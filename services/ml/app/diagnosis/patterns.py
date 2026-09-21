"""Matching the DOC-04 §7 abnormal patterns against observed anomalies.

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
        fault_candidates=("TSE-CTRL-001",),
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

    Surfaced in the UI as coverage. "BLACKGATE cannot distinguish a die
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
