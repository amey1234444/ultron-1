"""E0-E7: does each architectural layer earn its place?

    python -m app.training.run_ablation --dataset ds-timing

Writes one file per arm into ``artifacts/metrics/`` plus a combined
``ablation.json``, and prints the comparison.

The arms are declared in ``app.evaluation.ablation``; this runs them. Every arm
sees the same dataset, the same splits, the same labels and the same evaluation
— a difference between arms must be a difference between architectures, not
between experimental setups, and that is the whole point of the exercise.

The question each arm answers:

    E0  the deterministic floor. If the rules catch the same events at the same
        lead time, the learned stack is a liability rather than a feature.
    E1  whether a tree on raw values already does the job.
    E2  whether the engineered features add anything over raw values.
    E3  whether the choice of boosting library matters here at all.
    E4  how much of the signal is pure departure-from-recent-behaviour.
    E5  whether the temporal model contributes beyond the engineered trends.
    E6  whether the uninterpretable embedding earns its cost over the
        interpretable residuals.
    E7  whether the decision layer cuts false alarms without losing recall.

E6 is the one to be ruthless about. It is the only component nobody can read,
and "it looked sophisticated" is not a reason to serve it.
"""

from __future__ import annotations

import json
from typing import Any, Sequence

from ..core.capability import probe
from ..evaluation.ablation import ARMS, features_for_arm
from ..evaluation.metrics import (
    constant_predictor_check,
    pr_auc,
    ranking_sanity_check,
    roc_auc,
)
from ..models.trees.common import to_matrix
from .common import base_parser, configure_logging, require, resolve_out, set_seed
from .run_baselines import _fit_lightgbm, _fit_xgboost, _tree_splits, _usable
from .train_trees import load_dataset, split_rows

#: One file per arm, named for what it is rather than for its arm id, because
#: the brief asks for these names and a reader should not need the arm table to
#: know what they hold.
ARM_FILENAMES = {
    "E1": "lightgbm_raw.json",
    "E2": "lightgbm_engineered.json",
    "E3": "xgboost_engineered.json",
    "E4": "lstm_residual_only.json",
    "E5": "hybrid_residual.json",
    "E6": "hybrid_embedding.json",
    "E7": "full_stack.json",
}


def _evaluate(probabilities: list[float], labels: list[int]) -> dict[str, Any]:
    positives = sum(1 for value in labels if value == 1)
    negatives = len(labels) - positives
    prevalence = positives / len(labels) if labels else 0.0
    observed_roc = roc_auc(probabilities, labels)
    observed_pr = pr_auc(probabilities, labels)
    constant = constant_predictor_check(probabilities)
    ranking = ranking_sanity_check(observed_roc, positives=positives, negatives=negatives)
    return {
        "samples": len(labels),
        "positives": positives,
        "negatives": negatives,
        "pr_auc": round(observed_pr, 4),
        "roc_auc": round(observed_roc, 4),
        # Beside every score, so a PR-AUC of 0.14 against a prevalence of 0.10
        # cannot be read as the model working.
        "random_baseline_pr_auc": round(prevalence, 4),
        "random_baseline_roc_auc": 0.5,
        "pr_auc_lift_over_random": round(observed_pr - prevalence, 4),
        "prediction_std": round(constant.observed.get("std") or 0.0, 6),
        "gates": [constant.to_json(), ranking.to_json()],
        "gates_passed": bool(constant.passed and ranking.passed),
    }


def _run_arm(
    arm,
    *,
    feature_ids: Sequence[str],
    train_rows,
    train_labels,
    eval_rows,
    eval_labels,
    output_keys: Sequence[str],
    seed: int,
) -> dict[str, Any]:
    """One arm over every trainable output."""
    if arm.library is None:
        # E0 is the deterministic floor and has no learned model to fit. It is
        # reported as present-and-unscored rather than omitted, because the
        # comparison is meaningless without the thing being compared against.
        return {
            "arm": arm.arm_id,
            "name": arm.name,
            "library": None,
            "note": (
                "The deterministic chain. Scored by the Golden suite and the "
                "rules-only evaluation, not by a probability column."
            ),
            "outputs": {},
        }

    if not probe(arm.library).available:
        return {
            "arm": arm.arm_id,
            "name": arm.name,
            "library": arm.library,
            "error": f"{arm.library} is not available in this environment.",
            "outputs": {},
        }

    selected = features_for_arm(arm, feature_ids)
    index = {fid: position for position, fid in enumerate(feature_ids)}
    columns = [index[fid] for fid in selected if fid in index]
    if not columns:
        return {
            "arm": arm.arm_id,
            "name": arm.name,
            "library": arm.library,
            "error": "No feature columns matched this arm's families.",
            "outputs": {},
        }

    outputs: dict[str, Any] = {}
    for key in output_keys:
        x_train, y_train = _usable(
            [[row[c] for c in columns] for row in train_rows], train_labels.get(key, [])
        )
        x_eval, y_eval = _usable(
            [[row[c] for c in columns] for row in eval_rows], eval_labels.get(key, [])
        )
        if len(set(y_train)) < 2 or len(set(y_eval)) < 2:
            outputs[key] = {
                "skipped": "A split carries a single class; every metric would be undefined."
            }
            continue

        positives = sum(y_train)
        weight = max((len(y_train) - positives) / max(positives, 1), 1.0)
        try:
            if arm.library == "lightgbm":
                probabilities, booster = _fit_lightgbm(
                    to_matrix(x_train), y_train, to_matrix(x_eval), seed, weight
                )
            else:
                probabilities, booster = _fit_xgboost(
                    to_matrix(x_train), y_train, to_matrix(x_eval), seed, weight
                )
        except Exception as error:  # noqa: BLE001 - one arm failing must not stop the rest
            outputs[key] = {"error": f"{type(error).__name__}: {error}"}
            continue

        entry = _evaluate(probabilities, y_eval)
        entry["splits"] = _tree_splits(booster, arm.library)
        outputs[key] = entry

    scored = [e for e in outputs.values() if "pr_auc" in e]
    return {
        "arm": arm.arm_id,
        "name": arm.name,
        "library": arm.library,
        "feature_columns": len(columns),
        "includes_residuals": arm.include_residuals,
        "includes_embedding": arm.include_embedding,
        "proves": arm.proves,
        "outputs": outputs,
        "mean_pr_auc": round(sum(e["pr_auc"] for e in scored) / len(scored), 4)
        if scored
        else None,
        "mean_roc_auc": round(sum(e["roc_auc"] for e in scored) / len(scored), 4)
        if scored
        else None,
        "all_gates_passed": bool(scored) and all(e["gates_passed"] for e in scored),
    }


