"""Evaluation metrics, and the ones deliberately absent.

Accuracy does not appear in `app/evaluation/metrics.py` at all, and a test here
asserts that. At a 0.2% positive rate a model that always answers "no fault" is
99.8% accurate, and reporting that number anywhere invites somebody to quote it.
"""

from __future__ import annotations

import random
from datetime import datetime, timedelta, timezone

import pytest

from app.evaluation import metrics as M
from app.evaluation.ablation import ARMS, ARMS_BY_ID, AblationReport, ArmResult, features_for_arm
from app.monitoring.drift import DriftReport, measure, population_stability_index

UTC = timezone.utc
ORIGIN = datetime(2026, 1, 1, tzinfo=UTC)


def _stamps(count: int, step: int = 10) -> list[datetime]:
    return [ORIGIN + timedelta(seconds=index * step) for index in range(count)]


# -- the metrics themselves -------------------------------------------------


def test_accuracy_is_not_reported_anywhere() -> None:
    """The metric that flatters a useless model on imbalanced data."""
    source = (M.__file__ or "")
    text = open(source, encoding="utf-8").read()
    assert "def accuracy" not in text
    assert '"accuracy"' not in text


def test_pr_auc_is_the_positive_rate_for_a_random_scorer() -> None:
    """The floor PR-AUC can reach: a random ranking scores the base rate."""
    random.seed(11)
    labels = [1 if index % 20 == 0 else 0 for index in range(2000)]
    scores = [random.random() for _ in labels]
    assert M.pr_auc(scores, labels) == pytest.approx(0.05, abs=0.02)


def test_pr_auc_is_one_for_a_perfect_ranking() -> None:
    labels = [0] * 90 + [1] * 10
    scores = [0.1] * 90 + [0.9] * 10
    assert M.pr_auc(scores, labels) == pytest.approx(1.0)


def test_pr_auc_is_zero_when_there_is_nothing_to_find() -> None:
    assert M.pr_auc([0.5, 0.6], [0, 0]) == 0.0


def test_roc_auc_is_half_for_a_coin() -> None:
    random.seed(3)
    labels = [index % 2 for index in range(1000)]
    scores = [random.random() for _ in labels]
    assert M.roc_auc(scores, labels) == pytest.approx(0.5, abs=0.05)


def test_confusion_counts_are_consistent() -> None:
    result = M.confusion([0.9, 0.8, 0.2, 0.1], [1, 0, 1, 0], 0.5)
    assert (result.true_positives, result.false_positives) == (1, 1)
    assert (result.false_negatives, result.true_negatives) == (1, 1)
    assert result.precision == pytest.approx(0.5)
    assert result.recall == pytest.approx(0.5)
    assert result.f1 == pytest.approx(0.5)


def test_threshold_search_respects_a_precision_floor() -> None:
    """A recall gain that costs three false alarms a shift is a loss."""
    scores = [0.9, 0.85, 0.8, 0.4, 0.3, 0.2]
    labels = [1, 0, 1, 0, 0, 0]
    _loose, loose_metrics = M.best_threshold(scores, labels, objective="recall")
    _strict, strict_metrics = M.best_threshold(scores, labels, min_precision=0.9)
    assert strict_metrics.precision >= 0.9
    assert loose_metrics.recall >= strict_metrics.recall


def test_an_unattainable_precision_floor_is_reported_not_faked() -> None:
    threshold, result = M.best_threshold([0.6, 0.6], [1, 0], min_precision=0.99)
    assert threshold == 1.0
    assert result.recall == 0.0


# -- event level, which is what a maintenance team cares about --------------


def test_event_detection_requires_persistence() -> None:
    """An isolated spike is not something the decision layer would surface."""
    stamps = _stamps(40)
    onset = stamps[30]
    spiky = [0.95 if index == 5 else 0.1 for index in range(40)]
    outcomes = M.detect_events(
        timestamps=stamps, probabilities=spiky, onsets=[("EV-1", "F", onset)],
        threshold=0.8, persistence_n=3, persistence_m=5,
    )
    assert outcomes[0].detected is False


def test_a_sustained_crossing_is_detected_with_its_lead_time() -> None:
    stamps = _stamps(40)
    onset = stamps[30]
    sustained = [0.95 if 20 <= index <= 29 else 0.1 for index in range(40)]
    outcomes = M.detect_events(
        timestamps=stamps, probabilities=sustained, onsets=[("EV-1", "F", onset)],
        threshold=0.8, persistence_n=3, persistence_m=5,
    )
    assert outcomes[0].detected is True
    # Crossing at index 22 (third of five), onset at index 30, 10s apart.
    assert outcomes[0].lead_time_seconds == pytest.approx(80.0)


