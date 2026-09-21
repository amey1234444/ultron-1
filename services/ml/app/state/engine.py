"""The operating state engine — DOC-02 §4 and §14.

State is not a label on a chart. It decides which comparisons are valid at all,
and getting it wrong produces the two classic failures in opposite directions:
running steady-production fault rules through a startup transient (false
alarms all morning), or learning a "normal" baseline from a warm-up ramp
(a machine whose normal is a temperature that never stops rising).

So the engine is built around three commitments.

**Explicit beats inferred, always.** A PLC run bit, mode word or trip status is
authority. Inference exists because this machine publishes none of them, and
the engine records which route it took in ``state_source`` so nobody reads an
inferred STEADY_PRODUCTION as a confirmed one.

**UNKNOWN is a supported answer.** DOC-02 §4's own note: "Unknown is safer than
falsely applying a steady-production baseline." When the evidence is missing or
points two ways, ST-00 is returned and the ML gate refuses on it.

**Time in state is part of the answer.** "STEADY_PRODUCTION for 4 seconds" and
"STEADY_PRODUCTION for 40 minutes" support completely different claims, and the
baseline engine refuses the first.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from ..core.timeutil import seconds_between
from ..knowledge.enums import OperatingState, QualityVerdict
from ..knowledge.loader import knowledge
from ..quality.engine import FrameQuality
from ..schemas.telemetry import TelemetryFrame

StateSource = str  # "EXPLICIT" | "INFERRED" | "DECLARED" | "UNKNOWN"


@dataclass(frozen=True)
class StateThresholds:
    """What counts as stopped, fed and at temperature on this machine.

    DOC-02 §7 is explicit that these are machine and recipe specific
    configuration, not universal numbers, so they are loaded from the
    commissioning export rather than written here.
    """

    zero_rpm: float
    zero_feed: float
    min_production_feed: float
    ready_band_deg_c: float
    warm_up_slope_deg_c_per_min: float

    @classmethod
    def from_knowledge(cls) -> "StateThresholds":
        raw: dict[str, Any] = knowledge().commissioning.get("stateThresholds", {})
        return cls(
            zero_rpm=float(raw.get("zeroRpm", 5)),
            zero_feed=float(raw.get("zeroFeed", 1)),
            min_production_feed=float(raw.get("minProductionFeed", 10)),
            ready_band_deg_c=float(raw.get("readyBandDegC", 8)),
            warm_up_slope_deg_c_per_min=float(raw.get("warmUpSlopeDegCPerMin", 0.5)),
        )


@dataclass(frozen=True)
class StateTrends:
    """How fast the context variables are moving, over the trend window.

    Supplied by the caller because the state engine has no window store of its
    own — and should not grow one, since it would then be two things. ``None``
    on a field means "not measurable yet", which is treated as "not proven
    steady" rather than as zero.
    """

    feed_slope_per_min: float | None = None
    screw_slope_per_min: float | None = None
    pressure_slope_per_min: float | None = None
    zone_slope_deg_c_per_min: float | None = None
    """Mean barrel zone slope. Distinguishes heating up from cooling down.

    Without it a hot machine cannot be told from a warming one, and DOC-02 §4
    warns specifically against the wrong call: a barrel that is still hot after
    a shutdown is STOPPED, and classifying it as WARM_UP would start a thermal
    readiness assessment on a machine nobody is starting.
    """


@dataclass
class StateRecord:
    """The DOC-02 §14 engine output, every field the document lists."""

    operating_state: OperatingState
    state_name: str
    state_confidence: float
    state_source: StateSource
    state_start: datetime | None = None
    time_in_state_seconds: float | None = None
    previous_state: OperatingState | None = None
    transition_type: str = "EXPECTED"
    state_evidence: list[str] = field(default_factory=list)
    state_quality: QualityVerdict | str = "UNKNOWN"
    unknown_reason: str | None = None

    @property
    def is_steady_production(self) -> bool:
        return self.operating_state == "ST-06"

    @property
    def baseline_learning_allowed(self) -> bool:
        """Whether DOC-02 permits learning a baseline in this state at all.

        Necessary, not sufficient — the baseline engine adds data quality, fault
        status and duration on top. This answers only the document's question.
        """
        definition = knowledge().state(self.operating_state)
        return bool(definition and definition.baseline_learning)


#: Transitions the document treats as ordinary. Anything else is UNEXPECTED,
#: which is not an error — a trip from steady production is a real transition —
#: but it is worth naming, because an unexpected transition invalidates a
#: baseline window that an expected one merely ends.
_EXPECTED_TRANSITIONS: dict[str, set[str]] = {
    "ST-01": {"ST-02", "ST-03", "ST-04", "ST-10", "ST-11", "ST-12"},
    "ST-02": {"ST-03", "ST-01", "ST-09"},
    "ST-03": {"ST-04", "ST-01", "ST-02", "ST-09"},
    "ST-04": {"ST-05", "ST-06", "ST-08", "ST-09"},
    "ST-05": {"ST-06", "ST-08", "ST-09"},
    "ST-06": {"ST-05", "ST-07", "ST-08", "ST-09"},
    "ST-07": {"ST-05", "ST-06", "ST-08"},
    "ST-08": {"ST-01", "ST-11", "ST-09"},
    "ST-09": {"ST-01", "ST-10"},
    "ST-10": {"ST-01", "ST-03"},
    "ST-11": {"ST-01", "ST-03"},
    "ST-12": {"ST-01", "ST-06"},
}


class OperatingStateEngine:
    """Per-machine state inference with transition tracking."""

    def __init__(self, thresholds: StateThresholds | None = None) -> None:
        self._thresholds = thresholds
        self._current: dict[str, StateRecord] = {}

    @property
    def thresholds(self) -> StateThresholds:
        if self._thresholds is None:
            self._thresholds = StateThresholds.from_knowledge()
        return self._thresholds

    def reset(self, machine_id: str | None = None) -> None:
        if machine_id is None:
            self._current.clear()
        else:
            self._current.pop(machine_id, None)

    def evaluate(
        self,
        frame: TelemetryFrame,
        quality: FrameQuality,
        trends: StateTrends | None = None,
    ) -> StateRecord:
        """The state this frame is in, and how confident that is."""
        previous = self._current.get(frame.machine_id)
        record = self._classify(frame, quality, trends)

        if previous is not None and previous.operating_state == record.operating_state:
            record.state_start = previous.state_start
            record.previous_state = previous.previous_state
            record.transition_type = previous.transition_type
        else:
            record.state_start = frame.timestamp
            record.previous_state = previous.operating_state if previous else None
            record.transition_type = _transition_type(record.previous_state, record.operating_state)

        if record.state_start is not None:
            record.time_in_state_seconds = max(0.0, seconds_between(record.state_start, frame.timestamp))

        self._current[frame.machine_id] = record
        return record

    # -- classification -----------------------------------------------------

    def _classify(
        self, frame: TelemetryFrame, quality: FrameQuality, trends: StateTrends | None
    ) -> StateRecord:
        book = knowledge()

        declared = frame.context.operating_state
        if declared is not None:
            definition = book.state(declared)
            return StateRecord(
                operating_state=declared,
                state_name=definition.name if definition else declared,
                # A declared state from a control system is authority. One
                # declared by a caller that is merely passing through what it
                # was told is not, and the source field is how the two are
                # told apart downstream.
                state_confidence=float(frame.context.state_confidence or 0.95),
                state_source=frame.context.state_source or "DECLARED",
                state_evidence=[f"Operating state declared as {declared} by {frame.context.state_source or 'caller'}."],
                state_quality=quality.overall,
            )

        screw_rpm = _usable(quality, "TS-S1") or _usable(quality, "TS-S2")
        feed = _usable(quality, "TS-F1")
        power = _usable(quality, "TS-PM1")
        pressure = _usable(quality, "TS-P3")
        zones = [
            value
            for value in (_usable(quality, f"TS-TZ{index}") for index in range(1, 10))
            if value is not None
        ]

        evidence: list[str] = []
        thresholds = self.thresholds

        # The machine publishes no run bit, mode word or trip status. Rotation
        # stands in for the run bit, which is honest and is exactly why every
        # inferred state below is capped well under an explicit one.
        if screw_rpm is None and feed is None:
            return StateRecord(
                operating_state="ST-00",
                state_name="UNKNOWN",
                state_confidence=0.0,
                state_source="UNKNOWN",
                state_evidence=["Neither screw speed nor feed rate is usable."],
                state_quality=quality.overall,
                unknown_reason=(
                    "Screw speed and feed rate are both unavailable, so rotation and production "
                    "cannot be established. DOC-02 §4: unknown is safer than a wrong steady baseline."
                ),
            )

        rotating = screw_rpm is not None and screw_rpm > thresholds.zero_rpm
        feeding = feed is not None and feed > thresholds.zero_feed
        producing = feed is not None and feed >= thresholds.min_production_feed

        if rotating:
            evidence.append(f"Screw speed {screw_rpm:.0f} rpm is above the {thresholds.zero_rpm:g} rpm zero band.")
        else:
            evidence.append(f"Screw speed is at or below the {thresholds.zero_rpm:g} rpm zero band.")
        if feed is not None:
            evidence.append(f"Feed rate {feed:.1f} against a {thresholds.min_production_feed:g} production minimum.")

        if not rotating and not feeding:
            warming = _zones_warming(zones, trends, thresholds)
            if warming is True:
                return self._record(
                    "ST-02",
                    0.55,
                    evidence
                    + [
                        f"Barrel zones are climbing at "
                        f"{trends.zone_slope_deg_c_per_min:.2f} degC/min with no rotation or feed."
                        if trends and trends.zone_slope_deg_c_per_min is not None
                        else "Barrel zones are heating with no rotation or feed."
                    ],
                    quality,
                )
            note = (
                "Barrel zones are hot but not climbing, which is a machine that has stopped "
                "rather than one warming up."
                if zones and max(zones) > 40.0
                else "No rotation and no feed."
            )
            return self._record("ST-01", 0.7, evidence + [note], quality)

        if rotating and not producing:
            # Rotating with little or no feed. STARTUP and PURGE look identical
            # from here, and the machine publishes no purge flag, so the engine
            # returns the one it can defend and lowers confidence accordingly.
            record = self._record("ST-04", 0.45, evidence, quality)
            record.state_evidence.append(
                "Rotating below the production feed minimum. STARTUP and PURGE are "
                "indistinguishable without a purge or mode flag."
            )
            return record

        if rotating and producing:
            stable = _looks_stable(power, pressure, trends, thresholds)
            if stable:
                return self._record(
                    "ST-06",
                    0.6,
                    evidence + ["Drive load and melt pressure are both reporting, consistent with production."],
                    quality,
                )
            return self._record(
                "ST-05",
                0.45,
                evidence
                + [
                    "Producing, but feed or speed is still moving, or the evidence needed to "
                    "prove stability is incomplete. Steady-production rules do not apply."
                ],
                quality,
            )

        return StateRecord(
            operating_state="ST-00",
            state_name="UNKNOWN",
            state_confidence=0.0,
            state_source="INFERRED",
            state_evidence=evidence,
            state_quality=quality.overall,
            unknown_reason="Feed is present without rotation, which no declared state describes.",
        )

    def _record(
        self, state_id: str, confidence: float, evidence: list[str], quality: FrameQuality
    ) -> StateRecord:
        definition = knowledge().state(state_id)
        # Evidence that is itself untrustworthy cannot produce a confident
        # state. The cap is the same idea as the DOC-03 quality gate, applied
        # one layer earlier.
        if quality.overall == "UNCERTAIN":
            confidence = min(confidence, 0.5)
        elif quality.overall in {"BAD", "MISSING"}:
            confidence = min(confidence, 0.3)
        return StateRecord(
            operating_state=state_id,  # type: ignore[arg-type]
            state_name=definition.name if definition else state_id,
            state_confidence=round(confidence, 3),
            state_source="INFERRED",
            state_evidence=evidence,
            state_quality=quality.overall,
        )


def _usable(quality: FrameQuality, tag: str) -> float | None:
    entry = quality.per_signal.get(tag)
    return entry.usable_value if entry and entry.usable else None


def _zones_warming(
    zones: list[float], trends: "StateTrends | None", thresholds: StateThresholds
) -> bool | None:
    """Whether the barrel is actively heating toward a setpoint.

    A *level* test cannot answer this. A barrel at 200 degC is equally
    consistent with a machine warming up and a machine that stopped ten minutes
    ago, and DOC-02 §4 singles out the second case: hot temperatures after a
    shutdown must not be read as a process condition. So the discriminator is
    the slope, and without one the answer is None — not warming, not proven
    otherwise — which resolves to STOPPED, the safer of the two.
    """
    if not zones:
        return False
    if trends is None or trends.zone_slope_deg_c_per_min is None:
        return None
    return trends.zone_slope_deg_c_per_min >= thresholds.warm_up_slope_deg_c_per_min


def _looks_stable(
    power: float | None,
    pressure: float | None,
    trends: "StateTrends | None",
    thresholds: StateThresholds,
) -> bool:
    """Whether the evidence supports calling production *steady*.

    Presence is necessary and nowhere near sufficient. During a startup ramp
    feed, speed, pressure and load are all present and all plausible, and a
    presence-only test classifies the ramp as steady production — which then
    lets the steady-state fault rules run through a transient and diagnose feed
    starvation on a machine that is simply still filling.

    So stability is measured: feed and speed must not be moving materially over
    the trend window. Without a trend the answer is "not proven", which keeps
    the machine in RAMP_UP rather than promoting it on no evidence.
    """
    if power is None or power <= 0 or pressure is None or pressure <= 0:
        return False
    if trends is None:
        return False

    # Moving faster than a few per cent of the production minimum per minute is
    # a ramp, not steady production.
    feed_budget = max(1.0, thresholds.min_production_feed * 0.25)
    rpm_budget = max(1.0, thresholds.zero_rpm * 2.0)

    if trends.feed_slope_per_min is None or trends.screw_slope_per_min is None:
        return False
    return (
        abs(trends.feed_slope_per_min) <= feed_budget
        and abs(trends.screw_slope_per_min) <= rpm_budget
    )


def _transition_type(previous: str | None, current: str) -> str:
    if previous is None:
        return "EXPECTED"
    if previous == current:
        return "EXPECTED"
    return "EXPECTED" if current in _EXPECTED_TRANSITIONS.get(previous, set()) else "UNEXPECTED"
