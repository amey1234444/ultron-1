"""Gateway configuration, resolved from environment variables.

Credentials are never hard-coded; Colab and the Raspberry Pi use the same
configuration model (env file / exported variables).
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field


@dataclass(frozen=True)
class Config:
    gateway_id: str = field(default_factory=lambda: os.environ.get("GATEWAY_ID", "GW-001"))
    rack_id: int = field(default_factory=lambda: int(os.environ.get("RACK_ID", "1")))
    gateway_ip: str | None = field(default_factory=lambda: os.environ.get("GATEWAY_IP") or None)
    primary_interface: str | None = field(
        default_factory=lambda: os.environ.get("GATEWAY_PRIMARY_INTERFACE") or None
    )

    mqtt_host: str = field(default_factory=lambda: os.environ.get("MQTT_HOST", "localhost"))
    mqtt_port: int = field(default_factory=lambda: int(os.environ.get("MQTT_PORT", "8883")))
    mqtt_use_tls: bool = field(default_factory=lambda: os.environ.get("MQTT_USE_TLS", "1") != "0")
    mqtt_username: str | None = field(default_factory=lambda: os.environ.get("MQTT_USERNAME") or None)
    mqtt_password: str | None = field(default_factory=lambda: os.environ.get("MQTT_PASSWORD") or None)
    mqtt_ca_cert: str | None = field(default_factory=lambda: os.environ.get("MQTT_CA_CERT") or None)

    state_dir: str = field(default_factory=lambda: os.environ.get("GATEWAY_STATE_DIR", "./state"))
    telemetry_interval_s: float = field(
        default_factory=lambda: float(os.environ.get("TELEMETRY_INTERVAL_S", "0.5"))
    )

    @property
    def mqtt_client_id(self) -> str:
        return f"ultron-gw-{self.gateway_id}"
