"""Direct WebSocket transport for gateway -> backend ingest.

The message contract stays the same as MQTT: every publish sends the canonical
topic and envelope, but the transport is a long-lived WebSocket to Render.
"""

from __future__ import annotations

import json
import ssl
import threading
from typing import Any, Callable

from .config import Config


class DirectWebSocketClient:
    publish_when_disconnected = True

    def __init__(self, config: Config) -> None:
        self._config = config
        self._socket: Any | None = None
        self._lock = threading.Lock()

    def subscribe_commands(self, _topic_filter: str, _handler: Callable[[str, dict[str, Any]], None]) -> None:
        # Direct ingest is telemetry-first. Commands can be added as a second
        # backend -> gateway WebSocket channel without changing publishers.
        return

    def _headers(self) -> list[str]:
        if not self._config.direct_ws_token:
            return []
        return [f"Authorization: Bearer {self._config.direct_ws_token}"]

    def _connect_locked(self, timeout_s: float = 30.0) -> None:
        if self._socket is not None:
            return
        try:
            import websocket
        except ImportError as exc:
            raise RuntimeError("websocket-client is required for GATEWAY_TRANSPORT=websocket") from exc

        sslopt = {"cert_reqs": ssl.CERT_REQUIRED}
        self._socket = websocket.create_connection(
            self._config.direct_ws_url,
            timeout=timeout_s,
            header=self._headers(),
            sslopt=sslopt,
        )

    def connect(self, timeout_s: float = 30.0) -> None:
        if not self._config.direct_ws_url:
            raise RuntimeError("DIRECT_WS_URL is required when GATEWAY_TRANSPORT=websocket")
        with self._lock:
            self._connect_locked(timeout_s)

    @property
    def connected(self) -> bool:
        return self._socket is not None

    @property
    def telemetry_qos(self) -> int:
        # The direct transport is TCP/WebSocket. The value is kept for publisher
        # compatibility and for deployments that switch back to MQTT.
        return self._config.telemetry_qos

    @property
    def publish_latest_telemetry(self) -> bool:
        return self._config.publish_latest_telemetry

    def publish(self, topic: str, message: dict[str, Any], retain: bool = False, qos: int = 1) -> bool:
        packet = json.dumps({"topic": topic, "message": message, "retain": retain, "qos": qos}, separators=(",", ":"))
        with self._lock:
            try:
                self._connect_locked(timeout_s=10.0)
                self._socket.send(packet)
                return True
            except Exception:
                self._close_locked()
                return False

    def _close_locked(self) -> None:
        if self._socket is None:
            return
        try:
            self._socket.close()
        finally:
            self._socket = None

    def disconnect(self) -> None:
        with self._lock:
            self._close_locked()
