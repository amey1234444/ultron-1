"""The rolling window store.

Everything temporal reads from here: rolling statistics, trends, persistence,
the LSTM's lookback sequence. The existing TypeScript pipeline is stateless and
judges one frame at a time, which is why it can see that a pressure is high and
never that it has been climbing for six minutes. This is the memory that makes
the second statement possible.

Three design points.

**Windows are time-based.** ``window(tag, seconds=120)`` returns what happened
in the last two minutes, whatever the sample rate was, and reports how many
samples that turned out to be. A row-count window silently means different
durations on different machines, and the whole feature set would be
incomparable across a site.

**Only usable values are admitted.** A BAD or MISSING reading is recorded as a
gap, not as a number and not as the previous number. A mean over a
forward-filled outage is a fabrication, and it is exactly the fabrication that
makes a frozen sensor look like a stable process.

**Bounded by construction.** Each series keeps a retention horizon and is
pruned on every append, so a machine that runs for a month does not grow a
month of memory.

The in-memory implementation is the default and is correct for a single
process. ``RedisWindowStore`` exists for the case where inference is spread
across workers or must survive a restart; it has the same interface and the
pipeline never knows which one it has.
"""

from __future__ import annotations

import json
from bisect import bisect_left, bisect_right
from dataclasses import dataclass
from datetime import datetime
from typing import Iterable, Protocol, Sequence

from ..core.config import settings
from ..core.timeutil import iso, parse_timestamp, window_start


@dataclass(frozen=True)
class Sample:
    """One value at one instant, or a recorded gap."""

    at: datetime
    value: float | None

    @property
    def present(self) -> bool:
        return self.value is not None


@dataclass
class Window:
    """A slice of one series, with everything needed to judge its worth.

    ``values`` and ``timestamps`` are materialised once at construction rather
    than recomputed on each access. They are read a dozen times per window by
    the feature families, and as properties they dominated the whole inference
    profile — several million generator steps per frame for data that cannot
    change once the slice is taken.
    """

    tag: str
    seconds: float
    samples: tuple[Sample, ...]
    values: tuple[float, ...] = ()
    timestamps: tuple[datetime, ...] = ()
    count: int = 0
    gap_count: int = 0
    span_seconds: float = 0.0

    def __post_init__(self) -> None:
        present = [sample for sample in self.samples if sample.value is not None]
        self.values = tuple(sample.value for sample in present)  # type: ignore[misc]
        self.timestamps = tuple(sample.at for sample in present)
        self.count = len(present)
        self.gap_count = len(self.samples) - self.count
        self.span_seconds = (
            (self.timestamps[-1] - self.timestamps[0]).total_seconds()
            if self.count >= 2
            else 0.0
        )

    def coverage(self, expected_hz: float) -> float:
        """Fraction of the expected samples that are present.

        The caller supplies the rate rather than the store guessing it, because
        DOC-02 §21 refuses to declare universal sample rates and a guess here
        would quietly decide whether a feature is trustworthy.
        """
        expected = max(1.0, self.seconds * expected_hz)
        return min(1.0, self.count / expected)

    def sufficient(self, *, min_samples: int = 3, min_span_fraction: float = 0.5) -> bool:
        """Whether a statistic over this window is worth computing.

        Both conditions are needed. Enough samples bunched into the last ten
        seconds of a five-minute window describe the last ten seconds, and a
        slope fitted across them is not a five-minute trend.
        """
        if self.count < min_samples:
            return False
        return self.span_seconds >= self.seconds * min_span_fraction


class WindowStore(Protocol):
    """What the pipeline needs from a window store."""

    def append(self, machine_id: str, tag: str, at: datetime, value: float | None) -> None: ...

    def window(self, machine_id: str, tag: str, *, seconds: float, end: datetime | None = None) -> Window: ...

    def latest(self, machine_id: str, tag: str) -> Sample | None: ...

    def sequence(
        self, machine_id: str, tags: Sequence[str], *, seconds: float, end: datetime | None = None
    ) -> "SequenceWindow": ...

    def reset(self, machine_id: str | None = None) -> None: ...


@dataclass(frozen=True)
class SequenceWindow:
    """Several tags over one time span, aligned on a common grid.

    The LSTM's input. Alignment is where this earns its place: signals arrive at
    different rates with different jitter, and a network fed ragged columns
    learns the ragged edges. Each tag is resampled onto the requested grid by
    last-observation-carried-forward *within a bounded staleness*, and a cell
    with nothing fresh enough stays a gap rather than repeating a stale value
    across the whole window.
    """

    tags: tuple[str, ...]
    grid: tuple[datetime, ...]
    rows: tuple[tuple[float | None, ...], ...]
    """One row per grid point, one column per tag, in ``tags`` order."""

    @property
    def length(self) -> int:
        return len(self.grid)

    def completeness(self) -> float:
        cells = self.length * max(1, len(self.tags))
        if cells == 0:
            return 0.0
        present = sum(1 for row in self.rows for cell in row if cell is not None)
        return present / cells

    def complete(self) -> bool:
        return self.completeness() >= 1.0

    def column(self, tag: str) -> tuple[float | None, ...]:
        index = self.tags.index(tag)
        return tuple(row[index] for row in self.rows)


