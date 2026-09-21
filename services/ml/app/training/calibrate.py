"""Fit probability calibrators on the validation split.

    python -m app.training.calibrate --dataset ds-001 --model lgbm-20260918

A raw gradient-boosted score trained under ``scale_pos_weight`` on a rare class
is not a probability. This command measures how far off it is and fits the
correction, per output, choosing Platt or isotonic by how many positives the
validation split actually contains.

Validation only. Fitting on train reproduces the training optimism; fitting on
the frozen test set destroys the only unbiased estimate remaining, and
``fit_calibrator`` refuses both.
"""

from __future__ import annotations

import json
from pathlib import Path

from ..models.calibration.calibrators import (
    expected_calibration_error,
    fit_calibrator,
    reliability_curve,
)
from ..models.trees.ensemble import TreeEnsemble
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
    parser = base_parser(__doc__ or "Fit probability calibrators.")
    parser.add_argument("--dataset", required=True)
    parser.add_argument("--model", required=True, help="Model id to calibrate.")
    parser.add_argument("--version", default="1")
    parser.add_argument(
        "--method",
        choices=("auto", "platt", "isotonic"),
        default="auto",
        help="auto chooses by the number of validation positives.",
    )

    args = parser.parse_args(argv)
    log = configure_logging(args.log_level)
    set_seed(args.seed)

    registry = ModelRegistry()
    entry = registry.get(args.model, args.version)
    require(entry is not None, f"No registered model {args.model}:{args.version}.")
    assert entry is not None

    artifact = Path(entry.artifact_path)
    ensemble = TreeEnsemble.load(artifact)
    require(ensemble.available, ensemble.reason or "The model artifact would not load.")

    dataset_dir = resolve_out(args.out, "datasets") / args.dataset
    records, feature_ids, _events, _summary = load_dataset(dataset_dir)
    indices = [feature_ids.index(fid) for fid in ensemble.contract.feature_ids]  # type: ignore[union-attr]
    output_keys = sorted(ensemble.outputs)

    valid_rows, valid_labels = split_rows(records, "valid", indices, output_keys, feature_ids)
    require(bool(valid_rows), "The validation split is empty; there is nothing to calibrate on.")

    report: dict[str, dict[str, object]] = {}

    for key, fitted in ensemble.outputs.items():
        labels = valid_labels.get(key, [])
        pairs = [
            (float(score), int(label))
            for score, label in zip(ensemble.score_batch(valid_rows, key), labels)
            if label >= 0
        ]
        if not pairs:
            report[key] = {"calibrated": False, "reason": "No usable validation rows."}
            continue

        scores = [score for score, _ in pairs]
        targets = [label for _, label in pairs]
        positives = sum(targets)
        if positives == 0 or positives == len(targets):
            report[key] = {
                "calibrated": False,
                "reason": (
                    f"The validation split has {positives} positives out of {len(targets)}. "
                    "A calibrator fitted on one class maps everything to a constant."
                ),
            }
            continue

        calibrator = fit_calibrator(
            scores,
            targets,
            split="valid",
            kind=None if args.method == "auto" else args.method,  # type: ignore[arg-type]
        )
        fitted.calibrator = calibrator
        calibrated = [calibrator.apply(score) or score for score in scores]

        report[key] = {
            "calibrated": True,
            "method": calibrator.kind,
            "validation_samples": len(targets),
            "validation_positives": positives,
            "ece_before": round(expected_calibration_error(scores, targets), 4),
            "ece_after": round(expected_calibration_error(calibrated, targets), 4),
            "brier_before": calibrator.metrics.get("brier_before"),
            "brier_after": calibrator.metrics.get("brier_after"),
            "reliability": reliability_curve(calibrated, targets),
        }
        log.info(
            "%s calibrated with %s: ECE %.4f -> %.4f",
            key,
            calibrator.kind,
            report[key]["ece_before"],
            report[key]["ece_after"],
        )

    ensemble.save(artifact)
    (artifact / "calibration.json").write_text(json.dumps(report, indent=2), encoding="utf-8")

    entry.contract["calibration"] = {
        key: {inner: value for inner, value in data.items() if inner != "reliability"}
        for key, data in report.items()
    }
    registry.save()

    RunRecord(
        run_id=f"{args.model}-calibrate",
        command="calibrate",
        seed=args.seed,
        dataset_id=args.dataset,
        arguments={key: str(value) for key, value in vars(args).items()},
        artifacts=[str(artifact)],
    ).finish(outputs=len(report)).write(artifact)

    print_summary(
        f"Calibration for {args.model}",
        {
            "outputs": len(report),
            "calibrated": sum(1 for data in report.values() if data.get("calibrated")),
            "skipped": sum(1 for data in report.values() if not data.get("calibrated")),
            "artifact": str(artifact),
        },
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
