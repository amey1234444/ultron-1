"""E0-E4: does this dataset contain learnable signal at all?

    python -m app.training.run_baselines --dataset ds-synth-005

Runs the same outputs through progressively more capable models on **identical
splits, labels and feature columns**, and writes one comparison to
``artifacts/metrics/baselines.json``.

    E1  logistic regression   the simplest thing that could possibly learn
    E3  LightGBM              the designated champion
    E4  XGBoost               the challenger

The point is not to pick a winner. It is to answer a prior question: *is there
signal here at all?* A linear model on engineered features is the cheapest
honest answer. If logistic regression, LightGBM and XGBoost all sit at chance,
the problem is the data, the labels or the feature plumbing — and no amount of
boosting rounds or hyperparameter search will find something that is not there.
That is exactly the situation this project was in, and four hundred trees were
built before anyone noticed the feature matrix was empty.

So every arm is gated:

    CONSTANT_PREDICTOR_CHECK   the scores actually vary
    RANKING_SANITY_CHECK       ranking is distinguishable from chance

and every result is printed against its random baseline (PR-AUC = prevalence,
ROC-AUC = 0.50) so a score of 0.14 on a 10% positive rate cannot be mistaken
for skill.

Nothing here is promotable. It is a diagnostic.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Sequence

from ..core.capability import probe
from .train_trees import load_dataset, split_rows
from ..evaluation.metrics import (
    constant_predictor_check,
    pr_auc,
    ranking_sanity_check,
    roc_auc,
)
from ..models.trees.common import to_matrix
from .common import base_parser, configure_logging, require, resolve_out, set_seed


def _usable(rows: Sequence[Sequence[float | None]], labels: Sequence[int]):
    """Rows whose label is a real 0 or 1, dropping EXCLUDED."""
    from ..labels.events import EXCLUDED

    kept_x, kept_y = [], []
    for row, label in zip(rows, labels):
        if label == EXCLUDED:
            continue
        kept_x.append(row)
        kept_y.append(int(label))
    return kept_x, kept_y


def _impute(matrix, medians=None):
    """Median-impute and standardise for the linear arm only.

    The trees take NaN directly and learn a default direction, which is the
    honest encoding of "not computable". Logistic regression cannot, so the
    linear arm gets imputation — and that difference is recorded rather than
    hidden, because it is a real advantage the trees have on this data.
    """
    import numpy as np

    if medians is None:
        medians = np.nanmedian(matrix, axis=0)
        medians = np.where(np.isnan(medians), 0.0, medians)
    filled = np.where(np.isnan(matrix), medians, matrix)
    return filled, medians


def _score(name: str, probabilities: list[float], labels: list[int]) -> dict[str, Any]:
    positives = sum(1 for value in labels if value == 1)
    negatives = len(labels) - positives
    prevalence = positives / len(labels) if labels else 0.0
    observed_roc = roc_auc(probabilities, labels)
    observed_pr = pr_auc(probabilities, labels)
    constant = constant_predictor_check(probabilities)
    ranking = ranking_sanity_check(observed_roc, positives=positives, negatives=negatives)
    return {
        "arm": name,
        "samples": len(labels),
        "positives": positives,
        "negatives": negatives,
        "pr_auc": round(observed_pr, 4),
        "roc_auc": round(observed_roc, 4),
        # Always beside the score. A PR-AUC of 0.14 against a prevalence of
        # 0.10 is not a model working.
        "random_baseline_pr_auc": round(prevalence, 4),
        "random_baseline_roc_auc": 0.5,
        "pr_auc_lift_over_random": round(observed_pr - prevalence, 4),
        "prediction_std": round(constant.observed.get("std") or 0.0, 6),
        "prediction_min": constant.observed.get("min"),
        "prediction_max": constant.observed.get("max"),
        "gates": [constant.to_json(), ranking.to_json()],
        "gates_passed": bool(constant.passed and ranking.passed),
    }


def _fit_logistic(x_train, y_train, x_valid, seed: int):
    from sklearn.linear_model import LogisticRegression
    from sklearn.preprocessing import StandardScaler

    scaler = StandardScaler()
    scaled = scaler.fit_transform(x_train)
    model = LogisticRegression(
        max_iter=2000,
        class_weight="balanced",  # the positive rate is a few per cent
        random_state=seed,
    )
    model.fit(scaled, y_train)
    return model.predict_proba(scaler.transform(x_valid))[:, 1].tolist()


def _fit_lightgbm(x_train, y_train, x_valid, seed: int, weight: float):
    import lightgbm as lgb

    train_set = lgb.Dataset(x_train, label=y_train)
    booster = lgb.train(
        {
            "objective": "binary",
            "learning_rate": 0.03,
            "num_leaves": 31,
            "max_depth": 6,
            "min_child_samples": 30,
            "feature_fraction": 0.8,
            "bagging_fraction": 0.8,
            "bagging_freq": 1,
            "scale_pos_weight": weight,
            "verbose": -1,
            "seed": seed,
        },
        train_set,
        num_boost_round=300,
    )
    return booster.predict(x_valid).tolist(), booster


def _fit_xgboost(x_train, y_train, x_valid, seed: int, weight: float):
    import xgboost as xgb

    dtrain = xgb.DMatrix(x_train, label=y_train)
    booster = xgb.train(
        {
            "objective": "binary:logistic",
            "eta": 0.03,
            "max_depth": 6,
            "min_child_weight": 1,
            "subsample": 0.8,
            "colsample_bytree": 0.8,
            "scale_pos_weight": weight,
            "eval_metric": "aucpr",
            "seed": seed,
        },
        dtrain,
        num_boost_round=300,
    )
    return booster.predict(xgb.DMatrix(x_valid)).tolist(), booster


def _tree_splits(booster, library: str) -> int:
    """How many times the model actually split. Zero means it learned nothing."""
    try:
        if library == "lightgbm":
            return sum(t.get("num_leaves", 1) - 1 for t in booster.dump_model().get("tree_info", []))
        total = 0
        for tree in booster.get_dump(dump_format="json"):
            def walk(node):
                nonlocal total
                if "split" in node:
                    total += 1
                    for child in node.get("children", []):
                        walk(child)
            walk(json.loads(tree))
        return total
    except Exception:  # noqa: BLE001 - diagnostics must not fail the run
        return -1


def main(argv: list[str] | None = None) -> int:
    parser = base_parser(__doc__ or "Run baseline experiments.")
    parser.add_argument("--dataset", required=True)
    parser.add_argument("--split", choices=("valid", "test"), default="valid")
    parser.add_argument(
        "--max-outputs", type=int, default=0, help="0 means every trainable output."
    )
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

    have_lgb = probe("lightgbm").available
    have_xgb = probe("xgboost").available
    have_skl = probe("sklearn").available
    log.info(
        "libraries: sklearn=%s lightgbm=%s xgboost=%s", have_skl, have_lgb, have_xgb
    )

    results: dict[str, Any] = {}
    considered = 0

    for key in output_keys:
        x_train, y_train = _usable(train_rows, train_labels.get(key, []))
        x_eval, y_eval = _usable(eval_rows, eval_labels.get(key, []))
        if len(set(y_train)) < 2 or len(set(y_eval)) < 2:
            results[key] = {
                "skipped": "One of the splits has only a single class; every metric "
                "would be undefined."
            }
            continue
        if args.max_outputs and considered >= args.max_outputs:
            break
        considered += 1

        positives = sum(y_train)
        weight = max((len(y_train) - positives) / max(positives, 1), 1.0)
        matrix_train = to_matrix(x_train)
        matrix_eval = to_matrix(x_eval)

        arms: list[dict[str, Any]] = []

        if have_skl:
            try:
                filled_train, medians = _impute(matrix_train)
                filled_eval, _ = _impute(matrix_eval, medians)
                probabilities = _fit_logistic(filled_train, y_train, filled_eval, args.seed)
                entry = _score("E1_logistic", probabilities, y_eval)
                entry["note"] = "Median-imputed and standardised; the trees take NaN directly."
                arms.append(entry)
            except Exception as error:  # noqa: BLE001
                arms.append({"arm": "E1_logistic", "error": f"{type(error).__name__}: {error}"})

        if have_lgb:
            try:
                probabilities, booster = _fit_lightgbm(
                    matrix_train, y_train, matrix_eval, args.seed, weight
                )
                entry = _score("E3_lightgbm", probabilities, y_eval)
                entry["splits"] = _tree_splits(booster, "lightgbm")
                arms.append(entry)
            except Exception as error:  # noqa: BLE001
                arms.append({"arm": "E3_lightgbm", "error": f"{type(error).__name__}: {error}"})

        if have_xgb:
            try:
                probabilities, booster = _fit_xgboost(
                    matrix_train, y_train, matrix_eval, args.seed, weight
                )
                entry = _score("E4_xgboost", probabilities, y_eval)
                entry["splits"] = _tree_splits(booster, "xgboost")
                arms.append(entry)
            except Exception as error:  # noqa: BLE001
                arms.append({"arm": "E4_xgboost", "error": f"{type(error).__name__}: {error}"})

        results[key] = {
            "train_rows": len(y_train),
            "train_positives": positives,
            f"{args.split}_rows": len(y_eval),
            f"{args.split}_positives": sum(y_eval),
            "scale_pos_weight": round(weight, 3),
            "arms": arms,
        }

    any_learned = any(
        arm.get("gates_passed")
        for entry in results.values()
        for arm in entry.get("arms", [])
    )

    payload = {
        "dataset": args.dataset,
        "evaluated_on": args.split,
        "synthetic_only": not bool(summary.get("contains_real_data", False)),
        "label_quality_mix": summary.get("label_quality", {}),
        "results": results,
        # The headline. If this is false on data built to be separable, stop
        # and fix the data -- do not tune.
        "any_arm_learned": any_learned,
        "verdict": (
            "At least one arm ranks better than chance."
            if any_learned
            else "No arm beat chance. Investigate data, labels and feature plumbing "
            "before tuning anything."
        ),
        "warning": "SYNTHETIC PIPELINE VALIDATION ONLY. These numbers carry no "
        "evidence about a real machine.",
    }

    out = root / "metrics"
    out.mkdir(parents=True, exist_ok=True)
    (out / "baselines.json").write_text(json.dumps(payload, indent=2), encoding="utf-8")

    print(f"\nBASELINES on {args.dataset} ({args.split} split)")
    print("SYNTHETIC PIPELINE VALIDATION ONLY\n")
    header = f"  {'output':22} {'arm':14} {'PR-AUC':>8} {'rand':>7} {'lift':>7} {'ROC':>6} {'std':>9} {'splits':>7}  gates"
    print(header)
    for key, entry in results.items():
        if "arms" not in entry:
            continue
        for arm in entry["arms"]:
            if "error" in arm:
                print(f"  {key:22} {arm['arm']:14} ERROR {arm['error'][:60]}")
                continue
            print(
                f"  {key:22} {arm['arm']:14} {arm['pr_auc']:8.4f} "
                f"{arm['random_baseline_pr_auc']:7.4f} {arm['pr_auc_lift_over_random']:7.4f} "
                f"{arm['roc_auc']:6.3f} {arm['prediction_std']:9.6f} "
                f"{str(arm.get('splits', '-')):>7}  {'PASS' if arm['gates_passed'] else 'FAIL'}"
            )
    print(f"\n  any_arm_learned: {any_learned}")
    print(f"  {payload['verdict']}")
    log.info("wrote %s", out / "baselines.json")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