class InMemoryWindowStore:
    """The default store. One ordered list per machine and tag.

    A list rather than a deque, because the dominant operation is not appending
    — it is slicing a time range, which the feature engine does a hundred and
    thirty times per frame. A deque has to be copied to be sliced; a list with a
    lazily advanced head offset is sliced in constant time and amortises the
    pruning over many appends.
    """

    def __init__(self, retention_seconds: int | None = None, max_samples: int = 20_000) -> None:
        self._retention = retention_seconds or settings().window_retention_seconds
        self._max_samples = max_samples
        self._series: dict[tuple[str, str], list[Sample]] = {}
        self._head: dict[tuple[str, str], int] = {}

    def append(self, machine_id: str, tag: str, at: datetime, value: float | None) -> None:
        key = (machine_id, tag)
        series = self._series.setdefault(key, [])
        sample = Sample(at=at, value=value)
        # Out-of-order arrival is rare and must not corrupt the ordering every
        # window slice depends on. Appending is O(1); the insert path is only
        # taken when the clock actually went backwards.
        if series and at < series[-1].at:
            position = bisect_left([entry.at for entry in series], at)
            series.insert(position, sample)
        else:
            series.append(sample)
        self._prune(key, at)

    def _prune(self, key: tuple[str, str], now: datetime) -> None:
        """Advance the head past expired samples, compacting occasionally.

        Compacting on every append would make this O(n); never compacting would
        leak. Rebuilding once the dead prefix is half the list keeps both the
        append and the memory bounded.
        """
        series = self._series[key]
        horizon = window_start(now, self._retention)
        head = self._head.get(key, 0)
        while head < len(series) and series[head].at < horizon:
            head += 1
        if head > len(series) // 2 and head > 64:
            del series[:head]
            head = 0
        if len(series) - head > self._max_samples:
            del series[: len(series) - self._max_samples]
            head = 0
        self._head[key] = head

    def _live(self, key: tuple[str, str]) -> list[Sample]:
        series = self._series.get(key)
        if not series:
            return []
        head = self._head.get(key, 0)
        return series[head:] if head else series

    def window(self, machine_id: str, tag: str, *, seconds: float, end: datetime | None = None) -> Window:
        series = self._live((machine_id, tag))
        if not series:
            return Window(tag=tag, seconds=seconds, samples=())
        finish = end or series[-1].at
        start = window_start(finish, seconds)
        stamps = [sample.at for sample in series]
        lower = bisect_left(stamps, start)
        upper = bisect_right(stamps, finish)
        return Window(tag=tag, seconds=seconds, samples=tuple(series[lower:upper]))

    def latest(self, machine_id: str, tag: str) -> Sample | None:
        series = self._live((machine_id, tag))
        for sample in reversed(series):
            if sample.present:
                return sample
        return None

    def sequence(
        self,
        machine_id: str,
        tags: Sequence[str],
        *,
        seconds: float,
        end: datetime | None = None,
        step_seconds: float = 1.0,
        max_staleness_seconds: float | None = None,
    ) -> SequenceWindow:
        """Align several tags onto a fixed grid for a temporal model."""
        finish = end or self._latest_time(machine_id, tags)
        if finish is None:
            return SequenceWindow(tags=tuple(tags), grid=(), rows=())

        steps = int(seconds // step_seconds)
        grid = tuple(
            window_start(finish, seconds - index * step_seconds) for index in range(steps + 1)
        )
        staleness = max_staleness_seconds if max_staleness_seconds is not None else step_seconds * 3

        columns: list[tuple[float | None, ...]] = []
        for tag in tags:
            series = [sample for sample in self._live((machine_id, tag)) if sample.present]
            columns.append(_resample(series, grid, staleness))

        rows = tuple(tuple(column[index] for column in columns) for index in range(len(grid)))
        return SequenceWindow(tags=tuple(tags), grid=grid, rows=rows)

    def reset(self, machine_id: str | None = None) -> None:
        if machine_id is None:
            self._series.clear()
            self._head.clear()
            return
        for key in [key for key in self._series if key[0] == machine_id]:
            del self._series[key]
            self._head.pop(key, None)

    def _latest_time(self, machine_id: str, tags: Sequence[str]) -> datetime | None:
        stamps = [
            series[-1].at
            for tag in tags
            if (series := self._live((machine_id, tag)))
        ]
        return max(stamps) if stamps else None

    def stats(self) -> dict[str, int]:
        return {
            "series": len(self._series),
            "samples": sum(len(self._live(key)) for key in self._series),
        }


def _resample(
    series: Sequence[Sample], grid: Sequence[datetime], max_staleness_seconds: float
) -> tuple[float | None, ...]:
    """Last observation carried forward, but only while it is fresh.

    The staleness bound is the whole point. Carrying a value forward for two
    seconds across jitter is resampling; carrying it forward for four minutes
    across an outage is inventing data, and the model would learn the invented
    flatness as a real behaviour of the machine.
    """
    if not series:
        return tuple(None for _ in grid)

    stamps = [sample.at for sample in series]
    out: list[float | None] = []
    for point in grid:
        index = bisect_left(stamps, point)
        if index < len(stamps) and stamps[index] == point:
            out.append(series[index].value)
            continue
        if index == 0:
            out.append(None)
            continue
        candidate = series[index - 1]
        age = (point - candidate.at).total_seconds()
        out.append(candidate.value if age <= max_staleness_seconds else None)
    return tuple(out)


class RedisWindowStore:
    """A window store backed by Redis sorted sets.

    Used when inference runs across several workers, or must survive a restart
    without a cold-start gap where no model is eligible. The interface is
    identical to the in-memory store, and the pipeline never knows which it has.

    Redis is an optional dependency: constructing this without ``redis``
    installed raises ``CapabilityUnavailable`` with a reason the health
    endpoint can surface, rather than an ImportError at module import.
    """

    def __init__(self, url: str, retention_seconds: int | None = None, namespace: str = "ultron:win") -> None:
        from ..core.capability import module  # local: keeps redis off the import path

        redis = module("redis")
        self._client = redis.Redis.from_url(url, decode_responses=True)
        self._retention = retention_seconds or settings().window_retention_seconds
        self._namespace = namespace

    def _key(self, machine_id: str, tag: str) -> str:
        return f"{self._namespace}:{machine_id}:{tag}"

    def append(self, machine_id: str, tag: str, at: datetime, value: float | None) -> None:
        key = self._key(machine_id, tag)
        score = at.timestamp()
        payload = json.dumps({"t": iso(at), "v": value})
        pipe = self._client.pipeline()
        pipe.zadd(key, {payload: score})
        pipe.zremrangebyscore(key, "-inf", score - self._retention)
        pipe.expire(key, self._retention * 2)
        pipe.execute()

    def _read(self, machine_id: str, tag: str, start: float, end: float) -> list[Sample]:
        raw = self._client.zrangebyscore(self._key(machine_id, tag), start, end)
        samples: list[Sample] = []
        for item in raw:
            try:
                payload = json.loads(item)
            except json.JSONDecodeError:
                continue
            samples.append(Sample(at=parse_timestamp(payload["t"]), value=payload.get("v")))
        return samples

    def window(self, machine_id: str, tag: str, *, seconds: float, end: datetime | None = None) -> Window:
        finish = end or datetime.now(tz=None).astimezone()
        start = window_start(finish, seconds)
        samples = self._read(machine_id, tag, start.timestamp(), finish.timestamp())
        return Window(tag=tag, seconds=seconds, samples=tuple(samples))

    def latest(self, machine_id: str, tag: str) -> Sample | None:
        raw = self._client.zrange(self._key(machine_id, tag), -1, -1)
        if not raw:
            return None
        payload = json.loads(raw[0])
        return Sample(at=parse_timestamp(payload["t"]), value=payload.get("v"))

    def sequence(
        self,
        machine_id: str,
        tags: Sequence[str],
        *,
        seconds: float,
        end: datetime | None = None,
        step_seconds: float = 1.0,
        max_staleness_seconds: float | None = None,
    ) -> SequenceWindow:
        finish = end
        if finish is None:
            latest = [self.latest(machine_id, tag) for tag in tags]
            stamps = [sample.at for sample in latest if sample is not None]
            if not stamps:
                return SequenceWindow(tags=tuple(tags), grid=(), rows=())
            finish = max(stamps)

        steps = int(seconds // step_seconds)
        grid = tuple(window_start(finish, seconds - index * step_seconds) for index in range(steps + 1))
        staleness = max_staleness_seconds if max_staleness_seconds is not None else step_seconds * 3
        start = window_start(finish, seconds + staleness)

        columns = [
            _resample([s for s in self._read(machine_id, tag, start.timestamp(), finish.timestamp()) if s.present], grid, staleness)
            for tag in tags
        ]
        rows = tuple(tuple(column[index] for column in columns) for index in range(len(grid)))
        return SequenceWindow(tags=tuple(tags), grid=grid, rows=rows)

    def reset(self, machine_id: str | None = None) -> None:
        pattern = f"{self._namespace}:{machine_id or '*'}:*"
        for key in self._client.scan_iter(pattern):
            self._client.delete(key)


def build_window_store() -> WindowStore:
    """The store this deployment is configured for, falling back in the open.

    A Redis URL that will not connect degrades to memory rather than refusing to
    start: losing cross-worker windows costs model eligibility for a few
    minutes, while refusing to start costs the deterministic rules too.
    """
    url = settings().redis_url
    if not url:
        return InMemoryWindowStore()
    try:
        return RedisWindowStore(url)
    except Exception:  # noqa: BLE001 - see docstring; any failure degrades
        return InMemoryWindowStore()


def iter_present(window: Window) -> Iterable[tuple[datetime, float]]:
    for sample in window.samples:
        if sample.value is not None:
            yield sample.at, sample.value
