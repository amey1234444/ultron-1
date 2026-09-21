"""DOC-05: five outputs that must stay separate.

The tests that matter most here are the ones that prove a confusion is
*impossible*, not merely absent. §16's failure — an approved Danger downgraded
because the model was unsure — is the one this module exists to prevent, and it
is asserted from several directions.
"""

from __future__ import annotations

import inspect

import pytest

from app.decision.engine import DecisionEngine
from app.diagnosis.resolver import EvidenceItem, ResolvedDiagnosis
from app.rules.limits import RuleResult, SignalVerdict, max_severity, severity_at_least


def _diagnosis(**overrides) -> ResolvedDiagnosis:  # type: ignore[no-untyped-def]
    defaults = dict(
        fault_id="TSE-DOWN-001",
        name="Screen Restriction / Blockage",
        family="DOWNSTREAM",
        diagnosis_state="PROBABLE",
        what="Increased melt-flow resistance",
        where="Screen pack",
        why="Pressure and load rose with the context unchanged.",
        mechanism="Material on the screen reduces the open area.",
        supporting=[
            EvidenceItem("REQUIRED", "Pre-screen pressure is high"),
            EvidenceItem("SUPPORTING", "Drive load is high"),
            EvidenceItem("SUPPORTING", "Melt temperature is rising"),
        ],
        location_resolvable=True,
        root_cause_candidates=["Screen contamination", "Gel accumulation"],
        signals=["TS-P3", "TS-PM1"],
    )
    defaults.update(overrides)
    return ResolvedDiagnosis(**defaults)  # type: ignore[arg-type]


def _rules(**overrides) -> RuleResult:  # type: ignore[no-untyped-def]
    defaults = dict(
        verdicts=(),
        severity="NORMAL",
        severity_authority=None,
        severity_reason="No approved limit reached.",
        alert_reached=False,
        danger_reached=False,
        trip_active=False,
        instrumentation_suspect=False,
    )
    defaults.update(overrides)
    return RuleResult(**defaults)  # type: ignore[arg-type]


def _decide(diagnosis, rules, **kwargs):  # type: ignore[no-untyped-def]
    return DecisionEngine().decide(
        diagnosis=diagnosis,
        rules=rules,
        data_quality_fraction=kwargs.get("data_quality_fraction", 1.0),
        context_confidence=kwargs.get("context_confidence", 0.9),
        baseline_confidence=kwargs.get("baseline_confidence", 0.9),
        state_confidence=kwargs.get("state_confidence", 0.95),
        ml_eligible=kwargs.get("ml_eligible", True),
    )


# -- §16: severity is not a function of confidence --------------------------


def test_severity_is_computed_without_confidence_in_scope() -> None:
    """The structural guarantee, asserted on the signature itself.

    `_severity` takes the diagnosis and the rule result and nothing else. §16's
    failure is not merely avoided; it cannot be written without adding a
    parameter, which this test would then catch.
    """
    signature = inspect.signature(DecisionEngine._severity)
    assert set(signature.parameters) == {"self", "diagnosis", "rules"}


def test_approved_danger_survives_low_confidence() -> None:
    """DOC-05 §16, the case the document spells out."""
    rules = _rules(
        severity="DANGER",
        severity_authority="CUSTOMER_DANGER",
        severity_reason="An approved Danger limit has been reached.",
        danger_reached=True,
    )
    weak = _diagnosis(
        supporting=[EvidenceItem("SUPPORTING", "One signal is elevated")],
        location_resolvable=False,
        diagnosis_state="POSSIBLE",
    )
    decision = _decide(weak, rules, data_quality_fraction=0.4, baseline_confidence=0.2)

    assert decision.severity == "DANGER"
    assert decision.fault_confidence.level in {"LOW", "MEDIUM"}
    assert decision.priority == "P1"


def test_low_confidence_changes_the_action_not_the_condition() -> None:
    """An approved Alert on weak evidence stays ALERT and becomes VERIFY."""
    rules = _rules(
        severity="ALERT",
        severity_authority="CUSTOMER_ALERT",
        severity_reason="An approved Alert limit has been reached.",
        alert_reached=True,
    )
    weak = _diagnosis(
        supporting=[EvidenceItem("SUPPORTING", "One signal is elevated")],
        location_resolvable=False,
    )
    decision = _decide(weak, rules, data_quality_fraction=0.3, baseline_confidence=0.15)

    assert decision.severity == "ALERT"
    assert decision.action_level == "VERIFY"
    assert decision.priority == "P2", "Weak evidence must not lower urgency below an approved Alert."


def test_trip_is_always_danger() -> None:
    rules = _rules(severity="DANGER", severity_authority="SAFETY_TRIP", trip_active=True)
    decision = _decide(_diagnosis(), rules)
    assert decision.severity == "DANGER"
    assert decision.action_level == "IMMEDIATE_ESCALATION"


def test_a_learned_anomaly_cannot_reach_danger() -> None:
    """DOC-05 §5. Analytics may raise to ALERT; only an authority reaches DANGER."""
    from app.rules.limits import RuleEngine

    engine = RuleEngine()
    anomalies = [
        SignalVerdict(signal_id=f"TS-P{index}", label="p", verdict="HIGH_ANOMALY", blocked_at_gate=None, reason="")
        for index in range(1, 5)
    ]
    severity, authority, _reason = engine._severity(
        trip_active=False,
        danger_reached=False,
        alert_reached=False,
        authority=None,
        anomalies=anomalies,
    )
    assert severity == "ALERT"
    assert authority == "ULTRON_LEARNED"


