"""The feature engine, and its refusal to invent numbers.

DOC-03 §2's quality gate is the subject: BAD or MISSING inputs must never
become apparently valid features. Every test here checks that the null comes
back with a reason rather than a plausible number.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from app.baseline.engine import BaselineSelector, BaselineStore
from app.context.engine import ContextEngine
from app.features import families
from app.features.engine import FeatureEngine, union_feature_ids
from app.features.registry import feature_definitions
from app.quality.engine import DataQualityEngine
from app.state.engine import OperatingStateEngine
from app.windows.store import InMemoryWindowStore

UTC = timezone.utc


def _run(frames, settings):  # type: ignore[no-untyped-def]
    store = InMemoryWindowStore()
    quality_engine = DataQualityEngine()
    state_engine = OperatingStateEngine()
    context_engine = ContextEngine()
    engine = FeatureEngine(store, BaselineSelector(BaselineStore(settings.artifacts_dir / "bl")))

    result = None
    for frame in frames:
        quality = quality_engine.evaluate(frame)
        for tag, entry in quality.per_signal.items():
            store.append(
                frame.machine_id, tag, frame.timestamp, entry.usable_value if entry.usable else None
            )
        state = state_engine.evaluate(frame, quality)
        context = context_engine.build(frame, state)
        result = engine.compute(frame, quality, state, context)
    return result


def test_registry_ids_are_unique_and_described(isolated_settings) -> None:
    definitions = feature_definitions()
    ids = [entry.feature_id for entry in definitions]
    assert len(ids) == len(set(ids)), "Feature ids must be unique; a model indexes into this order."
    assert all(entry.name and entry.unit and entry.family for entry in definitions)


def test_union_order_is_stable(isolated_settings) -> None:
    """A model indexes into this vector. Reordering invalidates every model."""
    assert union_feature_ids() == union_feature_ids()


def test_union_always_includes_temporal_columns(isolated_settings) -> None:
    """Width must not depend on whether TensorFlow imported."""
    ids = union_feature_ids()
    assert any(entry.startswith("r.") for entry in ids)
    assert sum(1 for entry in ids if entry.startswith("e.embedding_")) == 32


def test_features_compute_over_a_run(isolated_settings, steady_run) -> None:
    frame = _run(steady_run(400), isolated_settings)
    assert frame is not None
    assert frame.value_of("TS-P3.value") == pytest.approx(8.0, abs=0.001)
    assert frame.value_of("TS-P3.mean_300s") == pytest.approx(8.0, abs=0.01)
    assert frame.value_of("TS-P3.std_300s") is not None


def test_bad_input_yields_null_with_a_reason(isolated_settings, steady_run) -> None:
    frames = steady_run(200, mutate=lambda overrides, index: overrides.update({"TS-P3": float("nan")}))
    result = _run(frames, isolated_settings)
    assert result is not None
    entry = result.get("TS-P3.mean_300s")
    assert entry is not None
    assert entry.value is None
    assert entry.unavailable_reason and "unusable" in entry.unavailable_reason.lower()


def test_short_window_is_null_not_a_partial_statistic(isolated_settings, steady_run) -> None:
    """A mean over ten seconds of a ten-minute window is not that window's mean."""
    result = _run(steady_run(20), isolated_settings)
    assert result is not None
    entry = result.get("TS-P3.mean_600s")
    assert entry is not None and entry.value is None
    assert "600s window" in (entry.unavailable_reason or "")


def test_absent_setpoint_produces_null_not_zero_error(isolated_settings, steady_run) -> None:
    """The machine publishes no setpoints; the error is unknown, not zero."""
    result = _run(steady_run(120), isolated_settings)
    assert result is not None
    entry = result.get("TS-F1.setpoint_error")
    assert entry is not None and entry.value is None
    assert "No setpoint" in (entry.unavailable_reason or "")


def test_undeclared_limit_produces_null_distance(isolated_settings, steady_run) -> None:
    result = _run(steady_run(120), isolated_settings)
    assert result is not None
    entry = result.get("TS-P3.distance_to_danger")
    assert entry is not None and entry.value is None


def test_cross_signal_ratio_refuses_a_zero_denominator(isolated_settings, steady_run) -> None:
    frames = steady_run(120, mutate=lambda overrides, index: overrides.update({"TS-S1": 0.0, "TS-S2": 0.0}))
    result = _run(frames, isolated_settings)
    assert result is not None
    assert result.value_of("l.load_proxy") is None


def test_thermal_gradient_uses_adjacent_zones(isolated_settings, steady_run) -> None:
    result = _run(steady_run(120), isolated_settings)
    assert result is not None
    # Zone 2 at 185 minus zone 1 at 170.
    assert result.value_of("t.gradient_TS-TZ1_TS-TZ2") == pytest.approx(15.0, abs=1.0)


def test_lineage_and_formula_ids_travel(isolated_settings, steady_run) -> None:
    """SHAP renders from this; a bare column id cannot be explained."""
    result = _run(steady_run(400), isolated_settings)
    assert result is not None
    entry = result.get("TS-P3.baseline_pct_dev")
    assert entry is not None
    assert entry.lineage and "TS-P3" in entry.lineage[0]
    assert "F-COM-009" in entry.formula_ids


# -- the mathematics --------------------------------------------------------


def test_percent_deviation_refuses_a_zero_baseline() -> None:
    assert families.percent_deviation(5.0, 0.0) is None
    assert families.percent_deviation(5.0, 4.0) == pytest.approx(25.0)


def test_ratio_refuses_a_floor_denominator() -> None:
    assert families.ratio(10.0, 0.0) is None
    assert families.ratio(10.0, 2.0) == pytest.approx(5.0)


def test_slope_needs_three_points_and_a_span() -> None:
    origin = datetime(2026, 1, 1, tzinfo=UTC)
    stamps = [origin + timedelta(seconds=index * 60) for index in range(3)]
    assert families.slope_per_minute([1.0, 2.0, 3.0], stamps) == pytest.approx(1.0)
    assert families.slope_per_minute([1.0, 2.0], stamps[:2]) is None


def test_cv_is_undefined_near_zero() -> None:
    assert families.coefficient_of_variation([0.0, 0.0, 0.0]) is None


def test_persistence_seconds_is_the_trailing_run() -> None:
    """A condition that fired an hour ago and is quiet now has not persisted."""
    origin = datetime(2026, 1, 1, tzinfo=UTC)
    stamps = [origin + timedelta(seconds=index) for index in range(6)]
    assert families.persistence_seconds([True, True, False, True, True, True], stamps) == 3.0
    assert families.persistence_seconds([True, True, True, False], stamps[:4]) == 0.0


def test_robust_score_matches_a_z_score_scale() -> None:
    """One robust unit equals one standard deviation on normal data."""
    assert families.robust_score(3.0, 0.0, 0.6745) == pytest.approx(3.0, abs=0.01)
