"""MQTT 5 client wrapper (paho-mqtt v2): TLS, Last Will, configurable QoS."""

from __future__ import annotations

import json
import ssl
import threading
from typing import Any, Callable

import paho.mqtt.client as mqtt
from paho.mqtt.enums import CallbackAPIVersion

from .config import Config


class MqttClient:
    def __init__(self, config: Config, will_topic: str, will_payload: dict[str, Any]) -> None:
        self._config = config
        self._connected = threading.Event()
        self._on_command: Callable[[str, dict[str, Any]], None] | None = None
        self._command_filter: str | None = None

        self._client = mqtt.Client(
            callback_api_version=CallbackAPIVersion.VERSION2,
            client_id=config.mqtt_client_id,
            protocol=mqtt.MQTTv5,
        )
        if config.mqtt_username:
            self._client.username_pw_set(config.mqtt_username, config.mqtt_password)
        if config.mqtt_use_tls:
            if config.mqtt_ca_cert:
                self._client.tls_set(
                    ca_certs=config.mqtt_ca_cert,
                    certfile=config.mqtt_client_cert,
                    keyfile=config.mqtt_client_key,
                    tls_version=ssl.PROTOCOL_TLS_CLIENT,
                )
            else:
                self._client.tls_set(
                    certfile=config.mqtt_client_cert,
                    keyfile=config.mqtt_client_key,
                    tls_version=ssl.PROTOCOL_TLS_CLIENT,
                )
            self._client.tls_insecure_set(False)

        # Retained Last Will so the backend flips this gateway OFFLINE on an
        # unexpected disconnect (handover §13).
        self._client.will_set(will_topic, json.dumps(will_payload), qos=1, retain=True)

        self._client.on_connect = self._handle_connect
        self._client.on_disconnect = self._handle_disconnect
        self._client.on_message = self._handle_message

    def _handle_connect(self, client, userdata, flags, reason_code, properties) -> None:  # noqa: ANN001
        self._connected.set()
        if self._command_filter:
            client.subscribe(self._command_filter, qos=1)

    def _handle_disconnect(self, client, userdata, flags, reason_code, properties) -> None:  # noqa: ANN001
        self._connected.clear()

    def _handle_message(self, client, userdata, message) -> None:  # noqa: ANN001
        if self._on_command is None:
            return
        try:
            payload = json.loads(message.payload.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            return
        self._on_command(message.topic, payload)

    def subscribe_commands(self, topic_filter: str, handler: Callable[[str, dict[str, Any]], None]) -> None:
        self._command_filter = topic_filter
        self._on_command = handler
        if self._connected.is_set():
            self._client.subscribe(topic_filter, qos=1)

    def connect(self, timeout_s: float = 30.0) -> None:
        self._client.connect(self._config.mqtt_host, self._config.mqtt_port, keepalive=30)
        self._client.loop_start()
        if not self._connected.wait(timeout_s):
            raise RuntimeError(f"MQTT connect timeout ({self._config.mqtt_host}:{self._config.mqtt_port})")

    @property
    def connected(self) -> bool:
        return self._connected.is_set()

    @property
    def telemetry_qos(self) -> int:
        return self._config.telemetry_qos

    @property
    def publish_latest_telemetry(self) -> bool:
        return self._config.publish_latest_telemetry

    def publish(self, topic: str, message: dict[str, Any], retain: bool = False, qos: int = 1) -> bool:
        info = self._client.publish(topic, json.dumps(message), qos=qos, retain=retain)
        return info.rc == mqtt.MQTT_ERR_SUCCESS

    def disconnect(self) -> None:
        self._client.loop_stop()
        self._client.disconnect()
