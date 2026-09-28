"""Matching the abnormal patterns against observed anomalies.

The patterns are the bridge between "this signal is abnormal" and "this fault
is a candidate". DOC-04 states each one as a sentence of evidence — *"Pressure
HIGH + Torque HIGH + Feed STABLE + RPM STABLE"* — and this module turns that
sentence into a predicate over the signals this machine actually has.

Two rules govern the translation.

**A pattern needing a signal the machine lacks is not evaluated.** Not
half-matched on the signals that happen to exist: P-002 distinguishes a screen
restriction from a die restriction using the pressure *drop across the screen*,
and on a machine with only the upstream tap that distinction cannot be made.
Claiming it anyway sends somebody to pull a screen pack on evidence that never
existed.

**Specific before general.** P-002 (localised screen restriction) is checked
before P-001 (increased process resistance) because it is the more precise
reading of the same evidence, and reporting the general one when the specific
one fits loses information the operator needed.

P-012 is the safety net and the point of the whole exercise: a strong
multi-signal anomaly that fits nothing known returns FAULT_UNKNOWN rather than
the nearest match. DOC-04 §20 is explicit about it, and it is the behaviour
that separates a diagnostic system from a classifier.

**Past §7.** P-001 to P-012 come from DOC-04 §7 and cover the melt path and
the instrumentation. P-013 onwards do not: the document does not state them,
so each takes its evidence from its target fault's own minimum required
evidence in DOC-07 instead. They exist because the resolver can only name a
fault that some pattern points at, so before they were written every
mechanical, drive-thermal, zone and shear condition resolved to FAULT_UNKNOWN
no matter how cleanly the anomaly layer saw it.

Every rule here must have a matching entry in the knowledge layer, and every
declared pattern must have a rule here or be one the resolver owns by name.
That is not a convention — it is enforced, in
``tests/unit/test_resolver_and_filters.py``, because the two halves drifted
once already and the symptom was silence rather than an error.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Mapping

from ..rules.limits import SignalVerdict


@dataclass(frozen=True)
class PatternMatch:
    """A matched pattern, with the fault candidates it points at."""

    pattern_id: str
    name: str
    fault_candidates: tuple[str, ...]
    evidence: tuple[str, ...]
    required_signals: tuple[str, ...]
    """Signals the match actually rested on. Becomes REQUIRED evidence."""

    missing_signals: tuple[str, ...] = ()
    """Signals that would have sharpened it and are unavailable."""


class SignalView:
    """Convenience over the rule verdicts, so patterns read like the document."""

    def __init__(self, verdicts: Mapping[str, SignalVerdict]) -> None:
        self._verdicts = verdicts

    def present(self, tag: str) -> bool:
        entry = self._verdicts.get(tag)
        return entry is not None and entry.value is not None

    def high(self, tag: str) -> bool:
        entry = self._verdicts.get(tag)
        return entry is not None and entry.verdict == "HIGH_ANOMALY"

    def low(self, tag: str) -> bool:
        entry = self._verdicts.get(tag)
        return entry is not None and entry.verdict == "LOW_ANOMALY"

    def oscillating(self, tag: str) -> bool:
        entry = self._verdicts.get(tag)
        return entry is not None and entry.verdict == "OSCILLATING"

    def rising(self, tag: str) -> bool:
        entry = self._verdicts.get(tag)
        return entry is not None and entry.verdict == "RISING_ABNORMAL"

    def stable(self, tag: str) -> bool:
        """Present and not anomalous.

        Absence is *not* stability. A feed rate nobody is measuring is not
        "feed stable", and treating it that way would let every pattern that
        requires a stable context match on a machine with no feed instrument.
        """
        entry = self._verdicts.get(tag)
        return entry is not None and entry.value is not None and not entry.is_anomalous

    def value(self, tag: str) -> float | None:
        entry = self._verdicts.get(tag)
        return entry.value if entry else None

    def verdict(self, tag: str) -> SignalVerdict | None:
        return self._verdicts.get(tag)

    def anomalous_tags(self) -> tuple[str, ...]:
        return tuple(tag for tag, entry in self._verdicts.items() if entry.is_anomalous)


@dataclass(frozen=True)
class PatternRule:
    """One DOC-04 pattern, expressed against this machine's tags."""

    pattern_id: str
    name: str
    fault_candidates: tuple[str, ...]
    requires: tuple[str, ...]
    """Tags that must be present for the rule to be evaluated at all."""

    sharpened_by: tuple[str, ...]
    """Tags that would improve the match. Reported as MISSING when absent."""

    predicate: Callable[[SignalView], bool]
    evidence: Callable[[SignalView], tuple[str, ...]]


