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


def _rack_ids_from_env() -> tuple[str, ...]:
    raw = os.environ.get("RACK_IDS")
    if raw:
        ids = tuple(part for part in raw.split(",") if part)
        if ids:
            return ids
    return (os.environ.get("RACK_ID", "1"),)


def _rack_number_map_from_env() -> dict[str, str]:
    """`RACK_NUMBER_MAP=CC_Card_UID1=1,CC_Card_UID2=2` — v3 names racks, the
    contract numbers them."""
    mapping: dict[str, str] = {}
    for part in os.environ.get("RACK_NUMBER_MAP", "").split(","):
        name, _, value = part.partition("=")
        if not name or value == "":
            continue
        mapping[name] = value
    return mapping


def _channel_slot_map_from_env() -> dict[int, tuple[int, int]]:
    """`CHANNEL_SLOT_MAP=1=1.1,2=1.2` — override the default one card per v3
    channel when several channels share a physical card."""
    mapping: dict[int, tuple[int, int]] = {}
    for part in os.environ.get("CHANNEL_SLOT_MAP", "").split(","):
        channel, _, target = part.partition("=")
        slot, _, sub_channel = target.partition(".")
        if not channel.strip().isdigit() or not slot.strip().isdigit():
            continue
        mapping[int(channel.strip())] = (
            int(slot.strip()),
            int(sub_channel.strip()) if sub_channel.strip().isdigit() else 1,
        )
    return mapping


@dataclass(frozen=True)
class Config:
    gateway_id: str = field(default_factory=lambda: os.environ.get("GATEWAY_ID", "ultron-gw-demo-01"))
    rack_id: str = field(default_factory=lambda: os.environ.get("RACK_ID", "1"))
    rack_ids: tuple[str, ...] = field(default_factory=_rack_ids_from_env)
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
    mqtt_client_cert: str | None = field(default_factory=lambda: os.environ.get("MQTT_CLIENT_CERT") or None)
    mqtt_client_key: str | None = field(default_factory=lambda: os.environ.get("MQTT_CLIENT_KEY") or None)

    state_dir: str = field(default_factory=lambda: os.environ.get("GATEWAY_STATE_DIR", "./state"))
    telemetry_interval_s: float = field(
        default_factory=lambda: float(os.environ.get("TELEMETRY_INTERVAL_S", "0.5"))
    )

    # Data source: the simulator (Colab/dev) or Ultron Gateway v3 CC telemetry
    # (Raspberry Pi). v3 writes latest_telemetry.json and can stream frames over
    # TCP; CC_V3_TCP_HOST/PORT selects the stream, otherwise the file is polled.
    data_source: str = field(default_factory=lambda: os.environ.get("DATA_SOURCE", "simulator").strip().lower())
    cc_v3_path: str = field(
        default_factory=lambda: os.environ.get("CC_V3_TELEMETRY_PATH", "/home/mtb/Desktop/UltronGateway/latest_telemetry.json")
    )
    cc_v3_test_fixture_path: str = field(
        default_factory=lambda: os.environ.get("CC_V3_TEST_FIXTURE_PATH", "tests/fixtures/cc_v3_telemetry.json")
    )
    cc_v3_tcp_host: str | None = field(default_factory=lambda: os.environ.get("CC_V3_TCP_HOST") or None)
    cc_v3_tcp_port: int | None = field(
        default_factory=lambda: int(os.environ["CC_V3_TCP_PORT"]) if os.environ.get("CC_V3_TCP_PORT") else None
    )
    cc_stale_after_s: float = field(default_factory=lambda: float(os.environ.get("CC_STALE_AFTER_S", "5")))
    controller_slot_id: int = field(default_factory=lambda: int(os.environ.get("CC_CONTROLLER_SLOT", "13")))
    rack_number_map: dict[str, str] = field(default_factory=_rack_number_map_from_env)
    channel_slot_map: dict[int, tuple[int, int]] = field(default_factory=_channel_slot_map_from_env)
    mqtt_payload_format: str = field(default_factory=lambda: os.environ.get("MQTT_PAYLOAD_FORMAT", "v2").strip().lower())

    @property
    def primary_rack_id(self) -> str:
        return self.rack_ids[0]

    @property
    def mqtt_client_id(self) -> str:
        return f"ultron-gw-{self.gateway_id}"
