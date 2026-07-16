"""UTC timestamps in the two envelope formats (ISO-8601 + microseconds string)."""

from __future__ import annotations

import time
from datetime import datetime, timezone


def now_us() -> int:
    return time.time_ns() // 1_000


def iso_from_us(us: int) -> str:
    return datetime.fromtimestamp(us / 1_000_000, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")
