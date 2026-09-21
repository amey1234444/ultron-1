"""Ablation: proving each architectural layer earns its place.

The architecture is hybrid and every layer costs something — training time,
serving latency, a dependency, a failure mode. The only defensible reason to
keep one is that it measurably improves something, and the only way to know
that is to build the same model without it and compare.

    E0  Rules only, no learned model at all
    E1  LightGBM on raw current values
    E2  LightGBM on the full engineered feature set
    E3  XGBoost on exactly E2's features
    E4  Temporal model alone, as a residual detector
    E5  E2 features plus LSTM residuals
    E6  E5 plus the 32-dimensional temporal embedding
    E7  E6 with calibration and the persistence/hysteresis decision layer

E0 is the one people skip and the one that matters most: if the deterministic
rules catch the same events at the same lead time, the whole learned stack is
a liability rather than a feature.

Every arm sees the same dataset, the same splits, the same events and the same
evaluation. The comparison is otherwise worthless — a difference between arms
would be a difference between experimental setups.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Sequence

from ..features.registry import FeatureFamily, definition_index


@dataclass(frozen=True)
class AblationArm:
    """One experiment: which feature families it sees, and what it proves."""

    arm_id: str
    name: str
    description: str
    library: str | None
    """None for the rules-only arm, which fits nothing."""

    families: tuple[str, ...]
    """Feature families included. Empty means all of them."""

    include_residuals: bool = False
    include_embedding: bool = False
    calibrated: bool = False
    decision_layer: bool = False
    proves: str = ""


#: Families that count as "raw current values" for E1 — the deliberately naive
#: baseline. Anything a control-room screen already shows.
_RAW_FAMILIES: tuple[str, ...] = ("RAW", "CONTEXT", "QUALITY")

ARMS: tuple[AblationArm, ...] = (
    AblationArm(
        arm_id="E0",
        name="Rules only",
        description="The deterministic DOC-02..DOC-05 chain with no learned model.",
        library=None,
        families=(),
        proves=(
            "The floor. Every learned arm has to beat this on lead time or false alarms "
            "to justify existing at all."
        ),
    ),
    AblationArm(
        arm_id="E1",
        name="LightGBM on raw values",
        description="Current sensor readings, operating state and data quality only.",
        library="lightgbm",
        families=_RAW_FAMILIES,
        proves="Whether a tree on raw values already does the job, before any feature work.",
    ),
    AblationArm(
        arm_id="E2",
        name="LightGBM on engineered features",
        description="The full DOC-03 feature set: rolling, trend, baseline, threshold, cross-signal.",
        library="lightgbm",
        families=(),
        proves="Whether the engineered features add anything over raw values.",
    ),
    AblationArm(
        arm_id="E3",
        name="XGBoost challenger",
        description="Exactly E2's feature set, splits and labels, different library.",
        library="xgboost",
        families=(),
        proves="Whether the choice of gradient-boosting library matters here at all.",
    ),
    AblationArm(
        arm_id="E4",
        name="Temporal residuals only",
        description="The LSTM's normalised residuals as the sole evidence.",
        library="lightgbm",
        families=("RESIDUAL",),
        include_residuals=True,
        proves="How much of the signal is pure departure-from-recent-behaviour.",
    ),
    AblationArm(
        arm_id="E5",
        name="Engineered features plus residuals",
        description="E2 with the LSTM residual columns added.",
        library="lightgbm",
        families=(),
        include_residuals=True,
        proves="Whether the temporal model contributes beyond the engineered trends.",
    ),
    AblationArm(
        arm_id="E6",
        name="Plus the temporal embedding",
        description="E5 with the 32-dimensional learned summary of the window.",
        library="lightgbm",
        families=(),
        include_residuals=True,
        include_embedding=True,
        proves=(
            "Whether the uninterpretable embedding earns its cost over the interpretable "
            "residuals. If it does not, drop it — it is the one component nobody can read."
        ),
    ),
    AblationArm(
        arm_id="E7",
        name="Full stack with the decision layer",
        description="E6, calibrated, behind persistence, hysteresis and cooldown.",
        library="lightgbm",
        families=(),
        include_residuals=True,
        include_embedding=True,
        calibrated=True,
        decision_layer=True,
        proves=(
            "Whether the decision layer reduces false alarms per hour without losing "
            "event recall or lead time. This is the arm that ships."
        ),
    ),
)

ARMS_BY_ID: dict[str, AblationArm] = {arm.arm_id: arm for arm in ARMS}


def features_for_arm(arm: AblationArm, all_feature_ids: Sequence[str]) -> tuple[str, ...]:
    """The columns one arm is allowed to see.

    Selected by declared family rather than by name matching, so adding a
    feature to a family automatically includes it in every arm that family
    belongs to, instead of silently omitting it from the comparison.
    """
    index = definition_index()
    selected: list[str] = []
    for feature_id in all_feature_ids:
        definition = index.get(feature_id)
        family: FeatureFamily | str = definition.family if definition else "UNKNOWN"

        if family == "RESIDUAL":
            if arm.include_residuals:
                selected.append(feature_id)
            continue
        if family == "EMBEDDING":
            if arm.include_embedding:
                selected.append(feature_id)
            continue
        # An empty family list means every non-temporal family.
        if arm.families and family not in arm.families:
            continue
        selected.append(feature_id)
    return tuple(selected)


@dataclass
class ArmResult:
    """One arm's measured outcome."""

    arm_id: str
    name: str
    library: str | None
    feature_count: int
    metrics: dict[str, dict[str, object]] = field(default_factory=dict)
    """Per output key."""

    skipped: bool = False
    skip_reason: str | None = None

    def headline(self, key: str) -> dict[str, object]:
        return self.metrics.get(key, {})

    def mean_pr_auc(self) -> float | None:
        values = [
            float(entry.get("pr_auc", 0.0))
            for entry in self.metrics.values()
            if entry.get("positives", 0)
        ]
        return round(sum(values) / len(values), 4) if values else None

    def mean_false_alarms(self) -> float | None:
        values = [float(entry.get("false_alarms_per_hour", 0.0)) for entry in self.metrics.values()]
        return round(sum(values) / len(values), 4) if values else None

    def median_lead_time(self) -> float | None:
        values = [
            float(lead["median"])
            for entry in self.metrics.values()
            if isinstance(lead := entry.get("lead_time_seconds"), dict) and lead.get("median") is not None
        ]
        return round(sum(values) / len(values), 1) if values else None


