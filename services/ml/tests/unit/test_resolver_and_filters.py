"""Diagnosis resolution and the decision filter.

The resolver is where a probability becomes a named fault, and the rules that
govern that conversion are the ones DOC-04 spends most of its length on:
instrumentation first, required evidence, unknown stays unknown, causal chains
grouped, independent faults kept apart.

The filter is what stands between a model and a pager.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from app.diagnosis.resolver import DiagnosisResolver
from app.persistence.filters import DecisionFilter, FilterConfig, FilterConfigSet, FilterVerdict
from app.quality.engine import FrameQuality, SignalQuality
from app.rules.limits import RuleResult, SignalVerdict

UTC = timezone.utc
ORIGIN = datetime(2026, 1, 1, tzinfo=UTC)


def _verdict(tag: str, verdict: str, **kwargs) -> SignalVerdict:  # type: ignore[no-untyped-def]
    return SignalVerdict(
        signal_id=tag,
        label=kwargs.get("label", tag),
        verdict=verdict,
        blocked_at_gate=None,
        reason=kwargs.get("reason", f"{tag} is {verdict}"),
        value=kwargs.get("value"),
        expected=kwargs.get("expected"),
    )


def _quality(*, mandatory_unavailable: list[str] | None = None) -> FrameQuality:
    per_signal: dict[str, SignalQuality] = {}
    for tag in mandatory_unavailable or []:
        entry = SignalQuality(signal_id=tag, verdict="MISSING")
        entry.suppresses_physical_diagnosis = True
        per_signal[tag] = entry
    return FrameQuality(
        per_signal=per_signal,
        overall="MISSING" if mandatory_unavailable else "GOOD",
        signals_reporting=30,
        signals_expected=36,
        mandatory_unavailable=list(mandatory_unavailable or []),
        frame_findings=[],
    )


def _rules(verdicts, **kwargs) -> RuleResult:  # type: ignore[no-untyped-def]
    defaults = dict(
        verdicts=tuple(verdicts),
        severity="NORMAL",
        severity_authority=None,
        severity_reason="No approved limit reached.",
        alert_reached=False,
        danger_reached=False,
        trip_active=False,
        instrumentation_suspect=False,
    )
    defaults.update(kwargs)
    return RuleResult(**defaults)  # type: ignore[arg-type]


# -- instrumentation first --------------------------------------------------


def test_instrumentation_suspicion_withholds_the_physical_diagnosis(isolated_settings) -> None:
    """DOC-07 §6. The measurement chain is cleared before the machine."""
    rules = _rules(
        [
            _verdict("TS-P3", "HIGH_ANOMALY", value=14.0, expected=8.0),
            _verdict("TS-P4", "NOT_ANOMALOUS", value=6.0),
            _verdict("TS-F1", "NOT_ANOMALOUS", value=120.0),
        ],
        instrumentation_suspect=True,
        instrumentation_reasons=("Melt pressure has departed while load has not moved.",),
    )
    result = DiagnosisResolver().resolve(rules=rules, quality=_quality())

    assert result.condition_verdict == "DATA_QUALITY_PROBLEM"
    assert len(result.diagnoses) == 1
    assert result.diagnoses[0].family == "INSTRUMENTATION"
    assert all(entry.fault_id != "TSE-DOWN-001" for entry in result.diagnoses)


def test_missing_mandatory_signal_yields_insufficient_evidence(isolated_settings) -> None:
    result = DiagnosisResolver().resolve(
        rules=_rules([]), quality=_quality(mandatory_unavailable=["TS-P3"])
    )
    assert result.condition_verdict == "INSUFFICIENT_EVIDENCE"
    assert result.diagnoses[0].diagnosis_state == "INSUFFICIENT_EVIDENCE"
    assert result.diagnoses[0].required_evidence_satisfied is False


# -- unknown stays unknown --------------------------------------------------


def test_unmatched_multi_signal_anomaly_is_fault_unknown(isolated_settings) -> None:
    """DOC-04 §20. The nearest known fault is not offered."""
    rules = _rules(
        [
            _verdict("TS-V1", "HIGH_ANOMALY", value=5.0),
            _verdict("TS-V2", "HIGH_ANOMALY", value=4.8),
            _verdict("TS-L1", "LOW_ANOMALY", value=20.0),
        ]
    )
    result = DiagnosisResolver().resolve(rules=rules, quality=_quality())
    assert result.condition_verdict == "FAULT_UNKNOWN"
    assert result.diagnoses[0].fault_id == "FAULT_UNKNOWN"
    assert result.diagnoses[0].diagnosis_state == "FAULT_UNKNOWN"


def test_a_healthy_frame_produces_no_diagnosis(isolated_settings) -> None:
    result = DiagnosisResolver().resolve(rules=_rules([]), quality=_quality())
    assert result.condition_verdict == "NORMAL"
    assert result.diagnoses == []


def test_expected_process_response_is_not_a_fault(isolated_settings) -> None:
    """DOC-04 §3 gate 8. A context change is not a fault."""
    rules = _rules([_verdict("TS-P3", "EXPECTED_PROCESS_RESPONSE", value=9.6)])
    result = DiagnosisResolver().resolve(rules=rules, quality=_quality())
    assert result.condition_verdict == "EXPECTED_PROCESS_RESPONSE"
    assert result.diagnoses == []


# -- multi-fault and causal chains -----------------------------------------


def test_a_causal_chain_becomes_one_diagnosis_with_symptoms(isolated_settings) -> None:
    """DOC-04 §19. A restriction that raises load is one fault, not two."""
    rules = _rules(
        [
            _verdict("TS-P3", "HIGH_ANOMALY", value=15.0, expected=8.0),
            _verdict("TS-P4", "NOT_ANOMALOUS", value=6.1),
            _verdict("TS-F1", "NOT_ANOMALOUS", value=120.0),
            _verdict("TS-S1", "NOT_ANOMALOUS", value=250.0),
            _verdict("TS-PM1", "HIGH_ANOMALY", value=64.0, expected=45.0),
        ]
    )
    result = DiagnosisResolver().resolve(rules=rules, quality=_quality())

    ids = [entry.fault_id for entry in result.diagnoses]
    assert "TSE-DOWN-001" in ids
    primary = next(entry for entry in result.diagnoses if entry.fault_id == "TSE-DOWN-001")
    # The general process-resistance reading of the same evidence is folded in
    # rather than alarmed beside it.
    assert "TSE-PROC-001" not in ids
    assert any("resistance" in symptom.lower() for symptom in primary.grouped_symptoms)


def test_independent_faults_are_both_retained(isolated_settings) -> None:
    rules = _rules(
        [
            _verdict("TS-P3", "HIGH_ANOMALY", value=15.0, expected=8.0),
            _verdict("TS-P4", "NOT_ANOMALOUS", value=6.1),
            _verdict("TS-F1", "NOT_ANOMALOUS", value=120.0),
            _verdict("TS-PV", "HIGH_ANOMALY", value=0.08, expected=0.03),
        ]
    )
    result = DiagnosisResolver().resolve(rules=rules, quality=_quality())
    ids = {entry.fault_id for entry in result.diagnoses}
    assert {"TSE-DOWN-001", "TSE-VENT-001"} <= ids


def test_a_model_output_naming_an_unknown_fault_is_dropped(isolated_settings) -> None:
    """A model trained against a different knowledge version, caught."""
    bogus = FilterVerdict(
        key="TSE-NOT-A-FAULT@15",
        probability=0.99,
        threshold=0.8,
        raise_threshold=0.8,
        clear_threshold=0.6,
        crossed=True,
        persistence_met=True,
        consecutive_eligible_cycles=5,
        active=True,
        newly_raised=True,
        newly_cleared=False,
    )
    result = DiagnosisResolver().resolve(
        rules=_rules([]), quality=_quality(), risks={bogus.key: bogus}, ml_eligible=True
    )
    assert all("NOT-A-FAULT" not in entry.fault_id for entry in result.diagnoses)


def test_a_risk_does_not_set_the_present_tense_state(isolated_settings) -> None:
    """A 15-minute prognosis says nothing about whether the fault is here now."""
    high = FilterVerdict(
        key="TSE-DOWN-001@15",
        probability=0.97,
        threshold=0.8,
        raise_threshold=0.8,
        clear_threshold=0.6,
        crossed=True,
        persistence_met=True,
        consecutive_eligible_cycles=9,
        active=True,
        newly_raised=True,
        newly_cleared=False,
    )
    # Every signal present and normal: the model sees something the rules do
    # not, which is the case this test is about. With no signals at all the
    # answer would correctly be INSUFFICIENT_EVIDENCE instead.
    quiet = _rules(
        [
            _verdict("TS-P3", "NOT_ANOMALOUS", value=8.1),
            _verdict("TS-P4", "NOT_ANOMALOUS", value=6.0),
            _verdict("TS-PM1", "NOT_ANOMALOUS", value=45.5),
            _verdict("TS-F1", "NOT_ANOMALOUS", value=120.0),
            _verdict("TS-S1", "NOT_ANOMALOUS", value=250.0),
        ]
    )
    result = DiagnosisResolver().resolve(
        rules=quiet, quality=_quality(), risks={high.key: high}, ml_eligible=True
    )
    entry = next(item for item in result.diagnoses if item.fault_id == "TSE-DOWN-001")
    assert entry.source == "ML"
    assert entry.diagnosis_state == "POSSIBLE", "A prognosis is not an observation."


def test_a_model_risk_without_required_evidence_is_insufficient(isolated_settings) -> None:
    """The complementary case: a model answering on signals nobody can read."""
    high = FilterVerdict(
        key="TSE-DOWN-001@15",
        probability=0.97,
        threshold=0.8,
        raise_threshold=0.8,
        clear_threshold=0.6,
        crossed=True,
        persistence_met=True,
        consecutive_eligible_cycles=9,
        active=True,
        newly_raised=True,
        newly_cleared=False,
    )
    result = DiagnosisResolver().resolve(
        rules=_rules([]), quality=_quality(), risks={high.key: high}, ml_eligible=True
    )
    entry = next(item for item in result.diagnoses if item.fault_id == "TSE-DOWN-001")
    assert entry.diagnosis_state == "INSUFFICIENT_EVIDENCE"


def test_unevaluable_patterns_are_reported(isolated_settings) -> None:
    """Coverage an operator can act on: which instrument is missing."""
    rules = _rules([_verdict("TS-P3", "NOT_ANOMALOUS", value=8.0)])
    result = DiagnosisResolver().resolve(rules=rules, quality=_quality())
    gaps = dict(result.unevaluable_patterns)
    assert "P-002" in gaps
    assert "TS-P4" in gaps["P-002"]


# -- the decision filter ----------------------------------------------------


def _filter(**overrides) -> DecisionFilter:  # type: ignore[no-untyped-def]
    defaults = dict(
        raise_threshold=0.8,
        clear_threshold=0.6,
        persistence_n=3,
        persistence_m=5,
        cooldown_seconds=60,
        duplicate_suppression_seconds=0,
    )
    defaults.update(overrides)
    return DecisionFilter(FilterConfigSet(default=FilterConfig(**defaults)))  # type: ignore[arg-type]


def _apply(filt, values, *, eligible=True, hard_limit=False):  # type: ignore[no-untyped-def]
    out = []
    for index, value in enumerate(values):
        out.append(
            filt.apply(
                machine_id="TSE-01",
                key="TSE-DOWN-001@15",
                probability=value,
                at=ORIGIN + timedelta(seconds=index * 10),
                eligible=eligible,
                hard_limit_active=hard_limit,
            )
        )
    return out


def test_one_sample_above_threshold_does_not_alert() -> None:
    verdicts = _apply(_filter(), [0.95])
    assert verdicts[-1].crossed is False


def test_n_of_m_tolerates_a_dip() -> None:
    """A genuine signal that dips for one sample is still a genuine signal."""
    verdicts = _apply(_filter(), [0.95, 0.4, 0.95, 0.92])
    assert verdicts[-1].crossed is True
    assert verdicts[-1].newly_raised is True


def test_hysteresis_holds_between_the_thresholds() -> None:
    verdicts = _apply(_filter(), [0.95, 0.9, 0.95, 0.7, 0.65])
    assert verdicts[-1].crossed is True, "0.65 is above the clear threshold."
    verdicts = _apply(_filter(), [0.95, 0.9, 0.95, 0.7, 0.55])
    assert verdicts[-1].crossed is False
    assert verdicts[-1].newly_cleared is True


def test_cooldown_suppresses_an_immediate_re_raise() -> None:
    filt = _filter()
    _apply(filt, [0.95, 0.9, 0.95, 0.5])
    later = filt.apply(
        machine_id="TSE-01",
        key="TSE-DOWN-001@15",
        probability=0.99,
        at=ORIGIN + timedelta(seconds=45),
        eligible=True,
    )
    assert later.suppressed is True
    assert "cooldown" in (later.suppression_reason or "")


def test_an_ineligible_cycle_is_not_a_negative_observation() -> None:
    """A data-quality gap must not silently clear a confirmed alert."""
    filt = _filter()
    _apply(filt, [0.95, 0.9, 0.95])
    held = filt.apply(
        machine_id="TSE-01",
        key="TSE-DOWN-001@15",
        probability=0.0,
        at=ORIGIN + timedelta(seconds=100),
        eligible=False,
    )
    assert held.crossed is True
    assert held.suppressed is True


def test_a_hard_limit_bypasses_the_filter_entirely() -> None:
    """DOC-02 §25. A protection condition does not wait for confirmation."""
    verdict = _apply(_filter(), [0.05], hard_limit=True)[0]
    assert verdict.crossed is True
    assert verdict.bypassed is True


def test_inverted_hysteresis_is_rejected_at_construction() -> None:
    with pytest.raises(ValueError):
        FilterConfig(raise_threshold=0.5, clear_threshold=0.9)


def test_per_fault_configuration_is_honoured() -> None:
    config = FilterConfigSet(
        default=FilterConfig(raise_threshold=0.9),
        overrides={"TSE-DOWN-001": FilterConfig(raise_threshold=0.5, clear_threshold=0.3)},
    )
    assert config.for_output("TSE-DOWN-001@15").raise_threshold == 0.5
    assert config.for_output("TSE-MECH-001@15").raise_threshold == 0.9


def test_shipped_threshold_config_loads(isolated_settings) -> None:
    from pathlib import Path

    path = Path(__file__).resolve().parents[2] / "configs" / "thresholds.yaml"
    config = FilterConfigSet.load(path)
    assert config.for_output("TSE-DOWN-001@15").raise_threshold == pytest.approx(0.75)
    assert config.for_output("TSE-THERM-012@5").raise_threshold == pytest.approx(0.90)
