"""Drift monitoring, and the thing it is deliberately not allowed to do.

**Drift never triggers a retrain.** It makes a model *eligible for review*. The
difference is the whole design: PSI crossing 0.2 means the input distribution
moved, and the reasons it moves include a new recipe, a seasonal ambient
change, a replaced sensor, a genuine process improvement and an actual
degradation. Four of those five call for a human to look, and retraining
automatically on any of them produces a model that chases its own inputs.

So this module measures and reports. It has no side effects and nothing calls a
trainer from it.

What is monitored, because each drifts for different reasons:

    raw sensors          instrument replacement, recalibration, ambient
    engineered features  a changed feature version, a changed baseline
    baseline residuals   the machine departing from its own learned normal
    LSTM residuals       the temporal model's expectations going stale
    prediction scores    the output distribution moving, with or without cause
    context mix          a different recipe mix, which is not drift at all
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Sequence

from ..features import families


@dataclass(frozen=True)
class DriftMeasure:
    """One quantity's drift between a reference window and a current one."""

    name: str
    psi: float | None
    reference_median: float | None
    current_median: float | None
    reference_spread: float | None
    current_spread: float | None
    reference_count: int
    current_count: int
    note: str | None = None

    @property
    def level(self) -> str:
        """A band, not a trigger.

        The conventional PSI reading: below 0.1 no meaningful change, 0.1–0.25
        moderate, above 0.25 significant. Conventional, which is to say
        somebody's rule of thumb rather than a property of this process, and
        the band is reported alongside the raw value so a reader can disagree.
        """
        if self.psi is None:
            return "NOT_MEASURABLE"
        if self.psi < 0.1:
            return "STABLE"
        if self.psi < 0.25:
            return "MODERATE"
        return "SIGNIFICANT"

    def to_json(self) -> dict[str, object]:
        return {
            "name": self.name,
            "psi": None if self.psi is None else round(self.psi, 4),
            "level": self.level,
            "reference": {
                "median": self.reference_median,
                "spread": self.reference_spread,
                "count": self.reference_count,
            },
            "current": {
                "median": self.current_median,
                "spread": self.current_spread,
                "count": self.current_count,
            },
            "note": self.note,
        }


def population_stability_index(
    reference: Sequence[float], current: Sequence[float], *, bins: int = 10
) -> float | None:
    """PSI between two samples, binned on the reference's own quantiles.

    Quantile bins rather than equal-width, because an equal-width binning of a
    skewed process variable puts ninety per cent of both samples in one bin and
    reports stability whatever happened.

    Returns None when either sample is too small to say anything. Fifty is not
    a principled number; it is the point below which a ten-bin PSI is mostly
    counting noise.
    """
    if len(reference) < 50 or len(current) < 50:
        return None

    edges = [families.percentile(list(reference), index / bins) for index in range(1, bins)]
    edges = [edge for edge in edges if edge is not None]
    if not edges:
        return None
    # A constant reference has no distribution to compare against.
    if len({round(edge, 12) for edge in edges}) < 2:
        return None

    def distribute(values: Sequence[float]) -> list[float]:
        counts = [0] * (len(edges) + 1)
        for value in values:
            index = 0
            while index < len(edges) and value > edges[index]:
                index += 1
            counts[index] += 1
        total = max(1, len(values))
        # A floor, so an empty bin does not send the log to infinity. It biases
        # the result slightly upward, which is the safe direction for a measure
        # whose purpose is to prompt a look.
        return [max(count / total, 1e-4) for count in counts]

    reference_share = distribute(reference)
    current_share = distribute(current)

    from math import log

    return sum(
        (current - reference) * log(current / reference)
        for reference, current in zip(reference_share, current_share)
    )