def _screen_restriction(view: SignalView) -> bool:
    """P-002. Needs both taps: the differential is what localises it."""
    inlet, outlet = view.value("TS-P3"), view.value("TS-P4")
    if inlet is None or outlet is None:
        return False
    differential_high = (inlet - outlet) > 3.0
    return view.high("TS-P3") and differential_high and view.stable("TS-F1")


def _process_resistance(view: SignalView) -> bool:
    """P-001. Pressure and load up together with the context unchanged."""
    return (
        (view.high("TS-P3") or view.high("TS-P1"))
        and view.high("TS-PM1")
        and view.stable("TS-F1")
        and view.stable("TS-S1")
    )


def _die_restriction(view: SignalView) -> bool:
    """P-003. Both taps high, but the screen drop is not what dominates."""
    inlet, outlet = view.value("TS-P3"), view.value("TS-P4")
    if inlet is None or outlet is None:
        return False
    return view.high("TS-P3") and view.high("TS-P4") and (inlet - outlet) <= 3.0


def _feed_instability(view: SignalView) -> bool:
    """P-004. Feed swinging while screw speed holds.

    DOC-04 words the evidence as "Feed OSCILLATING; torque/pressure follow with
    lag; RPM stable", and the corroboration is deliberately *not* required
    here. On a machine running against commissioning template baselines the
    load swing that accompanies a feed oscillation is frequently inside the
    template's own wide spread — the template is wide on purpose, so that it
    under-reports rather than invents — and requiring load to be independently
    anomalous would make feed instability undiagnosable on exactly the machines
    that have not been commissioned yet.

    So the match rests on what is unambiguous: the feeder is the only thing
    that makes feed swing while screw speed is constant. The load and pressure
    corroboration is declared in ``sharpened_by``, and its absence is reported
    as missing evidence, which lowers confidence rather than hiding the
    finding.
    """
    return view.oscillating("TS-F1") and view.stable("TS-S1")


def _feed_starvation(view: SignalView) -> bool:
    """P-005. Feed down, and everything downstream of it down with it."""
    return view.low("TS-F1") and (view.low("TS-PM1") or view.low("TS-P3"))


def _high_viscosity(view: SignalView) -> bool:
    """P-006. Load up while the melt runs cold."""
    return (view.high("TS-PM1") or view.high("TS-P3")) and view.low("TS-TM")


def _thermal_instability(view: SignalView) -> bool:
    """P-007. A zone oscillating at an unchanged setpoint."""
    return any(view.oscillating(f"TS-TZ{index}") for index in range(1, 10))


def _cooling_ineffective(view: SignalView) -> bool:
    """P-008. Zone temperature climbing with the process context steady."""
    climbing = any(view.rising(f"TS-TZ{index}") or view.high(f"TS-TZ{index}") for index in range(1, 10))
    return climbing and view.stable("TS-F1") and view.stable("TS-S1")


def _vacuum_problem(view: SignalView) -> bool:
    """P-009. Vacuum poor while the process context is valid."""
    return (view.low("TS-PV") or view.high("TS-PV")) and view.stable("TS-F1")


def _mechanical_drag(view: SignalView) -> bool:
    """P-010. Load up with *weak* pressure evidence, plus thermal or vibration.

    The absence of a pressure rise is the discriminator. A process restriction
    raises pressure and load together; drag in the drive train raises load
    alone, and the gearbox says so in its temperature or its vibration.
    """
    drive_evidence = (
        view.high("TS-T2")
        or view.high("TS-T3")
        or any(view.high(f"TS-V{index}") for index in (3, 4, 5))
    )
    return view.high("TS-PM1") and not view.high("TS-P3") and drive_evidence


_ZONES = tuple(f"TS-TZ{index}" for index in range(1, 10))


def _bearing_thermal_rise(view: SignalView) -> bool:
    """P-013. Motor bearing temperature leads; the drive load has not changed.

    The load term is the whole discriminator against a process cause. A motor
    running hot because the machine is asking more of it is not a bearing
    fault, and the way to tell is that the asking would show in TS-PM1.
    """
    return (view.high("TS-T1") or view.rising("TS-T1")) and view.stable("TS-PM1")


