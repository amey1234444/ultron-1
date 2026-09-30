"""Pydantic schemas for versioned machine-profile configuration.

Engineering values (units, ranges, thresholds, recipes, fault records) live in YAML under
``profiles/<profile>/`` and are validated through these models. Model code never hard-codes
engineering values.
"""

from __future__ import annotations

from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class Detectability(StrEnum):
    D1 = "D1"  # detectable with current measurements; specific diagnosis allowed
    D2 = "D2"  # family-level only / meaningful ambiguity
    D3 = "D3"  # needs extra sensing / inspection / quality evidence


class OccurrenceClass(StrEnum):
    FREQUENT = "FREQUENT"
    SOMETIMES = "SOMETIMES"
    RARE = "RARE"


class OperatingState(StrEnum):
    OFF = "OFF"
    STARTING = "STARTING"
    WARMING = "WARMING"
    STEADY_PRODUCTION = "STEADY_PRODUCTION"
    RECIPE_CHANGE = "RECIPE_CHANGE"
    PURGING = "PURGING"
    SHUTDOWN = "SHUTDOWN"
    MAINTENANCE = "MAINTENANCE"


class Band(StrictModel):
    """Closed numeric interval [low, high]; either side may be open (None)."""

    low: float | None = None
    high: float | None = None

    @model_validator(mode="after")
    def _ordered(self) -> Band:
        if self.low is not None and self.high is not None and self.low > self.high:
            raise ValueError(f"band low {self.low} > high {self.high}")
        return self

    def contains(self, x: float) -> bool:
        return (self.low is None or x >= self.low) and (self.high is None or x <= self.high)


class ChannelSpec(StrictModel):
    code: str = Field(pattern=r"^[A-Z][A-Z0-9_]*$")
    name: str
    unit: str
    kind: Literal["process", "derived", "context"] = "process"
    plausible: Band  # physically possible measurement range
    nominal: float | None = None
    normal: Band | None = None
    warning: Band | None = None  # outside normal but inside warning => WARNING
    severe: Band | None = None  # outside warning => SEVERE
    max_rate_per_s: float | None = Field(default=None, gt=0)
    freeze_tolerance: float = Field(default=0.0, ge=0)
    freeze_seconds: int = Field(default=60, ge=1)
    critical: bool = False  # missing => ML diagnosis suppressed
    description: str = ""
    source_document_reference: str = ""

    @model_validator(mode="after")
    def _nested(self) -> ChannelSpec:
        if self.normal and self.warning:
            if self.warning.low is not None and self.normal.low is not None:
                if self.warning.low > self.normal.low:
                    raise ValueError(f"{self.code}: warning.low must be <= normal.low")
            if self.warning.high is not None and self.normal.high is not None:
                if self.warning.high < self.normal.high:
                    raise ValueError(f"{self.code}: warning.high must be >= normal.high")
        return self


class ChannelsConfig(StrictModel):
    version: str
    machine_profile: str
    sample_rate_hz: float = Field(gt=0)
    channels: list[ChannelSpec]
    gear_ratio: float | None = Field(default=None, gt=0)

    @model_validator(mode="after")
    def _unique(self) -> ChannelsConfig:
        codes = [c.code for c in self.channels]
        if len(codes) != len(set(codes)):
            raise ValueError("duplicate channel codes")
        return self

    def by_code(self) -> dict[str, ChannelSpec]:
        return {c.code: c for c in self.channels}


class StateRule(StrictModel):
    """Which pipeline stages are enabled in an operating state."""

    state: OperatingState
    rules: bool = True
    diagnosis: bool = False
    prognosis: bool = False
    thermal_only: bool = False
    train_eligible: bool = False
    persistence_reset: bool = False
    description: str = ""


class StatesConfig(StrictModel):
    version: str
    stabilisation_seconds: int = Field(default=120, ge=0)
    rules: list[StateRule]

    def for_state(self, state: OperatingState) -> StateRule:
        for r in self.rules:
            if r.state == state:
                return r
        raise KeyError(state)

    @model_validator(mode="after")
    def _complete(self) -> StatesConfig:
        missing = {s for s in OperatingState} - {r.state for r in self.rules}
        if missing:
            raise ValueError(f"states missing rules: {sorted(missing)}")
        return self


class RecipeSpec(StrictModel):
    recipe_id: str
    product_id: str
    grade: str = ""
    feed_setpoint: float
    motor_speed_setpoint: float
    screw_speed_setpoint: float | None = None
    zone_setpoints: dict[str, float]
    expected_melt_temperature: float
    expected_pressure: Band
    expected_ranges: dict[str, Band] = Field(default_factory=dict)
    machine_profile: str
    config_version: str


class RecipesConfig(StrictModel):
    version: str
    recipes: list[RecipeSpec]

    def by_id(self) -> dict[str, RecipeSpec]:
        return {r.recipe_id: r for r in self.recipes}


class Pattern(StrictModel):
    """Qualitative sensor pattern; direction per channel with optional magnitude."""

    channel: str
    direction: Literal["UP", "DOWN", "FLAT", "OSCILLATING", "ANY"]
    magnitude: str = ""  # free text from catalogue, e.g. ">+10% of nominal"


