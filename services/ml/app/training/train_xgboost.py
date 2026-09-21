"""Train the XGBoost challenger.

    python -m app.training.train_xgboost --dataset ds-001

A challenger, not an ensemble member. LightGBM and XGBoost are never combined
by voting — the production champion is decided from measured operational
performance on the frozen test set and the Golden suite, and a vote between two
correlated models mostly averages their shared mistakes.

It receives the identical dataset, splits, features, labels, events and
evaluation. ``train_trees`` is shared for exactly that reason.
"""

from __future__ import annotations

from .train_trees import train


def main(argv: list[str] | None = None) -> int:
    return train("xgboost", argv)


if __name__ == "__main__":
    raise SystemExit(main())