def _gearbox_thermal_rise(view: SignalView) -> bool:
    """P-014. Gearbox oil or thrust bearing hot with the load steady."""
    hot = (
        view.high("TS-T2")
        or view.rising("TS-T2")
        or view.high("TS-T3")
        or view.rising("TS-T3")
    )
    return hot and view.stable("TS-PM1")


def _drive_looseness(view: SignalView) -> bool:
    """P-015. The mirror of P-013: vibration leads and the bearing stays cool.

    Looseness, misalignment and imbalance all put energy into the casing
    without first putting it into the bearing, so a motor temperature that is
    *not* anomalous is positive evidence here rather than a missing signal.
    Excluding it also keeps this mutually exclusive with P-013, so one drive
    problem cannot be reported twice under two names.
    """
    vibration_high = view.high("TS-V1") or view.high("TS-V2")
    return (
        vibration_high
        and not (view.high("TS-T1") or view.rising("TS-T1"))
        and view.stable("TS-PM1")
    )


def _zone_below_setpoint(view: SignalView) -> bool:
    """P-016. A zone fallen away from its envelope, with the heat input steady.

    ``not oscillating`` is what separates a zone that has dropped from one
    that is hunting through the bottom of its swing; the hunting case is
    P-007's, and a directed residual is the distinction.
    """
    if any(view.oscillating(tag) for tag in _ZONES):
        return False
    return (
        any(view.low(tag) for tag in _ZONES)
        and view.stable("TS-F1")
        and view.stable("TS-S1")
    )


def _reduced_resistance(view: SignalView) -> bool:
    """P-017. Both taps fallen with feed and screw speed unchanged.

    The inverse of P-001. Feed stability is required rather than assumed:
    pressure falling because less material is going in is P-005, and the two
    are told apart at the feeder, not at the tap.
    """
    return (
        view.low("TS-P3")
        and view.low("TS-P4")
        and view.stable("TS-F1")
        and view.stable("TS-S1")
    )


def _pressure_pulsation(view: SignalView) -> bool:
    """P-018. Pressure swinging while the feed holds.

    The inverse of P-004, and exclusive with it: there the feed oscillates and
    pressure follows, so requiring a stable feed here puts the origin
    downstream of the screws.
    """
    return (view.oscillating("TS-P3") or view.oscillating("TS-P4")) and view.stable("TS-F1")


def _shear_overheating(view: SignalView) -> bool:
    """P-019. The melt is hot and the barrel is not what made it hot.

    Melt temperature and drive load rise together while every zone sits inside
    its envelope, which puts the energy in at the screws. A zone that is also
    high makes this a thermal fault instead, so the zones are checked and the
    match withheld rather than reported with a competing explanation.
    """
    if any(view.high(tag) or view.rising(tag) for tag in _ZONES):
        return False
    return view.high("TS-TM") and view.high("TS-PM1")


