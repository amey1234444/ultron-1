"""The canonical telemetry object.

One strongly typed frame, validated before anything reads it. The shape is
DOC-02's: a value is never a bare number, it is a number with a unit, a source,
a timestamp and a quality verdict, because every one of those four changes what
the value means and dropping any of them is how a broken sensor becomes a
machine fault.

Two decisions worth stating.

**Channels are keyed by the machine's own tag** (``TS-P3``), not by the DOC-02
signal id (``D041``). Several tags legitimately supply one signal — three melt
pressure taps all map to D041 — and keying on the signal would silently
collapse them. The tag is the instrument; the signal is what it measures.

**An absent channel and a null channel are different.** A channel missing from
the payload was never published; a channel present with ``value: null`` was
published and had nothing to say. The first is a mapping gap, the second is a
sensor problem, and the quality engine reports them differently.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator

from ..core.timeutil import parse_timestamp
from ..knowledge.enums import DataSource, OperatingState, QualityVerdict


class ChannelReading(BaseModel):
    """One instrument's reading at one instant."""

    model_config = ConfigDict(extra="forbid")

    value: float | None = None
    """The measurement in ``unit``. Null when the source published nothing."""

    unit: str | None = None
    """The unit as published. Normalised against the tag's canonical unit."""

    source_timestamp: datetime | None = None
    """When the source says it measured. Preferred over arrival time."""

    received_at: datetime | None = None
    """When this service saw it. Used for the freshness and delay checks."""

    source_quality: QualityVerdict | None = None
    """A quality verdict the source itself supplied, if any.

    Honoured as a *floor*, never a ceiling: a gateway saying GOOD does not stop
    the quality engine finding the value frozen, but a gateway saying BAD is
    believed without argument.
    """

    source: str | None = None
    """Which system produced it — PLC, drive, gateway, operator entry."""

    alert_active: bool = False
    danger_active: bool = False
    trip_active: bool = False
    """Approved limit states as the plant reports them.

    Carried separately from any learned boundary, and never recomputed here.
    DOC-03 §4: a learned baseline must not silently replace an approved limit,
    so these arrive from the authority that owns them and pass straight through.
    """

    @field_validator("source_timestamp", "received_at", mode="before")
    @classmethod
    def _coerce_time(cls, value: Any) -> Any:
        return None if value is None else parse_timestamp(value)


class TelemetryContext(BaseModel):
    """What the reading has to be interpreted against.

    Every field is optional because a real plant supplies a subset, and DOC-02
    §27 is explicit that a missing context key lowers confidence rather than
    being invented. The context engine records what was absent.
    """

    model_config = ConfigDict(extra="forbid")

    operating_state: OperatingState | None = None
    state_confidence: float | None = Field(default=None, ge=0.0, le=1.0)
    state_source: str | None = None

    recipe_id: str | None = None
    material_id: str | None = None
    product_id: str | None = None
    batch_id: str | None = None

    rpm_band: str | None = None
    feed_band: str | None = None
    temperature_profile: str | None = None
    vacuum_mode: str | None = None
    cooling_mode: str | None = None
    side_feeder_active: bool | None = None
    screw_configuration: str | None = None
    production_mode: str | None = None

    commanded_change: str | None = None
    """A change the operator or control system just made.

    DOC-04 §3 gate 8 reads this. A pressure rise that follows a commanded feed
    increase is the machine working, not a fault, and without this field the
    gate has nothing to check — which is exactly why the existing pipeline's
    gate 8 has never fired on this machine.
    """


class TelemetryFrame(BaseModel):
    """One validated observation of one machine.

    The unit the whole pipeline works in. Everything downstream — windows,
    features, baselines, models — consumes frames and nothing reaches back to
    the transport that produced one.
    """

    model_config = ConfigDict(extra="forbid")

    machine_id: str
    timestamp: datetime
    machine_type: str = "TWIN_SCREW_EXTRUDER"
    template_id: str | None = None
    configuration_version: str | None = None

    context: TelemetryContext = Field(default_factory=TelemetryContext)
    channels: dict[str, ChannelReading] = Field(default_factory=dict)
    setpoints: dict[str, float | None] = Field(default_factory=dict)
    """Commanded values keyed by the same tag as the actual they govern.

    ``{"TS-F1": 120.0}`` is the feed setpoint for the feed actual, so the
    feature engine can compute an error without a second naming scheme.
    """

    data_source: DataSource = "REAL"
    """Never inferred. A synthetic frame says so and stays saying so."""

    gateway_id: str | None = None
    device_id: str | None = None
    sequence: int | None = None
    """Monotonic per machine where the source supplies it. Duplicate and
    out-of-order detection use it in preference to timestamps, which clocks
    can move backwards."""

    ingest_metadata: dict[str, Any] = Field(default_factory=dict)

    @field_validator("timestamp", mode="before")
    @classmethod
    def _coerce_time(cls, value: Any) -> Any:
        return parse_timestamp(value)

    @field_validator("channels", mode="before")
    @classmethod
    def _coerce_channels(cls, value: Any) -> Any:
        """Accept a bare number per channel as shorthand for a reading.

        ``{"TS-P3": 8.1}`` is what a simple publisher sends and what most test
        fixtures want to write. It becomes a reading with no unit and no source
        timestamp, and the quality engine treats those absences honestly rather
        than assuming the canonical unit.
        """
        if not isinstance(value, dict):
            return value
        coerced: dict[str, Any] = {}
        for tag, reading in value.items():
            if isinstance(reading, (int, float)) or reading is None:
                coerced[tag] = {"value": None if reading is None else float(reading)}
            else:
                coerced[tag] = reading
        return coerced

    def value(self, tag: str) -> float | None:
        """The raw published value for a tag, or None."""
        reading = self.channels.get(tag)
        return None if reading is None else reading.value

    def reported_tags(self) -> tuple[str, ...]:
        """Tags that actually carried a number in this frame."""
        return tuple(tag for tag, reading in self.channels.items() if reading.value is not None)


class InferenceRequest(BaseModel):
    """A request to run the chain over one frame."""

    model_config = ConfigDict(extra="forbid")

    frame: TelemetryFrame
    explain: bool = False
    """Force SHAP regardless of the probability floor. What the detail view sends."""

    force: bool = False
    """Ignore the inference cadence. Tests and manual investigation."""


class BatchInferenceRequest(BaseModel):
    """Several frames, replayed in order.

    Order matters and is not sorted for the caller: a replay that arrives out
    of order should be *seen* to be out of order by the quality engine, which
    is a DQ finding, rather than quietly fixed here.
    """

    model_config = ConfigDict(extra="forbid")

    frames: list[TelemetryFrame]
    explain: bool = False
    emit_every: int = 1
    """Return a diagnosis for every Nth frame. A 10-minute replay at 1 Hz does
    not need six hundred diagnosis objects returned over HTTP."""