def test_severity_can_be_raised_never_lowered() -> None:
    assert severity_at_least("NORMAL", "ALERT") == "ALERT"
    assert severity_at_least("DANGER", "ALERT") == "DANGER"
    assert max_severity(["NORMAL", "ALERT", "NORMAL"]) == "ALERT"


# -- §13: three confidences, not one ----------------------------------------


def test_the_three_confidences_are_ordered_and_distinct() -> None:
    """DOC-05 §13's own example: 94 / 76 / 45 is one finding, three numbers."""
    decision = _decide(_diagnosis(), _rules())
    assert decision.fault_confidence.score >= decision.location_confidence.score
    assert decision.location_confidence.score >= decision.root_cause_confidence.score
    assert decision.root_cause_confidence.score < decision.fault_confidence.score


def test_unlocalised_finding_has_lower_location_confidence() -> None:
    localised = _decide(_diagnosis(location_resolvable=True), _rules())
    vague = _decide(_diagnosis(location_resolvable=False), _rules())
    assert vague.location_confidence.score < localised.location_confidence.score


def test_more_root_cause_candidates_means_less_certainty() -> None:
    one = _decide(_diagnosis(root_cause_candidates=["A"]), _rules())
    four = _decide(_diagnosis(root_cause_candidates=["A", "B", "C", "D"]), _rules())
    assert four.root_cause_confidence.score < one.root_cause_confidence.score


def test_missing_required_evidence_yields_insufficient() -> None:
    decision = _decide(_diagnosis(required_evidence_satisfied=False), _rules())
    assert decision.fault_confidence.level == "INSUFFICIENT_EVIDENCE"
    assert decision.action_level == "VERIFY"


def test_untrustworthy_data_caps_confidence() -> None:
    good = _decide(_diagnosis(), _rules(), data_quality_fraction=1.0)
    poor = _decide(_diagnosis(), _rules(), data_quality_fraction=0.3)
    assert poor.fault_confidence.score < good.fault_confidence.score


def test_uncalibrated_baseline_caps_confidence() -> None:
    """A deviation against a template reference is a weaker claim."""
    learned = _decide(_diagnosis(), _rules(), baseline_confidence=0.95)
    template = _decide(_diagnosis(), _rules(), baseline_confidence=0.21)
    assert template.fault_confidence.score < learned.fault_confidence.score
    assert any("baseline" in entry.lower() for entry in template.fault_confidence.basis)


def test_model_only_candidate_is_capped() -> None:
    """A model may be right; it has not shown its work."""
    decision = _decide(
        _diagnosis(source="ML", supporting=[EvidenceItem("SUPPORTING", "model raised it")]),
        _rules(),
    )
    assert decision.fault_confidence.score <= 0.45


# -- probability is not confidence, severity or priority --------------------


def test_a_risk_probability_is_not_a_confidence() -> None:
    """DOC-05 §3. A 0.87 fifteen-minute risk says nothing about certainty now."""
    from app.persistence.filters import FilterVerdict

    high_risk = FilterVerdict(
        key="TSE-DOWN-001@15",
        probability=0.87,
        threshold=0.8,
        raise_threshold=0.8,
        clear_threshold=0.6,
        crossed=True,
        persistence_met=True,
        consecutive_eligible_cycles=9,
        active=True,
        newly_raised=False,
        newly_cleared=False,
    )
    weak_evidence = _diagnosis(
        supporting=[EvidenceItem("SUPPORTING", "one elevated signal")],
        location_resolvable=False,
        risk={15: high_risk},
    )
    decision = _decide(weak_evidence, _rules(), baseline_confidence=0.2)

    # High risk, low confidence — both true at once, and neither derived from
    # the other.
    assert decision.fault_confidence.level == "LOW"
    assert decision.progression in {"DEVELOPING", "ADVANCED"}


def test_priority_is_a_class_not_a_deadline() -> None:
    """DOC-05 §23. Nothing here converts a priority into minutes."""
    decision = _decide(_diagnosis(), _rules())
    assert decision.priority in {"P1", "P2", "P3", "P4"}
    assert not any(
        token in decision.priority_reason.lower() for token in ("minutes", "hours", "within 30")
    )


# -- impact -----------------------------------------------------------------


def test_impact_is_potential_when_nothing_has_been_reached() -> None:
    decision = _decide(_diagnosis(), _rules())
    assert decision.impact_horizon == "POTENTIAL"


def test_impact_is_current_once_a_limit_is_reached() -> None:
    decision = _decide(_diagnosis(), _rules(severity="ALERT", alert_reached=True))
    assert decision.impact_horizon == "CURRENT"


def test_instrumentation_finding_floors_at_alert() -> None:
    """A machine whose instruments disagree is not a machine anyone calls normal."""
    decision = _decide(
        _diagnosis(family="INSTRUMENTATION", diagnosis_state="SUSPECTED"),
        _rules(),
    )
    assert decision.severity == "ALERT"
    assert decision.action_level == "VERIFY"


def test_explainability_answers_all_four_questions() -> None:
    """DOC-05 §41."""
    decision = _decide(_diagnosis(), _rules())
    questions = {entry["question"] for entry in decision.explainability}
    assert questions == {
        "Why this severity?",
        "Why this confidence?",
        "Why this priority?",
        "Why this action?",
    }
    assert all(entry["answer"] for entry in decision.explainability)
