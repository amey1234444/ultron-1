"""DOC-05 — severity, confidence, impact, priority and action.

Five outputs that must stay separate. §3 names the confusions:

    Severity   how serious the physical condition is        != Confidence
    Confidence how certain the diagnosis is                 != Severity
    Impact     what the condition can affect                != Priority
    Priority   how urgently to respond                      != physical severity
    Action     what to do                                   != the diagnosis text

Collapsing any two is the failure this module exists to prevent, and the code
is arranged so the worst of them is unreachable: ``severity`` is computed from
the authority ladder *before* any confidence is calculated, and no confidence
value is in scope when it is. §16's disaster — an approved Danger downgraded
because the model was unsure — cannot be written here without adding an
argument to the function.

The other structural commitment is three confidences, not one. DOC-05 §13's
example is a real one: "process restriction 94%, screen/downstream 76%, screen
contamination 45%" is a single finding with three different certainties, and
reporting only the first sends somebody to strip a screen pack on 45% evidence.

And a probability is never any of these. A 0.87 fifteen-minute risk is an input
to priority and to nothing else.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from ..diagnosis.resolver import ResolvedDiagnosis
from ..knowledge.enums import (
    ActionStep,
    ConfidenceLevel,
    ImpactLevel,
    LimitAuthority,
    Priority,
    ProgressionStage,
    Severity,
    confidence_level,
)
from ..rules.limits import RuleResult, severity_at_least


@dataclass
class ConfidenceResult:
    score: float
    level: ConfidenceLevel
    basis: list[str] = field(default_factory=list)


@dataclass
class DecisionResult:
    """The DOC-05 §40 decision for one diagnosis."""

    severity: Severity
    severity_authority: LimitAuthority | None
    severity_reason: str
    progression: ProgressionStage
    fault_confidence: ConfidenceResult
    location_confidence: ConfidenceResult
    root_cause_confidence: ConfidenceResult
    impact: dict[str, ImpactLevel]
    impact_horizon: str
    priority: Priority
    priority_reason: str
    action_level: str
    action_steps: list[ActionStep]
    action_text: str
    action_authority: str = "ULTRON_RECOMMENDATION"
    explainability: list[dict[str, str]] = field(default_factory=list)


#: DOC-05 §17. What each fault family can affect, before the specific evidence
#: is considered. A starting matrix per family rather than per fault, because
#: ninety per-fault impact rows nobody has reviewed would be ninety guesses.
FAMILY_IMPACT: dict[str, dict[str, ImpactLevel]] = {
    "DOWNSTREAM": {"equipment": "MEDIUM", "process": "HIGH", "production": "MEDIUM", "quality": "POTENTIAL", "energy": "MEDIUM", "safety": "LOW", "downtime": "MEDIUM"},
    "PROCESS": {"equipment": "LOW", "process": "HIGH", "production": "MEDIUM", "quality": "POTENTIAL", "energy": "MEDIUM", "safety": "LOW", "downtime": "LOW"},
    "FEEDING": {"equipment": "LOW", "process": "MEDIUM", "production": "HIGH", "quality": "POTENTIAL", "energy": "LOW", "safety": "NONE", "downtime": "MEDIUM"},
    "THERMAL": {"equipment": "MEDIUM", "process": "MEDIUM", "production": "MEDIUM", "quality": "HIGH", "energy": "MEDIUM", "safety": "LOW", "downtime": "LOW"},
    "VENTING": {"equipment": "LOW", "process": "MEDIUM", "production": "LOW", "quality": "HIGH", "energy": "LOW", "safety": "LOW", "downtime": "LOW"},
    "DRIVE_LOAD": {"equipment": "HIGH", "process": "MEDIUM", "production": "MEDIUM", "quality": "LOW", "energy": "HIGH", "safety": "LOW", "downtime": "HIGH"},
    "MECHANICAL": {"equipment": "HIGH", "process": "LOW", "production": "MEDIUM", "quality": "LOW", "energy": "MEDIUM", "safety": "MEDIUM", "downtime": "HIGH"},
    "CONTROL": {"equipment": "LOW", "process": "MEDIUM", "production": "MEDIUM", "quality": "MEDIUM", "energy": "LOW", "safety": "LOW", "downtime": "LOW"},
    "INSTRUMENTATION": {"equipment": "NONE", "process": "LOW", "production": "LOW", "quality": "POTENTIAL", "energy": "NONE", "safety": "LOW", "downtime": "LOW"},
    "QUALITY": {"equipment": "NONE", "process": "MEDIUM", "production": "MEDIUM", "quality": "HIGH", "energy": "LOW", "safety": "NONE", "downtime": "LOW"},
}

_EMPTY_IMPACT: dict[str, ImpactLevel] = {
    "equipment": "NONE",
    "process": "NONE",
    "production": "NONE",
    "quality": "NONE",
    "energy": "NONE",
    "safety": "NONE",
    "downtime": "NONE",
}


class DecisionEngine:
    """DOC-05, applied to one resolved diagnosis at a time."""

    def decide(
        self,
        *,
        diagnosis: ResolvedDiagnosis,
        rules: RuleResult,
        data_quality_fraction: float,
        context_confidence: float,
        baseline_confidence: float,
        state_confidence: float,
        ml_eligible: bool,
        asset_critical: bool = True,
        redundancy_available: bool = False,
        safety_relevant: bool = False,
    ) -> DecisionResult:
        # --- SEVERITY. Computed first, with no confidence in scope. --------
        severity, authority, severity_reason = self._severity(diagnosis, rules)
        progression = self._progression(diagnosis, rules)

        # --- CONFIDENCE. Three of them, none of which touches severity. ----
        fault_confidence = self._fault_confidence(
            diagnosis,
            data_quality_fraction=data_quality_fraction,
            context_confidence=context_confidence,
            baseline_confidence=baseline_confidence,
            state_confidence=state_confidence,
        )
        location_confidence = self._location_confidence(diagnosis, fault_confidence)
        root_cause_confidence = self._root_cause_confidence(diagnosis, location_confidence)

        # --- IMPACT --------------------------------------------------------
        impact, horizon = self._impact(diagnosis, severity)

        # --- PRIORITY ------------------------------------------------------
        priority, priority_reason = self._priority(
            diagnosis=diagnosis,
            severity=severity,
            fault_confidence=fault_confidence,
            impact=impact,
            asset_critical=asset_critical,
            redundancy_available=redundancy_available,
            safety_relevant=safety_relevant,
        )

        # --- ACTION --------------------------------------------------------
        action_level, steps, text = self._action(
            diagnosis=diagnosis,
            severity=severity,
            fault_confidence=fault_confidence,
            priority=priority,
        )

        return DecisionResult(
            severity=severity,
            severity_authority=authority,
            severity_reason=severity_reason,
            progression=progression,
            fault_confidence=fault_confidence,
            location_confidence=location_confidence,
            root_cause_confidence=root_cause_confidence,
            impact=impact,
            impact_horizon=horizon,
            priority=priority,
            priority_reason=priority_reason,
            action_level=action_level,
            action_steps=steps,
            action_text=text,
            explainability=self._explainability(
                diagnosis, severity, severity_reason, fault_confidence, priority, priority_reason
            ),
        )

    # -- severity -----------------------------------------------------------

    def _severity(
        self, diagnosis: ResolvedDiagnosis, rules: RuleResult
    ) -> tuple[Severity, LimitAuthority | None, str]:
        """The authority ladder. Analytics may raise; nothing may lower.

        Note the signature: no confidence, no probability. §16's failure is not
        expressible from here.
        """
        severity = rules.severity
        authority = rules.severity_authority
        reason = rules.severity_reason

        # An instrumentation finding does not carry process severity of its own.
        # It is not NORMAL either — a machine whose instruments disagree is not
        # a machine anyone should be calling normal — so it floors at ALERT
        # unless an approved limit has already set something higher.
        if diagnosis.family == "INSTRUMENTATION" and diagnosis.diagnosis_state in {
            "SUSPECTED",
            "PROBABLE",
        }:
            raised = severity_at_least(severity, "ALERT")
            if raised != severity:
                return (
                    raised,
                    authority or "ULTRON_LEARNED",
                    "The measurement chain is inconsistent, so the machine's condition "
                    "cannot presently be established.",
                )

        # A confirmed fault in a family that damages equipment floors at ALERT
        # even with no approved limit declared, because a site that has not
        # declared limits has not thereby made its gearbox indestructible.
        if diagnosis.diagnosis_state == "PROBABLE" and diagnosis.family in {
            "MECHANICAL",
            "DRIVE_LOAD",
        }:
            raised = severity_at_least(severity, "ALERT")
            if raised != severity:
                return (
                    raised,
                    "ULTRON_LEARNED",
                    f"{diagnosis.name} is PROBABLE in a family that damages equipment. "
                    "No approved limit was reached; this is a learned advisory floor.",
                )

        return severity, authority, reason

    def _progression(self, diagnosis: ResolvedDiagnosis, rules: RuleResult) -> ProgressionStage:
        """How far it has developed. Separate from how serious it is.

        DOC-05 §8. An EARLY DANGER and an ADVANCED ALERT are both coherent, and
        an engineer needs both numbers to plan.
        """
        if rules.trip_active or rules.danger_reached:
            return "SEVERE"
        anomaly_count = len(diagnosis.signals)
        risks = [verdict.probability for verdict in diagnosis.risk.values()]
        peak = max(risks) if risks else 0.0
        if anomaly_count >= 4 or peak >= 0.9:
            return "ADVANCED"
        if anomaly_count >= 2 or peak >= 0.7:
            return "DEVELOPING"
        return "EARLY"

    # -- confidence ---------------------------------------------------------

    def _fault_confidence(
        self,
        diagnosis: ResolvedDiagnosis,
        *,
        data_quality_fraction: float,
        context_confidence: float,
        baseline_confidence: float,
        state_confidence: float,
    ) -> ConfidenceResult:
        """How certain the *fault* is. Not how serious, and not a probability."""
        basis: list[str] = []

        if not diagnosis.required_evidence_satisfied:
            return ConfidenceResult(
                score=0.0,
                level="INSUFFICIENT_EVIDENCE",
                basis=["A required measurement for this rule is unavailable."],
            )

        required = sum(1 for item in diagnosis.supporting if item.evidence_class == "REQUIRED")
        supporting = sum(1 for item in diagnosis.supporting if item.evidence_class == "SUPPORTING")

        score = 0.2
        if required:
            score += 0.3
            basis.append(f"{required} item(s) of required evidence present.")
        else:
            basis.append("No required evidence; the candidate rests on supporting signals alone.")

        score += min(0.25, 0.08 * supporting)
        if supporting >= 2:
            basis.append(f"{supporting} independent signals agree.")

        # Every input that could make the evidence itself untrustworthy is a
        # multiplier, not an addend. A perfect pattern match on data nobody
        # trusts is not a confident diagnosis.
        quality_factor = 0.4 + 0.6 * max(0.0, min(1.0, data_quality_fraction))
        score *= quality_factor
        if data_quality_fraction < 0.9:
            basis.append(f"Data quality is {data_quality_fraction * 100:.0f}% GOOD across signals.")

        context_factor = 0.5 + 0.5 * max(0.0, min(1.0, context_confidence))
        score *= context_factor
        if context_confidence < 0.8:
            basis.append(f"Context confidence {context_confidence:.2f}.")

        baseline_factor = 0.5 + 0.5 * max(0.0, min(1.0, baseline_confidence))
        score *= baseline_factor
        if baseline_confidence < 0.5:
            basis.append(
                f"The comparison used a low-confidence baseline ({baseline_confidence:.2f})."
            )

        # Operating state is deliberately *not* a separate multiplier here.
        # The context engine already caps context confidence at the state's own
        # confidence, so applying it again would penalise an inferred state
        # twice and drive every cold-start finding to LOW whatever the evidence.
        del state_confidence

        if diagnosis.contradicting:
            score *= 0.7
            basis.append(f"{len(diagnosis.contradicting)} item(s) of contradicting evidence.")
        if diagnosis.missing:
            score *= 0.85
            basis.append(f"{len(diagnosis.missing)} item(s) of evidence are unavailable.")

        # A model-only candidate with no structural corroboration is capped.
        # The model may be right; it has not shown its work, and the fault
        # library's evidence model is what "shown its work" means here.
        if diagnosis.source == "ML" and not required:
            score = min(score, 0.45)
            basis.append(
                "Raised by the learned model without a matching deterministic pattern."
            )

        score = max(0.0, min(1.0, score))
        return ConfidenceResult(score=round(score, 3), level=confidence_level(score), basis=basis)

    def _location_confidence(
        self, diagnosis: ResolvedDiagnosis, fault: ConfidenceResult
    ) -> ConfidenceResult:
        """Where it is. Never higher than the confidence that it exists."""
        if fault.level == "INSUFFICIENT_EVIDENCE":
            return ConfidenceResult(score=0.0, level="INSUFFICIENT_EVIDENCE", basis=fault.basis)

        basis: list[str] = []
        score = fault.score
        if diagnosis.location_resolvable:
            score *= 0.95
            basis.append("The matched pattern localises the fault directly.")
        else:
            score *= 0.6
            basis.append(
                "The evidence does not separate this location from its neighbours; "
                "a localising measurement is missing."
            )
        if diagnosis.missing:
            score *= 0.8
        score = max(0.0, min(1.0, score))
        return ConfidenceResult(score=round(score, 3), level=confidence_level(score), basis=basis)

    def _root_cause_confidence(
        self, diagnosis: ResolvedDiagnosis, location: ConfidenceResult
    ) -> ConfidenceResult:
        """Why it happened. The weakest of the three, and honestly so.

        A screen restriction can be near-certain while *why* the screen loaded
        up — contamination, gel, an undersized pack — is a list of candidates
        nobody can separate without opening the machine.
        """
        if location.level == "INSUFFICIENT_EVIDENCE":
            return ConfidenceResult(score=0.0, level="INSUFFICIENT_EVIDENCE", basis=location.basis)

        candidates = len(diagnosis.root_cause_candidates)
        if candidates == 0:
            return ConfidenceResult(
                score=0.0,
                level="LOW",
                basis=["No root-cause candidate is proposed for this fault."],
            )

        # More candidates means less certainty about any one of them.
        score = location.score * (1.0 / (1.0 + 0.6 * (candidates - 1)))
        basis = [
            f"{candidates} root-cause candidate(s) fit the same evidence and cannot be "
            "separated without inspection."
        ]
        score = max(0.0, min(1.0, score))
        return ConfidenceResult(score=round(score, 3), level=confidence_level(score), basis=basis)

    # -- impact -------------------------------------------------------------

    def _impact(
        self, diagnosis: ResolvedDiagnosis, severity: Severity
    ) -> tuple[dict[str, ImpactLevel], str]:
        base = dict(FAMILY_IMPACT.get(diagnosis.family, _EMPTY_IMPACT))
        # Current versus potential, kept apart per §18. A fault that has not
        # reached a limit is describing what it *could* affect.
        horizon = "CURRENT" if severity != "NORMAL" else "POTENTIAL"
        if horizon == "POTENTIAL":
            base = {
                key: ("POTENTIAL" if value in {"HIGH", "MEDIUM"} else value)
                for key, value in base.items()
            }
        return base, horizon

    # -- priority -----------------------------------------------------------

    def _priority(
        self,
        *,
        diagnosis: ResolvedDiagnosis,
        severity: Severity,
        fault_confidence: ConfidenceResult,
        impact: dict[str, ImpactLevel],
        asset_critical: bool,
        redundancy_available: bool,
        safety_relevant: bool,
    ) -> tuple[Priority, str]:
        """How urgently to respond. A class, never a deadline.

        §23's TIMING IS CUSTOMER-CONFIGURABLE note: exact response times come
        from customer and OEM maintenance policy. Nothing here converts a
        priority into minutes.
        """
        if severity == "DANGER" or safety_relevant:
            return "P1", (
                "An approved Danger or protection condition is present. Respond under the "
                "plant's emergency or operating procedure."
            )

        peak_risk = max((verdict.probability for verdict in diagnosis.risk.values()), default=0.0)
        crossed = any(verdict.crossed for verdict in diagnosis.risk.values())
        short_horizon_crossed = any(
            verdict.crossed for horizon, verdict in diagnosis.risk.items() if horizon <= 15
        )

        if severity == "ALERT":
            if fault_confidence.level in {"HIGH", "MEDIUM"}:
                return "P2", (
                    f"An approved Alert is present with {fault_confidence.level} fault "
                    "confidence. Act within the current shift per plant procedure."
                )
            # Low confidence does NOT lower the priority below urgent when an
            # approved Alert is present. It changes the action to verification.
            return "P2", (
                "An approved Alert is present. Confidence in the diagnosis is LOW, so the "
                "urgent task is verification rather than intervention — the condition is "
                "not downgraded."
            )

        if crossed and short_horizon_crossed and fault_confidence.level == "HIGH":
            return "P2", (
                f"Predictive risk has crossed its threshold within 15 minutes "
                f"(peak {peak_risk:.2f}) with HIGH fault confidence, while no approved limit "
                "has been reached."
            )
        if crossed:
            return "P3", (
                f"Predictive risk has crossed its threshold (peak {peak_risk:.2f}) with no "
                "approved limit reached. Schedule the intervention."
            )
        if diagnosis.diagnosis_state in {"SUSPECTED", "PROBABLE"}:
            return "P3", (
                f"{diagnosis.name} is {diagnosis.diagnosis_state.lower()} on deterministic "
                "evidence with no approved limit reached. Plan the verification."
            )
        if impact.get("equipment") == "HIGH" and asset_critical and not redundancy_available:
            return "P3", (
                "The affected equipment is critical and has no redundancy, so a developing "
                "condition should be planned in rather than watched."
            )
        return "P4", (
            "No approved limit reached and no predictive threshold crossed. Continue "
            "trending and verify on a routine basis."
        )

    # -- action -------------------------------------------------------------

    def _action(
        self,
        *,
        diagnosis: ResolvedDiagnosis,
        severity: Severity,
        fault_confidence: ConfidenceResult,
        priority: Priority,
    ) -> tuple[str, list[ActionStep], str]:
        """What to do. The step sequence is DOC-05 §27's, in order."""
        if severity == "DANGER":
            return (
                "IMMEDIATE_ESCALATION",
                ["CONFIRM", "ESCALATE"],
                (
                    f"{diagnosis.name}: an approved Danger condition is present. Follow the "
                    "approved emergency procedure. Verify the measurement as part of the "
                    "response, not before it."
                ),
            )

        if fault_confidence.level == "INSUFFICIENT_EVIDENCE":
            return (
                "VERIFY",
                ["CONFIRM"],
                (
                    "A required measurement is unavailable. Restore or verify the "
                    f"instrumentation before {diagnosis.name} can be assessed."
                ),
            )

        if diagnosis.family == "INSTRUMENTATION":
            return (
                "VERIFY",
                ["CONFIRM", "INSPECT", "CORRECT", "VERIFY"],
                (
                    "Check the sensor, wiring, scaling and tag mapping against an independent "
                    "measurement before treating this as a process condition."
                ),
            )

        if severity == "ALERT" and fault_confidence.level == "LOW":
            # §16 exactly: the severity stays, the action becomes verification.
            return (
                "VERIFY",
                ["CONFIRM", "INSPECT"],
                (
                    f"An approved Alert is present but the evidence for {diagnosis.name} is "
                    "weak. Verify with independent measurements and related process values "
                    "before committing to maintenance."
                ),
            )

        if severity == "ALERT":
            return (
                "URGENT_INTERVENTION",
                ["CONFIRM", "INSPECT", "CORRECT", "VERIFY"],
                (
                    f"{diagnosis.name} at {diagnosis.where}. Confirm the reading, inspect the "
                    "location, apply the approved corrective action and verify the condition "
                    "actually improved."
                ),
            )

        if (
            diagnosis.diagnosis_state in {"SUSPECTED", "PROBABLE"}
            and fault_confidence.level == "LOW"
        ):
            # DOC-05 §28's VERIFY: credible evidence, uncertain support. The
            # answer is an independent measurement, not a maintenance job and
            # not silence.
            return (
                "VERIFY",
                ["CONFIRM", "INSPECT"],
                (
                    f"{diagnosis.name} is {diagnosis.diagnosis_state.lower()} at "
                    f"{diagnosis.where}, but confidence is LOW — the comparison rests on an "
                    "uncalibrated baseline or incomplete evidence. Verify with an "
                    "independent measurement before acting."
                ),
            )

        if priority == "P3":
            return (
                "PLAN_MAINTENANCE",
                ["CONFIRM", "INSPECT", "CORRECT", "VERIFY"],
                (
                    f"{diagnosis.name} is developing at {diagnosis.where} with no limit reached. "
                    "Schedule inspection in the next planned window."
                ),
            )

        return (
            "MONITOR",
            ["CONFIRM"],
            (
                f"{diagnosis.name} is an early advisory with no approved limit reached. "
                "Continue trending; no intervention is indicated yet."
            ),
        )

    def _explainability(
        self,
        diagnosis: ResolvedDiagnosis,
        severity: Severity,
        severity_reason: str,
        fault_confidence: ConfidenceResult,
        priority: Priority,
        priority_reason: str,
    ) -> list[dict[str, str]]:
        """DOC-05 §41 — the four questions a decision must be able to answer."""
        return [
            {"question": "Why this severity?", "answer": severity_reason},
            {
                "question": "Why this confidence?",
                "answer": " ".join(fault_confidence.basis) or "Evidence was complete and consistent.",
            },
            {"question": "Why this priority?", "answer": priority_reason},
            {
                "question": "Why this action?",
                "answer": (
                    f"The condition is {severity} at {fault_confidence.level} confidence, and the "
                    f"fault is {diagnosis.diagnosis_state}. That combination determines the step "
                    "sequence, not the diagnosis text."
                ),
            },
        ]
