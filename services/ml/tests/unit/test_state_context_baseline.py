"""State, context and baselines — the three things that decide what is valid.

Grouped because they form one chain: the state decides whether a comparison is
meaningful at all, the context decides which normal to compare against, and the
baseline is that normal. Getting any of the three wrong produces a confident
comparison against something else's behaviour.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from app.baseline.engine import (
    BaselineSelector,
    BaselineStore,
    LearningInput,
    eligibility,
    learn,
    template_baseline,
)
from app.context.engine import ContextEngine, context_changed
from app.quality.engine import DataQualityEngine
from app.state.engine import OperatingStateEngine, StateTrends

UTC = timezone.utc
ORIGIN = datetime(2026, 1, 1, tzinfo=UTC)


def _state(frame, trends: StateTrends | None = None):  # type: ignore[no-untyped-def]
    quality = DataQualityEngine().evaluate(frame)
    return OperatingStateEngine().evaluate(frame, quality, trends)


STEADY = StateTrends(feed_slope_per_min=0.1, screw_slope_per_min=0.2, pressure_slope_per_min=0.0)


# -- operating state --------------------------------------------------------


def test_steady_production_requires_measured_stability(isolated_settings, steady_frame) -> None:
    """Presence is not stability. A ramp has every signal present."""
    frame = steady_frame()
    assert _state(frame, STEADY).operating_state == "ST-06"

    ramping = StateTrends(feed_slope_per_min=40.0, screw_slope_per_min=60.0)
    assert _state(frame, ramping).operating_state == "ST-05"


def test_no_trend_means_not_proven_steady(isolated_settings, steady_frame) -> None:
    """The safe direction: unproven stays RAMP_UP, not STEADY."""
    assert _state(steady_frame(), None).operating_state == "ST-05"


def test_stopped_machine_is_stopped(isolated_settings, steady_frame) -> None:
    frame = steady_frame(
        overrides={"TS-S1": 0.0, "TS-S2": 0.0, "TS-E1": 0.0, "TS-F1": 0.0, "TS-F2": 0.0}
    )
    assert _state(frame, STEADY).operating_state == "ST-01"


def test_missing_core_signals_yield_unknown(isolated_settings, steady_frame) -> None:
    """DOC-02 §4: unknown is safer than a wrong steady baseline."""
    frame = steady_frame(overrides={"TS-S1": None, "TS-S2": None, "TS-F1": None})
    record = _state(frame, STEADY)
    assert record.operating_state == "ST-00"
    assert record.unknown_reason


def test_declared_state_beats_inference(isolated_settings, steady_frame) -> None:
    frame = steady_frame(overrides={"TS-S1": 0.0, "TS-S2": 0.0, "TS-F1": 0.0})
    frame.context.operating_state = "ST-11"
    frame.context.state_source = "PLC"
    record = _state(frame, STEADY)
    assert record.operating_state == "ST-11"
    assert record.state_source == "PLC"


def test_inferred_confidence_is_capped_below_explicit(isolated_settings, steady_frame) -> None:
    inferred = _state(steady_frame(), STEADY)
    assert inferred.state_confidence < 0.9
    assert inferred.state_source == "INFERRED"


def test_time_in_state_accumulates(isolated_settings, steady_frame) -> None:
    engine = OperatingStateEngine()
    quality_engine = DataQualityEngine()
    record = None
    for index in range(6):
        frame = steady_frame(at=ORIGIN + timedelta(seconds=index * 10))
        record = engine.evaluate(frame, quality_engine.evaluate(frame), STEADY)
    assert record is not None
    assert record.time_in_state_seconds == pytest.approx(50.0, abs=1.0)


def test_only_steady_production_permits_baseline_learning(isolated_settings, steady_frame) -> None:
    assert _state(steady_frame(), STEADY).baseline_learning_allowed is True
    ramping = _state(steady_frame(), StateTrends(feed_slope_per_min=40.0, screw_slope_per_min=1.0))
    assert ramping.baseline_learning_allowed is False


# -- context ----------------------------------------------------------------


def test_context_id_is_stable_across_processes(isolated_settings, steady_frame) -> None:
    """A Python hash() is salted per process and would orphan every baseline."""
    engine = ContextEngine()
    state = _state(steady_frame(), STEADY)
    first = engine.build(steady_frame(), state)
    second = engine.build(steady_frame(), state)
    assert first.context_id == second.context_id
    assert first.context_id is not None
    assert first.context_id.startswith("CTX-")


def test_banding_keeps_one_operating_point_together(isolated_settings, steady_frame) -> None:
    """248 rpm and 252 rpm are the same operating point."""
    engine = ContextEngine()
    state = _state(steady_frame(), STEADY)
    low = engine.build(steady_frame(overrides={"TS-S1": 248.0}), state)
    high = engine.build(steady_frame(overrides={"TS-S1": 252.0}), state)
    assert low.context_id == high.context_id


def test_crossing_a_band_changes_the_context(isolated_settings, steady_frame) -> None:
    engine = ContextEngine()
    state = _state(steady_frame(), STEADY)
    inside = engine.build(steady_frame(overrides={"TS-S1": 250.0}), state)
    outside = engine.build(steady_frame(overrides={"TS-S1": 350.0}), state)
    assert inside.context_id != outside.context_id
    assert context_changed(inside, outside) is True


def test_missing_recipe_lowers_confidence_and_is_named(isolated_settings, steady_frame) -> None:
    engine = ContextEngine()
    state = _state(steady_frame(), STEADY)
    full = engine.build(steady_frame(recipe_id="PP-GF30"), state)
    partial = engine.build(steady_frame(recipe_id=None), state)
    assert partial.confidence < full.confidence
    assert "recipe_id" in partial.missing
    assert partial.context_id is None
    assert partial.fallback_context_id, "A broader comparison must still be offered."


def test_context_confidence_cannot_exceed_state_confidence(isolated_settings, steady_frame) -> None:
    """A context built on an uncertain state cannot be more certain than it."""
    engine = ContextEngine()
    state = _state(steady_frame(), STEADY)
    context = engine.build(steady_frame(), state)
    assert context.confidence <= state.state_confidence + 1e-9


# -- baselines --------------------------------------------------------------


def _learning_input(**overrides):  # type: ignore[no-untyped-def]
    defaults = dict(
        machine_id="TSE-01",
        feature_id="TS-P3",
        context_id="CTX-abc",
        state="ST-06",
        configuration_version="CFG-01",
        values=tuple(8.0 + (index % 7) * 0.01 for index in range(400)),
        timestamps=tuple(ORIGIN + timedelta(seconds=index * 2) for index in range(400)),
        unit="MPa",
        quality_verdicts=("GOOD",) * 400,
        fault_active=False,
        limit_active=False,
    )
    defaults.update(overrides)
    return LearningInput(**defaults)  # type: ignore[arg-type]


def test_eligible_window_learns(isolated_settings) -> None:
    verdict = eligibility(_learning_input())
    assert verdict.eligible, verdict.failures
    record = learn(_learning_input())
    assert record is not None
    assert record.level == "EXACT_CONTEXT"
    assert record.median == pytest.approx(8.03, abs=0.05)


@pytest.mark.parametrize(
    ("override", "fragment"),
    [
        ({"quality_verdicts": ("GOOD",) * 399 + ("BAD",)}, "Data quality"),
        ({"state": "ST-04"}, "not eligible for baseline learning"),
        ({"fault_active": True}, "fault is active"),
        ({"limit_active": True}, "approved Alert"),
        ({"configuration_version": None}, "configuration version"),
        ({"context_id": ""}, "context id"),
    ],
)
def test_each_eligibility_rule_blocks(isolated_settings, override, fragment) -> None:
    """Every clause is a way a system teaches itself that a fault is normal."""
    verdict = eligibility(_learning_input(**override))
    assert not verdict.eligible
    assert any(fragment in failure for failure in verdict.failures), verdict.failures


def test_ineligible_window_returns_none_not_a_weak_baseline(isolated_settings) -> None:
    """A baseline that exists gets used. The only way not to use a bad one is
    for it not to exist."""
    assert learn(_learning_input(fault_active=True)) is None


def test_short_window_is_not_learned(isolated_settings) -> None:
    short = _learning_input(
        values=tuple(8.0 for _ in range(30)),
        timestamps=tuple(ORIGIN + timedelta(seconds=index) for index in range(30)),
        quality_verdicts=("GOOD",) * 30,
    )
    assert learn(short) is None


def test_template_baseline_is_template_level(isolated_settings) -> None:
    """A cold start compares against a template and says so."""
    record = template_baseline("TS-P3", "TSE-01")
    assert record is not None
    assert record.level == "TEMPLATE_REFERENCE"
    assert record.status == "PROVISIONAL"
    assert record.confidence_score < 0.35, "A template reference is a weak claim."


def test_selector_falls_back_through_the_hierarchy(isolated_settings, tmp_path) -> None:
    store = BaselineStore(tmp_path / "bl")
    selector = BaselineSelector(store)

    # Nothing learned yet: the template answers, at its declared level.
    cold = selector.select(
        machine_id="TSE-01", tag="TS-P3", context_id="CTX-abc", fallback_context_id="CTXB-abc"
    )
    assert cold.level == "TEMPLATE_REFERENCE"

    # Once learned, the exact context wins and confidence rises.
    record = learn(_learning_input())
    assert record is not None
    store.put(record)
    warm = selector.select(
        machine_id="TSE-01", tag="TS-P3", context_id="CTX-abc", fallback_context_id="CTXB-abc"
    )
    assert warm.level == "EXACT_CONTEXT"
    assert warm.confidence > cold.confidence


def test_broader_context_is_labelled_as_such(isolated_settings, tmp_path) -> None:
    store = BaselineStore(tmp_path / "bl")
    record = learn(_learning_input(context_id="CTXB-abc"))
    assert record is not None
    store.put(record)

    selection = BaselineSelector(store).select(
        machine_id="TSE-01", tag="TS-P3", context_id="CTX-missing", fallback_context_id="CTXB-abc"
    )
    assert selection.level == "BROADER_CONTEXT"
    assert "broader" in selection.reason.lower()


def test_freezing_a_context_stops_learning_but_not_comparison(isolated_settings, tmp_path) -> None:
    store = BaselineStore(tmp_path / "bl")
    record = learn(_learning_input())
    assert record is not None
    store.put(record)

    frozen = store.freeze_context("TSE-01", "CTX-abc", "Recipe changed.")
    assert frozen == 1
    stored = store.get("TSE-01", "TS-P3", "CTX-abc")
    assert stored is not None
    assert stored.status == "FROZEN"
    assert stored.usable, "A frozen baseline is still a valid comparison."


def test_configuration_change_marks_review_not_deletion(isolated_settings, tmp_path) -> None:
    store = BaselineStore(tmp_path / "bl")
    record = learn(_learning_input())
    assert record is not None
    store.put(record)

    touched = store.mark_stale("TSE-01", "CFG-02")
    assert touched == 1
    stored = store.get("TSE-01", "TS-P3", "CTX-abc")
    assert stored is not None
    assert stored.status == "REVIEW_REQUIRED"
    assert any("CFG-02" in note for note in stored.notes)