def measure(name: str, reference: Sequence[float], current: Sequence[float]) -> DriftMeasure:
    """One quantity, measured."""
    reference_values = [value for value in reference if value is not None]
    current_values = [value for value in current if value is not None]
    psi = population_stability_index(reference_values, current_values)
    return DriftMeasure(
        name=name,
        psi=psi,
        reference_median=families.median(reference_values),
        current_median=families.median(current_values),
        reference_spread=families.mad(reference_values),
        current_spread=families.mad(current_values),
        reference_count=len(reference_values),
        current_count=len(current_values),
        note=(
            "Too few samples to measure. Not evidence of stability."
            if psi is None
            else None
        ),
    )


@dataclass
class DriftReport:
    """Everything measured, and what it makes the model eligible for.

    ``retraining_eligible`` is the strongest statement this module makes, and
    the word is deliberate. It is an input to a human decision, recorded so the
    decision can cite it.
    """

    model_id: str | None
    measures: list[DriftMeasure] = field(default_factory=list)
    context_mix_changed: bool = False
    notes: list[str] = field(default_factory=list)

    @property
    def significant(self) -> list[DriftMeasure]:
        return [entry for entry in self.measures if entry.level == "SIGNIFICANT"]

    @property
    def retraining_eligible(self) -> bool:
        """Whether a human should consider retraining. Never an action."""
        return len(self.significant) >= 3 or self.context_mix_changed

    def review_reasons(self) -> list[str]:
        reasons: list[str] = []
        if self.context_mix_changed:
            reasons.append(
                "The recipe or configuration mix has changed. This is usually not drift at "
                "all — it is a different machine doing different work — and the right "
                "response is often a new context and a new baseline rather than a retrain."
            )
        for entry in self.significant:
            reasons.append(
                f"{entry.name}: PSI {entry.psi:.3f}, median "
                f"{entry.reference_median} to {entry.current_median}."
            )
        if not reasons:
            reasons.append("Nothing has drifted significantly.")
        return reasons

    def to_json(self) -> dict[str, object]:
        return {
            "model_id": self.model_id,
            "measures": [entry.to_json() for entry in self.measures],
            "significant_count": len(self.significant),
            "context_mix_changed": self.context_mix_changed,
            "retraining_eligible": self.retraining_eligible,
            "review_reasons": self.review_reasons(),
            "policy": (
                "Drift makes a model eligible for review. It never triggers a retrain: the "
                "reasons a distribution moves include a new recipe, a replaced sensor and a "
                "genuine process improvement, and retraining on any of those produces a model "
                "that chases its own inputs."
            ),
            "notes": self.notes,
        }


#: The retraining triggers, as data rather than as a paragraph. A deployment's
#: review process reads this list; nothing in the service acts on it.
RETRAINING_TRIGGERS: tuple[dict[str, str], ...] = (
    {
        "trigger": "Enough new verified events",
        "detail": "New GOLD or SILVER events since the last dataset version, for a fault "
        "that was previously below the modelling floor or thinly represented.",
    },
    {
        "trigger": "A new fault class",
        "detail": "A fault confirmed for the first time. The existing model has no output "
        "for it and cannot acquire one without retraining.",
    },
    {
        "trigger": "A new machine configuration",
        "detail": "A configuration version change can invalidate every learned relationship. "
        "Baselines are marked REVIEW_REQUIRED automatically; models are not.",
    },
    {
        "trigger": "Measured performance degradation",
        "detail": "Precision, recall or lead time moving on confirmed events — not on drift.",
    },
    {
        "trigger": "Material process distribution change",
        "detail": "A sustained shift in the operating envelope, reviewed rather than assumed.",
    },
    {
        "trigger": "A sensor set change",
        "detail": "An added or removed instrument changes the feature set, which invalidates "
        "the input contract outright.",
    },
    {
        "trigger": "A feature set change",
        "detail": "FEATURE_SET_VERSION bumped. The eligibility gate already refuses the old "
        "model; retraining is how it is replaced.",
    },
    {
        "trigger": "A material change in baseline logic",
        "detail": "Baseline deviation features are model inputs, so changing how a baseline "
        "is selected changes what the model was trained on.",
    },
)
