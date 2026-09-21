"""The data-quality engine, and the one rule it exists to enforce.

*A machine diagnosis must never be produced because a broken sensor reported an
extreme value.* Each test below is a way that gets violated in practice.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.quality.engine import DataQualityEngine

UTC = timezone.utc


def test_healthy_frame_is_good(isolated_settings, steady_frame) -> None:
    quality = DataQualityEngine().evaluate(steady_frame())
    assert quality.overall == "GOOD"
    assert quality.suppresses_physical_diagnosis is False
    assert quality.signals_reporting > 25


def test_absent_channel_is_missing_not_zero(isolated_settings, steady_frame) -> None:
    frame = steady_frame()
    del frame.channels["TS-P3"]
    quality = DataQualityEngine().evaluate(frame)
    entry = quality.for_signal("TS-P3")
    assert entry.verdict == "MISSING"
    assert entry.usable_value is None
    assert entry.usable is False


def test_null_value_is_distinguished_from_absence(isolated_settings, steady_frame) -> None:
    """Published-with-nothing is a sensor problem; absent is a mapping gap."""
    frame = steady_frame(overrides={"TS-P3": None})
    quality = DataQualityEngine().evaluate(frame)
    entry = quality.for_signal("TS-P3")
    assert entry.verdict == "MISSING"
    assert any("published with no value" in finding.reason for finding in entry.findings)


def test_nan_is_rejected_before_any_comparison(isolated_settings, steady_frame) -> None:
    frame = steady_frame(overrides={"TS-P3": float("nan")})
    entry = DataQualityEngine().evaluate(frame).for_signal("TS-P3")
    assert entry.verdict == "BAD"
    assert entry.usable_value is None
    assert any(finding.rule_id == "DQ-003" for finding in entry.findings)


def test_out_of_instrument_range_is_a_scaling_fault(isolated_settings, steady_frame) -> None:
    """Outside the transmitter's range is calibration, not a hot process."""
    entry = DataQualityEngine().evaluate(steady_frame(overrides={"TS-P3": 500.0})).for_signal("TS-P3")
    assert entry.verdict == "BAD"
    finding = next(item for item in entry.findings if item.rule_id == "DQ-003")
    assert "scaling or calibration fault" in finding.reason


def test_flatline_is_detected(isolated_settings, steady_frame) -> None:
    """The single most important check: a frozen sensor reads as stable."""
    engine = DataQualityEngine()
    origin = datetime(2026, 1, 1, tzinfo=UTC)
    entry = None
    for index in range(12):
        frame = steady_frame(at=origin + timedelta(seconds=index), overrides={"TS-P3": 8.0})
        entry = engine.evaluate(frame).for_signal("TS-P3")
    assert entry is not None
    assert entry.verdict == "BAD"
    assert any(finding.rule_id == "DQ-005" for finding in entry.findings)
    assert "frozen" in " ".join(finding.reason for finding in entry.findings)


def test_stale_value_is_bad_not_forward_filled(isolated_settings, steady_frame) -> None:
    origin = datetime(2026, 1, 1, tzinfo=UTC)
    frame = steady_frame(at=origin)
    engine = DataQualityEngine()
    quality = engine.evaluate(frame, now=origin + timedelta(seconds=120))
    entry = quality.for_signal("TS-P3")
    assert entry.verdict == "BAD"
    assert "stale" in " ".join(finding.reason for finding in entry.findings)


def test_impossible_rate_of_change_is_an_artefact(isolated_settings, steady_frame) -> None:
    engine = DataQualityEngine()
    origin = datetime(2026, 1, 1, tzinfo=UTC)
    engine.evaluate(steady_frame(at=origin, overrides={"TS-P3": 8.0}))
    entry = engine.evaluate(
        steady_frame(at=origin + timedelta(seconds=1), overrides={"TS-P3": 30.0})
    ).for_signal("TS-P3")
    assert entry.verdict == "BAD"
    assert any(finding.rule_id == "DQ-004" for finding in entry.findings)


def test_out_of_order_frame_is_recorded(isolated_settings, steady_frame) -> None:
    engine = DataQualityEngine()
    origin = datetime(2026, 1, 1, tzinfo=UTC)
    engine.evaluate(steady_frame(at=origin + timedelta(seconds=10)))
    quality = engine.evaluate(steady_frame(at=origin))
    assert any(finding.rule_id == "DQ-002" for finding in quality.frame_findings)


def test_duplicate_sequence_is_recorded(isolated_settings, steady_frame) -> None:
    engine = DataQualityEngine()
    origin = datetime(2026, 1, 1, tzinfo=UTC)
    engine.evaluate(steady_frame(at=origin, sequence=7))
    quality = engine.evaluate(steady_frame(at=origin + timedelta(seconds=1), sequence=7))
    assert any("Duplicate packet" in finding.reason for finding in quality.frame_findings)


def test_unit_mismatch_is_flagged_not_converted(isolated_settings, steady_frame) -> None:
    """Silently converting a mislabelled unit multiplies the value by ten."""
    frame = steady_frame()
    frame.channels["TS-P3"].unit = "bar"
    entry = DataQualityEngine().evaluate(frame).for_signal("TS-P3")
    assert entry.verdict == "UNCERTAIN"
    assert any(finding.rule_id == "DQ-008" for finding in entry.findings)


def test_source_declared_bad_is_believed(isolated_settings, steady_frame) -> None:
    frame = steady_frame()
    frame.channels["TS-P3"].source_quality = "BAD"
    entry = DataQualityEngine().evaluate(frame).for_signal("TS-P3")
    assert entry.verdict == "BAD"


def test_source_declared_good_does_not_override_a_finding(isolated_settings, steady_frame) -> None:
    """A gateway saying GOOD knows only that it received something."""
    frame = steady_frame(overrides={"TS-P3": 500.0})
    frame.channels["TS-P3"].source_quality = "GOOD"
    entry = DataQualityEngine().evaluate(frame).for_signal("TS-P3")
    assert entry.verdict == "BAD"


def test_unmapped_tag_is_a_configuration_error(isolated_settings, steady_frame) -> None:
    from app.schemas.telemetry import ChannelReading

    frame = steady_frame()
    frame.channels["TS-NOT-A-TAG"] = ChannelReading(value=1.0)
    entry = DataQualityEngine().evaluate(frame).for_signal("TS-NOT-A-TAG")
    assert entry.verdict == "BAD"
    assert "not a declared tag" in " ".join(finding.reason for finding in entry.findings)


def test_missing_optional_signal_does_not_drag_the_frame_down(isolated_settings, steady_frame) -> None:
    """A partially instrumented machine is not permanently MISSING."""
    frame = steady_frame()
    del frame.channels["TS-V4"]
    quality = DataQualityEngine().evaluate(frame)
    assert quality.overall == "GOOD"
