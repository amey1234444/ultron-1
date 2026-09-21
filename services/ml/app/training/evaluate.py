"""Evaluate a model, per fault and per horizon.

    python -m app.training.evaluate --dataset ds-001 --model lgbm-20260918 --split test

Reports PR-AUC, precision, recall, F1, false-positive and false-negative rates,
false alarms per operating hour, event-level recall, lead-time distribution and
calibration. It does not report accuracy, because at a 0.2% positive rate
accuracy is a measure of the class balance and nothing else.

``--split test`` is the frozen test set and should be run **once**, at the end,
on a model whose thresholds and hyperparameters were chosen on validation.
Running it repeatedly and picking the best turns the test set into a tuning set,
and every number from it afterwards is an overstatement. The command says so on
every test-split run rather than trusting anyone to remember.
"""

from __future__ import annotations

import json
from pathlib import Path

from ..core.timeutil import parse_timestamp
from ..evaluation.metrics import (
    FalseAlarmRecord,
    classify_false_alarm,
    detect_events,
    evaluate_output,
)
from ..models.trees.ensemble import TreeEnsemble
from ..persistence.filters import FilterConfigSet
from ..registry.registry import ModelRegistry
from .common import (
    RunRecord,
    base_parser,
    configure_logging,
    print_summary,
    require,
    resolve_out,
    set_seed,
)
from .train_trees import load_dataset, split_rows