def test_a_crossing_after_the_onset_does_not_count() -> None:
    """Detecting a fault that has already started is detection, not prognosis."""
    stamps = _stamps(40)
    onset = stamps[10]
    late = [0.95 if index >= 20 else 0.1 for index in range(40)]
    outcomes = M.detect_events(
        timestamps=stamps, probabilities=late, onsets=[("EV-1", "F", onset)],
        threshold=0.8, persistence_n=3, persistence_m=5,
    )
    assert outcomes[0].detected is False


def test_lead_time_reports_p10_not_the_mean() -> None:
    """The mean is dominated by the one event caught forty minutes early."""
    outcomes = [
        M.EventOutcome(f"EV-{index}", "F", True, float(value), None, None)
        for index, value in enumerate([60, 90, 120, 150, 2400])
    ]
    summary = M.lead_times(outcomes)
    assert summary["median"] == pytest.approx(120.0)
    assert summary["p10"] == pytest.approx(72.0, abs=1.0)
    assert "mean" not in summary


def test_undetected_events_are_excluded_from_lead_time_not_zeroed() -> None:
    outcomes = [
        M.EventOutcome("EV-1", "F", True, 120.0, None, None),
        M.EventOutcome("EV-2", "F", False, None, None, None),
    ]
    assert M.lead_times(outcomes)["count"] == 1
    assert M.event_level_recall(outcomes)["event_recall"] == pytest.approx(0.5)


def test_false_alarms_are_counted_as_onsets_not_samples() -> None:
    """A condition above the line for ten minutes is one alarm, not six hundred."""
    stamps = _stamps(120, step=30)  # one hour
    probabilities = [0.95 if 10 <= index <= 60 else 0.1 for index in range(120)]
    labels = [0] * 120
    rate = M.false_alarms_per_hour(
        stamps, probabilities, labels, threshold=0.8, persistence_n=3, persistence_m=5
    )
    assert rate == pytest.approx(1.0, abs=0.05)


def test_evaluate_output_says_so_when_there_are_no_positives() -> None:
    """Undefined, not zero. A model for this output was never demonstrated."""
    stamps = _stamps(20)
    result = M.evaluate_output(
        key="TSE-DOWN-001@15",
        probabilities=[0.1] * 20,
        labels=[0] * 20,
        timestamps=stamps,
        threshold=0.8,
    )
    assert result.positive_count == 0
    assert result.note and "undefined rather than zero" in result.note


# -- false-alarm triage -----------------------------------------------------


@pytest.mark.parametrize(
    ("state", "quality", "baseline", "fragment"),
    [
        ("ST-04", "GOOD", "EXACT_CONTEXT", "Startup or ramp"),
        ("ST-07", "GOOD", "EXACT_CONTEXT", "Recipe transition"),
        ("ST-06", "BAD", "EXACT_CONTEXT", "data quality"),
        ("ST-06", "GOOD", "TEMPLATE_REFERENCE", "uncalibrated template"),
    ],
)
def test_false_alarms_are_triaged_into_actionable_buckets(
    state, quality, baseline, fragment
) -> None:
    """'Forty false alarms' is not actionable. 'Thirty-one were startup' is."""
    record = M.FalseAlarmRecord(
        at=ORIGIN,
        machine_id="TSE-01",
        fault_id="TSE-DOWN-001",
        horizon_minutes=15,
        probability=0.9,
        threshold=0.8,
        operating_state=state,
        state_confidence=0.9,
        recipe_id="PP-GF30",
        context_id="CTX-1",
        rule_severity="NORMAL",
        data_quality=quality,
        baseline_level=baseline,
    )
    assert fragment in M.classify_false_alarm(record)


# -- ablation ---------------------------------------------------------------


def test_every_arm_is_declared_with_what_it_proves() -> None:
    assert {arm.arm_id for arm in ARMS} == {f"E{index}" for index in range(8)}
    assert all(arm.proves for arm in ARMS)


def test_e1_sees_far_fewer_features_than_e2(isolated_settings) -> None:
    from app.features.engine import union_feature_ids

    ids = union_feature_ids()
    raw = features_for_arm(ARMS_BY_ID["E1"], ids)
    engineered = features_for_arm(ARMS_BY_ID["E2"], ids)
    assert len(raw) < len(engineered) / 10


