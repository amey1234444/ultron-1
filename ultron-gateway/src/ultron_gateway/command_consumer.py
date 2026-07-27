"""Backend -> Gateway command consumer (Phase F).

Subscribes to .../racks/+/commands/request and acknowledges with a matching
request_id. Only PING is implemented for now — the full command set arrives
with the backend-to-gateway milestone.
"""

from __future__ import annotations

from typing import Any
from urllib.parse import unquote

from .publisher import Publisher


def _rack_id_from_topic(topic: str) -> str | None:
    parts = topic.split("/")
    try:
        rack_index = parts.index("racks") + 1
    except ValueError:
        return None
    if rack_index >= len(parts):
        return None
    value = unquote(parts[rack_index])
    if not value:
        return None
    return value


class CommandConsumer:
    def __init__(self, publisher: Publisher, rack_ids: set[str]) -> None:
        self._publisher = publisher
        self._rack_ids = rack_ids

    def handle(self, topic: str, request: dict[str, Any]) -> None:
        rack_id = _rack_id_from_topic(topic)
        if rack_id not in self._rack_ids:
            rack_id = sorted(self._rack_ids)[0]
        request_id = request.get("request_id")
        if not isinstance(request_id, str):
            return
        command = request.get("command")
        if command == "PING":
            self._publisher.command_response(rack_id, {"request_id": request_id, "status": "COMPLETED", "result": {"pong": True}})
        else:
            self._publisher.command_response(
                rack_id,
                {"request_id": request_id, "status": "REJECTED", "message": f"unsupported command: {command!r}"},
            )
