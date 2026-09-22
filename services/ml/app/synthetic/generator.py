"""Controlled scenarios for testing software. Not a digital twin.

Said first because it is the thing that must not be forgotten: these are
plausible-shaped signals produced by a few lines of arithmetic. They exercise
the pipeline, they let the Golden suite assert real behaviour, and they carry
exactly zero evidential weight about how a real extruder behaves. Every frame
they produce is stamped ``data_source = SYNTHETIC`` and every dataset built
from them is labelled BRONZE, so nothing downstream can mistake one for a
measurement.

What they *are* good for is precise: each scenario declares what the pipeline
should conclude, and the test suite asserts it. "A frozen pressure sensor must
produce DATA_QUALITY_PROBLEM and not a restriction diagnosis" is a statement
about software, and software is what this tests.

The signal model is deliberately simple — a baseline level, a drift, an
oscillation and Gaussian noise per tag, with a seeded RNG so a scenario is
reproducible frame for frame. Anything more elaborate would invite the belief
that it is a process model.
"""

from __future__ import annotations

import math
import random
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Callable, Iterator

from ..schemas.telemetry import ChannelReading, TelemetryContext, TelemetryFrame

UTC = timezone.utc

#: Steady-production levels for a compounding twin screw, matching the
#: commissioning template baselines so a healthy scenario reads as healthy.
#: Engineering-development values, not measurements.
STEADY_LEVELS: dict[str, float] = {
    "TS-S1": 250.0,
    "TS-S2": 250.0,
    "TS-E1": 1450.0,
    "TS-PM1": 45.0,
    "TS-F1": 120.0,
    "TS-F2": 30.0,
    "TS-P1": 7.5,
    "TS-P2": 7.0,
    "TS-P3": 8.0,
    "TS-P4": 6.0,
    "TS-TM": 215.0,
    "TS-TZ1": 170.0,
    "TS-TZ2": 185.0,
    "TS-TZ3": 200.0,
    "TS-TZ4": 210.0,
    "TS-TZ5": 210.0,
    "TS-TZ6": 205.0,
    "TS-TZ7": 205.0,
    "TS-TZ8": 205.0,
    "TS-TT0": 55.0,
    "TS-TV": 200.0,
    "TS-PV": 0.03,
    "TS-T1": 65.0,
    "TS-T2": 58.0,
    "TS-T3": 62.0,
    "TS-V1": 2.2,
    "TS-V2": 2.0,
    "TS-V3": 2.4,
    "TS-V4": 2.4,
    "TS-V5": 2.4,
    "TS-L1": 60.0,
}

#: Per-tag noise, as a fraction of level. Temperatures are quiet, pressures are
#: not; that ordering is real even if the numbers are illustrative.
NOISE: dict[str, float] = {
    "TS-P1": 0.012,
    "TS-P2": 0.012,
    "TS-P3": 0.012,
    "TS-P4": 0.012,
    "TS-PM1": 0.015,
    "TS-F1": 0.008,
    "TS-F2": 0.010,
    "TS-S1": 0.004,
    "TS-S2": 0.004,
    "TS-E1": 0.004,
    "TS-PV": 0.020,
}
DEFAULT_NOISE = 0.003

#: Canonical units, so a frame carries them and the unit check has something
#: to compare against.
UNITS: dict[str, str] = {
    "TS-S1": "rpm", "TS-S2": "rpm", "TS-E1": "rpm",
    "TS-PM1": "kW",
    "TS-F1": "kg/h", "TS-F2": "kg/h",
    "TS-P1": "MPa", "TS-P2": "MPa", "TS-P3": "MPa", "TS-P4": "MPa", "TS-PV": "MPa",
    "TS-TM": "degC", "TS-TT0": "degC", "TS-TV": "degC",
    "TS-T1": "degC", "TS-T2": "degC", "TS-T3": "degC",
    "TS-V1": "mm/s RMS", "TS-V2": "mm/s RMS", "TS-V3": "mm/s RMS",
    "TS-V4": "mm/s RMS", "TS-V5": "mm/s RMS",
    "TS-L1": "percent",
    **{f"TS-TZ{index}": "degC" for index in range(1, 10)},
}


@dataclass
class ScenarioExpectation:
    """What the pipeline should conclude. Asserted by the Golden suite."""

    operating_state: str | None = None
    condition_verdict: str | None = None
    expect_fault_ids: tuple[str, ...] = ()
    forbid_fault_ids: tuple[str, ...] = ()
    expect_anomaly_ids: tuple[str, ...] = ()
    min_severity: str | None = None
    max_severity: str | None = None
    expect_ml_ineligible: str | None = None
    expect_baseline_learning: bool | None = None
    notes: str = ""