#: The patterns, in match order. Specific before general, as the module
#: docstring explains; P-011 and P-012 are handled by the resolver rather than
#: here, because they are decisions about the *absence* of a match.
PATTERN_RULES: tuple[PatternRule, ...] = (
    PatternRule(
        pattern_id="P-002",
        name="Localized Screen Restriction",
        fault_candidates=("TSE-DOWN-001",),
        requires=("TS-P3", "TS-P4", "TS-F1"),
        sharpened_by=("TS-PM1",),
        predicate=_screen_restriction,
        evidence=lambda view: (
            f"Pre-screen pressure is high at {view.value('TS-P3'):.3g} MPa",
            f"Pressure drop across the screen is {(view.value('TS-P3') or 0) - (view.value('TS-P4') or 0):.2g} MPa",
            "Feed rate is stable, so the rise is not a throughput change",
        ),
    ),
    PatternRule(
        pattern_id="P-003",
        name="Downstream / Die Restriction",
        fault_candidates=("TSE-DOWN-003", "TSE-DOWN-004"),
        requires=("TS-P3", "TS-P4"),
        sharpened_by=("TS-PM1", "TS-F1"),
        predicate=_die_restriction,
        evidence=lambda view: (
            "Both melt pressure taps are high",
            "The drop across the screen is not dominant, which points past the screen",
        ),
    ),
    PatternRule(
        pattern_id="P-019",
        name="Shear-Driven Overheating",
        fault_candidates=("TSE-PROC-003",),
        requires=("TS-TM", "TS-PM1", "TS-TZ1"),
        sharpened_by=("TS-TZ4", "TS-TZ5", "TS-S1"),
        predicate=_shear_overheating,
        evidence=lambda view: (
            f"Melt temperature is high at {view.value('TS-TM'):.4g} °C",
            "Drive load is high with it, so the energy is going in at the screws",
            "Every barrel zone is inside its envelope, so the barrel did not add the heat",
        ),
    ),
    PatternRule(
        pattern_id="P-001",
        name="Increased Process Resistance",
        fault_candidates=("TSE-PROC-001",),
        requires=("TS-P3", "TS-PM1", "TS-F1", "TS-S1"),
        sharpened_by=("TS-P4",),
        predicate=_process_resistance,
        evidence=lambda view: (
            "Melt pressure and drive load are both high",
            "Feed rate and screw speed are unchanged, so the context did not cause it",
        ),
    ),
    PatternRule(
        pattern_id="P-006",
        name="High-Viscosity Behaviour",
        fault_candidates=("TSE-PROC-006",),
        requires=("TS-PM1", "TS-TM"),
        sharpened_by=("TS-P3",),
        predicate=_high_viscosity,
        evidence=lambda view: (
            "Drive load is high while melt temperature is low",
            "Colder material works harder for the same throughput",
        ),
    ),
    PatternRule(
        pattern_id="P-005",
        name="Feed Starvation",
        fault_candidates=("TSE-FEED-001",),
        requires=("TS-F1",),
        sharpened_by=("TS-PM1", "TS-P3", "TS-L1"),
        predicate=_feed_starvation,
        evidence=lambda view: (
            "Feed rate is below its contextual envelope",
            "Drive load or melt pressure has fallen with it",
        ),
    ),
    PatternRule(
        pattern_id="P-004",
        name="Feed-Driven Instability",
        fault_candidates=("TSE-FEED-002",),
        requires=("TS-F1", "TS-S1"),
        sharpened_by=("TS-PM1", "TS-P3"),
        predicate=_feed_instability,
        evidence=lambda view: (
            "Feed rate is swinging well outside its learned variability",
            "Screw speed is steady, so the swing originates at the feeder rather than the drive",
        ),
    ),
    PatternRule(
        pattern_id="P-008",
        name="Cooling Ineffective",
        fault_candidates=("TSE-THERM-012", "TSE-THERM-013"),
        requires=("TS-F1", "TS-S1"),
        sharpened_by=("TS-TZ4", "TS-TZ5"),
        predicate=_cooling_ineffective,
        evidence=lambda view: (
            "A barrel zone is above or climbing away from its envelope",
            "Feed and screw speed are steady, so the heat input has not changed",
        ),
    ),
    PatternRule(
        pattern_id="P-007",
        name="Thermal Control Instability",
        fault_candidates=("TSE-CTRL-001", "TSE-THERM-009"),
        requires=("TS-TZ1",),
        sharpened_by=("TS-TZ4",),
        predicate=_thermal_instability,
        evidence=lambda view: ("A barrel zone temperature is oscillating at an unchanged setpoint",),
    ),
    PatternRule(
        pattern_id="P-009",
        name="Vacuum / Degassing Problem",
        fault_candidates=("TSE-VENT-001",),
        requires=("TS-PV",),
        sharpened_by=("TS-F1",),
        predicate=_vacuum_problem,
        evidence=lambda view: ("Vent/vacuum pressure is outside its contextual envelope",),
    ),
    PatternRule(
        pattern_id="P-010",
        name="Mechanical Drag",
        fault_candidates=("TSE-MECH-001", "TSE-LOAD-001"),
        requires=("TS-PM1",),
        sharpened_by=("TS-T2", "TS-V3", "TS-P3"),
        predicate=_mechanical_drag,
        evidence=lambda view: (
            "Drive load is high with no matching melt-pressure rise",
            "Gearbox thermal or vibration evidence accompanies it",
        ),
    ),
    PatternRule(
        pattern_id="P-013",
        name="Drive Bearing Thermal Rise",
        fault_candidates=("TSE-MECH-001",),
        requires=("TS-T1", "TS-PM1"),
        sharpened_by=("TS-V1", "TS-V2"),
        predicate=_bearing_thermal_rise,
        evidence=lambda view: (
            f"Motor temperature is above its envelope at {view.value('TS-T1'):.4g} °C",
            "Drive load is unchanged, so the machine is not asking more of the motor",
        ),
    ),
    PatternRule(
        pattern_id="P-014",
        name="Gearbox Thermal Rise",
        fault_candidates=("TSE-MECH-002",),
        requires=("TS-T2", "TS-PM1"),
        sharpened_by=("TS-T3", "TS-V3"),
        predicate=_gearbox_thermal_rise,
        evidence=lambda view: (
            f"Gearbox temperature is above its envelope at {view.value('TS-T2'):.4g} °C",
            "Drive load is unchanged, so the heat is not coming from the duty",
        ),
    ),
    PatternRule(
        pattern_id="P-015",
        name="Drive Mechanical Looseness",
        fault_candidates=("TSE-MECH-004",),
        requires=("TS-V1", "TS-T1", "TS-PM1"),
        sharpened_by=("TS-V2", "TS-V3"),
        predicate=_drive_looseness,
        evidence=lambda view: (
            f"Motor vibration is above its envelope at {view.value('TS-V1'):.3g} mm/s RMS",
            "Motor temperature is normal, which separates this from a bearing running hot",
            "Drive load is unchanged, so the excitation is mechanical rather than process",
        ),
    ),
    PatternRule(
        pattern_id="P-016",
        name="Zone Below Setpoint",
        fault_candidates=("TSE-THERM-008",),
        requires=("TS-TZ1", "TS-F1", "TS-S1"),
        sharpened_by=("TS-TZ4", "TS-TM"),
        predicate=_zone_below_setpoint,
        evidence=lambda view: (
            "A barrel zone has fallen below its contextual envelope and stayed there",
            "The residual has a direction, so the zone has dropped rather than hunting",
            "Feed and screw speed are steady, so the heat demand has not changed",
        ),
    ),
    PatternRule(
        pattern_id="P-017",
        name="Reduced Process Resistance",
        fault_candidates=("TSE-DOWN-005",),
        requires=("TS-P3", "TS-P4", "TS-F1", "TS-S1"),
        sharpened_by=("TS-PM1",),
        predicate=_reduced_resistance,
        evidence=lambda view: (
            f"Both melt pressure taps are low, at {view.value('TS-P3'):.3g} and {view.value('TS-P4'):.3g} MPa",
            "Feed rate and screw speed are unchanged, so less material is not the cause",
        ),
    ),
    PatternRule(
        pattern_id="P-018",
        name="Discharge Pressure Pulsation",
        fault_candidates=("TSE-DOWN-006",),
        requires=("TS-P3", "TS-F1"),
        sharpened_by=("TS-P4", "TS-S1"),
        predicate=_pressure_pulsation,
        evidence=lambda view: (
            "Melt pressure is swinging well outside its learned variability",
            "Feed rate is steady, so the swing originates downstream of the feeder",
        ),
    ),
)