def test_only_the_temporal_arms_see_residuals_and_embeddings(isolated_settings) -> None:
    from app.features.engine import union_feature_ids

    ids = union_feature_ids()
    e2 = features_for_arm(ARMS_BY_ID["E2"], ids)
    e6 = features_for_arm(ARMS_BY_ID["E6"], ids)
    assert not any(entry.startswith(("r.", "e.")) for entry in e2)
    assert any(entry.startswith("r.") for entry in e6)
    assert any(entry.startswith("e.embedding_") for entry in e6)


def test_a_layer_that_improves_nothing_is_reported_as_such() -> None:
    """Nothing is kept because it is sophisticated."""
    report = AblationReport(dataset_id="ds-test")
    identical = {"TSE-DOWN-001@15": {"pr_auc": 0.5, "positives": 10, "false_alarms_per_hour": 1.0}}
    for arm_id in ("E5", "E6"):
        report.results.append(
            ArmResult(arm_id=arm_id, name=arm_id, library="lightgbm", feature_count=10, metrics=dict(identical))
        )
    verdict = next(
        entry for entry in report.verdicts() if entry["comparison"] == "E5 -> E6"
    )
    assert verdict["verdict"] == "NO_MEASURABLE_IMPROVEMENT"
    assert "Consider removing it" in verdict["detail"]


def test_a_real_improvement_is_recognised() -> None:
    report = AblationReport(dataset_id="ds-test")
    report.results.append(
        ArmResult("E5", "E5", "lightgbm", 10, {"k": {"pr_auc": 0.50, "positives": 10, "false_alarms_per_hour": 2.0}})
    )
    report.results.append(
        ArmResult("E6", "E6", "lightgbm", 42, {"k": {"pr_auc": 0.70, "positives": 10, "false_alarms_per_hour": 0.5}})
    )
    verdict = next(entry for entry in report.verdicts() if entry["comparison"] == "E5 -> E6")
    assert verdict["verdict"] == "IMPROVES"


def test_the_rules_only_baseline_is_compared_against_the_full_stack() -> None:
    """E0 is the comparison people skip and the one that matters."""
    report = AblationReport(dataset_id="ds-test")
    comparisons = {entry["comparison"] for entry in report.verdicts()}
    assert "E0 -> E7" in comparisons


# -- drift ------------------------------------------------------------------


def test_psi_is_near_zero_for_the_same_distribution() -> None:
    random.seed(5)
    reference = [random.gauss(8.0, 0.2) for _ in range(1000)]
    current = [random.gauss(8.0, 0.2) for _ in range(1000)]
    psi = population_stability_index(reference, current)
    assert psi is not None and psi < 0.1


def test_psi_detects_a_shifted_distribution() -> None:
    random.seed(5)
    reference = [random.gauss(8.0, 0.2) for _ in range(1000)]
    current = [random.gauss(9.5, 0.2) for _ in range(1000)]
    psi = population_stability_index(reference, current)
    assert psi is not None and psi > 0.25


def test_psi_refuses_a_sample_too_small_to_judge() -> None:
    """None, not zero. Too few samples is not evidence of stability."""
    assert population_stability_index([1.0] * 10, [1.0] * 10) is None
    entry = measure("TS-P3", [1.0] * 10, [2.0] * 10)
    assert entry.level == "NOT_MEASURABLE"
    assert entry.note and "Not evidence of stability" in entry.note


def test_drift_makes_a_model_eligible_for_review_never_retrains_it() -> None:
    """The whole design: PSI is an input to a human decision."""
    report = DriftReport(model_id="lgbm-1")
    payload = report.to_json()
    assert payload["retraining_eligible"] is False
    assert "never triggers a retrain" in payload["policy"]
    # And the module exposes no way to act on it.
    import app.monitoring.drift as drift_module

    assert not any(name.startswith("retrain") for name in dir(drift_module) if callable(getattr(drift_module, name, None)))


def test_a_context_mix_change_is_flagged_as_probably_not_drift() -> None:
    report = DriftReport(model_id="lgbm-1", context_mix_changed=True)
    assert report.retraining_eligible is True
    assert any("not drift at all" in reason for reason in report.review_reasons())


def test_retraining_triggers_are_declared_as_data() -> None:
    from app.monitoring.drift import RETRAINING_TRIGGERS

    assert len(RETRAINING_TRIGGERS) >= 8
    assert all(entry["trigger"] and entry["detail"] for entry in RETRAINING_TRIGGERS)
