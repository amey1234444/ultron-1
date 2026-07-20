"""Gateway configuration, resolved from environment variables.

Credentials are never hard-coded; Colab and the Raspberry Pi use the same
configuration model (env file / exported variables).
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path


def _load_dotenv() -> None:
    candidates = [
        Path.cwd() / ".env",
        Path(__file__).resolve().parents[2] / ".env",
    ]
    for path in candidates:
        if not path.exists():
            continue
        for raw_line in path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value
        return


_load_dotenv()


def _rack_ids_from_env() -> tuple[int, ...]:
    raw = os.environ.get("RACK_IDS")
    if raw:
        ids = tuple(int(part.strip()) for part in raw.split(",") if part.strip())
        if ids:
            return ids
    return (int(os.environ.get("RACK_ID", "1")),)


@dataclass(frozen=True)
class Config:
    gateway_id: str = field(default_factory=lambda: os.environ.get("GATEWAY_ID", "ultron-gw-demo-01"))
    rack_id: int = field(default_factory=lambda: int(os.environ.get("RACK_ID", "1")))
    rack_ids: tuple[int, ...] = field(default_factory=_rack_ids_from_env)
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
    def primary_rack_id(self) -> int:
        return self.rack_ids[0]

    @property
    def mqtt_client_id(self) -> str:
        return f"ultron-gw-{self.gateway_id}"
