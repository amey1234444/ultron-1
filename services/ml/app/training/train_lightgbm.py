"""Train the LightGBM champion.

    python -m app.training.train_lightgbm --dataset ds-001

LightGBM is the initial primary structured model. See ``train_trees`` for the
implementation — champion and challenger share it so that every comparison
between them is a comparison of the libraries and not of two training scripts.
"""

from __future__ import annotations

from .train_trees import train


def main(argv: list[str] | None = None) -> int:
    return train("lightgbm", argv)


if __name__ == "__main__":
    raise SystemExit(main())
