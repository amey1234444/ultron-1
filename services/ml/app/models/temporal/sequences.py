"""Turning telemetry into training sequences, without leaking the future.

Two jobs, and the second is the one that has to be right.

**Windowing.** A sequence is ``lookback`` consecutive grid points ending at
``t``, and its target is the value at ``t + 1`` step. Nothing in the sequence
may come from after ``t``, which sounds obvious and is violated the moment
somebody computes a rolling mean over the whole series before slicing it.

**Gap policy.** Real telemetry has holes. A sequence containing a hole is
either dropped or imputed, and which one is a decision with consequences:
dropping loses the periods around outages, which is exactly when faults
develop; imputing teaches the network whatever the imputation looks like. The
policy here is explicit and narrow — a sequence is kept only if its
completeness clears a threshold, and the surviving holes are filled by
interpolating *within the sequence*, never from outside it.

``build_sequences`` also returns the index of each sequence's end time, which
the split builder needs to enforce the leakage gap. A sequence set without that
index cannot be split safely, so it is not optional.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Sequence


@dataclass
class SequenceSet:
    """Windowed sequences with their targets and their provenance."""

    columns: tuple[str, ...]
    forecast_columns: tuple[str, ...]
    sequences: list[list[list[float | None]]] = field(default_factory=list)
    """[n_sequences][lookback][n_columns]."""

    targets: list[list[float | None]] = field(default_factory=list)
    """[n_sequences][n_forecast_columns]."""

    end_times: list[datetime] = field(default_factory=list)
    """When each sequence ends. The anchor for every split decision."""

    machine_ids: list[str] = field(default_factory=list)
    event_ids: list[str | None] = field(default_factory=list)
    completeness: list[float] = field(default_factory=list)

    def __len__(self) -> int:
        return len(self.sequences)

    def subset(self, indices: Sequence[int]) -> "SequenceSet":
        return SequenceSet(
            columns=self.columns,
            forecast_columns=self.forecast_columns,
            sequences=[self.sequences[i] for i in indices],
            targets=[self.targets[i] for i in indices],
            end_times=[self.end_times[i] for i in indices],
            machine_ids=[self.machine_ids[i] for i in indices],
            event_ids=[self.event_ids[i] for i in indices],
            completeness=[self.completeness[i] for i in indices],
        )

    def flat_rows(self) -> list[list[float | None]]:
        """Every timestep as a row. What the scaler is fitted on."""
        return [row for sequence in self.sequences for row in sequence]

    def to_arrays(self):  # type: ignore[no-untyped-def]
        """Dense numpy arrays for Keras, with remaining gaps interpolated.

        Interpolation happens *here*, at the last possible moment, and only
        within each sequence. Keras cannot consume a None, and filling earlier
        would let an imputed value leak into a statistic computed over the
        whole series.
        """
        from ...core.capability import module

        numpy = module("numpy")
        x = numpy.array([dense_sequence(sequence, len(self.columns)) for sequence in self.sequences], dtype="float32")
        y = numpy.array(
            [[0.0 if value is None else float(value) for value in target] for target in self.targets],
            dtype="float32",
        )
        return x, y


def dense_sequence(
    sequence: Sequence[Sequence[float | None]], width: int
) -> list[list[float]]:
    """One sequence with every gap filled, as [lookback][width]."""
    columns = [_fill_column_gaps(sequence, index) for index in range(width)]
    return [[columns[index][step] for index in range(width)] for step in range(len(sequence))]


def _column_values(sequence: Sequence[Sequence[float | None]], index: int) -> list[float | None]:
    return [row[index] if index < len(row) else None for row in sequence]


def _fill_column_gaps(sequence: Sequence[Sequence[float | None]], index: int) -> list[float]:
    """Linear interpolation inside one column of one sequence.

    Interior gaps are interpolated between their neighbours; leading and
    trailing gaps are held at the nearest known value, because there is nothing
    to interpolate toward. A column that is empty from end to end becomes
    zeros and the sequence that contains it should already have been rejected
    by the completeness threshold.
    """
    values = _column_values(sequence, index)
    known = [(position, value) for position, value in enumerate(values) if value is not None]
    if not known:
        return [0.0] * len(values)

    out: list[float] = []
    for position in range(len(values)):
        value = values[position]
        if value is not None:
            out.append(float(value))
            continue
        before = [entry for entry in known if entry[0] < position]
        after = [entry for entry in known if entry[0] > position]
        if before and after:
            (left_pos, left_val), (right_pos, right_val) = before[-1], after[0]
            weight = (position - left_pos) / (right_pos - left_pos)
            out.append(float(left_val) + weight * (float(right_val) - float(left_val)))
        elif before:
            out.append(float(before[-1][1]))
        else:
            out.append(float(after[0][1]))
    return out


def build_sequences(
    *,
    grid: Sequence[datetime],
    rows: Sequence[Sequence[float | None]],
    columns: Sequence[str],
    forecast_columns: Sequence[str],
    lookback: int,
    horizon_steps: int = 1,
    machine_id: str = "",
    event_at: dict[datetime, str] | None = None,
    min_completeness: float = 0.85,
) -> SequenceSet:
    """Slide a window over an aligned grid and emit training sequences.

    ``min_completeness`` is the gap policy. At 0.85 a sequence may miss up to
    fifteen percent of its cells and still be used; below that it is dropped,
    because a network taught on mostly-interpolated windows learns the
    interpolation.
    """
    if lookback <= 0:
        raise ValueError("lookback must be positive")
    if len(grid) != len(rows):
        raise ValueError("grid and rows must be the same length")

    forecast_index = [columns.index(column) for column in forecast_columns]
    result = SequenceSet(columns=tuple(columns), forecast_columns=tuple(forecast_columns))

    last_start = len(rows) - lookback - horizon_steps
    for start in range(max(0, last_start + 1)):
        end = start + lookback
        window = [list(row) for row in rows[start:end]]
        target_row = rows[end + horizon_steps - 1]
        target = [target_row[index] for index in forecast_index]

        # A sequence whose *target* is missing teaches nothing — the loss would
        # be computed against an invented value. Dropped without argument.
        if any(value is None for value in target):
            continue

        cells = lookback * max(1, len(columns))
        present = sum(1 for row in window for value in row if value is not None)
        completeness = present / cells if cells else 0.0
        if completeness < min_completeness:
            continue

        result.sequences.append(window)
        result.targets.append(list(target))
        result.end_times.append(grid[end - 1])
        result.machine_ids.append(machine_id)
        result.event_ids.append((event_at or {}).get(grid[end - 1]))
        result.completeness.append(completeness)

    return result


def sequence_from_window(
    rows: Sequence[Sequence[float | None]],
    *,
    lookback: int,
    min_completeness: float = 0.7,
) -> list[list[float]] | None:
    """One inference-time sequence, or None when the window is too sparse.

    The threshold is looser than at training. At inference the alternative to a
    slightly sparse sequence is no temporal evidence at all, whereas at
    training the alternative is a cleaner dataset — different trade, different
    number, both stated rather than shared by accident.
    """
    if len(rows) < lookback:
        return None
    window = [list(row) for row in rows[-lookback:]]
    width = max((len(row) for row in window), default=0)
    cells = lookback * max(1, width)
    present = sum(1 for row in window for value in row if value is not None)
    if cells == 0 or present / cells < min_completeness:
        return None
    return dense_sequence(window, width)
