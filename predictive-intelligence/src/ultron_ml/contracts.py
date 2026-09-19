"""Versioned input/output contracts (Doc A §16; brief: INPUT CONTRACT / OUTPUT CONTRACT).

Telemetry packets are validated *structurally* here. Physical plausibility, freshness, freezing
etc. are the job of :mod:`ultron_ml.data_quality`. A missing channel is ``None`` – never zero.
"""

from __future__ import annotations

from datetime import UTC, datetime
from enum import StrEnum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from ultron_ml import SCHEMA_VERSION
from ultron_ml.config.models import Detectability, OperatingState


class Contract(BaseModel):
    model_config = ConfigDict(extra="forbid")


class QualityFlag(StrEnum):
    GOOD = "GOOD"
    UNCERTAIN = "UNCERTAIN"
    BAD = "BAD"
    STALE = "STALE"
    MISSING = "MISSING"


class TelemetryPacket(Contract):
    """One 1 Hz sample for one machine (Doc A §16.1 example)."""

    schema_version: str = SCHEMA_VERSION
    machine_id: str = Field(min_length=1)
    machine_profile: str = Field(default="tse", pattern=r"^[a-z][a-z0-9_]*$")
    timestamp: datetime
    operating_state: OperatingState = OperatingState.STEADY_PRODUCTION
    recipe_id: str | None = None
    channels: dict[str, float | int | None]
    quality: dict[str, QualityFlag] = Field(default_factory=dict)
    sequence: int | None = Field(default=None, ge=0)
    config_version: str | None = None

    @field_validator("timestamp")
    @classmethod
    def _tz_aware(cls, v: datetime) -> datetime:
        if v.tzinfo is None:
            raise ValueError("timestamp must be timezone-aware (ISO-8601 with offset)")
        return v.astimezone(UTC)

    @field_validator("channels")
    @classmethod
    def _numeric(cls, v: dict[str, Any]) -> dict[str, float | None]:
        out: dict[str, float | None] = {}
        for k, x in v.items():
            if x is None:
                out[k] = None
            elif isinstance(x, bool) or not isinstance(x, int | float):
                raise ValueError(f"channel {k}: value must be numeric or null, got {type(x).__name__}")
            else:
                out[k] = float(x)
        return out


class Severity(StrEnum):
    NORMAL = "NORMAL"
    WARNING = "WARNING"
    SEVERE = "SEVERE"


class DataQualityIssue(Contract):
    code: str  # e.g. STALE, MISSING_CHANNEL, FROZEN, RATE_OF_CHANGE, IMPLAUSIBLE, ...
    channel: str | None = None
    severity: Literal["INFO", "WARNING", "REJECT"]
    message: str
    value: float | None = None


class DataQualityReport(Contract):
    valid: bool  # packet usable for rules
    ml_eligible: bool  # packet usable for ML features/inference
    issues: list[DataQualityIssue] = Field(default_factory=list)
    channel_flags: dict[str, list[str]] = Field(default_factory=dict)
    missing_channels: list[str] = Field(default_factory=list)
    stale_seconds: float | None = None
    dq_version: str


class RuleViolation(Contract):
    rule_id: str
    channel: str
    severity: Severity
    value: float
    boundary: str  # e.g. "severe.high"
    limit: float
    unit: str
    message: str


class RuleResult(Contract):
    status: Severity
    developing: list[str] = Field(default_factory=list)  # channels outside normal but inside warning
    violations: list[RuleViolation] = Field(default_factory=list)
    reasons: list[str] = Field(default_factory=list)
    sensor_values: dict[str, float | None] = Field(default_factory=dict)
    timestamp: datetime
    rule_version: str
    config_hash: str
    operating_state: OperatingState
    state_suppressed: list[str] = Field(default_factory=list)


class Contribution(Contract):
    feature: str
    value: float | None
    unit: str = ""
    shap: float
    direction: Literal["increases_risk", "decreases_risk"]
    description: str = ""


class Hypothesis(Contract):
    fault_id: str
    fault_family: str
    probability: float = Field(ge=0, le=1)
    detectability: Detectability
    evidence_available: list[str] = Field(default_factory=list)
    evidence_missing: list[str] = Field(default_factory=list)


class Diagnosis(Contract):
    status: Literal["NORMAL", "DEVELOPING", "WARNING", "SEVERE", "SUPPRESSED", "DATA_QUALITY_FAULT"]
    fault_family: str | None = None
    specific_fault: str | None = None
    detectability: Detectability | None = None
    localization_confidence: Literal["HIGH", "MEDIUM", "LOW", "NONE"] = "NONE"
    probability: float | None = Field(default=None, ge=0, le=1)
    alternatives: list[Hypothesis] = Field(default_factory=list)
    evidence_available: list[str] = Field(default_factory=list)
    evidence_missing: list[str] = Field(default_factory=list)
    top_contributors: list[Contribution] = Field(default_factory=list)
    narrative: str = ""
    propagation_chain: list[str] = Field(default_factory=list)


class HorizonRisk(Contract):
    fault: str  # fault or family id
    horizon: str  # "5m" | "15m" | "30m"
    probability: float = Field(ge=0, le=1)
    calibrated: bool
    threshold_on: float
    persistent: bool  # N-of-M satisfied
    alert: bool  # passed hysteresis/cooldown/gates
    suppressed_by: list[str] = Field(default_factory=list)
    top_contributors: list[Contribution] = Field(default_factory=list)


class InferenceResponse(Contract):
    schema_version: str = SCHEMA_VERSION
    machine_id: str
    machine_profile: str
    timestamp: datetime
    operating_state: OperatingState
    data_quality: DataQualityReport
    rules: RuleResult | None
    diagnosis: Diagnosis
    prognosis: list[HorizonRisk] = Field(default_factory=list)
    ml_available: bool
    ml_eligible: bool
    ml_suppression_reasons: list[str] = Field(default_factory=list)
    model_version: str | None = None
    feature_schema_version: str | None = None
    taxonomy_version: str
    config_hash: str
    advisory_notice: str = (
        "ADVISORY ONLY. This output does not perform control or safety action; protection "
        "trips and interlocks remain with the machine/VFD/safety system."
    )
