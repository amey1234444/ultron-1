"""Shared implementation for the LightGBM and XGBoost training commands.

One implementation, two entry points, because champion and challenger must
receive identical treatment. If the two libraries had separate training code,
every comparison between them would be partly a comparison of the code, and the
ablation report would be measuring the wrong thing.

The ``--min-events`` flag deserves explaining. By default a fault with fewer
than eight confirmed events is not modelled at all: a binary classifier fitted
on three positives memorises three timestamps and reports a PR-AUC of 1.0.
Lowering the floor is allowed — it is the only way to exercise the pipeline
before real events exist — and every model fitted below the floor records the
fact in its contract, which is what stops it being promoted.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Sequence

from ..core.capability import probe
from ..core.timeutil import iso, now as utc_now, parse_timestamp
from ..core.versions import FEATURE_SET_VERSION
from ..labels.events import FaultEvent, label_quality_mix
from ..models.base import ModelContract
from ..models.trees.common import TreeTrainingConfig
from ..models.trees.ensemble import TreeEnsemble
from ..registry.registry import ModelRegistry, artifact_dir, timestamp_id
from .common import (
    RunRecord,
    base_parser,
    configure_logging,
    environment,
    print_summary,
    require,
    resolve_out,
    set_seed,
)


def parser_for(library: str):  # type: ignore[no-untyped-def]
    parser = base_parser(f"Train the {library} structured diagnosis/prognosis models.")
    parser.add_argument("--dataset", required=True, help="Dataset id to train from.")
    parser.add_argument("--model-id", default=None)
    parser.add_argument("--learning-rate", type=float, default=0.03)
    parser.add_argument("--num-leaves", type=int, default=31)
    parser.add_argument("--max-depth", type=int, default=6)
    parser.add_argument("--min-child-samples", type=int, default=50)
    parser.add_argument("--n-estimators", type=int, default=2000)
    parser.add_argument("--feature-fraction", type=float, default=0.8)
    parser.add_argument("--bagging-fraction", type=float, default=0.8)
    parser.add_argument("--reg-alpha", type=float, default=0.0)
    parser.add_argument("--reg-lambda", type=float, default=1.0)
    parser.add_argument("--early-stopping-rounds", type=int, default=100)
    parser.add_argument(
        "--min-events",
        type=int,
        default=None,
        help=(
            "Override the minimum confirmed events per fault. Below the default of 8 a "
            "model memorises its positives; lowering it is for pipeline testing only and "
            "is recorded in the model contract."
        ),
    )
    parser.add_argument(
        "--features",
        nargs="*",
        default=None,
        help="Restrict to these feature ids. Used by the ablation runner.",
    )
    return parser


def train(library: str, argv: Sequence[str] | None = None) -> int:
    parser = parser_for(library)
    args = parser.parse_args(list(argv) if argv is not None else None)
    log = configure_logging(args.log_level)
    set_seed(args.seed)

    capability = probe(library)
    require(capability.available, f"{library} is required. {capability.reason}")

    dataset_dir = resolve_out(args.out, "datasets") / args.dataset
    require(dataset_dir.is_dir(), f"No dataset at {dataset_dir}. Run build_dataset first.")

    records, feature_ids, events, summary = load_dataset(dataset_dir)
    require(bool(records), "The dataset contains no rows.")

    selected = tuple(args.features) if args.features else feature_ids
    indices = [feature_ids.index(fid) for fid in selected if fid in feature_ids]
    require(bool(indices), "None of the requested features exist in the dataset.")

    output_keys = sorted(
        {key[len("y::") :] for record in records[:1] for key in record if key.startswith("y::")}
    )
    require(bool(output_keys), "The dataset carries no labels.")

    train_rows, train_labels = split_rows(records, "train", indices, output_keys, feature_ids)
    valid_rows, valid_labels = split_rows(records, "valid", indices, output_keys, feature_ids)
    require(bool(train_rows), "The training split is empty.")
    require(bool(valid_rows), "The validation split is empty. Early stopping needs one.")

    config = TreeTrainingConfig(
        learning_rate=args.learning_rate,
        num_leaves=args.num_leaves,
        max_depth=args.max_depth,
        min_child_samples=args.min_child_samples,
        n_estimators=args.n_estimators,
        feature_fraction=args.feature_fraction,
        bagging_fraction=args.bagging_fraction,
        reg_alpha=args.reg_alpha,
        reg_lambda=args.reg_lambda,
        early_stopping_rounds=args.early_stopping_rounds,
        random_seed=args.seed,
    )

    event_counts = summary.get("events", {})
    if args.min_events is not None:
        _relax_event_floor(args.min_events)
        # Every event in the dataset counts, verified or not. Only reachable
        # through an explicit flag, and recorded below.
        event_counts = {
            key: sum(1 for event in events if event.fault_id == key.split("@")[0])
            for key in output_keys
        }

    model_id = args.model_id or timestamp_id(library)
    kind = "LIGHTGBM" if library == "lightgbm" else "XGBOOST"
    out = artifact_dir(kind, model_id, "1")

    contract = ModelContract(
        model_id=model_id,
        model_kind=kind,
        version="1",
        feature_ids=tuple(selected),
        feature_set_version=FEATURE_SET_VERSION,
        trained_on_dataset=args.dataset,
        trained_on_real_data=bool(summary.get("contains_real_data", False)),
        label_quality_mix=label_quality_mix(events),
        knowledge_digest=str(summary.get("knowledge_digest", "")),
        random_seed=args.seed,
        trained_at=iso(utc_now()),
        training_window=_window(records),
        machines=tuple(sorted({str(record["machine_id"]) for record in records})),
        recipes=tuple(sorted({str(record.get("recipe_id")) for record in records if record.get("recipe_id")})),
        event_ids=tuple(sorted({event.event_id for event in events})),
        hyperparameters=vars(args) | {"library": library},
        environment=environment(),
    )
    if args.min_events is not None and args.min_events < 8:
        contract.notes.append(
            f"Trained with --min-events {args.min_events}, below the 8-event floor. "
            "This model is a pipeline exercise and must not be promoted."
        )
    if not contract.trained_on_real_data:
        contract.notes.append(
            "Every training row is SYNTHETIC. This model carries no evidence about a "
            "real machine."
        )

    log.info("Training %d outputs on %d rows.", len(output_keys), len(train_rows))
    ensemble = TreeEnsemble.train(
        library=library,
        contract=contract,
        train_rows=train_rows,
        train_labels=train_labels,
        valid_rows=valid_rows,
        valid_labels=valid_labels,
        config=config,
        event_counts={key: int(value) for key, value in event_counts.items()},
    )

    if not ensemble.outputs:
        print_summary(
            f"{library} training produced no models",
            {
                "dataset": args.dataset,
                "reason": "No fault has enough confirmed events to model.",
                "notes": contract.notes,
            },
        )
        return 1

    ensemble.save(out)
    registry = ModelRegistry()
    entry = registry.register(
        contract=contract,
        artifact_path=out,
        validation_metrics={key: fitted.metrics for key, fitted in ensemble.outputs.items()},
        notes=contract.notes,
    )

    RunRecord(
        run_id=model_id,
        command=f"train_{library}",
        seed=args.seed,
        dataset_id=args.dataset,
        arguments={key: str(value) for key, value in vars(args).items()},
        artifacts=[str(out)],
        notes=contract.notes,
    ).finish(outputs=len(ensemble.outputs)).write(out)

    print_summary(
        f"{kind} model {model_id}",
        {
            "artifact": str(out),
            "outputs_trained": len(ensemble.outputs),
            "outputs_skipped": len(output_keys) - len(ensemble.outputs),
            "features": len(selected),
            "rows": {"train": len(train_rows), "valid": len(valid_rows)},
            "registry_role": entry.role,
            "trained_on_real_data": contract.trained_on_real_data,
            "notes": contract.notes,
        },
    )
    return 0


def load_dataset(directory: Path) -> tuple[list[dict], tuple[str, ...], list[FaultEvent], dict[str, Any]]:
    """Rows, feature order, events and summary for a built dataset."""
    feature_ids = tuple(
        json.loads((directory / "feature_ids.json").read_text(encoding="utf-8"))
    )
    summary = json.loads((directory / "summary.json").read_text(encoding="utf-8"))
    events = [
        FaultEvent.from_json(row)
        for row in json.loads((directory / "events.json").read_text(encoding="utf-8"))
    ]

    parquet_path = directory / "rows.parquet"
    if parquet_path.is_file():
        try:
            import pyarrow.parquet as parquet

            records = parquet.read_table(parquet_path).to_pylist()
            return records, feature_ids, events, summary
        except Exception:  # noqa: BLE001 - JSONL fallback
            pass

    jsonl = directory / "rows.jsonl"
    records = [
        json.loads(line)
        for line in jsonl.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    return records, feature_ids, events, summary


def split_rows(
    records: Sequence[dict],
    split: str,
    indices: Sequence[int],
    output_keys: Sequence[str],
    feature_ids: Sequence[str],
) -> tuple[list[list[float | None]], dict[str, list[int]]]:
    """Feature rows and per-output labels for one split.

    EXCLUDED labels (-1) are kept in place here and dropped inside the trainer,
    per output, because a row can be a valid negative for one fault and
    excluded for another.
    """
    rows: list[list[float | None]] = []
    labels: dict[str, list[int]] = {key: [] for key in output_keys}
    for record in records:
        if record.get("split") != split:
            continue
        rows.append([record.get(f"x::{feature_ids[index]}") for index in indices])
        for key in output_keys:
            labels[key].append(int(record.get(f"y::{key}", 0)))
    return rows, labels


def _window(records: Sequence[dict]) -> tuple[str, str] | None:
    stamps = [parse_timestamp(record["timestamp"]) for record in records if record.get("timestamp")]
    return (iso(min(stamps)), iso(max(stamps))) if stamps else None


def _relax_event_floor(minimum: int) -> None:
    """Lower the modelling floor for this process only.

    Mutating module state is normally a bad idea; here it is the narrowest way
    to let one explicit flag change one policy constant, and the change is
    recorded in every contract written afterwards.
    """
    from ..models.trees import common

    common.MIN_POSITIVE_EVENTS = minimum
    common.MIN_POSITIVE_SAMPLES = min(common.MIN_POSITIVE_SAMPLES, max(1, minimum * 5))
