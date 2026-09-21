"""Fault events and how much their labels are worth.

A prognosis model is trained on *events*, not on rows. "This fault began at
14:32, was confirmed by the fitter who opened the machine at 15:10, and was
resolved by replacing the screen pack" is the unit of truth; the per-second
rows are derived from it by asking, at each instant, whether a confirmed onset
falls in the next H minutes.

Two things this module refuses to do.

**It does not let an unverified guess become ground truth.** Label quality is a
required field, and ``GOLD`` means somebody physically confirmed it. A rule
that fired and nobody checked is ``UNVERIFIED`` and is excluded from training
by default — a model trained on its own predecessor's output learns that
predecessor's mistakes and cannot discover anything it did not already believe.

**It does not blur onset uncertainty.** A confirmed onset is rarely known to
the second; it is "somewhere in this half hour". That interval is stored, and
the label builder can be told to exclude the uncertain band rather than
guessing a point inside it, because a label that is wrong by twenty minutes on
a thirty-minute horizon is worse than no label.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Iterable, Sequence

from ..core.timeutil import iso, parse_timestamp
from ..knowledge.enums import DataSource, LabelQuality

#: Label qualities trusted as training truth by default.
TRUSTED_QUALITIES: frozenset[str] = frozenset({"GOLD", "SILVER"})


@dataclass
class FaultEvent:
    """One occurrence of one fault on one machine."""

    event_id: str
    machine_id: str
    fault_id: str
    fault_family: str

    suspected_onset: datetime | None = None
    """When the analytics first thought so. Never used as a training target."""

    confirmed_onset: datetime | None = None
    """When the fault is agreed to have begun. The label anchor."""

    onset_uncertainty_seconds: float = 0.0
    """Half-width of the interval the onset is known within."""

    confirmed_location: str | None = None
    confirmed_root_cause: str | None = None

    maintenance_at: datetime | None = None
    action_taken: str | None = None
    resolved_at: datetime | None = None

    confirmation_source: str | None = None
    """Physical inspection, lab result, maintenance record, engineer judgement."""

    label_quality: LabelQuality = "UNVERIFIED"
    data_source: DataSource = "REAL"
    scenario_id: str | None = None
    """Set for synthetic events. Its presence is itself a marker."""

    notes: str = ""

    @property
    def trusted(self) -> bool:
        return self.label_quality in TRUSTED_QUALITIES

    @property
    def onset_window(self) -> tuple[datetime, datetime] | None:
        """The interval the onset is known to lie within."""
        if self.confirmed_onset is None:
            return None
        delta = timedelta(seconds=self.onset_uncertainty_seconds)
        return self.confirmed_onset - delta, self.confirmed_onset + delta

    def spans(self) -> tuple[datetime, datetime] | None:
        """The whole event, onset to resolution. Used for split boundaries.

        A split must not cut through this interval, or the same event ends up
        on both sides of it and every metric computed afterwards is optimistic.
        """
        start = self.confirmed_onset or self.suspected_onset
        if start is None:
            return None
        end = self.resolved_at or self.maintenance_at or start
        return start, max(end, start)

    def to_json(self) -> dict[str, object]:
        return {
            "event_id": self.event_id,
            "machine_id": self.machine_id,
            "fault_id": self.fault_id,
            "fault_family": self.fault_family,
            "suspected_onset": iso(self.suspected_onset) if self.suspected_onset else None,
            "confirmed_onset": iso(self.confirmed_onset) if self.confirmed_onset else None,
            "onset_uncertainty_seconds": self.onset_uncertainty_seconds,
            "confirmed_location": self.confirmed_location,
            "confirmed_root_cause": self.confirmed_root_cause,
            "maintenance_at": iso(self.maintenance_at) if self.maintenance_at else None,
            "action_taken": self.action_taken,
            "resolved_at": iso(self.resolved_at) if self.resolved_at else None,
            "confirmation_source": self.confirmation_source,
            "label_quality": self.label_quality,
            "data_source": self.data_source,
            "scenario_id": self.scenario_id,
            "notes": self.notes,
        }

    @classmethod
    def from_json(cls, payload: dict[str, object]) -> "FaultEvent":
        def when(key: str) -> datetime | None:
            value = payload.get(key)
            return parse_timestamp(value) if value else None  # type: ignore[arg-type]

        return cls(
            event_id=str(payload["event_id"]),
            machine_id=str(payload["machine_id"]),
            fault_id=str(payload["fault_id"]),
            fault_family=str(payload.get("fault_family", "")),
            suspected_onset=when("suspected_onset"),
            confirmed_onset=when("confirmed_onset"),
            onset_uncertainty_seconds=float(payload.get("onset_uncertainty_seconds", 0) or 0),
            confirmed_location=payload.get("confirmed_location"),  # type: ignore[arg-type]
            confirmed_root_cause=payload.get("confirmed_root_cause"),  # type: ignore[arg-type]
            maintenance_at=when("maintenance_at"),
            action_taken=payload.get("action_taken"),  # type: ignore[arg-type]
            resolved_at=when("resolved_at"),
            confirmation_source=payload.get("confirmation_source"),  # type: ignore[arg-type]
            label_quality=payload.get("label_quality", "UNVERIFIED"),  # type: ignore[arg-type]
            data_source=payload.get("data_source", "REAL"),  # type: ignore[arg-type]
            scenario_id=payload.get("scenario_id"),  # type: ignore[arg-type]
            notes=str(payload.get("notes", "")),
        )


@dataclass
class LabelPolicy:
    """How events become per-row targets."""

    horizons_minutes: tuple[int, ...] = (5, 15, 30)
    trusted_only: bool = True
    """Exclude UNVERIFIED and BRONZE labels from positives."""

    exclude_uncertain_band: bool = True
    """Rows inside an onset's uncertainty interval are excluded entirely.

    Excluded, not labelled negative. A row twelve minutes before an onset that
    is only known to within twenty minutes might be a positive or a negative,
    and asserting either teaches the model a coin flip.
    """

    exclude_after_onset: bool = True
    """Rows after a confirmed onset are excluded from that fault's targets.

    Prognosis is "will this develop", not "is this happening". Including the
    post-onset period teaches the model to recognise a fault in progress and
    inflates every lead-time number, because it is then scoring detection.
    """

    exclude_post_maintenance_seconds: float = 1800.0
    """Rows just after maintenance are excluded: the machine is not itself."""


EXCLUDED = -1
"""The target value for a row that must not train. Distinct from 0."""


def label_row(
    *,
    at: datetime,
    machine_id: str,
    fault_id: str,
    horizon_minutes: int,
    events: Sequence[FaultEvent],
    policy: LabelPolicy,
) -> int:
    """The target for one row: 1, 0, or EXCLUDED.

    Three values, not two. A row that is neither a confirmed positive nor a
    trustworthy negative must not be forced into either, and ``EXCLUDED`` is
    how the dataset builder drops it.
    """
    horizon = timedelta(minutes=horizon_minutes)
    relevant = [
        event
        for event in events
        if event.machine_id == machine_id and event.fault_id == fault_id
    ]

    for event in relevant:
        if event.confirmed_onset is None:
            continue
        if policy.trusted_only and not event.trusted:
            # An unverified event is neither a positive nor evidence of absence.
            # Excluding its whole neighbourhood is the only honest handling.
            if _within(at, event.confirmed_onset, horizon, before=True):
                return EXCLUDED
            continue

        onset = event.confirmed_onset

        if policy.exclude_after_onset and event.spans() is not None:
            start, end = event.spans()  # type: ignore[misc]
            if start <= at <= end:
                return EXCLUDED

        if policy.exclude_post_maintenance_seconds and event.maintenance_at is not None:
            window = timedelta(seconds=policy.exclude_post_maintenance_seconds)
            if event.maintenance_at <= at <= event.maintenance_at + window:
                return EXCLUDED

        if policy.exclude_uncertain_band and event.onset_uncertainty_seconds > 0:
            low, high = event.onset_window  # type: ignore[misc]
            target_low = low - horizon
            if target_low <= at <= high:
                return EXCLUDED

        # The positive definition: a confirmed onset falls in (t, t + H].
        if onset > at and (onset - at) <= horizon:
            return 1

    return 0


def _within(at: datetime, onset: datetime, horizon: timedelta, *, before: bool) -> bool:
    if before:
        return onset > at and (onset - at) <= horizon
    return at >= onset


def events_for_machine(events: Iterable[FaultEvent], machine_id: str) -> list[FaultEvent]:
    return [event for event in events if event.machine_id == machine_id]


def label_quality_mix(events: Iterable[FaultEvent]) -> dict[str, int]:
    """Counts by label quality, stamped onto every trained model's contract."""
    mix: dict[str, int] = {}
    for event in events:
        mix[event.label_quality] = mix.get(event.label_quality, 0) + 1
    return mix


