"""The single common envelope builder (v1.1).

Every Gateway-originated message is built here so no publisher can forget a
mandatory field — in particular gateway_ip, the network-binding amendment.
"""

from __future__ import annotations

import uuid
from typing import Any

from .clock import iso_from_us, now_us
from .sequence import Sequence

SCHEMA_VERSION = "1.1"


class EnvelopeBuilder:
    def __init__(self, gateway_id: str, gateway_boot_id: str, gateway_ip: str, sequence: Sequence) -> None:
        self.gateway_id = gateway_id
        self.gateway_boot_id = gateway_boot_id
        self.gateway_ip = gateway_ip
        self._sequence = sequence

    def build(
        self,
        schema: str,
        rack_id: int,
        payload: dict[str, Any],
        source_controller: dict[str, Any] | None = None,
        replayed: bool = False,
        created_at_us: int | None = None,
    ) -> dict[str, Any]:
        us = created_at_us if created_at_us is not None else now_us()
        envelope: dict[str, Any] = {
            "schema": schema,
            "schema_version": SCHEMA_VERSION,
            "message_id": str(uuid.uuid4()),
            "gateway_id": self.gateway_id,
            "gateway_boot_id": self.gateway_boot_id,
            "gateway_ip": self.gateway_ip,
            "rack_id": rack_id,
            "gateway_sequence": self._sequence.next(),
            "created_at": iso_from_us(us),
            "created_at_us": str(us),
            "replayed": replayed,
            "payload": payload,
        }
        if source_controller is not None:
            envelope["source_controller"] = source_controller
        return envelope
