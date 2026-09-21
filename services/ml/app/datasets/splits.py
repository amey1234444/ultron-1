"""Leakage-safe splitting for overlapping time-series windows.

Random row-level splitting on this data is not a mistake that degrades a
metric; it destroys it. Consecutive rows share most of a ten-minute window, so
a random split puts near-duplicates of the same instant in train and test, and
the reported PR-AUC measures memorisation. The number that comes out looks
excellent and predicts nothing.

Four rules, all enforced rather than documented:

**Chronological.** Train is the earliest period, then validation, then a frozen
test set at the end. That is also the only split that matches how the model
will be used — on data from after everything it was trained on.

**Event-atomic.** A fault event lives entirely in one split. Early samples of
event X in train and later samples of the same event in test is the subtlest
and most common leak, because the two halves are not merely correlated, they
are the same physical occurrence.

**Gapped.** Between splits there is a dead zone of at least
``max_lookback + max_horizon``. Without it, a training row's *lookback* reaches
into validation, or a training row's *label* is determined by an event that
begins in validation. Ten-minute lookback plus a thirty-minute horizon means a
forty-minute gap, minimum.

**Verified.** ``check_leakage`` re-examines the finished split and raises on any
violation. It is called by the dataset builder unconditionally, and the tests
call it on deliberately broken splits to prove it fires.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Literal, Sequence

from ..core.errors import LeakageDetected
from ..core.timeutil import iso
from ..labels.events import FaultEvent

SplitName = Literal["train", "valid", "test", "excluded"]


@dataclass(frozen=True)
class SplitBoundaries:
    """The time boundaries of a chronological split, with its gaps."""

    train_end: datetime
    valid_start: datetime
    valid_end: datetime
    test_start: datetime
    gap_seconds: float

    def assign(self, at: datetime) -> SplitName:
        if at <= self.train_end:
            return "train"
        if at < self.valid_start:
            return "excluded"
        if at <= self.valid_end:
            return "valid"
        if at < self.test_start:
            return "excluded"
        return "test"

    def to_json(self) -> dict[str, object]:
        return {
            "train_end": iso(self.train_end),
            "valid_start": iso(self.valid_start),
            "valid_end": iso(self.valid_end),
            "test_start": iso(self.test_start),
            "gap_seconds": self.gap_seconds,
        }


@dataclass
class SplitDefinition:
    """A complete, persisted split. Reproducible from this record alone."""

    strategy: str
    boundaries: SplitBoundaries | None
    assignments: dict[str, SplitName] = field(default_factory=dict)
    """Row index (as a string) to split. Persisted so a later evaluation uses
    exactly the split the model was trained under."""

    event_assignment: dict[str, SplitName] = field(default_factory=dict)
    holdout_machines: tuple[str, ...] = ()
    holdout_recipes: tuple[str, ...] = ()
    counts: dict[str, int] = field(default_factory=dict)
    excluded_count: int = 0
    notes: list[str] = field(default_factory=list)

    def to_json(self) -> dict[str, object]:
        return {
            "strategy": self.strategy,
            "boundaries": self.boundaries.to_json() if self.boundaries else None,
            "event_assignment": dict(self.event_assignment),
            "holdout_machines": list(self.holdout_machines),
            "holdout_recipes": list(self.holdout_recipes),
            "counts": dict(self.counts),
            "excluded_count": self.excluded_count,
            "notes": list(self.notes),
        }


def required_gap_seconds(max_lookback_seconds: float, max_horizon_minutes: int) -> float:
    """The minimum dead zone between splits.

    A row's evidence reaches ``lookback`` into the past and its label reaches
    ``horizon`` into the future. Any gap shorter than the sum of the two lets
    one split's rows see the other's data.
    """
    return float(max_lookback_seconds) + float(max_horizon_minutes) * 60.0


def chronological_split(
    timestamps: Sequence[datetime],
    *,
    events: Sequence[FaultEvent] = (),
    train_fraction: float = 0.70,
    valid_fraction: float = 0.15,
    max_lookback_seconds: float = 600.0,
    max_horizon_minutes: int = 30,
) -> SplitDefinition:
    """Split in time, then move boundaries off any event they would cut.

    The fractions are a starting point; the event boundaries take precedence
    over them, because a split that respects the fractions and cuts an event in
    half has kept the wrong invariant.
    """
    if not timestamps:
        return SplitDefinition(strategy="chronological", boundaries=None)

    ordered = sorted(timestamps)
    gap = timedelta(seconds=required_gap_seconds(max_lookback_seconds, max_horizon_minutes))
    notes: list[str] = []

    train_cut = ordered[max(0, int(len(ordered) * train_fraction) - 1)]
    valid_cut = ordered[max(0, int(len(ordered) * (train_fraction + valid_fraction)) - 1)]

    train_cut = _move_off_events(train_cut, events, notes, "train/valid")
    valid_cut = _move_off_events(valid_cut, events, notes, "valid/test")

    boundaries = SplitBoundaries(
        train_end=train_cut,
        valid_start=train_cut + gap,
        valid_end=valid_cut,
        test_start=valid_cut + gap,
        gap_seconds=gap.total_seconds(),
    )
    if boundaries.valid_start > boundaries.valid_end:
        notes.append(
            "The leakage gap consumes the entire validation period. The dataset is too "
            "short for this lookback and horizon combination."
        )

    assignments: dict[str, SplitName] = {}
    counts: dict[str, int] = {"train": 0, "valid": 0, "test": 0, "excluded": 0}
    for index, at in enumerate(timestamps):
        split = boundaries.assign(at)
        assignments[str(index)] = split
        counts[split] += 1

    event_assignment = {
        event.event_id: boundaries.assign(event.confirmed_onset)
        for event in events
        if event.confirmed_onset is not None
    }

    return SplitDefinition(
        strategy="chronological",
        boundaries=boundaries,
        assignments=assignments,
        event_assignment=event_assignment,
        counts=counts,
        excluded_count=counts["excluded"],
        notes=notes,
    )


def _move_off_events(
    cut: datetime, events: Sequence[FaultEvent], notes: list[str], label: str
) -> datetime:
    """Shift a boundary earlier until it no longer falls inside an event."""
    moved = cut
    for event in events:
        span = event.spans()
        if span is None:
            continue
        start, end = span
        if start <= moved <= end:
            notes.append(
                f"The {label} boundary fell inside event {event.event_id} "
                f"({event.fault_id}); moved to before its onset at {iso(start)}."
            )
            moved = min(moved, start - timedelta(seconds=1))
    return moved


def machine_holdout_split(
    timestamps: Sequence[datetime],
    machine_ids: Sequence[str],
    *,
    test_machines: Sequence[str],
    valid_fraction: float = 0.2,
) -> SplitDefinition:
    """Hold out whole machines, to measure generalisation to an unseen unit.

    A different question from the chronological split, and both are needed. The
    chronological one answers "will this keep working next month"; this one
    answers "will this work on TSE-03, which the model has never seen" — which
    is the question that decides whether a site can deploy without per-machine
    training.
    """
    holdout = set(test_machines)
    assignments: dict[str, SplitName] = {}
    counts: dict[str, int] = {"train": 0, "valid": 0, "test": 0, "excluded": 0}

    train_pool = [index for index, machine in enumerate(machine_ids) if machine not in holdout]
    ordered_pool = sorted(train_pool, key=lambda index: timestamps[index])
    valid_start = int(len(ordered_pool) * (1 - valid_fraction))
    valid_indices = set(ordered_pool[valid_start:])

    for index, machine in enumerate(machine_ids):
        if machine in holdout:
            split: SplitName = "test"
        elif index in valid_indices:
            split = "valid"
        else:
            split = "train"
        assignments[str(index)] = split
        counts[split] += 1

    return SplitDefinition(
        strategy="machine_holdout",
        boundaries=None,
        assignments=assignments,
        holdout_machines=tuple(test_machines),
        counts=counts,
        notes=[
            f"Machines held out entirely: {', '.join(sorted(holdout))}. "
            "Measures generalisation to an unseen machine, not to a later time."
        ],
    )


def recipe_holdout_split(
    timestamps: Sequence[datetime],
    recipes: Sequence[str | None],
    *,
    test_recipes: Sequence[str],
    valid_fraction: float = 0.2,
) -> SplitDefinition:
    """Hold out whole recipes, to measure generalisation to unseen material."""
    holdout = set(test_recipes)
    assignments: dict[str, SplitName] = {}
    counts: dict[str, int] = {"train": 0, "valid": 0, "test": 0, "excluded": 0}

    train_pool = [index for index, recipe in enumerate(recipes) if recipe not in holdout]
    ordered_pool = sorted(train_pool, key=lambda index: timestamps[index])
    valid_start = int(len(ordered_pool) * (1 - valid_fraction))
    valid_indices = set(ordered_pool[valid_start:])

    for index, recipe in enumerate(recipes):
        if recipe in holdout:
            split: SplitName = "test"
        elif index in valid_indices:
            split = "valid"
        else:
            split = "train"
        assignments[str(index)] = split
        counts[split] += 1

    return SplitDefinition(
        strategy="recipe_holdout",
        boundaries=None,
        assignments=assignments,
        holdout_recipes=tuple(test_recipes),
        counts=counts,
    )


@dataclass(frozen=True)
class LeakageReport:
    """What the verifier found. Empty means the split is safe."""

    violations: tuple[str, ...]

    @property
    def clean(self) -> bool:
        return not self.violations


def check_leakage(
    split: SplitDefinition,
    *,
    timestamps: Sequence[datetime],
    event_ids: Sequence[str | None],
    events: Sequence[FaultEvent] = (),
    max_lookback_seconds: float = 600.0,
    max_horizon_minutes: int = 30,
    raise_on_violation: bool = True,
) -> LeakageReport:
    """Re-examine a finished split for every way it could have leaked.

    Deliberately recomputed from the assignments rather than trusting the
    builder. A verifier that shares its logic with the thing it verifies checks
    nothing.
    """
    violations: list[str] = []

    # 1 — an event must not appear in two splits.
    by_event: dict[str, set[str]] = {}
    for index, event_id in enumerate(event_ids):
        if not event_id:
            continue
        assigned = split.assignments.get(str(index))
        if assigned in (None, "excluded"):
            continue
        by_event.setdefault(event_id, set()).add(assigned)
    for event_id, splits in by_event.items():
        if len(splits) > 1:
            violations.append(
                f"Event {event_id} appears in {sorted(splits)}. An event must live entirely "
                "in one split; the two halves are the same physical occurrence."
            )

    # 2 — the gap between splits must cover lookback plus horizon.
    required = required_gap_seconds(max_lookback_seconds, max_horizon_minutes)
    by_split: dict[str, list[datetime]] = {}
    for index, at in enumerate(timestamps):
        assigned = split.assignments.get(str(index))
        if assigned in (None, "excluded"):
            continue
        by_split.setdefault(assigned, []).append(at)

    for earlier, later in (("train", "valid"), ("valid", "test"), ("train", "test")):
        if earlier not in by_split or later not in by_split:
            continue
        gap = (min(by_split[later]) - max(by_split[earlier])).total_seconds()
        if gap < required:
            violations.append(
                f"Only {gap:.0f}s separates {earlier} from {later}; {required:.0f}s is required "
                f"for a {max_lookback_seconds:.0f}s lookback and a {max_horizon_minutes}-minute "
                "horizon. A row's window or its label reaches across the boundary."
            )

    # 3 — chronological order must actually be chronological.
    if split.strategy == "chronological":
        for earlier, later in (("train", "valid"), ("valid", "test")):
            if earlier in by_split and later in by_split:
                if max(by_split[earlier]) >= min(by_split[later]):
                    violations.append(
                        f"{later} contains samples earlier than the end of {earlier}. The split "
                        "is not chronological."
                    )

    # 4 — an event's own onset must be in the same split as its rows.
    for event in events:
        if event.confirmed_onset is None:
            continue
        rows = [
            split.assignments.get(str(index))
            for index, event_id in enumerate(event_ids)
            if event_id == event.event_id
        ]
        seen = {value for value in rows if value not in (None, "excluded")}
        declared = split.event_assignment.get(event.event_id)
        if declared and seen and declared not in seen:
            violations.append(
                f"Event {event.event_id} is declared in {declared} but its rows are in "
                f"{sorted(seen)}."
            )

    report = LeakageReport(violations=tuple(violations))
    if raise_on_violation and not report.clean:
        raise LeakageDetected(
            "The split leaks. Training on it would produce metrics that measure memorisation.",
            detail={"violations": list(report.violations)},
        )
    return report
