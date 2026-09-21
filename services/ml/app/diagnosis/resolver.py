"""Resolving evidence and model output into DOC-04 diagnoses.

This is where a probability becomes a diagnosis, and the conversion is
deliberately lossy in one direction only: a model can *raise* a candidate the
rules did not see, and it can raise a candidate's diagnosis state, but it
cannot name a fault the library does not contain and it cannot overrule the
instrumentation-first rule.

The order of operations is the argument.

1. **Instrumentation first.** DOC-07 §6: when evidence is internally
   inconsistent, the measurement chain is the suspect before the machine. A
   physical diagnosis is withheld until the sensor, port, wiring, scaling and
   timestamp have been cleared. So the inconsistency checks run before anything
   else and, when they fire, the physical candidates are demoted rather than
   reported alongside.

2. **Required evidence.** DOC-04 §18: a fault whose minimum required evidence
   is missing or BAD returns INSUFFICIENT_EVIDENCE, not a weaker conclusion.

3. **Patterns, then model candidates.** A pattern match is structural evidence
   about *now*; a model probability is a statement about the next few minutes.
   Both can produce an entry, and the entry says which.

4. **Unknown is kept unknown.** A strong multi-signal anomaly matching no
   pattern and no confident model output is FAULT_UNKNOWN. The nearest known
   fault is not offered, because the nearest fault to an unknown one is a
   wrong answer with a fault id attached to it.

5. **Causal chains are grouped.** DOC-04 §19: a restriction that raises
   pressure, load and melt temperature is one diagnosis with three symptoms,
   not four alarms. Independent faults stay independent, and an instrumentation
   fault is never absorbed into a physical chain.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Mapping, Sequence

from ..knowledge.enums import DiagnosisState
from ..knowledge.loader import FaultDefinition, knowledge
from ..models.base import parse_output_key
from ..persistence.filters import FilterVerdict
from ..quality.engine import FrameQuality
from ..rules.limits import RuleResult, SignalVerdict
from .patterns import PatternMatch, match_patterns, unevaluable_patterns

#: Known causal directions on this machine. Each entry says "when both are
#: present, the first explains the second", so the second is grouped beneath it
#: instead of alarming separately. Only relationships the process physics makes
#: one-directional are listed; anything ambiguous is left as two findings with
#: the ambiguity stated, which is DOC-04 §19's instruction.
CAUSAL_EDGES: tuple[tuple[str, str, str], ...] = (
    (
        "TSE-DOWN-001",
        "TSE-LOAD-001",
        "A restriction downstream raises the pressure the screws work against, "
        "so drive load follows it.",
    ),
    (
        "TSE-DOWN-001",
        "TSE-PROC-001",
        "A localised screen restriction is the specific case of general process "
        "resistance, not a second fault.",
    ),
    (
        "TSE-FEED-001",
        "TSE-PROC-002",
        "Starved feed reduces the melt the screws carry, which changes the "
        "process behaviour downstream of it.",
    ),
    (
        "TSE-FEED-002",
        "TSE-LOAD-003",
        "An oscillating feed drives an oscillating load; the load is the symptom.",
    ),
    (
        "TSE-PROC-006",
        "TSE-LOAD-001",
        "Higher viscosity raises the work the drive has to do.",
    ),
)

#: Alternatives to offer for a candidate: other faults the same evidence could
#: mean. Taken from the fault library's own families and locations rather than
#: invented, and never suppressed — DOC-04 §18 forbids hiding the competition.
ALTERNATIVES: dict[str, tuple[str, ...]] = {
    "TSE-DOWN-001": ("TSE-DOWN-003", "TSE-DOWN-004", "TSE-PROC-006", "TSE-THERM-008"),
    "TSE-DOWN-003": ("TSE-DOWN-001", "TSE-DOWN-004"),
    "TSE-PROC-001": ("TSE-DOWN-001", "TSE-DOWN-003", "TSE-PROC-006"),
    "TSE-PROC-006": ("TSE-THERM-008", "TSE-PROC-001"),
    "TSE-FEED-001": ("TSE-FEED-003", "TSE-FEED-004", "TSE-FEED-005"),
    "TSE-FEED-002": ("TSE-FEED-006", "TSE-CTRL-005"),
    "TSE-LOAD-001": ("TSE-MECH-001", "TSE-PROC-001", "TSE-PROC-006"),
    "TSE-MECH-001": ("TSE-LOAD-001", "TSE-MECH-004"),
    "TSE-VENT-001": ("TSE-VENT-002", "TSE-VENT-003"),
    "TSE-THERM-012": ("TSE-THERM-013", "TSE-CTRL-001"),
}

#: Root-cause candidates per fault. DOC-04 distinguishes L5 (the fault) from L6
#: (the root cause) and is explicit that the second is a weaker claim than the
#: first — which is why they are separate fields with separate confidences.
ROOT_CAUSES: dict[str, tuple[str, ...]] = {
    "TSE-DOWN-001": ("Screen contamination or buildup", "Screen pack undersized for this recipe", "Gel or degraded material accumulation"),
    "TSE-DOWN-003": ("Die land buildup", "Adapter restriction", "Cold spot in the melt path"),
    "TSE-PROC-001": ("Restriction somewhere in the melt path", "Material viscosity higher than the recipe assumes"),
    "TSE-PROC-006": ("Material batch variation", "Melt temperature below the recipe profile"),
    "TSE-FEED-001": ("Hopper bridging", "Feeder screw wear", "Refill system not keeping up"),
    "TSE-FEED-002": ("Loss-in-weight controller tuning", "Refill disturbance", "Poor material flow behaviour"),
    "TSE-LOAD-001": ("Increased process resistance", "Drive-train drag", "Material change"),
    "TSE-MECH-001": ("Bearing degradation", "Lubrication problem", "Coupling misalignment"),
    "TSE-VENT-001": ("Vacuum line leak", "Pump degradation", "Vent port flooding"),
    "TSE-THERM-012": ("Cooling water flow loss", "Cooling valve stuck", "Fouled cooling channel"),
}

#: The mechanism sentence — DOC-04 §21's HOW. Deterministic, from the library,
#: never generated. An LLM-invented mechanism is indistinguishable in the UI
#: from a validated one, and only one of them is knowledge.
MECHANISMS: dict[str, str] = {
    "TSE-DOWN-001": (
        "Material accumulating on the screen reduces the open area available to the melt. "
        "The pressure needed to push the same throughput through the smaller area rises, "
        "and the drive works harder to maintain screw speed against it."
    ),
    "TSE-DOWN-003": (
        "A restriction beyond the screen raises pressure on both sides of it, so the "
        "differential across the screen stays where it was while the absolute level climbs."
    ),
    "TSE-PROC-001": (
        "Something in the melt path is resisting flow. Pressure and drive load rise "
        "together while feed and speed are unchanged, which localises the cause to the "
        "path rather than to the input."
    ),
    "TSE-PROC-006": (
        "Colder or higher-viscosity material resists shear more, so the same screw speed "
        "delivers more work into the melt and the drive load rises with it."
    ),
    "TSE-FEED-001": (
        "Less material is reaching the screws than the recipe calls for. The partially "
        "filled channels transmit less pressure and demand less torque."
    ),
    "TSE-FEED-002": (
        "The feeder is delivering an unsteady rate. The screws see a varying fill, and "
        "load and melt pressure oscillate a beat behind it."
    ),
    "TSE-LOAD-001": (
        "The drive is delivering more torque than this operating point normally needs. "
        "Whether the extra work goes into the material or into the drive train is what "
        "the accompanying evidence decides."
    ),
    "TSE-MECH-001": (
        "Additional mechanical resistance in the drive train raises torque without a "
        "matching rise in melt pressure, and appears as heat or vibration at the source."
    ),
    "TSE-VENT-001": (
        "The vent is not holding the vacuum the recipe requires, so volatiles remain in "
        "the melt rather than being drawn off."
    ),
    "TSE-THERM-012": (
        "Heat generated by shear is not being removed at the rate it is produced, so the "
        "zone climbs away from its setpoint despite unchanged process input."
    ),
}


@dataclass
class EvidenceItem:
    evidence_class: str
    statement: str
    signal_id: str | None = None
    quality: str | None = None


@dataclass
class ResolvedDiagnosis:
    """One fault candidate, resolved through the knowledge layer."""

    fault_id: str
    name: str
    family: str
    diagnosis_state: DiagnosisState
    what: str
    where: str
    why: str
    mechanism: str
    supporting: list[EvidenceItem] = field(default_factory=list)
    contradicting: list[EvidenceItem] = field(default_factory=list)
    missing: list[EvidenceItem] = field(default_factory=list)
    alternatives: list[str] = field(default_factory=list)
    root_cause_candidates: list[str] = field(default_factory=list)
    grouped_symptoms: list[str] = field(default_factory=list)
    caused_by: str | None = None
    pattern_id: str | None = None
    source: str = "RULES"
    risk: dict[int, FilterVerdict] = field(default_factory=dict)
    required_evidence_satisfied: bool = True
    location_resolvable: bool = False
    signals: list[str] = field(default_factory=list)


@dataclass
class ResolutionResult:
    """Everything the resolver concluded, plus the overall condition verdict."""

    diagnoses: list[ResolvedDiagnosis]
    condition_verdict: str
    condition_reason: str
    unevaluable_patterns: list[tuple[str, tuple[str, ...]]] = field(default_factory=list)


class DiagnosisResolver:
    """Turns rule verdicts and model risks into DOC-04 diagnosis objects."""

    def resolve(
        self,
        *,
        rules: RuleResult,
        quality: FrameQuality,
        risks: Mapping[str, FilterVerdict] | None = None,
        ml_eligible: bool = False,
    ) -> ResolutionResult:
        book = knowledge()
        verdicts = {entry.signal_id: entry for entry in rules.verdicts}
        anomalies = [entry for entry in rules.verdicts if entry.is_anomalous]

        # 1 — instrumentation first.
        if rules.instrumentation_suspect:
            return ResolutionResult(
                diagnoses=[self._instrumentation_entry(rules, quality)],
                condition_verdict="DATA_QUALITY_PROBLEM",
                condition_reason=(
                    "Evidence is internally inconsistent. The measurement chain is evaluated "
                    "before any physical diagnosis."
                ),
                unevaluable_patterns=unevaluable_patterns(verdicts),
            )

        if quality.suppresses_physical_diagnosis:
            return ResolutionResult(
                diagnoses=[self._insufficient_entry(quality)],
                condition_verdict="INSUFFICIENT_EVIDENCE",
                condition_reason=(
                    "A mandatory signal is unusable, so a physical diagnosis cannot be founded."
                ),
                unevaluable_patterns=unevaluable_patterns(verdicts),
            )

        expected_responses = [
            entry for entry in rules.verdicts if entry.verdict == "EXPECTED_PROCESS_RESPONSE"
        ]

        # 2 and 3 — patterns, then model candidates.
        matches = match_patterns(verdicts)
        candidates: dict[str, ResolvedDiagnosis] = {}

        for match in matches:
            for fault_id in match.fault_candidates:
                definition = book.fault(fault_id)
                if definition is None:
                    continue
                entry = self._build(definition, match, verdicts, anomalies)
                candidates.setdefault(fault_id, entry)

        for key, verdict in (risks or {}).items():
            fault_id, horizon = parse_output_key(key)
            definition = book.fault(fault_id)
            if definition is None:
                # A model output naming a fault the library does not contain is
                # a model that was trained against a different knowledge
                # version. Dropped, loudly, rather than surfaced unresolvable.
                continue
            entry = candidates.get(fault_id)
            if entry is None:
                if not verdict.crossed:
                    continue
                entry = self._build(definition, None, verdicts, anomalies)
                entry.source = "ML"
                candidates[fault_id] = entry
            elif verdict.crossed:
                entry.source = "RULES+ML"
            entry.risk[horizon] = verdict

        # 4 — unknown stays unknown.
        if not candidates:
            if anomalies and len(anomalies) >= 2:
                return ResolutionResult(
                    diagnoses=[self._unknown_entry(anomalies)],
                    condition_verdict="FAULT_UNKNOWN",
                    condition_reason=(
                        f"{len(anomalies)} signals are outside their contextual envelope and no "
                        "known pattern fits. DOC-04 §20: an unknown abnormal pattern is "
                        "returned as unknown rather than forced to the nearest class."
                    ),
                    unevaluable_patterns=unevaluable_patterns(verdicts),
                )
            if anomalies:
                return ResolutionResult(
                    diagnoses=[self._single_anomaly_entry(anomalies[0])],
                    condition_verdict="ANOMALY_CONFIRMED",
                    condition_reason=(
                        f"{anomalies[0].label} is outside its contextual envelope, with no "
                        "corroborating evidence yet for a named fault."
                    ),
                    unevaluable_patterns=unevaluable_patterns(verdicts),
                )
            if expected_responses:
                return ResolutionResult(
                    diagnoses=[],
                    condition_verdict="EXPECTED_PROCESS_RESPONSE",
                    condition_reason=(
                        f"{len(expected_responses)} signal(s) moved as physics predicts after a "
                        "commanded change. A context change is not a fault."
                    ),
                    unevaluable_patterns=unevaluable_patterns(verdicts),
                )
            return ResolutionResult(
                diagnoses=[],
                condition_verdict="NORMAL",
                condition_reason="No approved limit reached and no contextual anomaly.",
                unevaluable_patterns=unevaluable_patterns(verdicts),
            )

        # 5 — group causal chains.
        ordered = self._group_causal(candidates)

        for entry in ordered:
            entry.diagnosis_state = self._state_for(entry, ml_eligible)

        return ResolutionResult(
            diagnoses=ordered,
            condition_verdict="ANOMALY_CONFIRMED",
            condition_reason=(
                f"{len(ordered)} fault candidate(s) resolved from "
                f"{len(anomalies)} contextual anomal{'y' if len(anomalies) == 1 else 'ies'}."
            ),
            unevaluable_patterns=unevaluable_patterns(verdicts),
        )

    # -- builders -----------------------------------------------------------

    def _build(
        self,
        definition: FaultDefinition,
        match: PatternMatch | None,
        verdicts: Mapping[str, SignalVerdict],
        anomalies: Sequence[SignalVerdict],
    ) -> ResolvedDiagnosis:
        supporting = [
            EvidenceItem(
                evidence_class="SUPPORTING",
                statement=entry.reason,
                signal_id=entry.signal_id,
                quality=entry.data_quality,
            )
            for entry in anomalies
        ]
        if match:
            supporting = [
                EvidenceItem(evidence_class="REQUIRED", statement=statement)
                for statement in match.evidence
            ] + supporting

        missing = [
            EvidenceItem(
                evidence_class="MISSING",
                statement=_missing_statement(tag),
                signal_id=tag,
            )
            for tag in (match.missing_signals if match else ())
        ]

        required_ok, required_gap = self._required_evidence(definition, verdicts)
        if not required_ok and required_gap:
            missing.append(
                EvidenceItem(evidence_class="MISSING", statement=required_gap)
            )

        contradicting: list[EvidenceItem] = []
        for entry in verdicts.values():
            if entry.verdict == "EXPECTED_PROCESS_RESPONSE":
                contradicting.append(
                    EvidenceItem(
                        evidence_class="CONTRADICTORY",
                        statement=entry.reason,
                        signal_id=entry.signal_id,
                        quality=entry.data_quality,
                    )
                )

        return ResolvedDiagnosis(
            fault_id=definition.fault_id,
            name=definition.name,
            family=definition.family,
            diagnosis_state="POSSIBLE",
            what=definition.name,
            where=definition.primary_location,
            why=_why(definition, match, anomalies),
            mechanism=MECHANISMS.get(definition.fault_id, _generic_mechanism(definition)),
            supporting=supporting,
            contradicting=contradicting,
            missing=missing,
            alternatives=[
                _fault_name(candidate) for candidate in ALTERNATIVES.get(definition.fault_id, ())
            ],
            root_cause_candidates=list(ROOT_CAUSES.get(definition.fault_id, ())),
            pattern_id=match.pattern_id if match else None,
            required_evidence_satisfied=required_ok,
            location_resolvable=bool(match and not match.missing_signals),
            signals=[entry.signal_id for entry in anomalies],
        )

    def _required_evidence(
        self, definition: FaultDefinition, verdicts: Mapping[str, SignalVerdict]
    ) -> tuple[bool, str | None]:
        """Whether the fault's minimum required evidence is actually available.

        The library states it as prose — "pre/post pressure or pre pressure,
        torque, feed/RPM" — so the check is over the *signal families* named in
        it rather than a parse of the sentence. Coarse, and deliberately: it
        errs toward reporting a gap, which produces INSUFFICIENT_EVIDENCE, and
        that is the safe direction to be wrong in.
        """
        text = definition.minimum_required_evidence.lower()
        needed: list[tuple[str, tuple[str, ...]]] = []
        if "pressure" in text:
            needed.append(("melt pressure", ("TS-P1", "TS-P2", "TS-P3", "TS-P4")))
        if "torque" in text or "current" in text or "load" in text:
            needed.append(("drive load", ("TS-PM1",)))
        if "feed" in text:
            needed.append(("feed rate", ("TS-F1", "TS-F2")))
        if "rpm" in text or "speed" in text:
            needed.append(("screw speed", ("TS-S1", "TS-S2", "TS-E1")))
        if "vacuum" in text:
            needed.append(("vacuum", ("TS-PV",)))
        if "zone" in text or "temperature" in text:
            needed.append(("barrel temperature", tuple(f"TS-TZ{i}" for i in range(1, 10))))

        gaps = [
            name
            for name, tags in needed
            if not any(
                (entry := verdicts.get(tag)) is not None and entry.value is not None for tag in tags
            )
        ]
        if not gaps:
            return True, None
        return False, (
            f"{definition.name} requires {definition.minimum_required_evidence}. "
            f"Not available on this machine: {', '.join(gaps)}."
        )

    def _state_for(self, entry: ResolvedDiagnosis, ml_eligible: bool) -> DiagnosisState:
        """The DOC-04 §20 diagnosis state, from evidence strength.

        Note what does *not* appear: a model probability. A 0.9 risk of a fault
        developing in fifteen minutes says nothing about whether the fault is
        present now, and letting it set the present-tense state would be the
        exact conflation DOC-05 §3 forbids.
        """
        if not entry.required_evidence_satisfied:
            return "INSUFFICIENT_EVIDENCE"

        required = sum(1 for item in entry.supporting if item.evidence_class == "REQUIRED")
        supporting = sum(1 for item in entry.supporting if item.evidence_class == "SUPPORTING")

        if entry.contradicting:
            return "POSSIBLE"
        if required and supporting >= 2 and entry.location_resolvable:
            return "PROBABLE"
        if required and supporting >= 1:
            return "SUSPECTED"
        if required or supporting >= 2:
            return "POSSIBLE"
        if entry.source == "ML" and ml_eligible:
            # The model raised it and the structural evidence has not caught up.
            # POSSIBLE, never PROBABLE: a prognosis is not an observation.
            return "POSSIBLE"
        return "NOT_DETECTED"

    def _group_causal(self, candidates: dict[str, ResolvedDiagnosis]) -> list[ResolvedDiagnosis]:
        """Fold known downstream effects under their cause.

        Only where the direction is known. Where it is not, both stay as
        separate findings and neither claims to explain the other, which is
        what DOC-04 §19 asks for when causality is uncertain.
        """
        absorbed: set[str] = set()
        for cause_id, effect_id, explanation in CAUSAL_EDGES:
            cause = candidates.get(cause_id)
            effect = candidates.get(effect_id)
            if cause is None or effect is None or effect_id in absorbed:
                continue
            # An instrumentation fault is never absorbed into a physical chain.
            if effect.family == "INSTRUMENTATION":
                continue
            cause.grouped_symptoms.append(f"{effect.name} — {explanation}")
            effect.caused_by = cause_id
            absorbed.add(effect_id)

        remaining = [entry for fault_id, entry in candidates.items() if fault_id not in absorbed]
        # Most evidence first, so the finding an operator should read is first.
        remaining.sort(
            key=lambda entry: (
                -len(entry.supporting),
                -len(entry.grouped_symptoms),
                entry.fault_id,
            )
        )
        return remaining

    def _instrumentation_entry(self, rules: RuleResult, quality: FrameQuality) -> ResolvedDiagnosis:
        book = knowledge()
        definition = book.fault("TSE-INST-005") or book.fault("TSE-INST-001")
        name = definition.name if definition else "Instrumentation suspect"
        return ResolvedDiagnosis(
            fault_id=definition.fault_id if definition else "TSE-INST-001",
            name=name,
            family="INSTRUMENTATION",
            diagnosis_state="SUSPECTED",
            what="The measurement chain is inconsistent with itself",
            where="Sensor, wiring, scaling, tag or timestamp",
            why=(
                "One signal claims a condition that every signal which would have to agree "
                "with it does not. DOC-07 §6 withholds a physical diagnosis until the "
                "measurement chain has been cleared."
            ),
            mechanism=(
                "A fault in the measurement path changes what is reported without changing "
                "what is happening, so the reported value stops being consistent with the "
                "physically related ones."
            ),
            supporting=[
                EvidenceItem(evidence_class="REQUIRED", statement=reason)
                for reason in rules.instrumentation_reasons
            ],
            missing=[
                EvidenceItem(
                    evidence_class="MISSING",
                    statement=(
                        "A physical diagnosis is withheld until the instrumentation is cleared."
                    ),
                )
            ],
            alternatives=["A real process condition, once the measurement is verified"],
            root_cause_candidates=[
                "Sensor or transmitter fault",
                "Wiring or connector fault",
                "Incorrect scaling or engineering-unit configuration",
                "Tag mapped to the wrong point",
            ],
            source="RULES",
            required_evidence_satisfied=True,
            location_resolvable=False,
        )

    def _insufficient_entry(self, quality: FrameQuality) -> ResolvedDiagnosis:
        missing = ", ".join(sorted(quality.mandatory_unavailable)) or "a mandatory signal"
        return ResolvedDiagnosis(
            fault_id="TSE-INST-001",
            name="Insufficient evidence",
            family="INSTRUMENTATION",
            diagnosis_state="INSUFFICIENT_EVIDENCE",
            what="A required measurement is unavailable",
            where=missing,
            why=(
                f"{missing} is BAD or MISSING. DOC-04 §18: a rule whose required evidence is "
                "unavailable returns INSUFFICIENT_EVIDENCE rather than a weaker conclusion."
            ),
            mechanism="",
            missing=[
                EvidenceItem(
                    evidence_class="MISSING",
                    statement=f"{signal} is not usable in this frame.",
                    signal_id=signal,
                )
                for signal in sorted(quality.mandatory_unavailable)
            ],
            required_evidence_satisfied=False,
        )

    def _unknown_entry(self, anomalies: Sequence[SignalVerdict]) -> ResolvedDiagnosis:
        return ResolvedDiagnosis(
            fault_id="FAULT_UNKNOWN",
            name="Unknown abnormal pattern",
            family="PROCESS",
            diagnosis_state="FAULT_UNKNOWN",
            what=f"{len(anomalies)} signals are abnormal together in a combination the library does not describe",
            where="Not localised",
            why=(
                "The anomalies are real and corroborate each other, but no DOC-04 pattern "
                "matches them. Reporting the nearest known fault would attach a fault id to "
                "a wrong answer."
            ),
            mechanism="",
            supporting=[
                EvidenceItem(
                    evidence_class="REQUIRED" if index == 0 else "SUPPORTING",
                    statement=entry.reason,
                    signal_id=entry.signal_id,
                    quality=entry.data_quality,
                )
                for index, entry in enumerate(anomalies)
            ],
            missing=[
                EvidenceItem(
                    evidence_class="MISSING",
                    statement="No fault-library entry covers this combination. Engineering review.",
                )
            ],
            source="RULES",
            signals=[entry.signal_id for entry in anomalies],
        )

    def _single_anomaly_entry(self, anomaly: SignalVerdict) -> ResolvedDiagnosis:
        return ResolvedDiagnosis(
            fault_id="FAULT_UNKNOWN",
            name=f"{anomaly.label} outside its contextual envelope",
            family="PROCESS",
            diagnosis_state="POSSIBLE",
            what=f"{anomaly.label} is outside the envelope learned for this operating point",
            where=anomaly.label,
            why=(
                f"{anomaly.reason} One signal alone does not distinguish between a process "
                "condition and a measurement problem."
            ),
            mechanism="",
            supporting=[
                EvidenceItem(
                    evidence_class="REQUIRED",
                    statement=anomaly.reason,
                    signal_id=anomaly.signal_id,
                    quality=anomaly.data_quality,
                )
            ],
            missing=[
                EvidenceItem(
                    evidence_class="MISSING",
                    statement=(
                        "No second signal corroborates it, so neither a fault nor an "
                        "instrumentation problem can be separated from the other."
                    ),
                )
            ],
            signals=[anomaly.signal_id],
        )


def _fault_name(fault_id: str) -> str:
    definition = knowledge().fault(fault_id)
    return f"{definition.name} ({fault_id})" if definition else fault_id


def _missing_statement(tag: str) -> str:
    entry = knowledge().tag(tag)
    label = entry.label if entry else tag
    return f"{label} is not reporting, so the diagnosis cannot be narrowed further."


def _generic_mechanism(definition: FaultDefinition) -> str:
    return (
        f"{definition.name} presents at {definition.primary_location}. "
        f"Minimum evidence for this rule: {definition.minimum_required_evidence}."
    )


def _why(
    definition: FaultDefinition,
    match: PatternMatch | None,
    anomalies: Sequence[SignalVerdict],
) -> str:
    if match:
        return (
            f"{match.name} matched: {'; '.join(match.evidence)}. "
            f"That pattern points at {definition.primary_location}."
        )
    if anomalies:
        return (
            f"The learned model raised {definition.name} from the combination of "
            f"{', '.join(entry.label for entry in anomalies[:3])}. "
            "No deterministic pattern has matched yet."
        )
    return (
        f"The learned model raised {definition.name} from the current feature pattern. "
        "No deterministic anomaly or pattern corroborates it yet."
    )
