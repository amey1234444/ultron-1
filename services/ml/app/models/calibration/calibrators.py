"""Making a tree score mean what it says.

A gradient-boosted binary score is not a probability. Trained under
``scale_pos_weight`` on a rare class it is systematically shifted, and a raw
0.80 can correspond to an observed rate anywhere from 0.3 to 0.95. Surfacing
that as "80% risk" in front of an engineer is a lie the model did not intend to
tell.

Calibration fixes the mapping. Two methods, chosen by how much validation data
exists:

``platt``    a one-parameter logistic fit. Stable on a few hundred samples and
             the right default when positives are scarce, which is always here.
``isotonic`` a monotone step function. Strictly more flexible and strictly
             more willing to overfit; it needs a few thousand samples with a
             meaningful number of positives before it beats Platt.

Two rules that are enforced, not merely documented:

**Calibrators are fitted on validation data.** Fitting on train reproduces the
training optimism; fitting on test destroys the only unbiased estimate left.
``fit`` takes the split name and refuses anything but ``valid``.

**An unfitted calibrator is the identity, and says so.** ``calibrated=False``
travels onto the response, so an uncalibrated score is never presented as a
frequency.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from math import exp, log
from typing import Any, Literal, Sequence

CalibratorKind = Literal["identity", "platt", "isotonic"]


@dataclass
class Calibrator:
    """A fitted score-to-probability mapping, or the identity."""

    kind: CalibratorKind = "identity"
    slope: float = 1.0
    intercept: float = 0.0
    knots_x: tuple[float, ...] = ()
    knots_y: tuple[float, ...] = ()
    fitted_on_split: str | None = None
    sample_count: int = 0
    positive_count: int = 0
    metrics: dict[str, float] = field(default_factory=dict)

    @classmethod
    def identity(cls) -> "Calibrator":
        return cls(kind="identity")

    @property
    def fitted(self) -> bool:
        return self.kind != "identity"

    def apply(self, score: float) -> float | None:
        """The calibrated probability, or None when nothing is fitted.

        None rather than the raw score, so a caller cannot accidentally treat
        an uncalibrated number as calibrated. ``Prediction.probability`` falls
        back to the raw score deliberately and the response records which.
        """
        if self.kind == "identity":
            return None
        if self.kind == "platt":
            return _sigmoid(self.slope * _logit(score) + self.intercept)
        return _interpolate(self.knots_x, self.knots_y, score)

    def to_json(self) -> dict[str, Any]:
        return {
            "kind": self.kind,
            "slope": self.slope,
            "intercept": self.intercept,
            "knots_x": list(self.knots_x),
            "knots_y": list(self.knots_y),
            "fitted_on_split": self.fitted_on_split,
            "sample_count": self.sample_count,
            "positive_count": self.positive_count,
            "metrics": self.metrics,
        }

    @classmethod
    def from_json(cls, payload: dict[str, Any]) -> "Calibrator":
        if not payload:
            return cls.identity()
        return cls(
            kind=payload.get("kind", "identity"),
            slope=float(payload.get("slope", 1.0)),
            intercept=float(payload.get("intercept", 0.0)),
            knots_x=tuple(payload.get("knots_x", ())),
            knots_y=tuple(payload.get("knots_y", ())),
            fitted_on_split=payload.get("fitted_on_split"),
            sample_count=int(payload.get("sample_count", 0) or 0),
            positive_count=int(payload.get("positive_count", 0) or 0),
            metrics=payload.get("metrics", {}),
        )


#: Below this many positives, isotonic regression memorises them. Platt's one
#: parameter is the only defensible fit at that scale.
ISOTONIC_MIN_POSITIVES = 200


def fit_calibrator(
    scores: Sequence[float],
    labels: Sequence[int],
    *,
    split: str,
    kind: CalibratorKind | None = None,
) -> Calibrator:
    """Fit on the validation split, choosing the method by data volume."""
    if split != "valid":
        raise ValueError(
            f"A calibrator may only be fitted on the validation split; got {split!r}. "
            "Fitting on train reproduces training optimism; fitting on test destroys "
            "the only unbiased estimate remaining."
        )
    if len(scores) != len(labels):
        raise ValueError("scores and labels must be the same length")

    positives = sum(1 for value in labels if value == 1)
    if positives == 0 or positives == len(labels):
        # One class only. Nothing to calibrate against, and a fit would map
        # everything to a constant.
        return Calibrator.identity()

    chosen: CalibratorKind = kind or ("isotonic" if positives >= ISOTONIC_MIN_POSITIVES else "platt")
    calibrator = _fit_isotonic(scores, labels) if chosen == "isotonic" else _fit_platt(scores, labels)
    calibrator.fitted_on_split = split
    calibrator.sample_count = len(scores)
    calibrator.positive_count = positives
    calibrator.metrics = {
        "brier_before": brier_score(scores, labels),
        "brier_after": brier_score(
            [calibrator.apply(score) or score for score in scores], labels
        ),
    }
    return calibrator


def _fit_platt(scores: Sequence[float], labels: Sequence[int]) -> Calibrator:
    """Logistic regression of the label on the score's logit.

    Newton-Raphson on two parameters, written out rather than pulled from
    scikit-learn so the deterministic path keeps no hard dependency on it. It
    converges in a handful of iterations on a problem this small.
    """
    xs = [_logit(score) for score in scores]
    ys = [float(label) for label in labels]

    slope, intercept = 1.0, 0.0
    for _ in range(100):
        gradient = [0.0, 0.0]
        hessian = [[1e-9, 0.0], [0.0, 1e-9]]
        for x, y in zip(xs, ys):
            p = _sigmoid(slope * x + intercept)
            error = p - y
            weight = max(p * (1 - p), 1e-9)
            gradient[0] += error * x
            gradient[1] += error
            hessian[0][0] += weight * x * x
            hessian[0][1] += weight * x
            hessian[1][0] += weight * x
            hessian[1][1] += weight
        determinant = hessian[0][0] * hessian[1][1] - hessian[0][1] * hessian[1][0]
        if abs(determinant) < 1e-12:
            break
        step_slope = (hessian[1][1] * gradient[0] - hessian[0][1] * gradient[1]) / determinant
        step_intercept = (hessian[0][0] * gradient[1] - hessian[1][0] * gradient[0]) / determinant
        slope -= step_slope
        intercept -= step_intercept
        if abs(step_slope) < 1e-9 and abs(step_intercept) < 1e-9:
            break

    return Calibrator(kind="platt", slope=slope, intercept=intercept)


def _fit_isotonic(scores: Sequence[float], labels: Sequence[int]) -> Calibrator:
    """Pool-adjacent-violators isotonic regression.

    Produces a monotone step function through the observed rates. Monotone
    matters: a calibration that let a higher score map to a lower probability
    would make the ranking and the probability disagree, and every threshold
    downstream assumes they do not.
    """
    pairs = sorted(zip(scores, (float(label) for label in labels)))
    values = [value for _, value in pairs]
    weights = [1.0] * len(values)

    index = 0
    while index < len(values) - 1:
        if values[index] <= values[index + 1]:
            index += 1
            continue
        total_weight = weights[index] + weights[index + 1]
        pooled = (values[index] * weights[index] + values[index + 1] * weights[index + 1]) / total_weight
        values[index] = pooled
        weights[index] = total_weight
        del values[index + 1]
        del weights[index + 1]
        # Re-check backwards: pooling can violate monotonicity with the block
        # before it, which is the whole reason the algorithm is iterative.
        if index > 0:
            index -= 1

    knots_x: list[float] = []
    knots_y: list[float] = []
    position = 0
    for value, weight in zip(values, weights):
        count = int(round(weight))
        block = pairs[position : position + count]
        position += count
        if not block:
            continue
        knots_x.append(block[-1][0])
        knots_y.append(value)

    return Calibrator(kind="isotonic", knots_x=tuple(knots_x), knots_y=tuple(knots_y))


def _sigmoid(value: float) -> float:
    if value >= 0:
        return 1.0 / (1.0 + exp(-min(value, 60.0)))
    scaled = exp(max(value, -60.0))
    return scaled / (1.0 + scaled)


def _logit(probability: float) -> float:
    clipped = min(max(probability, 1e-6), 1 - 1e-6)
    return log(clipped / (1 - clipped))


def _interpolate(xs: Sequence[float], ys: Sequence[float], value: float) -> float:
    if not xs:
        return value
    if value <= xs[0]:
        return ys[0]
    if value >= xs[-1]:
        return ys[-1]
    for index in range(1, len(xs)):
        if value <= xs[index]:
            span = xs[index] - xs[index - 1]
            if span <= 0:
                return ys[index]
            weight = (value - xs[index - 1]) / span
            return ys[index - 1] + weight * (ys[index] - ys[index - 1])
    return ys[-1]


def brier_score(probabilities: Sequence[float], labels: Sequence[int]) -> float:
    """Mean squared error of a probability. Lower is better; 0.25 is a coin."""
    if not probabilities:
        return 0.0
    return sum((p - label) ** 2 for p, label in zip(probabilities, labels)) / len(probabilities)


def reliability_curve(
    probabilities: Sequence[float], labels: Sequence[int], *, bins: int = 10
) -> list[dict[str, float]]:
    """Predicted versus observed frequency, per bin.

    The plot that answers "does 0.8 mean 80%". Empty bins are omitted rather
    than reported as zero, because no prediction in a bin is not the same as
    every prediction in it being wrong.
    """
    buckets: list[list[tuple[float, int]]] = [[] for _ in range(bins)]
    for probability, label in zip(probabilities, labels):
        index = min(bins - 1, max(0, int(probability * bins)))
        buckets[index].append((probability, label))

    curve: list[dict[str, float]] = []
    for index, bucket in enumerate(buckets):
        if not bucket:
            continue
        predicted = sum(probability for probability, _ in bucket) / len(bucket)
        observed = sum(label for _, label in bucket) / len(bucket)
        curve.append(
            {
                "bin_lower": index / bins,
                "bin_upper": (index + 1) / bins,
                "predicted": predicted,
                "observed": observed,
                "count": float(len(bucket)),
            }
        )
    return curve


def expected_calibration_error(
    probabilities: Sequence[float], labels: Sequence[int], *, bins: int = 10
) -> float:
    """Weighted mean gap between predicted and observed, across bins."""
    curve = reliability_curve(probabilities, labels, bins=bins)
    total = sum(entry["count"] for entry in curve)
    if total == 0:
        return 0.0
    return sum(abs(entry["predicted"] - entry["observed"]) * entry["count"] for entry in curve) / total