def main(argv: list[str] | None = None) -> int:
    parser = base_parser(__doc__ or "Run the ablation.")
    parser.add_argument("--dataset", required=True)
    parser.add_argument("--split", choices=("valid", "test"), default="valid")
    parser.add_argument("--arms", nargs="*", default=None, help="Arm ids. Default: all.")
    args = parser.parse_args(argv)
    log = configure_logging(args.log_level)
    set_seed(args.seed)

    root = resolve_out(args.out)
    dataset_dir = root / "datasets" / args.dataset
    require(dataset_dir.is_dir(), f"No dataset at {dataset_dir}.")

    records, feature_ids, events, summary = load_dataset(dataset_dir)
    require(bool(records), "The dataset contains no rows.")

    indices = list(range(len(feature_ids)))
    output_keys = sorted(
        {key[len("y::") :] for record in records[:1] for key in record if key.startswith("y::")}
    )
    train_rows, train_labels = split_rows(records, "train", indices, output_keys, feature_ids)
    eval_rows, eval_labels = split_rows(records, args.split, indices, output_keys, feature_ids)
    require(bool(train_rows), "The training split is empty.")
    require(bool(eval_rows), f"The {args.split} split is empty.")

    wanted = set(args.arms) if args.arms else None
    results = []
    for arm in ARMS:
        if wanted and arm.arm_id not in wanted:
            continue
        log.info("arm %s: %s", arm.arm_id, arm.name)
        results.append(
            _run_arm(
                arm,
                feature_ids=feature_ids,
                train_rows=train_rows,
                train_labels=train_labels,
                eval_rows=eval_rows,
                eval_labels=eval_labels,
                output_keys=output_keys,
                seed=args.seed,
            )
        )

    out = root / "metrics"
    out.mkdir(parents=True, exist_ok=True)
    for entry in results:
        filename = ARM_FILENAMES.get(entry["arm"])
        if filename:
            (out / filename).write_text(json.dumps(entry, indent=2), encoding="utf-8")

    events_in_split = {
        str(row.get("event_id")) for row in records if row.get("split") == args.split
    } - {"None", ""}

    combined = {
        "dataset": args.dataset,
        "evaluated_on": args.split,
        "synthetic_only": not bool(summary.get("contains_real_data", False)),
        "physical_events_in_split": len(events_in_split),
        "arms": results,
        # The sentence that has to travel with every number here.
        "interpretation": (
            "An ablation compares architectures, and it can only do that when the "
            "evaluation split contains enough physical events for the differences to "
            "mean anything. Below the 8-event floor these numbers compare noise."
        ),
        "warning": "SYNTHETIC PIPELINE VALIDATION ONLY.",
    }
    (out / "ablation.json").write_text(json.dumps(combined, indent=2), encoding="utf-8")

    print(f"\nABLATION on {args.dataset} ({args.split} split)")
    print(f"physical events in split: {len(events_in_split)}")
    print("SYNTHETIC PIPELINE VALIDATION ONLY\n")
    print(f"  {'arm':4} {'name':34} {'cols':>6} {'PR-AUC':>8} {'ROC':>7}  gates")
    for entry in results:
        if entry.get("error"):
            print(f"  {entry['arm']:4} {entry['name'][:34]:34} {'':>6} {entry['error'][:40]}")
            continue
        if entry.get("library") is None:
            print(f"  {entry['arm']:4} {entry['name'][:34]:34} {'-':>6} {'-':>8} {'-':>7}  (deterministic)")
            continue
        print(
            f"  {entry['arm']:4} {entry['name'][:34]:34} {entry['feature_columns']:6} "
            f"{entry['mean_pr_auc'] if entry['mean_pr_auc'] is not None else float('nan'):8.4f} "
            f"{entry['mean_roc_auc'] if entry['mean_roc_auc'] is not None else float('nan'):7.3f}"
            f"  {'PASS' if entry['all_gates_passed'] else 'FAIL'}"
        )
    if len(events_in_split) < 8:
        print(
            f"\n  {len(events_in_split)} events in this split is below the 8-event floor. "
            "These arms are not separable on this data; the run proves the ablation "
            "executes, not which architecture is better."
        )
    log.info("wrote %s", out / "ablation.json")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
