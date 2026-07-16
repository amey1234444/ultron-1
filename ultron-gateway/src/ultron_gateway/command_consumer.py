"""Backend -> Gateway command consumer (Phase F).

Subscribes to .../racks/+/commands/request and acknowledges with a matching
request_id. Only PING is implemented for now — the full command set arrives
with the backend-to-gateway milestone.
"""

from __future__ import annotations

from typing import Any

from .publisher import Publisher


class CommandConsumer:
    def __init__(self, publisher: Publisher, rack_id: int) -> None:
        self._publisher = publisher
        self._rack_id = rack_id

    def handle(self, topic: str, request: dict[str, Any]) -> None:
        request_id = request.get("request_id")
        if not isinstance(request_id, str):
            return
        command = request.get("command")
        if command == "PING":
            self._publisher.command_response(self._rack_id, {"request_id": request_id, "status": "COMPLETED", "result": {"pong": True}})
        else:
            self._publisher.command_response(
                self._rack_id,
                {"request_id": request_id, "status": "REJECTED", "message": f"unsupported command: {command!r}"},
            )
