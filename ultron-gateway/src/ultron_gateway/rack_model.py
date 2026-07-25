"""Canonical rack model — the seam between the data source (CC/RCC or
simulator) and the MQTT publisher. Only the data source changes between Colab
and the Raspberry Pi; the model and MQTT code stay identical.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class Slot:
    slot_id: int
    presence: str = "EMPTY"  # PRESENT | EMPTY
    online_state: str = "UNKNOWN"  # ONLINE | OFFLINE | UNKNOWN
    card_type: str | None = None  # VIBRATION | PROCESS | SPEED | COMMUNICATION_CONTROLLER


@dataclass
class Measurement:
    slot_id: int
    channel_id: int
    point_id: int
    card_type: str
    measurement_type: str
    value: float
    unit: str
    quality: str
    freshness: str
    source_timestamp_us: int
    source_sequence: int
    configuration_revision: int = 1
    calibration_revision: int = 1
    # Optional per-channel detail a real controller reports alongside the value
    # (the simulator leaves these unset, so the record stays as it was).
    sensor: str | None = None
    channel_status: str | None = None
    alert_threshold: float | None = None
    danger_threshold: float | None = None
    alert_state: str | None = None
    danger_state: str | None = None

    def to_record(self) -> dict[str, Any]:
        record: dict[str, Any] = {
            "slot_id": self.slot_id,
            "channel_id": self.channel_id,
            "point_id": self.point_id,
            "card_type": self.card_type,
            "measurement_type": self.measurement_type,
            "value": round(self.value, 4),
            "unit": self.unit,
            "quality": self.quality,
            "freshness": self.freshness,
            "source_timestamp_us": str(self.source_timestamp_us),
            "source_sequence": self.source_sequence,
            "configuration_revision": self.configuration_revision,
            "calibration_revision": self.calibration_revision,
        }
        optional = {
            "sensor": self.sensor,
            "channel_status": self.channel_status,
            "alert_threshold": self.alert_threshold,
            "danger_threshold": self.danger_threshold,
            "alert_state": self.alert_state,
            "danger_state": self.danger_state,
        }
        record.update({key: value for key, value in optional.items() if value is not None})
        return record


@dataclass
class RackModel:
    rack_id: int
    snapshot_revision: int = 1
    slots: list[Slot] = field(default_factory=list)

    def inventory_payload(self) -> dict[str, Any]:
        return {
            "snapshot_revision": self.snapshot_revision,
            "slots": [
                {
                    "slot_id": s.slot_id,
                    "presence": s.presence,
                    "online_state": s.online_state,
                    **({"card_type": s.card_type} if s.card_type else {}),
                }
                for s in self.slots
            ],
        }