class FaultDefinition(StrictModel):
    fault_id: str = Field(pattern=r"^[A-Z0-9_\-\.]+$")
    machine_profile: str
    machine_part: str
    subcomponent: str = ""
    fault_name: str
    fault_family: str
    occurrence_class: OccurrenceClass
    detectability: Detectability
    detectability_note: str = ""  # raw catalogue wording, e.g. "D1/D2 - Integrity logic plus correlation"
    section: str = ""
    primary_sensors: list[str]
    supporting_sensors: list[str] = Field(default_factory=list)
    minimum_reference: dict[str, float] = Field(default_factory=dict)
    nominal_reference: dict[str, float] = Field(default_factory=dict)
    maximum_reference: dict[str, float] = Field(default_factory=dict)
    developing_pattern: list[Pattern] = Field(default_factory=list)
    warning_pattern: list[Pattern] = Field(default_factory=list)
    severe_pattern: list[Pattern] = Field(default_factory=list)
    temporal_evidence: str = ""
    derived_features: list[str] = Field(default_factory=list)
    ambiguity_group: str = ""
    alternative_causes: list[str] = Field(default_factory=list)
    additional_evidence_required: list[str] = Field(default_factory=list)
    maintenance_confirmation: str = ""
    related_scenarios: list[str] = Field(default_factory=list)
    propagation_paths: list[str] = Field(default_factory=list)
    predictive: bool = False  # trained as a prognosis target
    applies_to: list[str] = Field(default_factory=list)  # other profiles explicitly allowed
    source_document_reference: str

    @model_validator(mode="after")
    def _d3_needs_evidence(self) -> FaultDefinition:
        if self.detectability == Detectability.D3 and not self.additional_evidence_required:
            raise ValueError(f"{self.fault_id}: D3 faults must list additional_evidence_required")
        if self.detectability == Detectability.D2 and not (
            self.ambiguity_group or self.alternative_causes
        ):
            raise ValueError(f"{self.fault_id}: D2 faults must have ambiguity_group/alternatives")
        return self


class FaultFamily(StrictModel):
    family_id: str
    name: str
    description: str = ""
    machine_part: str = ""
    predictive: bool = True
    source_document_reference: str = ""


class FaultCatalogue(StrictModel):
    version: str
    machine_profile: str
    document: str
    sections: list[str] = Field(default_factory=list)
    families: list[FaultFamily]
    faults: list[FaultDefinition]

    @model_validator(mode="after")
    def _consistent(self) -> FaultCatalogue:
        fam = {f.family_id for f in self.families}
        ids = [f.fault_id for f in self.faults]
        if len(ids) != len(set(ids)):
            raise ValueError("duplicate fault ids")
        for f in self.faults:
            if f.fault_family not in fam:
                raise ValueError(f"{f.fault_id}: unknown family {f.fault_family}")
            if f.machine_profile != self.machine_profile and self.machine_profile not in f.applies_to:
                raise ValueError(f"{f.fault_id}: profile mismatch {f.machine_profile}")
        return self


class PropagationEdge(StrictModel):
    source: str  # fault_id or symptom id
    target: str
    relation: Literal[
        "may_propagate_to",
        "causes_symptom",
        "may_be_confused_with",
        "requires_confirmation_by",
        "uses_sensor",
        "affects_part",
    ]
    mechanism: str = ""
    typical_delay_s: int | None = Field(default=None, ge=0)
    source_document_reference: str = ""


class PropagationScenario(StrictModel):
    scenario_id: str
    name: str
    root_fault: str | None = None  # catalogue fault_id when resolvable
    initiating_fault: str = ""  # free-text initiating fault from the catalogue
    occurrence_class: OccurrenceClass | None = None
    chain: list[str]  # ordered symptom / fault ids or stage descriptions
    local_values: str = ""
    downstream_symptoms: str = ""
    timing: str = ""
    description: str = ""
    source_document_reference: str = ""


class PropagationConfig(StrictModel):
    version: str
    machine_profile: str
    edges: list[PropagationEdge]
    scenarios: list[PropagationScenario] = Field(default_factory=list)


class DecisionThreshold(StrictModel):
    fault: str  # fault_id or family_id, "*" for default
    horizon: str = "*"
    on_threshold: float = Field(ge=0, le=1)
    off_threshold: float = Field(ge=0, le=1)

    @model_validator(mode="after")
    def _hyst(self) -> DecisionThreshold:
        if self.off_threshold > self.on_threshold:
            raise ValueError("off threshold must be <= on threshold (hysteresis)")
        return self


class DecisionConfig(StrictModel):
    version: str
    persistence_n: int = Field(default=3, ge=1)
    persistence_m: int = Field(default=5, ge=1)
    cooldown_seconds: int = Field(default=300, ge=0)
    min_history_seconds: int = Field(default=120, ge=0)
    thresholds: list[DecisionThreshold]
    horizons: list[str] = Field(default_factory=lambda: ["5m", "15m", "30m"])

    @model_validator(mode="after")
    def _nm(self) -> DecisionConfig:
        if self.persistence_n > self.persistence_m:
            raise ValueError("persistence N must be <= M")
        if not any(t.fault == "*" for t in self.thresholds):
            raise ValueError("a default '*' threshold is required")
        return self

    def threshold_for(self, fault: str, horizon: str) -> DecisionThreshold:
        best: DecisionThreshold | None = None
        score = -1
        for t in self.thresholds:
            s = 0
            if t.fault == fault:
                s += 2
            elif t.fault != "*":
                continue
            if t.horizon == horizon:
                s += 1
            elif t.horizon != "*":
                continue
            if s > score:
                best, score = t, s
        assert best is not None
        return best


class ProfileConfig(StrictModel):
    """Fully-loaded machine profile."""

    name: str
    channels: ChannelsConfig
    states: StatesConfig
    recipes: RecipesConfig
    catalogue: FaultCatalogue
    propagation: PropagationConfig
    decision: DecisionConfig
    config_hash: str

    def channel(self, code: str) -> ChannelSpec:
        return self.channels.by_code()[code]