def main(argv: list[str] | None = None) -> int:
    parser = base_parser(__doc__ or "Evaluate a model.")
    parser.add_argument("--dataset", required=True)
    parser.add_argument("--model", required=True)
    parser.add_argument("--version", default="1")
    parser.add_argument("--split", choices=("valid", "test"), default="valid")
    parser.add_argument(
        "--false-alarm-report",
        action="store_true",
        help="Also write a per-alarm report with context and top features.",
    )

    args = parser.parse_args(argv)
    log = configure_logging(args.log_level)
    set_seed(args.seed)

    if args.split == "test":
        log.warning(
            "Evaluating on the FROZEN TEST SPLIT. Run this once, at the end. Choosing a "
            "model or a threshold from these numbers turns the test set into a tuning set."
        )

    registry = ModelRegistry()
    entry = registry.get(args.model, args.version)
    require(entry is not None, f"No registered model {args.model}:{args.version}.")
    assert entry is not None

    artifact = Path(entry.artifact_path)
    ensemble = TreeEnsemble.load(artifact)
    require(ensemble.available, ensemble.reason or "The model artifact would not load.")
    assert ensemble.contract is not None

    dataset_dir = resolve_out(args.out, "datasets") / args.dataset
    records, feature_ids, events, _summary = load_dataset(dataset_dir)
    indices = [feature_ids.index(fid) for fid in ensemble.contract.feature_ids]
    output_keys = sorted(ensemble.outputs)

    rows, labels = split_rows(records, args.split, indices, output_keys, feature_ids)
    require(bool(rows), f"The {args.split} split is empty.")

    split_records = [record for record in records if record.get("split") == args.split]
    timestamps = [parse_timestamp(record["timestamp"]) for record in split_records]
    filters = FilterConfigSet.load(resolve_out(None, "..", "configs") / "thresholds.yaml")

    report: dict[str, object] = {}
    false_alarms: list[dict[str, object]] = []

    for key in output_keys:
        probabilities = ensemble.calibrated_batch(rows, key)
        targets = labels.get(key, [])

        usable = [
            (probability, target, at)
            for probability, target, at in zip(probabilities, targets, timestamps)
            if target >= 0
        ]
        if not usable:
            report[key] = {"note": f"No usable rows in the {args.split} split for this output."}
            continue

        config = filters.for_output(key)
        fault_id = key.split("@")[0]
        # Only events whose onset falls inside this split. Counting an event
        # the split does not contain as a miss makes event recall a measure of
        # how the data was split rather than of the model.
        span_start = min(at for _p, _t, at in usable)
        span_end = max(at for _p, _t, at in usable)
        onsets = [
            (event.event_id, event.fault_id, event.confirmed_onset)
            for event in events
            if event.fault_id == fault_id
            and event.confirmed_onset is not None
            and span_start <= event.confirmed_onset <= span_end
        ]
        outcomes = detect_events(
            timestamps=[at for _p, _t, at in usable],
            probabilities=[p for p, _t, _at in usable],
            onsets=onsets,
            threshold=config.raise_threshold,
            persistence_n=config.persistence_n,
            persistence_m=config.persistence_m,
        )

        evaluation = evaluate_output(
            key=key,
            probabilities=[p for p, _t, _at in usable],
            labels=[t for _p, t, _at in usable],
            timestamps=[at for _p, _t, at in usable],
            threshold=config.raise_threshold,
            outcomes=outcomes,
            persistence_n=config.persistence_n,
            persistence_m=config.persistence_m,
        )
        report[key] = evaluation.to_json()
        log.info(
            "%s: PR-AUC %.3f, recall %.3f, precision %.3f, %s false alarms/h",
            key,
            evaluation.pr_auc,
            evaluation.at_threshold.recall,
            evaluation.at_threshold.precision,
            evaluation.false_alarms_per_hour,
        )

        if args.false_alarm_report:
            false_alarms.extend(
                _false_alarm_rows(
                    key=key,
                    usable=usable,
                    records=split_records,
                    threshold=config.raise_threshold,
                    ensemble=ensemble,
                    rows=rows,
                )
            )

    payload = {
        "model": f"{args.model}:{args.version}",
        "dataset": args.dataset,
        "split": args.split,
        "frozen_test": args.split == "test",
        "outputs": report,
    }
    out_path = artifact / f"evaluation-{args.split}.json"
    out_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    if args.split == "test":
        entry.test_metrics = report
    else:
        entry.validation_metrics = report
    registry.save()

    if false_alarms:
        (artifact / f"false-alarms-{args.split}.json").write_text(
            json.dumps(false_alarms, indent=2), encoding="utf-8"
        )

    RunRecord(
        run_id=f"{args.model}-eval-{args.split}",
        command="evaluate",
        seed=args.seed,
        dataset_id=args.dataset,
        arguments={key: str(value) for key, value in vars(args).items()},
        artifacts=[str(out_path)],
    ).finish(outputs=len(report)).write(artifact)

    print_summary(
        f"Evaluation of {args.model} on {args.split}",
        {
            "outputs": len(report),
            "false_alarm_records": len(false_alarms),
            "report": str(out_path),
            "reminder": (
                "Frozen test split — do not tune on these numbers."
                if args.split == "test"
                else "Validation split — thresholds and hyperparameters may be chosen here."
            ),
        },
    )
    return 0


def _false_alarm_rows(*, key, usable, records, threshold, ensemble, rows):  # type: ignore[no-untyped-def]
    """One record per false alarm, with the context that explains it."""
    fault_id, _, horizon = key.rpartition("@")
    out: list[dict[str, object]] = []
    for index, (probability, target, at) in enumerate(usable):
        if target == 1 or probability < threshold:
            continue
        record = records[index] if index < len(records) else {}
        contributions = ensemble.explain(rows[index], key)[:5] if index < len(rows) else []
        entry = FalseAlarmRecord(
            at=at,
            machine_id=str(record.get("machine_id", "")),
            fault_id=fault_id,
            horizon_minutes=int(horizon or 0),
            probability=probability,
            threshold=threshold,
            operating_state=str(record.get("operating_state", "")),
            state_confidence=float(record.get("state_confidence", 0.0) or 0.0),
            recipe_id=record.get("recipe_id"),
            context_id=record.get("context_id"),
            rule_severity=str(record.get("rule_severity", "")),
            data_quality=str(record.get("data_quality", "")),
            baseline_level=record.get("baseline_level"),
            top_features=sorted(contributions, key=lambda pair: -abs(pair[1]))[:5],
        )
        entry.probable_reason = classify_false_alarm(entry)
        out.append(entry.to_json())
    return out


if __name__ == "__main__":
    raise SystemExit(main())