@dataclass
class Scenario:
    """One reproducible synthetic run, with what it is supposed to prove."""

    scenario_id: str
    name: str
    description: str
    seed: int
    duration_seconds: int
    expectation: ScenarioExpectation
    mutate: Callable[[dict[str, float | None], float, "Scenario"], None] | None = None
    context: dict[str, object] = field(default_factory=dict)
    onset_second: int | None = None
    """When the injected condition begins. The ground-truth onset for labels."""

    fault_id: str | None = None
    """The fault this scenario injects, for event labelling. None for healthy."""

    data_source: str = "SYNTHETIC"
    sample_hz: float = 1.0

    def frames(self, machine_id: str = "TSE-01", start: datetime | None = None) -> Iterator[TelemetryFrame]:
        """Emit the scenario as canonical telemetry frames."""
        rng = random.Random(self.seed)
        origin = start or datetime(2026, 1, 1, tzinfo=UTC)
        step = 1.0 / self.sample_hz
        count = int(self.duration_seconds * self.sample_hz)

        for index in range(count):
            elapsed = index * step
            at = origin + timedelta(seconds=elapsed)
            values: dict[str, float | None] = {
                tag: level * (1.0 + rng.gauss(0.0, NOISE.get(tag, DEFAULT_NOISE)))
                for tag, level in STEADY_LEVELS.items()
            }
            if self.mutate is not None:
                self.mutate(values, elapsed, self)

            channels = {
                tag: ChannelReading(
                    value=None if value is None else round(value, 6),
                    unit=UNITS.get(tag),
                    source_timestamp=at,
                    received_at=at,
                    source="synthetic",
                )
                for tag, value in values.items()
            }

            yield TelemetryFrame(
                machine_id=machine_id,
                timestamp=at,
                template_id="TSE-7Z-CR-INT-PAR-COMP",
                configuration_version=str(self.context.get("configuration_version", "CFG-01")),
                context=TelemetryContext(
                    recipe_id=str(self.context.get("recipe_id", "PP-GF30")),
                    material_id=str(self.context.get("material_id", "PP-HOMO")),
                    commanded_change=self._commanded_change(elapsed),
                ),
                channels=channels,
                setpoints={},
                data_source="SYNTHETIC",
                sequence=index,
            )

    def _commanded_change(self, elapsed: float) -> str | None:
        change = self.context.get("commanded_change")
        window = self.context.get("commanded_change_window")
        if not change or not isinstance(window, tuple):
            return None
        return str(change) if window[0] <= elapsed <= window[1] else None


# -- mutators ---------------------------------------------------------------
#
# Each one is the arithmetic that turns healthy steady production into the
# scenario. They are short on purpose: a long one would be a process model
# pretending to be a test fixture.


def _healthy(values: dict[str, float | None], elapsed: float, scenario: Scenario) -> None:
    return None


def _startup(values: dict[str, float | None], elapsed: float, scenario: Scenario) -> None:
    """Speed and feed ramping from zero. Nothing here is a fault."""
    ramp = min(1.0, elapsed / 180.0)
    for tag in ("TS-S1", "TS-S2", "TS-E1", "TS-F1", "TS-F2", "TS-PM1"):
        values[tag] = (values[tag] or 0.0) * ramp
    for tag in ("TS-P1", "TS-P2", "TS-P3", "TS-P4"):
        values[tag] = (values[tag] or 0.0) * ramp * ramp


def _shutdown(values: dict[str, float | None], elapsed: float, scenario: Scenario) -> None:
    """Feed and speed reducing to zero; the barrel stays hot behind them."""
    ramp = max(0.0, 1.0 - elapsed / 180.0)
    for tag in ("TS-S1", "TS-S2", "TS-E1", "TS-F1", "TS-F2", "TS-PM1"):
        values[tag] = (values[tag] or 0.0) * ramp
    for tag in ("TS-P1", "TS-P2", "TS-P3", "TS-P4"):
        values[tag] = (values[tag] or 0.0) * ramp


def _recipe_change(values: dict[str, float | None], elapsed: float, scenario: Scenario) -> None:
    """A new recipe moves pressure and load legitimately. Not a fault."""
    onset = scenario.onset_second or 300
    if elapsed < onset:
        return
    progress = min(1.0, (elapsed - onset) / 120.0)
    values["TS-P3"] = (values["TS-P3"] or 0.0) * (1.0 + 0.22 * progress)
    values["TS-P4"] = (values["TS-P4"] or 0.0) * (1.0 + 0.20 * progress)
    values["TS-PM1"] = (values["TS-PM1"] or 0.0) * (1.0 + 0.18 * progress)
    values["TS-TM"] = (values["TS-TM"] or 0.0) + 6.0 * progress


