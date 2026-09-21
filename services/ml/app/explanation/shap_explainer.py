"""SHAP explanations, and the sentence that must travel with every one.

**SHAP explains the model, not the machine.** A large positive contribution
from ``TS-P3.slope_120s`` means the classifier's output moved up because that
feature had that value. It does not mean rising pressure *causes* the fault. The
physical WHY comes from the DOC-07 library and the measured evidence, and the
Analyzer labels the two panels differently for that reason.

Said plainly because the confusion is expensive: an engineer who reads a SHAP
bar chart as a causal ranking will go and work on the feature at the top, which
on a correlated feature set is frequently a symptom rather than a cause.

Cost is the other concern. Exact tree SHAP on a 1600-column vector is
milliseconds per output, which is fine on demand and wasteful at 1 Hz across
every fault. So explanations are computed when a risk crosses a meaningful
threshold, when the diagnosis changes, or when an operator opens the detail
view — never unconditionally.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence

from ..features.engine import FeatureFrame
from ..features.registry import describe
from ..models.trees.ensemble import TreeEnsemble

#: The caveat the API attaches to every explanation payload.
SHAP_CAVEAT = (
    "These are contributions to the model's output, not a causal ranking. The physical "
    "explanation comes from the fault library and the measured evidence, which are shown "
    "separately."
)


@dataclass(frozen=True)
class Contribution:
    """One feature's contribution, with everything needed to render it."""

    feature_id: str
    feature_name: str
    value: float | None
    unit: str | None
    shap: float
    family: str

    @property
    def direction(self) -> str:
        return "increases_risk" if self.shap > 0 else "decreases_risk"


@dataclass
class Explanation:
    """The contributions for one output, or the reason there are none."""

    available: bool
    output: str
    top_positive: list[Contribution]
    top_negative: list[Contribution]
    base_value: float | None = None
    reason: str | None = None
    caveat: str = SHAP_CAVEAT

    def all_contributions(self) -> list[Contribution]:
        return [*self.top_positive, *self.top_negative]


UNAVAILABLE_NO_MODEL = "No structured model is loaded, so there is nothing to explain."


def explain_output(
    ensemble: TreeEnsemble,
    features: FeatureFrame,
    feature_ids: Sequence[str],
    vector: Sequence[float | None],
    output: str,
    *,
    top_k: int = 8,
    include_negative: bool = True,
) -> Explanation:
    """Contributions for one fault-horizon output, largest magnitude first."""
    if not ensemble.available:
        return Explanation(
            available=False,
            output=output,
            top_positive=[],
            top_negative=[],
            reason=ensemble.reason or UNAVAILABLE_NO_MODEL,
        )

    pairs = ensemble.explain(vector, output)
    if not pairs:
        return Explanation(
            available=False,
            output=output,
            top_positive=[],
            top_negative=[],
            reason="The model could not produce contributions for this output.",
        )

    lookup = {feature_id: index for index, feature_id in enumerate(feature_ids)}
    contributions: list[Contribution] = []
    for feature_id, shap in pairs:
        # A contribution of exactly zero is a feature the trees never split on
        # for this sample. Listing it is noise.
        if shap == 0.0:
            continue
        definition = describe(feature_id)
        index = lookup.get(feature_id)
        raw = vector[index] if index is not None and index < len(vector) else None
        computed = features.get(feature_id)
        contributions.append(
            Contribution(
                feature_id=feature_id,
                feature_name=definition.name if definition else feature_id,
                value=raw if raw is not None else (computed.value if computed else None),
                unit=definition.unit if definition else (computed.unit if computed else None),
                shap=float(shap),
                family=definition.family if definition else "UNKNOWN",
            )
        )

    positive = sorted(
        (entry for entry in contributions if entry.shap > 0), key=lambda entry: -entry.shap
    )[:top_k]
    negative = (
        sorted((entry for entry in contributions if entry.shap < 0), key=lambda entry: entry.shap)[
            : max(1, top_k // 2)
        ]
        if include_negative
        else []
    )

    return Explanation(
        available=True,
        output=output,
        top_positive=positive,
        top_negative=negative,
        base_value=ensemble.base_value(output, vector),
    )


def should_explain(
    *,
    probability: float,
    crossed: bool,
    diagnosis_changed: bool,
    requested: bool,
    floor: float,
) -> bool:
    """Whether this inference earns the cost of an explanation.

    An explicit request always wins — that is an operator with the detail view
    open, and making them wait for the next cadence tick would be absurd.
    """
    if requested:
        return True
    if crossed or diagnosis_changed:
        return True
    return probability >= floor


def narrative(
    *,
    fault_name: str,
    where: str,
    mechanism: str,
    explanation: Explanation,
    horizon_minutes: int,
    probability: float,
) -> str:
    """A deterministic sentence assembled from the knowledge and the evidence.

    Template-driven on purpose. A generative model writing this paragraph would
    produce something more fluent and occasionally invent a root cause, and in
    the UI an invented cause is indistinguishable from a validated one.
    """
    lines = [
        f"{fault_name} at {where}: {probability * 100:.0f}% modelled risk within "
        f"{horizon_minutes} minutes.",
    ]
    if mechanism:
        lines.append(mechanism)
    if explanation.available and explanation.top_positive:
        drivers = ", ".join(
            f"{entry.feature_name}"
            + (f" ({entry.value:.3g} {entry.unit})" if entry.value is not None and entry.unit else "")
            for entry in explanation.top_positive[:3]
        )
        lines.append(f"The model's output is driven most by: {drivers}.")
        lines.append(SHAP_CAVEAT)
    elif explanation.reason:
        lines.append(f"No model explanation is available: {explanation.reason}")
    return " ".join(lines)
