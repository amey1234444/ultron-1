"""Per-machine rolling window store.

Holds up to ``max_seconds`` of 1 Hz samples per machine. Missing values are stored as NaN and
never imputed here. A long gap (``reset_gap_seconds``) clears the window so that stale history
cannot be forward-filled into current features. Samples newer than the current timestamp are
refused (no future leakage).
"""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field
from datetime import datetime

import numpy as np


@dataclass
class _Buf:
    ts: deque[datetime] = field(default_factory=deque)
    vals: dict[str, deque[float]] = field(default_factory=dict)


class WindowStore:
    def __init__(self, channels: list[str], max_seconds: int = 600, reset_gap_seconds: float = 60.0) -> None:
        self.channels = list(channels)
        self.max_seconds = max_seconds
        self.reset_gap_seconds = reset_gap_seconds
        self._buf: dict[str, _Buf] = {}

    def _b(self, machine_id: str) -> _Buf:
        b = self._buf.get(machine_id)
        if b is None:
            b = _Buf(vals={c: deque() for c in self.channels})
            self._buf[machine_id] = b
        return b

    def reset(self, machine_id: str | None = None) -> None:
        if machine_id is None:
            self._buf.clear()
        else:
            self._buf.pop(machine_id, None)

    def push(self, machine_id: str, ts: datetime, values: dict[str, float | None], quarantined: set[str] | frozenset[str] = frozenset()) -> bool:
        """Append a sample. Returns False (and ignores it) if the sample is not newer than the last."""
        b = self._b(machine_id)
        if b.ts and ts <= b.ts[-1]:
            return False
        if b.ts and (ts - b.ts[-1]).total_seconds() > self.reset_gap_seconds:
            self.reset(machine_id)
            b = self._b(machine_id)
        b.ts.append(ts)
        for c in self.channels:
            v = values.get(c)
            b.vals[c].append(np.nan if v is None or c in quarantined else float(v))
        # evict
        while b.ts and (ts - b.ts[0]).total_seconds() > self.max_seconds:
            b.ts.popleft()
            for c in self.channels:
                b.vals[c].popleft()
        return True

    def length(self, machine_id: str) -> int:
        return len(self._b(machine_id).ts)

    def seconds(self, machine_id: str) -> float:
        b = self._b(machine_id)
        return 0.0 if len(b.ts) < 2 else (b.ts[-1] - b.ts[0]).total_seconds()

    def series(self, machine_id: str, channel: str, seconds: int | None = None) -> tuple[np.ndarray, np.ndarray]:
        """(t_seconds_relative_to_now, values) for the trailing ``seconds`` window."""
        b = self._b(machine_id)
        if not b.ts:
            return np.empty(0), np.empty(0)
        now = b.ts[-1]
        t = np.fromiter(((x - now).total_seconds() for x in b.ts), dtype=float, count=len(b.ts))
        v = np.fromiter(b.vals[channel], dtype=float, count=len(b.ts))
        if seconds is not None:
            m = t >= -seconds
            return t[m], v[m]
        return t, v

    def matrix(self, machine_id: str, channels: list[str], steps: int) -> np.ndarray | None:
        """Last ``steps`` rows as [steps, len(channels)] or None if insufficient history."""
        b = self._b(machine_id)
        if len(b.ts) < steps:
            return None
        cols = [np.fromiter(b.vals[c], dtype=float, count=len(b.ts))[-steps:] for c in channels]
        return np.stack(cols, axis=1)
