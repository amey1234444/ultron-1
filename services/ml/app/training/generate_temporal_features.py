"""Fill a dataset's residual and embedding columns from a trained temporal model.

    python -m app.training.generate_temporal_features --dataset ds-001 --model temporal-2026...

The second pass, and the order matters. The temporal model is trained on the
same telemetry the dataset was built from, so its residual columns cannot exist
when the dataset is first written — they would be produced by a model that had
seen the rows it was about to label. The sequence is therefore:

    build_dataset            residual and embedding columns are null
    train_temporal           fits the LSTM on the train split only
    generate_temporal_features   fills the columns, using train-fitted weights
    train_lightgbm           the tree sees the filled union

The leakage risk here is real and specific: the temporal model must have been
fitted on the training split alone. This command checks the scaler's recorded
split and refuses otherwise, because a residual produced by a model that saw
the validation set makes every downstream metric optimistic in a way nothing
later can detect.
"""

from __future__ import annotations

import json
from collections import defaultdict, deque
from datetime import datetime, timedelta
from pathlib import Path

from ..core.capability import probe
from ..core.timeutil import parse_timestamp
from ..features import families
from ..inference.pipeline import RESIDUAL_EXCURSION_SIGMA
from ..models.temporal.runtime import TemporalRuntime
from ..registry.registry import ModelRegistry
#: Must match the window the registry declares for these features.
RESIDUAL_WINDOW_SECONDS = 300.0

from .common import (
    RunRecord,
    base_parser,
    configure_logging,
    print_summary,
    require,
    resolve_out,
    set_seed,
)
from .train_trees import load_dataset


def main(argv: list[str] | None = None) -> int:
    parser = base_parser(__doc__ or "Fill temporal feature columns.")
    parser.add_argument("--dataset", required=True)
    parser.add_argument("--model", required=True, help="Temporal model id.")
    parser.add_argument("--version", default="1")

    args = parser.parse_args(argv)
    log = configure_logging(args.log_level)
    set_seed(args.seed)

    capability = probe("tensorflow")
    require(capability.available, f"TensorFlow is required. {capability.reason}")

    registry = ModelRegistry()
    entry = registry.get(args.model, args.version)
    require(entry is not None, f"No registered model {args.model}:{args.version}.")
    assert entry is not None

    runtime = TemporalRuntime.load(Path(entry.artifact_path))
    require(runtime.available, runtime.reason or "The temporal model would not load.")
    require(
        runtime.scaler.fitted_on_split == "train",
        (
            f"The temporal scaler records fitted_on_split={runtime.scaler.fitted_on_split!r}. "
            "Residuals from a model that saw validation or test data make every downstream "
            "metric optimistic, and nothing later can detect it."
        ),
    )

    dataset_dir = resolve_out(args.out, "datasets") / args.dataset
    records, feature_ids, _events, _summary = load_dataset(dataset_dir)
    require(bool(records), "The dataset contains no rows.")

    columns = list(runtime.input_columns)
    lookback = runtime.lookback_steps
    require(lookback > 0, "The temporal contract declares no lookback.")

    series = [[record.get(f"x::{column}.value") for column in columns] for record in records]
    filled = 0
    skipped = 0
    # Residual history per channel, trimmed to the rolling window as it goes.
    history: defaultdict[str, deque[tuple[datetime, float]]] = defaultdict(deque)

    for index, record in enumerate(records):
        if index < lookback:
            skipped += 1
            continue
        window = series[index - lookback : index]
        actual = {
            channel: record.get(f"x::{channel}.value") for channel in runtime.forecast_channels
        }
        output = runtime.infer(window, actual=actual)
        if not output.available:
            skipped += 1
            continue
        for key, value in output.residual_features().items():
            record[f"x::{key}"] = value
        for key, value in output.embedding_features().items():
            record[f"x::{key}"] = value

        # The 300s rolling residual statistics, computed from the residuals of
        # the rows already filled.
        #
        # Not optional, and not a nicety: the online pipeline computes these
        # from its window store, so a dataset built without them trains a model
        # on 24 null columns that are populated at serving time. That is
        # train/serve skew, and it is worse than both sides being null -- the
        # model would have learned "this column is always missing" and then be
        # fed real numbers.
        moment = parse_timestamp(str(record.get("timestamp")))
        for channel, value in output.normalised_residual.items():
            history[channel].append((moment, value))
            cutoff = moment - timedelta(seconds=RESIDUAL_WINDOW_SECONDS)
            while history[channel] and history[channel][0][0] < cutoff:
                history[channel].popleft()
            stamps = [entry[0] for entry in history[channel]]
            values = [entry[1] for entry in history[channel]]
            excursion = [abs(v) >= RESIDUAL_EXCURSION_SIGMA for v in values]
            record[f"x::r.{channel}.residual_mean_300s"] = families.mean(values)
            record[f"x::r.{channel}.residual_slope_300s"] = families.slope_per_minute(
                values, stamps
            )
            record[f"x::r.{channel}.residual_persistence_300s"] = families.persistence_seconds(
                excursion, stamps
            )
        filled += 1

    _write_rows(dataset_dir, records)

    summary_path = dataset_dir / "summary.json"
    summary = json.loads(summary_path.read_text(encoding="utf-8"))
    summary.setdefault("notes", []).append(
        f"Temporal columns filled from {args.model}:{args.version} "
        f"({filled} rows filled, {skipped} left null)."
    )
    summary["temporal_model"] = f"{args.model}:{args.version}"
    summary_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")

    RunRecord(
        run_id=f"{args.dataset}-temporal",
        command="generate_temporal_features",
        seed=args.seed,
        dataset_id=args.dataset,
        arguments={key: str(value) for key, value in vars(args).items()},
        artifacts=[str(dataset_dir)],
    ).finish(filled=filled, skipped=skipped).write(dataset_dir)

    log.info("Filled %d rows; %d left null for want of lookback.", filled, skipped)
    print_summary(
        f"Temporal features for {args.dataset}",
        {
            "model": f"{args.model}:{args.version}",
            "rows_filled": filled,
            "rows_left_null": skipped,
            "forecast_channels": list(runtime.forecast_channels),
            "note": (
                "Rows before the first full lookback keep null residual columns. Null is "
                "the correct value — there was no window to compute one from."
            ),
        },
    )
    return 0


def _write_rows(directory: Path, records: list[dict]) -> None:
    parquet_path = directory / "rows.parquet"
    if parquet_path.is_file():
        try:
            import pyarrow
            import pyarrow.parquet as parquet_writer

            parquet_writer.write_table(pyarrow.Table.from_pylist(records), parquet_path)
            return
        except Exception:  # noqa: BLE001 - JSONL fallback
            pass
    with (directory / "rows.jsonl").open("w", encoding="utf-8") as handle:
        for record in records:
            handle.write(json.dumps(record, default=str) + "\n")


if __name__ == "__main__":
    raise SystemExit(main())
