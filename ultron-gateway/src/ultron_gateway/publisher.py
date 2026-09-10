"""Publication path: canonical model -> envelope -> validate -> MQTT (or spool
when disconnected). Retention per contract: status/inventory retained,
telemetry/events not.
"""

from __future__ import annotations

import json
import time
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
        self._last_spool_log_at: float | None = None
        self._spooled_since_log = 0

    def _send(self, topic: str, message: dict[str, Any], retain: bool, qos: int = 1) -> None:
        validate_envelope(message)
        can_publish = self._client.connected or getattr(self._client, "publish_when_disconnected", False)
        detail = f"topic={topic} retain={retain} qos={qos} schema={message.get('schema')} message_id={message.get('message_id')}"
        if can_publish and self._client.publish(topic, message, retain=retain, qos=qos):
            print(f"[publish] {detail}", flush=True)
            return
        # Log the outcome, not the intent. This line used to print before the
        # connection was checked, so a gateway that was spooling every single
        # message looked exactly like one that was publishing them.
        self._spool.push(topic, message, retain=retain)
        self._report_spooled(detail)

    # A spooling gateway is normal during an outage and alarming when it is the
    # steady state, so say so once and then at intervals rather than per message.
    _SPOOL_LOG_INTERVAL_S = 10.0

    def _report_spooled(self, detail: str) -> None:
        now = time.monotonic()
        self._spooled_since_log += 1
        if self._last_spool_log_at is not None and now - self._last_spool_log_at < self._SPOOL_LOG_INTERVAL_S:
            return
        self._last_spool_log_at = now
        print(
            f"[spool] NOT PUBLISHED - broker unavailable; buffered {self._spooled_since_log} "
            f"message(s), {len(self._spool)} waiting in total. Last: {detail}",
            flush=True,
        )
        self._spooled_since_log = 0

    def replay_spool(self) -> int:
        can_publish = self._client.connected or getattr(self._client, "publish_when_disconnected", False)
        if not can_publish:
            return 0
        return self._spool.drain(self._client.publish)

    def status(self, payload: dict[str, Any]) -> None:
        message = self._envelope.build("ultron.gateway.status", None, payload)
        self._send(topics.status(self._envelope.gateway_id), message, retain=True)

    def topology(self, payload: dict[str, Any]) -> None:
        message = self._envelope.build("ultron.gateway.topology", None, payload)
        self._send(topics.topology(self._envelope.gateway_id), message, retain=True)

    def rack_health(self, rack_id: str, payload: dict[str, Any]) -> None:
        message = self._envelope.build("ultron.rack.health", rack_id, payload)
        self._send(topics.rack_health(self._envelope.gateway_id, rack_id), message, retain=True)

    def inventory(self, rack_id: str, payload: dict[str, Any]) -> None:
        message = self._envelope.build("ultron.rack.inventory", rack_id, payload)
        self._send(topics.inventory(self._envelope.gateway_id, rack_id), message, retain=True)

    def telemetry(self, rack_id: str, payload: dict[str, Any]) -> None:
        message = self._envelope.build("ultron.rack.telemetry", rack_id, payload)
        qos = max(0, min(1, self._client.telemetry_qos))
        self._send(topics.telemetry(self._envelope.gateway_id, rack_id), message, retain=False, qos=qos)
        if self._client.publish_latest_telemetry:
            self._send(topics.telemetry_latest(self._envelope.gateway_id, rack_id), message, retain=True, qos=qos)

    def event(self, rack_id: str, kind: str, payload: dict[str, Any]) -> None:
        message = self._envelope.build(f"ultron.event.{kind}", rack_id, payload)
        self._send(topics.event(self._envelope.gateway_id, rack_id, kind), message, retain=False)

    def command_response(self, rack_id: str, payload: dict[str, Any]) -> None:
        message = self._envelope.build("ultron.command.response", rack_id, payload)
        self._send(topics.command_response(self._envelope.gateway_id, rack_id), message, retain=False)