def match_patterns(verdicts: Mapping[str, SignalVerdict]) -> list[PatternMatch]:
    """Every pattern that fits, most specific first.

    Several may match at once and all are returned: two independent faults are
    two patterns, and collapsing to one would suppress the second. The resolver
    decides which are independent and which are one chain.
    """
    view = SignalView(verdicts)
    matches: list[PatternMatch] = []

    for rule in PATTERN_RULES:
        unavailable = tuple(tag for tag in rule.requires if not view.present(tag))
        if unavailable:
            continue
        if not rule.predicate(view):
            continue
        matches.append(
            PatternMatch(
                pattern_id=rule.pattern_id,
                name=rule.name,
                fault_candidates=rule.fault_candidates,
                evidence=rule.evidence(view),
                required_signals=rule.requires,
                missing_signals=tuple(tag for tag in rule.sharpened_by if not view.present(tag)),
            )
        )

    return matches


def unevaluable_patterns(verdicts: Mapping[str, SignalVerdict]) -> list[tuple[str, tuple[str, ...]]]:
    """Patterns this machine cannot evaluate, and the signals they need.

    Surfaced in the UI as coverage. "ULTRON cannot distinguish a die
    restriction from a screen restriction on this machine because there is no
    post-screen pressure tap" is a sentence that gets an instrument installed;
    silence is not.
    """
    view = SignalView(verdicts)
    out: list[tuple[str, tuple[str, ...]]] = []
    for rule in PATTERN_RULES:
        unavailable = tuple(tag for tag in rule.requires if not view.present(tag))
        if unavailable:
            out.append((rule.pattern_id, unavailable))
    return out
