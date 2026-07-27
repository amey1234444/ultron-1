"""Simulated CC/RCC data source (Colab / dev). Replaced by cc_rcc_client.py on
the Raspberry Pi; both feed the same canonical RackModel.
"""

from __future__ import annotations

import random

from .clock import now_us
from .rack_model import Measurement, RackModel, Slot

# slot -> (card type, channels, measurement type, unit, band)
# Dense validation profile:
# - all 12 acquisition slots publish continuously
# - every TEMPERATURE channel is clamped between 7 and 8 degC
# - mixed vibration/speed/pressure channels keep the rack view realistic
_CARDS = {
    1: ("VIBRATION", 2, "VELOCITY_RMS", "mm/s", (1.2, 5.5)),
    2: ("PROCESS", 4, "TEMPERATURE", "degC", (35.0, 78.0)),
    3: ("SPEED", 2, "SPEED", "rpm", (1440.0, 1480.0)),
    4: ("PROCESS", 4, "PRESSURE", "bar", (1.5, 6.2)),
    5: ("PROCESS", 4, "TEMPERATURE", "degC", (35.0, 78.0)),
    6: ("VIBRATION", 2, "VELOCITY_RMS", "mm/s", (1.0, 4.8)),
    7: ("SPEED", 2, "SPEED", "rpm", (960.0, 1020.0)),
    8: ("PROCESS", 4, "TEMPERATURE", "degC", (35.0, 78.0)),
    9: ("PROCESS", 4, "PRESSURE", "bar", (2.0, 5.5)),
    10: ("VIBRATION", 2, "VELOCITY_RMS", "mm/s", (0.8, 4.2)),
    11: ("SPEED", 2, "SPEED", "rpm", (720.0, 780.0)),
    12: ("PROCESS", 4, "TEMPERATURE", "degC", (35.0, 78.0)),
}


class Simulator:
    def __init__(self, rack_id: str) -> None:
        self.rack = RackModel(rack_id=rack_id, snapshot_revision=1)
        for slot_id in range(1, 13):
            card = _CARDS.get(slot_id)
            self.rack.slots.append(
                Slot(
                    slot_number=slot_id,
                    presence="PRESENT" if card else "EMPTY",
                    online_state="ONLINE" if card else "UNKNOWN",
                    card_type=card[0] if card else None,
                )
            )
        self._sequence = 0
        self._values: dict[tuple[int, int], float] = {}
        for slot_id, (_, channels, _, _, band) in _CARDS.items():
            for channel_id in range(1, channels + 1):
                self._values[(slot_id, channel_id)] = random.uniform(*band)

    def sample(self) -> list[Measurement]:
        """One random-walk sample per configured channel."""
        records: list[Measurement] = []
        ts = now_us()
        for slot_id, (card_type, channels, measurement_type, unit, band) in _CARDS.items():
            lo, hi = band
            step = (hi - lo) / 20.0
            for channel_id in range(1, channels + 1):
                key = (slot_id, channel_id)
                value = self._values[key] + random.uniform(-step, step)
                self._values[key] = max(lo, min(hi, value))
                self._sequence += 1
                records.append(
                    Measurement(
                        slot_number=slot_id,
                        channel_id=channel_id,
                        point_id=slot_id * 100_000 + channel_id * 100 + 1,
                        card_type=card_type,
                        measurement_type=measurement_type,
                        value=self._values[key],
                        unit=unit,
                        quality="GOOD",
                        freshness="FRESH",
                        source_timestamp_us=ts,
                        source_sequence=self._sequence,
                    )
                )
        return records
