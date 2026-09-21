"""Time handling, deliberately explicit.

Two rules the rest of the service depends on.

**Everything is UTC and timezone-aware.** A naive datetime compared against an
aware one raises, and a naive one silently interpreted as local time puts a
window boundary in the wrong place by hours. Parsing rejects naive input by
attaching UTC rather than guessing.

**Windows are measured in seconds, never in rows.** DOC-02 §21 refuses to
declare universal sample rates because the real rate depends on the process and
the source. A "30-sample window" therefore means nothing portable; a
"30-second window" means the same thing on a 1 Hz feed and a 10 Hz one, and
carries its own sample count as a coverage measure.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

UTC = timezone.utc


def now() -> datetime:
    """The current instant, aware and in UTC."""
    return datetime.now(UTC)


def to_utc(value: datetime) -> datetime:
    """Force a datetime into aware UTC, treating naive input as UTC."""
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def parse_timestamp(value: str | datetime | int | float) -> datetime:
    """Parse an ISO-8601 string, epoch number or datetime into aware UTC.

    Epoch numbers are accepted in seconds and milliseconds, disambiguated by
    magnitude: anything past 1e11 is milliseconds, because a seconds value that
    large is the year 5138.
    """
    if isinstance(value, datetime):
        return to_utc(value)
    if isinstance(value, (int, float)):
        seconds = value / 1000.0 if abs(value) > 1e11 else float(value)
        return datetime.fromtimestamp(seconds, tz=UTC)
    text = value.strip()
    if text.endswith("Z"):
        text = f"{text[:-1]}+00:00"
    return to_utc(datetime.fromisoformat(text))


def iso(value: datetime) -> str:
    """ISO-8601 with a trailing Z, the form the TypeScript side emits."""
    return to_utc(value).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def seconds_between(earlier: datetime, later: datetime) -> float:
    return (to_utc(later) - to_utc(earlier)).total_seconds()


def window_start(end: datetime, seconds: float) -> datetime:
    return to_utc(end) - timedelta(seconds=seconds)
