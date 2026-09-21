"""What LightGBM and XGBoost share: the problem shape, and a fair comparison.

The two libraries are champion and challenger, and a challenger evaluation is
worthless unless the challenger got the same deal. So the dataset, the splits,
the feature order, the labels and the evaluation all come from here, and the
two adapters differ only in the estimator they fit.

**Multi-label, not multi-class.** A screen restriction and a motor overload can
be developing at once, and forcing one winner would suppress the second. Every
fault-horizon pair is an independent binary problem with its own model, its own
threshold and its own calibrator. The cost is a lot of small models; the
benefit is that nothing is mutually exclusive that is not physically mutually
exclusive.

**Imbalance is expected and handled by weight, not by resampling.** Faults are
rare. Oversampling the positives duplicates the same few events until the model
memorises them; ``scale_pos_weight`` changes the loss without inventing data.

**PR-AUC is the objective, not accuracy.** At a 0.2% positive rate a model that
always says "no fault" scores 99.8% accuracy and is worth nothing.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Sequence

from ..base import output_key, parse_output_key


@dataclass
class TreeTrainingConfig:
    """Baseline hyperparameters and the ranges a search should cover.

    The values are a documented starting point. They are not tuned — there is
    nothing to tune against yet — and calling them tuned would be the exact
    kind of claim this service must not make.
    """

    learning_rate: float = 0.03
    num_leaves: int = 31
    max_depth: int = 6
    min_child_samples: int = 50
    n_estimators: int = 2000
    feature_fraction: float = 0.8
    bagging_fraction: float = 0.8
    bagging_freq: int = 1
    reg_alpha: float = 0.0
    reg_lambda: float = 1.0
    early_stopping_rounds: int = 100
    random_seed: int = 20260918

    #: Ranges a hyperparameter search should sweep. Data, so the training CLI
    #: and the Optuna study read the same numbers.
    search_space: dict[str, tuple[float, float]] = field(
        default_factory=lambda: {
            "learning_rate": (0.005, 0.1),
            "num_leaves": (15, 127),
            "max_depth": (4, 8),
            "min_child_samples": (30, 100),
            "feature_fraction": (0.5, 1.0),
            "bagging_fraction": (0.5, 1.0),
            "reg_alpha": (0.0, 5.0),
            "reg_lambda": (0.0, 10.0),
        }
    )

    def lightgbm_params(self, scale_pos_weight: float) -> dict[str, Any]:
        return {
            "objective": "binary",
            "metric": ["average_precision", "binary_logloss"],
            "learning_rate": self.learning_rate,
            "num_leaves": self.num_leaves,
            "max_depth": self.max_depth,
            "min_child_samples": self.min_child_samples,
            "feature_fraction": self.feature_fraction,
            "bagging_fraction": self.bagging_fraction,
            "bagging_freq": self.bagging_freq,
            "lambda_l1": self.reg_alpha,
            "lambda_l2": self.reg_lambda,
            "scale_pos_weight": scale_pos_weight,
            "seed": self.random_seed,
            "verbosity": -1,
            # LightGBM handles NaN natively by learning a default direction per
            # split. That is exactly the behaviour wanted here: a missing
            # feature is informative (something was unusable) and imputing it
            # to a mean would erase that information.
            "use_missing": True,
            "zero_as_missing": False,
        }

    def xgboost_params(self, scale_pos_weight: float) -> dict[str, Any]:
        return {
            "objective": "binary:logistic",
            "eval_metric": ["aucpr", "logloss"],
            "tree_method": "hist",
            "learning_rate": self.learning_rate,
            "max_depth": min(self.max_depth, 6),
            "min_child_weight": 10,
            "subsample": self.bagging_fraction,
            "colsample_bytree": self.feature_fraction,
            "gamma": 0.0,
            "reg_alpha": self.reg_alpha,
            "reg_lambda": self.reg_lambda,
            "scale_pos_weight": scale_pos_weight,
            "seed": self.random_seed,
        }


@dataclass(frozen=True)
class LabelSpec:
    """One binary target: a fault, at a horizon."""

    fault_id: str
    horizon_minutes: int

    @property
    def key(self) -> str:
        return output_key(self.fault_id, self.horizon_minutes)

    @classmethod
    def from_key(cls, key: str) -> "LabelSpec":
        fault_id, horizon = parse_output_key(key)
        return cls(fault_id=fault_id, horizon_minutes=horizon)


#: The horizons every fault is modelled at. Five minutes is "act now", fifteen
#: is "this shift", thirty is "plan it" — and a fault whose lead time is under
#: five minutes is a protection function's job, not a prognosis model's.
DEFAULT_HORIZONS: tuple[int, ...] = (5, 15, 30)


def scale_pos_weight(positives: int, negatives: int) -> float:
    """The imbalance weight, floored so a near-empty class cannot explode it.

    With three positives and three hundred thousand negatives the raw ratio is
    100000, and a model trained at that weight predicts positive everywhere.
    Capping at 100 keeps the loss usable; the real answer to that ratio is that
    the fault does not have enough events to model yet, which the dataset
    builder reports separately.
    """
    if positives <= 0:
        return 1.0
    return float(min(100.0, max(1.0, negatives / positives)))


def to_matrix(
    rows: Sequence[Sequence[float | None]],
) -> Any:
    """Rows to a float matrix with ``None`` as NaN.

    NaN on purpose. Both libraries treat it as missing and learn a default
    split direction, which is the honest encoding of "this feature could not be
    computed" — unlike a zero, which is a real value on most of these scales.
    """
    from ...core.capability import module

    numpy = module("numpy")
    return numpy.array(
        [[numpy.nan if value is None else float(value) for value in row] for row in rows],
        dtype="float64",
    )


def class_counts(labels: Sequence[int]) -> tuple[int, int]:
    positives = sum(1 for value in labels if value == 1)
    return positives, len(labels) - positives


#: Below this many confirmed positive events, a fault is not modelled at all.
#: A binary classifier fitted on two positives will produce a number, and the
#: number will be a memorised timestamp. Reporting "not enough events" is the
#: correct output and the dataset builder emits it per fault.
MIN_POSITIVE_EVENTS = 8
MIN_POSITIVE_SAMPLES = 50


def trainable(positive_events: int, positive_samples: int) -> tuple[bool, str | None]:
    """Whether a fault-horizon pair has enough evidence to fit at all."""
    if positive_events < MIN_POSITIVE_EVENTS:
        return False, (
            f"{positive_events} confirmed event(s), below the {MIN_POSITIVE_EVENTS} minimum. "
            "A model fitted on this many would memorise them."
        )
    if positive_samples < MIN_POSITIVE_SAMPLES:
        return False, (
            f"{positive_samples} positive sample(s), below the {MIN_POSITIVE_SAMPLES} minimum."
        )
    return True, None
