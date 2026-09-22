"""Forensic audit of a saved tree model and the dataset it was trained on.

Answers the questions that a metrics table cannot: did the trees actually
split, did any feature reach the trainer, and are the predictions constant.

    python scripts/audit_model.py --model artifacts/models/xgboost/xgb-pipeline-test-1 \
                                  --dataset artifacts/datasets/ds-synth-002 \
                                  --out artifacts/audit/model_debug.json

Reads only. It never writes into the model directory, because the artifact it
inspects is kept as regression evidence for a known failure.
"""

from __future__ import annotations

import argparse
import glob
import json
import os
from pathlib import Path
from typing import Any


def walk_tree(node: dict[str, Any]) -> tuple[int, int, int]:
    """Return (splits, leaves, max_depth) for one dumped tree."""
    splits = leaves = 0
    depth = 0

    def visit(entry: dict[str, Any], level: int) -> None:
        nonlocal splits, leaves, depth
        depth = max(depth, level)
        if "split" in entry:
            splits += 1
            for child in entry.get("children", []):
                visit(child, level + 1)
        else:
            leaves += 1

    visit(node, 0)
    return splits, leaves, depth


def audit_boosters(model_dir: Path) -> dict[str, Any]:
    import xgboost as xgb

    out: dict[str, Any] = {}
    for path in sorted(glob.glob(str(model_dir / "[A-Z]*.json"))):
        name = os.path.basename(path)[:-5]
        booster = xgb.Booster()
        try:
            booster.load_model(path)
        except Exception as error:  # a non-booster json in the same directory
            continue
        dump = booster.get_dump(dump_format="json")
        splits = leaves = 0
        depth = 0
        for tree in dump:
            s, l, d = walk_tree(json.loads(tree))
            splits += s
            leaves += l
            depth = max(depth, d)
        config = json.loads(booster.save_config())
        out[name] = {
            "trees": len(dump),
            "splits": splits,
            "leaves": leaves,
            "max_depth": depth,
            "base_score": config.get("learner", {})
            .get("learner_model_param", {})
            .get("base_score"),
            # The finding this whole script exists to make unmissable.
            "is_constant_by_construction": splits == 0,
        }
    return out


def audit_feature_matrix(dataset_dir: Path) -> dict[str, Any]:
    import pandas as pd

    frame = pd.read_parquet(dataset_dir / "rows.parquet")
    feature_cols = [c for c in frame.columns if c.startswith("x::")]
    label_cols = [c for c in frame.columns if c.startswith("y::")]
    block = frame[feature_cols]
    non_null = block.notna().sum()
    distinct = block.nunique(dropna=True)
    rows = len(frame)

    return {
        "rows": rows,
        "feature_columns": len(feature_cols),
        "label_columns": len(label_cols),
        "features_all_null": int((non_null == 0).sum()),
        "features_over_99pct_null": int((non_null < 0.01 * rows).sum()),
        "features_with_any_value": int((non_null > 0).sum()),
        "features_constant": int((distinct <= 1).sum()),
        "features_varying": int((distinct >= 2).sum()),
        "null_fraction_overall": float(1 - (non_null.sum() / (rows * max(len(feature_cols), 1)))),
        "ml_eligible_counts": {
            str(k): int(v) for k, v in frame["ml_eligible"].value_counts(dropna=False).items()
        }
        if "ml_eligible" in frame
        else {},
        "data_quality_counts": {
            str(k): int(v) for k, v in frame["data_quality"].value_counts(dropna=False).items()
        }
        if "data_quality" in frame
        else {},
        # An X block that is entirely absent is not a dataset. Naming it here
        # means the next reader does not have to rediscover it.
        "usable_for_training": bool((non_null > 0).sum() > 0),
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", type=Path, default=None)
    parser.add_argument("--dataset", type=Path, default=None)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args(argv)

    report: dict[str, Any] = {"model_dir": None, "dataset_dir": None}

    if args.model:
        report["model_dir"] = str(args.model)
        boosters = audit_boosters(args.model)
        report["boosters"] = boosters
        report["all_boosters_constant"] = bool(
            boosters and all(b["is_constant_by_construction"] for b in boosters.values())
        )
        contract_path = args.model / "contract.json"
        if contract_path.exists():
            contract = json.loads(contract_path.read_text(encoding="utf-8"))
            report["contract"] = {
                "feature_set_version": contract.get("feature_set_version"),
                "feature_count": len(contract.get("feature_ids", [])),
                "trained_on_dataset": contract.get("trained_on_dataset"),
                "trained_on_real_data": contract.get("trained_on_real_data"),
                "label_quality_mix": contract.get("label_quality_mix"),
            }

    if args.dataset:
        report["dataset_dir"] = str(args.dataset)
        report["feature_matrix"] = audit_feature_matrix(args.dataset)

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2)[:4000])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