@dataclass
class AblationReport:
    """The comparison, and the verdict on each layer."""

    dataset_id: str
    results: list[ArmResult] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)

    def by_id(self, arm_id: str) -> ArmResult | None:
        for result in self.results:
            if result.arm_id == arm_id:
                return result
        return None

    def verdicts(self) -> list[dict[str, object]]:
        """Did each added layer actually improve anything?

        Stated as an explicit comparison between consecutive arms, because the
        question "should we keep the embedding" has a numeric answer and the
        table is where it goes. A layer whose verdict is "no measurable
        improvement" should be removed, however sophisticated it is.
        """
        comparisons = [
            ("E1", "E2", "Engineered features over raw values"),
            ("E2", "E3", "XGBoost over LightGBM"),
            ("E2", "E5", "LSTM residuals over engineered features alone"),
            ("E5", "E6", "Temporal embedding over residuals alone"),
            ("E6", "E7", "Calibration and the decision layer"),
            ("E0", "E7", "The whole learned stack over deterministic rules"),
        ]
        out: list[dict[str, object]] = []
        for baseline_id, candidate_id, question in comparisons:
            baseline = self.by_id(baseline_id)
            candidate = self.by_id(candidate_id)
            if baseline is None or candidate is None or baseline.skipped or candidate.skipped:
                out.append(
                    {
                        "question": question,
                        "comparison": f"{baseline_id} -> {candidate_id}",
                        "verdict": "NOT_MEASURED",
                        "detail": "One or both arms did not run.",
                    }
                )
                continue

            base_pr = baseline.mean_pr_auc()
            cand_pr = candidate.mean_pr_auc()
            base_fa = baseline.mean_false_alarms()
            cand_fa = candidate.mean_false_alarms()

            improved_quality = base_pr is not None and cand_pr is not None and cand_pr > base_pr + 0.01
            improved_alarms = base_fa is not None and cand_fa is not None and cand_fa < base_fa * 0.9

            verdict = (
                "IMPROVES"
                if improved_quality or improved_alarms
                else "NO_MEASURABLE_IMPROVEMENT"
            )
            out.append(
                {
                    "question": question,
                    "comparison": f"{baseline_id} -> {candidate_id}",
                    "verdict": verdict,
                    "mean_pr_auc": {"baseline": base_pr, "candidate": cand_pr},
                    "false_alarms_per_hour": {"baseline": base_fa, "candidate": cand_fa},
                    "median_lead_time_seconds": {
                        "baseline": baseline.median_lead_time(),
                        "candidate": candidate.median_lead_time(),
                    },
                    "detail": (
                        "Keep the added layer."
                        if verdict == "IMPROVES"
                        else "The added layer did not measurably improve anything. Consider removing it."
                    ),
                }
            )
        return out

    def to_json(self) -> dict[str, object]:
        return {
            "dataset_id": self.dataset_id,
            "arms": [
                {
                    "arm_id": result.arm_id,
                    "name": result.name,
                    "library": result.library,
                    "feature_count": result.feature_count,
                    "skipped": result.skipped,
                    "skip_reason": result.skip_reason,
                    "mean_pr_auc": result.mean_pr_auc(),
                    "mean_false_alarms_per_hour": result.mean_false_alarms(),
                    "median_lead_time_seconds": result.median_lead_time(),
                    "per_output": result.metrics,
                }
                for result in self.results
            ],
            "verdicts": self.verdicts(),
            "notes": self.notes,
        }
