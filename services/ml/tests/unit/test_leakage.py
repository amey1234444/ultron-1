"""Leakage protection. Mandatory, and each test proves the guard actually fires.

A leakage test that only checks the happy path checks nothing — the guards
matter precisely when somebody constructs a bad split, so every test here
builds one deliberately and asserts the refusal.

Six failure modes, from the brief and from experience:

  1. the same event in train and test
  2. overlapping windows crossing a split boundary
  3. a scaler fitted on validation or test
  4. future labels reaching into feature computation
  5. post-maintenance values inside pre-fault prediction features
  6. target information present as a feature column
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from app.core.errors import LeakageDetected
from app.datasets.splits import (
    SplitDefinition,
    check_leakage,
    chronological_split,
    required_gap_seconds,
)
from app.labels.events import EXCLUDED, FaultEvent, LabelPolicy, label_row
from app.models.temporal.scaler import SequenceScaler

UTC = timezone.utc
ORIGIN = datetime(2026, 1, 1, tzinfo=UTC)


def _stamps(count: int, step_seconds: int = 60) -> list[datetime]:
    return [ORIGIN + timedelta(seconds=index * step_seconds) for index in range(count)]


def _event(event_id: str, onset_index: int, *, step: int = 60, length: int = 20) -> FaultEvent:
    return FaultEvent(
        event_id=event_id,
        machine_id="TSE-01",
        fault_id="TSE-DOWN-001",
        fault_family="DOWNSTREAM",
        confirmed_onset=ORIGIN + timedelta(seconds=onset_index * step),
        resolved_at=ORIGIN + timedelta(seconds=(onset_index + length) * step),
        label_quality="GOLD",
    )


# -- 1. the same event on both sides ---------------------------------------


def test_same_event_in_two_splits_is_detected() -> None:
    stamps = _stamps(100)
    split = SplitDefinition(
        strategy="manual",
        boundaries=None,
        assignments={str(index): ("train" if index < 50 else "test") for index in range(100)},
    )
    # One event spanning the boundary — the subtlest and most common leak,
    # because the two halves are not merely correlated, they are the same
    # physical occurrence.
    event_ids = [("EV-1" if 40 <= index < 60 else None) for index in range(100)]

    with pytest.raises(LeakageDetected) as error:
        check_leakage(split, timestamps=stamps, event_ids=event_ids, events=[_event("EV-1", 40)])
    assert "EV-1" in str(error.value.detail)


# -- 2. an insufficient gap between splits ---------------------------------


def test_gap_shorter_than_lookback_plus_horizon_is_detected() -> None:
    stamps = _stamps(100)
    split = SplitDefinition(
        strategy="chronological",
        boundaries=None,
        assignments={str(index): ("train" if index < 50 else "valid") for index in range(100)},
    )
    with pytest.raises(LeakageDetected) as error:
        check_leakage(
            split,
            timestamps=stamps,
            event_ids=[None] * 100,
            max_lookback_seconds=600,
            max_horizon_minutes=30,
        )
    assert "separates train from valid" in str(error.value.detail)


def test_required_gap_is_lookback_plus_horizon() -> None:
    """Ten-minute lookback plus a thirty-minute horizon is forty minutes."""
    assert required_gap_seconds(600, 30) == 2400.0


def test_chronological_split_inserts_the_gap() -> None:
    stamps = _stamps(600, step_seconds=60)
    split = chronological_split(
        stamps, max_lookback_seconds=600, max_horizon_minutes=30
    )
    report = check_leakage(
        split,
        timestamps=stamps,
        event_ids=[None] * len(stamps),
        max_lookback_seconds=600,
        max_horizon_minutes=30,
        raise_on_violation=False,
    )
    assert report.clean, report.violations
    assert split.excluded_count > 0, "The gap must actually exclude rows."


def test_split_boundary_moves_off_an_event() -> None:
    """Fractions are a starting point; event atomicity takes precedence."""
    stamps = _stamps(600, step_seconds=60)
    # 70% of 600 rows is index 419, which falls inside this event.
    event = _event("EV-BOUNDARY", 400, step=60, length=40)
    split = chronological_split(
        stamps, events=[event], max_lookback_seconds=600, max_horizon_minutes=30
    )
    assert any("moved to before its onset" in note for note in split.notes)
    assert split.boundaries is not None
    assert split.boundaries.train_end < event.confirmed_onset


# -- 3. a scaler fitted on the wrong split ----------------------------------


def test_scaler_refuses_validation_data() -> None:
    scaler = SequenceScaler()
    with pytest.raises(ValueError) as error:
        scaler.fit([[1.0], [2.0]], ["a"], split="valid")
    assert "train split" in str(error.value)


def test_scaler_refuses_test_data() -> None:
    with pytest.raises(ValueError):
        SequenceScaler().fit([[1.0], [2.0]], ["a"], split="test")


def test_scaler_records_the_split_it_saw() -> None:
    scaler = SequenceScaler().fit([[1.0], [2.0], [3.0]], ["a"], split="train")
    assert scaler.fitted_on_split == "train"


def test_calibrator_refuses_train_and_test() -> None:
    from app.models.calibration.calibrators import fit_calibrator

    for split in ("train", "test"):
        with pytest.raises(ValueError):
            fit_calibrator([0.1, 0.9], [0, 1], split=split)


# -- 4. future labels reaching into the present -----------------------------


def test_label_is_positive_only_strictly_before_onset() -> None:
    """A row at or after onset is not a prognosis target."""
    policy = LabelPolicy(exclude_after_onset=True)
    event = _event("EV-2", 30)
    onset = event.confirmed_onset
    assert onset is not None

    before = label_row(
        at=onset - timedelta(minutes=10),
        machine_id="TSE-01",
        fault_id="TSE-DOWN-001",
        horizon_minutes=15,
        events=[event],
        policy=policy,
    )
    assert before == 1

    at_onset = label_row(
        at=onset,
        machine_id="TSE-01",
        fault_id="TSE-DOWN-001",
        horizon_minutes=15,
        events=[event],
        policy=policy,
    )
    assert at_onset == EXCLUDED, "After onset is detection, not prognosis."


def test_row_outside_the_horizon_is_a_negative() -> None:
    event = _event("EV-3", 60)
    onset = event.confirmed_onset
    assert onset is not None
    assert (
        label_row(
            at=onset - timedelta(minutes=45),
            machine_id="TSE-01",
            fault_id="TSE-DOWN-001",
            horizon_minutes=15,
            events=[event],
            policy=LabelPolicy(),
        )
        == 0
    )


def test_uncertain_onset_band_is_excluded_not_guessed() -> None:
    """A label wrong by twenty minutes on a thirty-minute horizon is worse than none."""
    event = _event("EV-4", 60)
    event.onset_uncertainty_seconds = 1200
    onset = event.confirmed_onset
    assert onset is not None
    assert (
        label_row(
            at=onset - timedelta(minutes=10),
            machine_id="TSE-01",
            fault_id="TSE-DOWN-001",
            horizon_minutes=15,
            events=[event],
            policy=LabelPolicy(exclude_uncertain_band=True),
        )
        == EXCLUDED
    )


def test_unverified_event_does_not_become_a_positive() -> None:
    """A model trained on its predecessor's guesses learns its mistakes."""
    event = _event("EV-5", 60)
    event.label_quality = "UNVERIFIED"
    onset = event.confirmed_onset
    assert onset is not None
    assert (
        label_row(
            at=onset - timedelta(minutes=5),
            machine_id="TSE-01",
            fault_id="TSE-DOWN-001",
            horizon_minutes=15,
            events=[event],
            policy=LabelPolicy(trusted_only=True),
        )
        == EXCLUDED
    )