def trusted_event_count(events: Iterable[FaultEvent], fault_id: str) -> int:
    return sum(1 for event in events if event.fault_id == fault_id and event.trusted)


@dataclass
class MaintenanceFeedback:
    """An engineer's verdict on a surfaced diagnosis.

    The input side of the continuous learning loop. Feedback never trains
    anything directly: it becomes an event, the event goes into a versioned
    dataset, and the dataset is reviewed before a candidate model is fitted
    from it. A model that retrains on an operator's click is a model that
    learns whoever clicks most.
    """

    feedback_id: str
    prediction_id: str
    machine_id: str
    submitted_at: datetime
    submitted_by: str | None = None

    diagnosis_correct: str = "UNKNOWN"
    """YES | NO | PARTIAL | UNKNOWN."""

    actual_fault_id: str | None = None
    actual_location: str | None = None
    actual_root_cause: str | None = None
    action_taken: str | None = None

    post_action_result: str = "UNKNOWN"
    """RESOLVED | IMPROVED | NO_CHANGE | UNKNOWN."""

    primary_anomaly_cleared: str = "UNKNOWN"
    """YES | NO | PARTIAL."""

    false_positive: bool = False
    false_negative: bool = False
    confirmation_source: str | None = None
    label_quality: LabelQuality = "UNVERIFIED"
    notes: str = ""

    def to_event(self, event_id: str, *, fault_family: str = "") -> FaultEvent | None:
        """Promote feedback to a labelled event, when it carries enough truth.

        Returns None for feedback that confirms nothing: "UNKNOWN / UNKNOWN"
        is a record worth keeping and not a training label, and silently
        turning it into one would poison the next dataset.
        """
        if self.diagnosis_correct == "UNKNOWN" and not self.actual_fault_id:
            return None
        fault_id = self.actual_fault_id
        if fault_id is None:
            return None
        return FaultEvent(
            event_id=event_id,
            machine_id=self.machine_id,
            fault_id=fault_id,
            fault_family=fault_family,
            confirmed_onset=None,
            confirmed_location=self.actual_location,
            confirmed_root_cause=self.actual_root_cause,
            maintenance_at=self.submitted_at,
            action_taken=self.action_taken,
            resolved_at=self.submitted_at if self.post_action_result == "RESOLVED" else None,
            confirmation_source=self.confirmation_source,
            label_quality=self.label_quality,
            notes=self.notes,
        )


@dataclass
class EventStore:
    """Events in memory, with the file they came from."""

    events: list[FaultEvent] = field(default_factory=list)

    def add(self, event: FaultEvent) -> None:
        self.events.append(event)

    def by_fault(self, fault_id: str) -> list[FaultEvent]:
        return [event for event in self.events if event.fault_id == fault_id]

    def trusted(self) -> list[FaultEvent]:
        return [event for event in self.events if event.trusted]

    def summary(self) -> dict[str, object]:
        return {
            "total": len(self.events),
            "by_quality": label_quality_mix(self.events),
            "by_fault": {
                fault_id: len(self.by_fault(fault_id))
                for fault_id in sorted({event.fault_id for event in self.events})
            },
            "real": sum(1 for event in self.events if event.data_source == "REAL"),
            "synthetic": sum(1 for event in self.events if event.data_source != "REAL"),
        }
