"""Pre-publish envelope self-check: publishing an invalid envelope is a bug in
the gateway, so it fails loudly rather than letting the backend quarantine it.
"""

from __future__ import annotations

import re
from typing import Any

_IP_RE = re.compile(r"^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$")

_REQUIRED = (
    "schema",
    "schema_version",
    "message_id",
    "gateway_id",
    "gateway_boot_id",
    "gateway_ip",
    "rack_id",
    "gateway_sequence",
    "created_at",
    "created_at_us",
    "replayed",
    "payload",
)


def validate_envelope(message: dict[str, Any]) -> None:
    missing = [key for key in _REQUIRED if key not in message]
    if missing:
        raise ValueError(f"envelope missing fields: {missing}")
    if message["schema_version"] != "1.1":
        raise ValueError("schema_version must be '1.1'")
    if not _IP_RE.match(str(message["gateway_ip"])):
        raise ValueError(f"invalid gateway_ip: {message['gateway_ip']!r}")
    if not isinstance(message["rack_id"], int):
        raise ValueError("rack_id must be an integer")
    if not isinstance(message["payload"], dict):
        raise ValueError("payload must be an object")
