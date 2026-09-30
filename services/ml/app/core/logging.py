"""Logging for the service, configured once and shaped for reading a run.

`ML_LOG_LEVEL` was read from the environment and used by nothing. The service
answered requests and said nothing about them, so the only way to find out
why a diagnosis came back empty was to reproduce it — which for a condition
that developed over twenty minutes of telemetry is not a thing anybody does
twice.

**One line per stage, key=value.** Not JSON, because these are read by a
person tailing a log during a commissioning visit far more often than they
are shipped to an aggregator, and `grep 'machine=TSE-01'` has to work. Not
prose, because the fields are compared across lines.

**A request id ties the stages together.** A frame arriving every five
seconds per machine interleaves in the log with every other machine's; the id
is what makes one frame's journey through quality, state, eligibility and the
model readable as a sequence rather than as noise.

**INFO is the shape of the run, DEBUG is the detail.** At INFO a frame
produces two lines — what arrived and what was decided — which is followable
in real time. At DEBUG every stage reports, which is what you turn on when
one of those two lines is surprising.
"""

from __future__ import annotations

import logging
import os
import sys
from contextvars import ContextVar
from typing import Any

#: The frame currently being processed, so stage logs can name it without
#: every function in the chain taking a request id it does not otherwise use.
_request_id: ContextVar[str] = ContextVar("ml_request_id", default="-")

_CONFIGURED = False


def configure(level: str | None = None) -> None:
    """Set up the root logger. Idempotent; safe to call per worker."""
    global _CONFIGURED
    if _CONFIGURED:
        return
    resolved = (level or os.environ.get("ML_LOG_LEVEL") or "INFO").upper()
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)-5s %(name)s %(message)s", "%H:%M:%S"))
    root = logging.getLogger("ultron")
    root.handlers = [handler]
    root.setLevel(getattr(logging, resolved, logging.INFO))
    # Uvicorn's access log repeats what the stage logs already say, one line
    # per request, and drowns them at the cadence this service is fed.
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    _CONFIGURED = True


def logger(name: str) -> logging.Logger:
    return logging.getLogger(f"ultron.{name}")


def set_request(request_id: str) -> None:
    _request_id.set(request_id)


def current_request() -> str:
    return _request_id.get()


def fields(**pairs: Any) -> str:
    """`key=value` pairs, with the request id first and None left out.

    Values are rendered without quoting. Everything logged here is an
    identifier, a number or a short enum — a value that needed quoting would
    be a value that belongs in a different field.
    """
    parts = [f"req={_request_id.get()}"]
    for key, value in pairs.items():
        if value is None:
            continue
        if isinstance(value, float):
            parts.append(f"{key}={value:.3f}")
        elif isinstance(value, bool):
            parts.append(f"{key}={'yes' if value else 'no'}")
        else:
            parts.append(f"{key}={value}")
    return " ".join(parts)
