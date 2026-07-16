"""Real CC/RCC TCP data source (Raspberry Pi target).

Deliberately unimplemented: the backend-to-gateway hardware link is a later
milestone. It must expose the same interface as Simulator (a RackModel plus
sample() -> list[Measurement]) so main.py can swap it in without touching the
MQTT publisher.
"""

from __future__ import annotations


class CcRccClient:
    def __init__(self, rack_id: int) -> None:
        raise NotImplementedError(
            "CC/RCC TCP client arrives with the Raspberry Pi deployment phase; "
            "use ultron_gateway.simulator.Simulator until then"
        )
