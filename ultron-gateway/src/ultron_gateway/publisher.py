"""Publication path: canonical model -> envelope -> validate -> MQTT (or spool
when disconnected). Retention per contract: status/inventory retained,
telemetry/events not.
"""

from __future__ import annotations

from typing import Any

from .envelope import EnvelopeBuilder
from .mqtt_client import MqttClient
from .spool import Spool
from . import topics
from .validators import validate_envelope


class Publisher:
    def __init__(self, envelope: EnvelopeBuilder, client: MqttClient, spool: Spool) -> None:
        self._envelope = envelope
        self._client = client
        self._spool = spool

    def _send(self, topic: str, message: dict[str, Any], retain: bool) -> None:
        validate_envelope(message)
        if self._client.connected and self._client.publish(topic, message, retain=retain):
            return
        self._spool.push(topic, message, retain=retain)

    def replay_spool(self) -> int:
        if not self._client.connected:
            return 0
        return self._spool.drain(self._client.publish)

    def status(self, rack_id: int, payload: dict[str, Any]) -> None:
        message = self._envelope.build("ultron.gateway.status", rack_id, payload)
        self._send(topics.status(self._envelope.gateway_id), message, retain=True)

    def inventory(self, rack_id: int, payload: dict[str, Any]) -> None:
        message = self._envelope.build("ultron.rack.inventory", rack_id, payload)
        self._send(topics.inventory(self._envelope.gateway_id, rack_id), message, retain=True)

    def telemetry(self, rack_id: int, batch_sequence: int, records: list[dict[str, Any]]) -> None:
        payload = {"batch_sequence": batch_sequence, "record_count": len(records), "records": records}
        message = self._envelope.build("ultron.measurement.batch", rack_id, payload)
        self._send(topics.telemetry(self._envelope.gateway_id, rack_id), message, retain=False)

    def event(self, rack_id: int, kind: str, payload: dict[str, Any]) -> None:
        message = self._envelope.build(f"ultron.event.{kind}", rack_id, payload)
        self._send(topics.event(self._envelope.gateway_id, rack_id, kind), message, retain=False)

    def command_response(self, rack_id: int, payload: dict[str, Any]) -> None:
        message = self._envelope.build("ultron.command.response", rack_id, payload)
        self._send(topics.command_response(self._envelope.gateway_id, rack_id), message, retain=False)