def _feed_increase(values: dict[str, float | None], elapsed: float, scenario: Scenario) -> None:
    """A commanded feed increase, with the physically expected response."""
    onset = scenario.onset_second or 300
    if elapsed < onset:
        return
    progress = min(1.0, (elapsed - onset) / 90.0)
    values["TS-F1"] = (values["TS-F1"] or 0.0) * (1.0 + 0.25 * progress)
    values["TS-P3"] = (values["TS-P3"] or 0.0) * (1.0 + 0.20 * progress)
    values["TS-PM1"] = (values["TS-PM1"] or 0.0) * (1.0 + 0.22 * progress)


def _screen_restriction(values: dict[str, float | None], elapsed: float, scenario: Scenario) -> None:
    """The canonical case: pre-screen pressure and load climb, feed steady.

    The pressure *drop across the screen* is what localises it, so the upstream
    tap rises and the downstream one barely moves — which is precisely the
    evidence P-002 requires and P-003 does not show.
    """
    onset = scenario.onset_second or 300
    if elapsed < onset:
        return
    progress = min(1.0, (elapsed - onset) / 420.0)
    values["TS-P3"] = (values["TS-P3"] or 0.0) * (1.0 + 0.85 * progress)
    values["TS-P4"] = (values["TS-P4"] or 0.0) * (1.0 + 0.05 * progress)
    values["TS-PM1"] = (values["TS-PM1"] or 0.0) * (1.0 + 0.40 * progress)
    values["TS-TM"] = (values["TS-TM"] or 0.0) + 7.0 * progress


def _die_restriction(values: dict[str, float | None], elapsed: float, scenario: Scenario) -> None:
    """Both taps climb together — past the screen, not at it."""
    onset = scenario.onset_second or 300
    if elapsed < onset:
        return
    progress = min(1.0, (elapsed - onset) / 420.0)
    for tag in ("TS-P3", "TS-P4"):
        values[tag] = (values[tag] or 0.0) * (1.0 + 0.7 * progress)
    values["TS-PM1"] = (values["TS-PM1"] or 0.0) * (1.0 + 0.3 * progress)


def _feed_instability(values: dict[str, float | None], elapsed: float, scenario: Scenario) -> None:
    """Feed oscillating, with load following a beat behind it."""
    onset = scenario.onset_second or 240
    if elapsed < onset:
        return
    phase = 2 * math.pi * (elapsed - onset) / 45.0
    values["TS-F1"] = (values["TS-F1"] or 0.0) * (1.0 + 0.30 * math.sin(phase))
    values["TS-PM1"] = (values["TS-PM1"] or 0.0) * (1.0 + 0.22 * math.sin(phase - 0.6))
    values["TS-P3"] = (values["TS-P3"] or 0.0) * (1.0 + 0.18 * math.sin(phase - 0.9))


def _cooling_failure(values: dict[str, float | None], elapsed: float, scenario: Scenario) -> None:
    """One zone climbing away from its neighbours with the context steady."""
    onset = scenario.onset_second or 300
    if elapsed < onset:
        return
    progress = min(1.0, (elapsed - onset) / 600.0)
    values["TS-TZ4"] = (values["TS-TZ4"] or 0.0) + 38.0 * progress
    values["TS-TZ5"] = (values["TS-TZ5"] or 0.0) + 14.0 * progress
    values["TS-TM"] = (values["TS-TM"] or 0.0) + 10.0 * progress


def _pressure_frozen(values: dict[str, float | None], elapsed: float, scenario: Scenario) -> None:
    """The sensor stops moving. Everything else carries on normally.

    The single most important negative case in the suite. A frozen transmitter
    reads as a beautifully stable process, and a system without a flatline
    check will happily learn it as normal.
    """
    onset = scenario.onset_second or 120
    if elapsed < onset:
        return
    values["TS-P3"] = 8.0


def _pressure_spike(values: dict[str, float | None], elapsed: float, scenario: Scenario) -> None:
    """One impossible sample. Torque and feed do not move with it."""
    onset = scenario.onset_second or 300
    if abs(elapsed - onset) < 0.5:
        values["TS-P3"] = 31.0


def _pressure_drift(values: dict[str, float | None], elapsed: float, scenario: Scenario) -> None:
    """A slow instrument drift with nothing corroborating it.

    Pressure departs while load, feed and melt temperature stay exactly where
    they were — which is the signature of a transmitter, not a restriction.
    """
    onset = scenario.onset_second or 120
    if elapsed < onset:
        return
    progress = min(1.0, (elapsed - onset) / 900.0)
    values["TS-P3"] = (values["TS-P3"] or 0.0) * (1.0 + 0.55 * progress)


def _missing_temperature(values: dict[str, float | None], elapsed: float, scenario: Scenario) -> None:
    """A channel stops publishing entirely."""
    onset = scenario.onset_second or 60
    if elapsed >= onset:
        values["TS-TZ4"] = None
        values["TS-TM"] = None