# -- 5. post-maintenance values in pre-fault features -----------------------


def test_post_maintenance_window_is_excluded() -> None:
    event = _event("EV-6", 60)
    event.maintenance_at = ORIGIN + timedelta(hours=2)
    assert (
        label_row(
            at=event.maintenance_at + timedelta(minutes=5),
            machine_id="TSE-01",
            fault_id="TSE-DOWN-001",
            horizon_minutes=15,
            events=[event],
            policy=LabelPolicy(exclude_post_maintenance_seconds=1800),
        )
        == EXCLUDED
    )


# -- 6. target information inside a feature column --------------------------


def test_no_feature_id_encodes_a_label(isolated_settings) -> None:
    """A column named after a fault id would leak the target into the input."""
    from app.features.engine import union_feature_ids
    from app.knowledge.loader import knowledge

    fault_ids = {entry.fault_id for entry in knowledge().faults}
    for feature_id in union_feature_ids():
        assert not any(fault_id in feature_id for fault_id in fault_ids)
        assert not feature_id.startswith("y::")


def test_diagnosis_output_is_not_a_feature(isolated_settings) -> None:
    """The rules' own verdict must not be a model input.

    A feature carrying the deterministic diagnosis would let the tree learn to
    copy it, which measures agreement with the rules rather than anything about
    the machine.
    """
    from app.features.engine import union_feature_ids

    banned = ("diagnosis", "fault_id", "severity", "priority")
    for feature_id in union_feature_ids():
        assert not any(token in feature_id.lower() for token in banned)
