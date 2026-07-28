"""Ultron Gateway v3 CC-card telemetry -> canonical rack model.

v3 emits one normalized JSON snapshot per DAQ frame: a `cc_gateway_communication`
block describing the CC link, a `rack_number`, and a flat `channels` list holding
value/unit/threshold/alert data. The canonical model is rack -> slot -> channel,
and the v3 frame has no slot field, so each v3 channel becomes its own
single-channel card (slot = channel number) unless a channel/slot map overrides
it.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Iterable

from .clock import now_us
from .rack_model import Measurement, RackModel, Slot

# v3 card_type -> the four canonical card types the rack model and the backend
# contract know about. Everything analogue that is neither vibration nor speed
# is a process input.
CARD_TYPES: dict[str, str] = {
    "vibration": "VIBRATION",
    "speed": "SPEED",
    "rtd": "PROCESS",
    "thermocouple": "PROCESS",
    "temperature": "PROCESS",
    "pressure": "PROCESS",
    "current": "PROCESS",
    "voltage": "PROCESS",
    "proximity": "PROCESS",
    "digital_input": "PROCESS",
    "analog_input": "PROCESS",
    "communication_controller": "COMMUNICATION_CONTROLLER",
}

MEASUREMENT_TYPES: dict[str, str] = {
    "vibration": "VELOCITY_RMS",
    "speed": "SPEED",
    "rtd": "TEMPERATURE",
    "thermocouple": "TEMPERATURE",
    "temperature": "TEMPERATURE",
    "pressure": "PRESSURE",
    "current": "CURRENT",
    "voltage": "VOLTAGE",
    "proximity": "PROXIMITY_STATE",
    "digital_input": "DIGITAL_STATE",
    "analog_input": "ANALOG_INPUT",
}

@dataclass(frozen=True)
class Alarm:
    """A threshold crossing derived from the v3 alert/danger status codes."""

    slot_number: int
    channel_id: int
    severity: str  # WARNING | CRITICAL
    state: str  # ACTIVE | CLEARED
    measurement_type: str
    value: float
    threshold: float | None
    unit: str

    @property
    def alarm_id(self) -> str:
        return f"slot{self.slot_number}-{self.severity.lower()}"

    def to_payload(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "alarm_id": self.alarm_id,
            "slot_number": self.slot_number,
            "severity": self.severity,
            "state": self.state,
            "measurement_type": self.measurement_type,
            "value": self.value,
            "unit": self.unit,
            "message": (
                f"{self.measurement_type} on slot {self.slot_number} "
                f"{'entered' if self.state == 'ACTIVE' else 'left'} {self.severity.lower()}"
            ),
        }
        if self.threshold is not None:
            payload["threshold"] = self.threshold
        return payload


@dataclass(frozen=True)
class CcSnapshot:
    """One v3 frame translated into everything the publisher needs."""

    rack_id: str
    rack_number: str
    rack: RackModel
    measurements: list[Measurement]
    slot_payloads: list[dict[str, Any]]
    alarms: list[Alarm]
    link_connected: bool
    telemetry_fresh: bool
    mode: str
    daq_valid: bool
    message_sequence: int
    received_at_us: int
    raw_frame: dict[str, Any]

    def telemetry_meta(self) -> dict[str, Any]:
        return {
            "data_current": self.link_connected and self.telemetry_fresh and self.daq_valid,
            "data_status": "current" if self.link_connected and self.telemetry_fresh and self.daq_valid else "invalid",
            "last_received_at": self.raw_frame.get("received_at"),
            "last_message_sequence": self.raw_frame.get("message_sequence"),
            "last_message_sequence_state": self.raw_frame.get("message_sequence_state"),
            "last_daq_sequence": self.raw_frame.get("daq_sequence"),
            "last_daq_sequence_state": self.raw_frame.get("daq_sequence_state"),
            "mode": self.mode,
            "daq_state": self.raw_frame.get("daq_state"),
            "crc32_hex": self.raw_frame.get("crc32_hex"),
        }

    def health_payload(self) -> dict[str, Any]:
        connection = self.raw_frame.get("connection")
        connection = connection if isinstance(connection, dict) else {}
        link = self.raw_frame.get("cc_gateway_communication")
        link = link if isinstance(link, dict) else {}
        return {
            "rack_id": self.rack_id,
            "status": "connected" if self.link_connected else "disconnected",
            "data_current": self.link_connected and self.telemetry_fresh and self.daq_valid,
            "connection": {
                "status": link.get("status") or connection.get("state"),
                "status_reason": link.get("status_reason"),
                "data_current": self.link_connected and self.telemetry_fresh and self.daq_valid,
                "current_ip": connection.get("client_ip") or link.get("connected_client_ip"),
                "current_port": connection.get("client_port") or link.get("connected_client_port"),
                "last_known_ip": connection.get("client_ip") or link.get("connected_client_ip") or link.get("expected_cc_card_ip"),
                "last_known_port": connection.get("client_port") or link.get("connected_client_port"),
                "connected_at": connection.get("connected_at"),
                "disconnected_at": connection.get("disconnected_at") or connection.get("last_disconnected_at"),
                "last_seen_at": connection.get("last_message_at") or link.get("last_message_at"),
                "last_transport_activity_at": connection.get("last_transport_activity_at") or link.get("last_transport_activity_at"),
                "last_message_at": connection.get("last_message_at") or link.get("last_message_at"),
                "telemetry_age_seconds": link.get("telemetry_age_seconds"),
                "stale_after_seconds": link.get("stale_after_seconds"),
                "last_disconnect_reason": connection.get("last_disconnect_reason") or link.get("last_disconnect_reason"),
                "last_error": connection.get("last_error") or link.get("last_error"),
                "connection_count": connection.get("connection_count"),
                "reconnect_count": connection.get("reconnect_count"),
                "valid_messages": connection.get("valid_messages"),
                "rejected_messages": connection.get("rejected_messages"),
                "current_connection_messages": connection.get("current_connection_messages"),
            },
            "telemetry": self.telemetry_meta(),
            "source_snapshot_updated_at": self.raw_frame.get("snapshot_updated_at"),
        }

    def inventory_payload(self, snapshot_revision: int) -> dict[str, Any]:
        slots = [
            {
                "slot_number": slot["slot_number"],
                **{key: slot[key] for key in ("card_type_code", "card_type", "sensor_code", "sensor", "unit_code", "unit", "decimal_places") if key in slot},
            }
            for slot in self.slot_payloads
        ]
        return {
            "rack_id": self.rack_id,
            "snapshot_revision": snapshot_revision,
            "slot_count": len(slots),
            "slots": slots,
            "source_snapshot_updated_at": self.raw_frame.get("snapshot_updated_at"),
        }

    def telemetry_payload(self) -> dict[str, Any]:
        return {
            "rack_id": self.rack_id,
            "source_schema": "ultron.gateway.multi_rack_live_state",
            "source_version": 2,
            "source_snapshot_updated_at": self.raw_frame.get("snapshot_updated_at"),
            "received_at": self.raw_frame.get("received_at"),
            "telemetry": self.telemetry_meta(),
            "slot_count": len(self.slot_payloads),
            "slots": self.slot_payloads,
        }


def parse_iso_us(value: Any) -> int | None:
    """v3 timestamps are ISO-8601 with offset; the envelope wants microseconds."""
    if not isinstance(value, str) or not value:
        return None
    text = value.replace("Z", "+00:00")
    try:
        return int(datetime.fromisoformat(text).timestamp() * 1_000_000)
    except ValueError:
        return None


def rack_id_for(rack_number: str, overrides: dict[str, str], fallback: str) -> str:
    """Racks are exact strings end to end; no digit extraction or case folding."""
    mapped = overrides.get(rack_number)
    if mapped is not None:
        return mapped
    return rack_number if rack_number else fallback


def card_type_for(card_type: str) -> str:
    return CARD_TYPES.get(card_type.strip().lower(), "PROCESS")


def measurement_type_for(card_type: str, sensor: str, unit: str) -> str:
    key = card_type.strip().lower()
    if key in MEASUREMENT_TYPES:
        return MEASUREMENT_TYPES[key]
    sensor_key = sensor.strip().lower()
    if sensor_key in MEASUREMENT_TYPES:
        return MEASUREMENT_TYPES[sensor_key]
    if key:
        return key.upper()
    return (unit or "VALUE").upper()


def _float(value: Any) -> float | None:
    if isinstance(value, bool):
        return float(value)
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value)
        except ValueError:
            return None
    return None


def channel_value(channel: dict[str, Any]) -> float | None:
    """Prefer the already-scaled string; fall back to raw / 10^decimals."""
    formatted = _float(channel.get("value_formatted"))
    if formatted is not None:
        return formatted
    raw = _float(channel.get("value_raw"))
    if raw is None:
        return None
    decimals = channel.get("decimal_places")
    return raw / (10 ** decimals) if isinstance(decimals, int) and decimals > 0 else raw


def _threshold(channel: dict[str, Any], prefix: str) -> float | None:
    formatted = _float(channel.get(f"{prefix}_value_formatted"))
    if formatted is not None:
        return formatted
    raw = _float(channel.get(f"{prefix}_value_raw"))
    if raw is None:
        return None
    decimals = channel.get("decimal_places")
    return raw / (10 ** decimals) if isinstance(decimals, int) and decimals > 0 else raw


def channel_quality(channel_status: str, daq_valid: bool) -> str:
    if channel_status and channel_status != "ok":
        return "BAD"
    if not daq_valid:
        return "UNCERTAIN"
    return "GOOD"


def slot_for_channel(channel_number: int, overrides: dict[int, tuple[int, int]]) -> tuple[int, int]:
    """Default layout: one single-channel card per v3 channel."""
    mapped = overrides.get(channel_number)
    if mapped is not None:
        return mapped
    return (channel_number, 1)


def normalize(
    snapshot: dict[str, Any],
    *,
    rack_number_map: dict[str, str] | None = None,
    channel_slot_map: dict[int, tuple[int, int]] | None = None,
    fallback_rack_id: str = "1",
    controller_slot_id: int = 13,
) -> CcSnapshot | None:
    """Translate one v3 telemetry frame; returns None when it carries no rack."""
    if not isinstance(snapshot, dict):
        return None
    rack_number = str(snapshot.get("rack_number") or "").strip()
    if not rack_number:
        return None

    rack_number_map = rack_number_map or {}
    channel_slot_map = channel_slot_map or {}

    rack_id = rack_id_for(rack_number, rack_number_map, fallback_rack_id)
    link = snapshot.get("cc_gateway_communication")
    link = link if isinstance(link, dict) else {}
    link_connected = str(link.get("status") or "").lower() == "connected"

    age = _float(link.get("telemetry_age_seconds"))
    stale_after = _float(link.get("stale_after_seconds")) or 5.0
    telemetry_fresh = bool(snapshot.get("telemetry_available", True)) and (age is None or age <= stale_after)

    daq_valid = snapshot.get("daq_valid") == 1 and str(snapshot.get("daq_state") or "valid") == "valid"
    received_at_us = parse_iso_us(snapshot.get("received_at")) or now_us()
    daq_sequence = snapshot.get("daq_sequence")
    message_sequence = snapshot.get("message_sequence")
    source_sequence = daq_sequence if isinstance(daq_sequence, int) else (message_sequence if isinstance(message_sequence, int) else 0)

    rack = RackModel(rack_id=rack_id, snapshot_revision=max(1, received_at_us // 1_000_000))
    occupied: dict[int, Slot] = {}
    measurements: list[Measurement] = []
    slot_payloads: list[dict[str, Any]] = []
    alarms: list[Alarm] = []

    channels: Iterable[Any] = snapshot.get("channels") or []
    for entry in channels:
        if not isinstance(entry, dict):
            continue
        channel_number = entry.get("channel")
        if not isinstance(channel_number, int):
            continue
        value = channel_value(entry)
        if value is None:
            continue

        slot_id, channel_id = slot_for_channel(channel_number, channel_slot_map)
        raw_card_type = str(entry.get("card_type") or "")
        card_type = card_type_for(raw_card_type)
        sensor = str(entry.get("sensor") or "")
        unit = str(entry.get("unit") or "")
        measurement_type = measurement_type_for(raw_card_type, sensor, unit)
        channel_status = str(entry.get("channel_status") or "ok").lower()
        alert_active = entry.get("alert_status_code") == 1 or str(entry.get("alert_status") or "") == "active"
        danger_active = entry.get("danger_status_code") == 1 or str(entry.get("danger_status") or "") == "active"
        alert_threshold = _threshold(entry, "alert")
        danger_threshold = _threshold(entry, "danger")
        measurement_valid = link_connected and telemetry_fresh and daq_valid and channel_status == "ok"

        slot_payload = {
            key: value
            for key, value in entry.items()
            if key
            in {
                "data_status",
                "channel_status_code",
                "channel_status",
                "card_type_code",
                "card_type",
                "sensor_code",
                "sensor",
                "unit_code",
                "unit",
                "decimal_places",
                "value_raw",
                "value_formatted",
                "value_with_unit",
                "alert_value_raw",
                "alert_value_formatted",
                "alert_with_unit",
                "danger_value_raw",
                "danger_value_formatted",
                "danger_with_unit",
                "alert_status_code",
                "alert_status",
                "danger_status_code",
                "danger_status",
            }
        }
        slot_payload.update(
            {
                "slot_number": slot_id,
                "channel_id": channel_id,
                "data_status": "current" if measurement_valid else "invalid",
                "measurement_valid": measurement_valid,
                "value_display": str(entry.get("value_formatted") or value),
            }
        )
        slot_payloads.append(slot_payload)

        occupied[slot_id] = Slot(
            slot_number=slot_id,
            presence="PRESENT",
            online_state="ONLINE" if channel_status == "ok" and link_connected else "OFFLINE",
            card_type=card_type,
        )
        measurements.append(
            Measurement(
                slot_number=slot_id,
                channel_id=channel_id,
                point_id=slot_id * 100_000 + channel_id * 100 + 1,
                card_type=card_type,
                measurement_type=measurement_type,
                value=value,
                unit=unit,
                quality=channel_quality(channel_status, daq_valid),
                freshness="FRESH" if telemetry_fresh else "STALE",
                source_timestamp_us=received_at_us,
                source_sequence=source_sequence,
                sensor=sensor or None,
                channel_status=channel_status or None,
                alert_threshold=alert_threshold,
                danger_threshold=danger_threshold,
                alert_state="ACTIVE" if alert_active else "INACTIVE",
                danger_state="ACTIVE" if danger_active else "INACTIVE",
            )
        )

        for severity, active, threshold in (
            ("CRITICAL", danger_active, danger_threshold),
            ("WARNING", alert_active, alert_threshold),
        ):
            alarms.append(
                Alarm(
                    slot_number=slot_id,
                    channel_id=channel_id,
                    severity=severity,
                    state="ACTIVE" if active else "CLEARED",
                    measurement_type=measurement_type,
                    value=value,
                    threshold=threshold,
                    unit=unit,
                )
            )

    rack.slots.extend(occupied[slot_id] for slot_id in sorted(occupied))

    return CcSnapshot(
        rack_id=rack_id,
        rack_number=rack_number,
        rack=rack,
        measurements=measurements,
        alarms=alarms,
        slot_payloads=slot_payloads,
        link_connected=link_connected,
        telemetry_fresh=telemetry_fresh,
        mode=str(snapshot.get("mode") or "unknown"),
        daq_valid=daq_valid,
        message_sequence=message_sequence if isinstance(message_sequence, int) else 0,
        received_at_us=received_at_us,
        raw_frame=snapshot,
    )