def _missing_mandatory(values: dict[str, float | None], elapsed: float, scenario: Scenario) -> None:
    """The melt pressure a restriction diagnosis requires goes away."""
    onset = scenario.onset_second or 60
    if elapsed >= onset:
        for tag in ("TS-P3", "TS-P4", "TS-P1", "TS-P2"):
            values[tag] = None


def _unknown_anomaly(values: dict[str, float | None], elapsed: float, scenario: Scenario) -> None:
    """Several signals abnormal in a combination no pattern describes.

    Vibration and gearbox temperature climb while the whole process side stays
    exactly normal. Real, corroborated, and matching nothing in the library —
    which must produce FAULT_UNKNOWN, not the nearest fit.
    """
    onset = scenario.onset_second or 300
    if elapsed < onset:
        return
    progress = min(1.0, (elapsed - onset) / 400.0)
    values["TS-V1"] = (values["TS-V1"] or 0.0) * (1.0 + 1.6 * progress)
    values["TS-V2"] = (values["TS-V2"] or 0.0) * (1.0 + 1.5 * progress)
    values["TS-L1"] = (values["TS-L1"] or 0.0) * (1.0 - 0.5 * progress)


def _two_independent_faults(values: dict[str, float | None], elapsed: float, scenario: Scenario) -> None:
    """A screen restriction and a vent problem, with no causal link.

    Both must survive into the response. Collapsing them to one would lose a
    fault; chaining them would assert a causal direction that does not exist.
    """
    _screen_restriction(values, elapsed, scenario)
    onset = (scenario.onset_second or 300) + 60
    if elapsed >= onset:
        progress = min(1.0, (elapsed - onset) / 300.0)
        values["TS-PV"] = (values["TS-PV"] or 0.0) * (1.0 + 1.8 * progress)


def _causal_chain(values: dict[str, float | None], elapsed: float, scenario: Scenario) -> None:
    """A restriction, with the load rise it causes following it.

    The load rise is a symptom and must be grouped, not alarmed separately.
    """
    onset = scenario.onset_second or 300
    if elapsed < onset:
        return
    progress = min(1.0, (elapsed - onset) / 420.0)
    values["TS-P3"] = (values["TS-P3"] or 0.0) * (1.0 + 0.9 * progress)
    values["TS-P4"] = (values["TS-P4"] or 0.0) * (1.0 + 0.05 * progress)
    values["TS-PM1"] = (values["TS-PM1"] or 0.0) * (1.0 + 0.55 * progress)
    values["TS-T2"] = (values["TS-T2"] or 0.0) * (1.0 + 0.18 * progress)


def _sensor_drift_gradual(values: dict[str, float | None], elapsed: float, scenario: Scenario) -> None:
    """A zone thermocouple drifting away from the rest of the profile."""
    onset = scenario.onset_second or 120
    if elapsed < onset:
        return
    progress = min(1.0, (elapsed - onset) / 900.0)
    values["TS-TZ3"] = (values["TS-TZ3"] or 0.0) + 160.0 * progress


def _rpm_change(values: dict[str, float | None], elapsed: float, scenario: Scenario) -> None:
    """A commanded speed change, with the expected process response."""
    onset = scenario.onset_second or 300
    if elapsed < onset:
        return
    progress = min(1.0, (elapsed - onset) / 60.0)
    for tag in ("TS-S1", "TS-S2", "TS-E1"):
        values[tag] = (values[tag] or 0.0) * (1.0 + 0.2 * progress)
    values["TS-PM1"] = (values["TS-PM1"] or 0.0) * (1.0 + 0.15 * progress)
    values["TS-P3"] = (values["TS-P3"] or 0.0) * (1.0 - 0.08 * progress)


MUTATORS: dict[str, Callable[[dict[str, float | None], float, Scenario], None]] = {
    "healthy": _healthy,
    "startup": _startup,
    "shutdown": _shutdown,
    "recipe_change": _recipe_change,
    "feed_increase": _feed_increase,
    "rpm_change": _rpm_change,
    "screen_restriction": _screen_restriction,
    "die_restriction": _die_restriction,
    "feed_instability": _feed_instability,
    "cooling_failure": _cooling_failure,
    "pressure_frozen": _pressure_frozen,
    "pressure_spike": _pressure_spike,
    "pressure_drift": _pressure_drift,
    "missing_temperature": _missing_temperature,
    "missing_mandatory": _missing_mandatory,
    "unknown_anomaly": _unknown_anomaly,
    "two_independent_faults": _two_independent_faults,
    "causal_chain": _causal_chain,
    "sensor_drift": _sensor_drift_gradual,
}
