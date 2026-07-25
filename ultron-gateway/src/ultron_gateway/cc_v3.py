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

TOTAL_SLOTS = 14
ACQUISITION_SLOTS = 12


@dataclass(frozen=True)
class Alarm:
    """A threshold crossing derived from the v3 alert/danger status codes."""

    slot_id: int
    channel_id: int
    severity: str  # WARNING | CRITICAL
    state: str  # ACTIVE | CLEARED
    measurement_type: str
    value: float
    threshold: float | None
    unit: str

    @property
    def alarm_id(self) -> str:
        return f"slot{self.slot_id}-ch{self.channel_id}-{self.severity.lower()}"

    def to_payload(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "alarm_id": self.alarm_id,
            "slot_id": self.slot_id,
            "channel_id": self.channel_id,
            "severity": self.severity,
            "state": self.state,
            "measurement_type": self.measurement_type,
            "value": self.value,
            "unit": self.unit,
            "message": (
                f"{self.measurement_type} on slot {self.slot_id} channel {self.channel_id} "
                f"{'entered' if self.state == 'ACTIVE' else 'left'} {self.severity.lower()}"
            ),
        }
        if self.threshold is not None:
            payload["threshold"] = self.threshold
        return payload


@dataclass(frozen=True)
class CcSnapshot:
    """One v3 frame translated into everything the publisher needs."""

    rack_id: int
    rack_number: str
    rack: RackModel
    measurements: list[Measurement]
    alarms: list[Alarm]
    link_connected: bool
    telemetry_fresh: bool
    mode: str
    daq_valid: bool
    message_sequence: int
    received_at_us: int


def parse_iso_us(value: Any) -> int | None:
    """v3 timestamps are ISO-8601 with offset; the envelope wants microseconds."""
    if not isinstance(value, str) or not value:
        return None
    text = value.replace("Z", "+00:00")
    try:
        return int(datetime.fromisoformat(text).timestamp() * 1_000_000)
    except ValueError:
        return None


def rack_id_for(rack_number: str, overrides: dict[str, int], fallback: int) -> int:
    """Racks are integers end to end; v3 names them (`CC_Card_UID1`)."""
    mapped = overrides.get(rack_number) or overrides.get(rack_number.strip().lower())
    if mapped is not None:
        return mapped
    digits = ""
    for char in reversed(rack_number):
        if char.isdigit():
            digits = char + digits
        elif digits:
            break
    return int(digits) if digits else fallback


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
    rack_number_map: dict[str, int] | None = None,
    channel_slot_map: dict[int, tuple[int, int]] | None = None,
    fallback_rack_id: int = 1,
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

        occupied[slot_id] = Slot(
            slot_id=slot_id,
            presence="PRESENT",
            online_state="ONLINE" if channel_status == "ok" and link_connected else "OFFLINE",
            card_type=card_type,
        )
        measurements.append(
            Measurement(
                slot_id=slot_id,
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
                    slot_id=slot_id,
                    channel_id=channel_id,
                    severity=severity,
                    state="ACTIVE" if active else "CLEARED",
                    measurement_type=measurement_type,
                    value=value,
                    threshold=threshold,
                    unit=unit,
                )
            )

    for slot_id in range(1, TOTAL_SLOTS + 1):
        if slot_id in occupied:
            rack.slots.append(occupied[slot_id])
        elif slot_id == controller_slot_id:
            rack.slots.append(
                Slot(
                    slot_id=slot_id,
                    presence="PRESENT",
                    online_state="ONLINE" if link_connected else "OFFLINE",
                    card_type="COMMUNICATION_CONTROLLER",
                )
            )
        else:
            rack.slots.append(Slot(slot_id=slot_id, presence="EMPTY"))

    return CcSnapshot(
        rack_id=rack_id,
        rack_number=rack_number,
        rack=rack,
        measurements=measurements,
        alarms=alarms,
        link_connected=link_connected,
        telemetry_fresh=telemetry_fresh,
        mode=str(snapshot.get("mode") or "unknown"),
        daq_valid=daq_valid,
        message_sequence=message_sequence if isinstance(message_sequence, int) else 0,
        received_at_us=received_at_us,
    )
