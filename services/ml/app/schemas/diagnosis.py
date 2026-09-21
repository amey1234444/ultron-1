"""The versioned diagnosis response contract.

This is what the Analyzer parses, so it is the one schema that cannot change
casually. ``schema_version`` is on the envelope and the TypeScript mirror in
``lib/knowledge/ml/contract.ts`` declares the same string; a test on each side
checks it.

The shape encodes the separation DOC-05 §3 insists on, structurally rather
than by convention:

    current_condition   what the deterministic system sees *now*
    anomalies           what is abnormal, per signal
    diagnoses[].risk    what may develop, per horizon        <- learned
    diagnoses[].*_confidence   how sure we are, three ways
    diagnoses[].severity / impact / priority / action        <- DOC-05

A reader cannot accidentally use a risk as a severity, because they are
different fields with different types in different objects. That is the whole
design: the confusion DOC-05 exists to prevent is made unrepresentable rather
than merely discouraged.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from ..core.versions import CONTRACT_VERSION
from ..knowledge.enums import (
    ActionStep,
    AnomalyVerdict,
    BaselineConfidence,
    BaselineLevel,
    ConditionVerdict,
    ConfidenceLevel,
    DiagnosisState,
    EvidenceClass,
    ImpactLevel,
    LimitAuthority,
    LimitStatus,
    OperatingState,
    Priority,
    ProgressionStage,
    QualityVerdict,
    Severity,
    TrendDirection,
)


class DataQualityIssue(BaseModel):
    """One DQ finding, carrying the rule that produced it."""

    model_config = ConfigDict(extra="forbid")

    signal_id: str
    rule_id: str
    check: str
    verdict: QualityVerdict
    reason: str
    downstream_rule: str
    suppresses_physical_diagnosis: bool = False


class DataQualityBlock(BaseModel):
    model_config = ConfigDict(extra="forbid")

    overall: QualityVerdict
    issues: list[DataQualityIssue] = Field(default_factory=list)
    signals_reporting: int = 0
    signals_expected: int = 0
    bad_or_missing_count: int = 0
    mandatory_unavailable: list[str] = Field(default_factory=list)


class MLBlock(BaseModel):
    """Whether the learned layer ran, and its honest status if not."""

    model_config = ConfigDict(extra="forbid")

    eligible: bool
    status: str
    """OK | DEGRADED | INELIGIBLE | DISABLED, from ``core.errors.MLStatus``."""

    eligibility_reason: str | None = None
    """One of ``MLIneligibleReason``. Null when eligible."""

    reason_detail: str | None = None
    mode: str = "shadow"
    surfaced: bool = False
    """Whether these findings may raise an operator alert in the current mode."""

    degraded_components: list[str] = Field(default_factory=list)
    inference_latency_ms: float | None = None


class ContextBlock(BaseModel):
    model_config = ConfigDict(extra="forbid")

    operating_state: OperatingState
    operating_state_name: str
    state_confidence: float
    state_source: str
    time_in_state_seconds: float | None = None
    state_transition: str | None = None

    context_id: str | None = None
    context_confidence: float = 0.0
    context_missing: list[str] = Field(default_factory=list)

    recipe_id: str | None = None
    material_id: str | None = None
    configuration_version: str | None = None

    baseline_id: str | None = None
    baseline_level: BaselineLevel | None = None
    baseline_confidence: BaselineConfidence = "NONE"


class CurrentCondition(BaseModel):
    """What the deterministic layer says, with no learned input at all.

    Kept whole and separate so that a reader can answer "is anything actually
    wrong right now" without reading a single model output — which is also the
    response the service returns when every model is unavailable.
    """

    model_config = ConfigDict(extra="forbid")

    verdict: ConditionVerdict
    rule_state: Severity
    rule_state_reason: str
    customer_alert_reached: bool = False
    customer_danger_reached: bool = False
    trip_active: bool = False
    active_anomaly_count: int = 0


class AnomalyReport(BaseModel):
    model_config = ConfigDict(extra="forbid")

    signal_id: str
    label: str
    anomaly_id: str | None = None
    """The DOC-07 library id, when one fits. Null rather than a nearest guess."""

    verdict: AnomalyVerdict
    blocked_at_gate: str | None = None
    reason: str
    value: float | None = None
    unit: str | None = None
    expected: float | None = None
    absolute_deviation: float | None = None
    percent_deviation: float | None = None
    robust_score: float | None = None
    trend: TrendDirection = "UNKNOWN"
    rate_of_change_per_min: float | None = None
    persistence_seconds: float | None = None
    limit_status: LimitStatus = "NONE"
    data_quality: QualityVerdict = "GOOD"


class Evidence(BaseModel):
    model_config = ConfigDict(extra="forbid")

    evidence_class: EvidenceClass
    statement: str
    signal_id: str | None = None
    quality: QualityVerdict | None = None


class ShapContribution(BaseModel):
    """One feature's contribution to one model output.

    ``shap`` is a contribution to the *model's* output, and the field name says
    so. DOC-04's WHY comes from the fault library and the measured evidence;
    this block explains the classifier, and the Analyzer labels it that way.
    """

    model_config = ConfigDict(extra="forbid")

    feature: str
    feature_name: str
    value: float | None
    unit: str | None
    shap: float
    direction: str
    """``increases_risk`` or ``decreases_risk``. Redundant with the sign, and
    worth the redundancy — a negative SHAP on a negative feature value is read
    backwards by most people most of the time."""


class ConfidenceScore(BaseModel):
    model_config = ConfigDict(extra="forbid")

    score: float = Field(ge=0.0, le=1.0)
    level: ConfidenceLevel
    basis: list[str] = Field(default_factory=list)
    """What raised or capped it, in readable phrases."""


class ImpactBlock(BaseModel):
    model_config = ConfigDict(extra="forbid")

    equipment: ImpactLevel = "NONE"
    process: ImpactLevel = "NONE"
    production: ImpactLevel = "NONE"
    quality: ImpactLevel = "NONE"
    energy: ImpactLevel = "NONE"
    safety: ImpactLevel = "NONE"
    downtime: ImpactLevel = "NONE"
    horizon: str = "CURRENT"


class RecommendedAction(BaseModel):
    model_config = ConfigDict(extra="forbid")

    level: str
    sequence: list[ActionStep] = Field(default_factory=list)
    text: str
    source: str = "DOC05/DOC07"
    authority: str = "ULTRON_RECOMMENDATION"
    sop_id: str | None = None


class RiskHorizon(BaseModel):
    """One calibrated probability, with everything needed to read it.

    A bare 0.87 is unusable: over what horizon, against which threshold, after
    how much persistence, and was it calibrated at all. All four travel with
    the number.
    """

    model_config = ConfigDict(extra="forbid")

    horizon_minutes: int
    probability: float = Field(ge=0.0, le=1.0)
    calibrated: bool
    threshold: float
    raise_threshold: float
    clear_threshold: float
    persistence_met: bool
    consecutive_eligible_cycles: int = 0
    crossed: bool = False
    """Threshold *and* persistence, after hysteresis. The only field the
    decision layer is allowed to act on."""


class DiagnosisEntry(BaseModel):
    """One fault, with its evidence, its risk and its decision.

    Note what is *not* here: a single "confidence" number. There are three, and
    they routinely disagree — a restriction can be near-certain while its root
    cause is a guess. DOC-05 §13's example is exactly that case.
    """

    model_config = ConfigDict(extra="forbid")

    fault_id: str
    diagnosis: str
    fault_family: str
    diagnosis_state: DiagnosisState

    what: str
    where: str
    why: str
    mechanism: str

    risk: list[RiskHorizon] = Field(default_factory=list)

    fault_confidence: ConfidenceScore
    location_confidence: ConfidenceScore
    root_cause_confidence: ConfidenceScore

    supporting_evidence: list[Evidence] = Field(default_factory=list)
    contradicting_evidence: list[Evidence] = Field(default_factory=list)
    missing_evidence: list[Evidence] = Field(default_factory=list)
    alternatives: list[str] = Field(default_factory=list)
    root_cause_candidates: list[str] = Field(default_factory=list)
    grouped_symptoms: list[str] = Field(default_factory=list)
    """Downstream effects rolled up under this cause rather than alarmed
    separately. DOC-04 §19: a causal chain is one diagnosis with symptoms."""

    caused_by: str | None = None
    """The fault id this one is a downstream effect of, when the direction is
    known. Null when the direction is uncertain, which is not the same as
    absent — an uncertain direction is stated in ``why`` instead."""

    shap: list[ShapContribution] = Field(default_factory=list)
    shap_available: bool = False
    shap_unavailable_reason: str | None = None

    severity: Severity
    severity_authority: LimitAuthority | None = None
    severity_reason: str
    progression: ProgressionStage = "EARLY"
    impact: ImpactBlock = Field(default_factory=ImpactBlock)
    priority: Priority
    priority_reason: str
    recommended_action: RecommendedAction

    source: str = "RULES"
    """RULES | ML | RULES+ML. Which layer put this entry on the page."""

    surfaced: bool = True
    """False in shadow mode: persisted and visible to engineering, not alarmed."""


class ModelBlock(BaseModel):
    model_config = ConfigDict(extra="forbid")

    temporal_model: str | None = None
    diagnosis_model: str | None = None
    calibrator: str | None = None
    champion: str | None = None
    feature_set_version: str | None = None
    trained_on_dataset: str | None = None
    trained_on_real_data: bool = False
    """False while the only fitted artifacts came from synthetic fixtures.

    Surfaced rather than hidden. A model trained on generated scenarios has
    real software behaviour and no evidential value about this machine, and the
    UI says so wherever a risk from it is shown.
    """


class DiagnosisResponse(BaseModel):
    """The whole answer for one machine at one instant."""

    model_config = ConfigDict(extra="forbid")

    schema_version: str = CONTRACT_VERSION
    machine_id: str
    timestamp: datetime
    prediction_id: str

    data_quality: DataQualityBlock
    ml: MLBlock
    context: ContextBlock
    current_condition: CurrentCondition
    anomalies: list[AnomalyReport] = Field(default_factory=list)
    diagnoses: list[DiagnosisEntry] = Field(default_factory=list)

    models: ModelBlock = Field(default_factory=ModelBlock)
    versions: dict[str, str] = Field(default_factory=dict)

    commissioning_notice: str | None = None
    uses_uncalibrated_limits: bool = True

    notes: list[str] = Field(default_factory=list)
    """Things an engineer should know that are not findings — a frozen
    baseline, a replayed frame, a model running in shadow."""

    def highest_risk(self) -> tuple[str, RiskHorizon] | None:
        """The largest calibrated risk across every fault and horizon."""
        best: tuple[str, RiskHorizon] | None = None
        for entry in self.diagnoses:
            for horizon in entry.risk:
                if best is None or horizon.probability > best[1].probability:
                    best = (entry.fault_id, horizon)
        return best


class ExplanationResponse(BaseModel):
    """A stored explanation, fetched by prediction id."""

    model_config = ConfigDict(extra="forbid")

    schema_version: str = CONTRACT_VERSION
    prediction_id: str
    machine_id: str
    timestamp: datetime
    fault_id: str
    horizon_minutes: int
    probability: float
    model_id: str
    contributions: list[ShapContribution] = Field(default_factory=list)
    base_value: float | None = None
    narrative: str = ""
    narrative_source: str = "DOC07_TEMPLATE"
    """Deterministic template, never generated prose. A root cause an LLM
    invented is indistinguishable in the UI from one the fault library
    asserted, and only one of them is knowledge."""

    extra: dict[str, Any] = Field(default_factory=dict)
