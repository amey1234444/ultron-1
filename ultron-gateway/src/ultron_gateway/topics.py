"""Topic builders for the frozen ultron/v1 tree (contracts/mqtt/topics.yaml).

Identity lives in path segments; the gateway IP never appears in a topic.
"""

from __future__ import annotations

PREFIX = "ultron/v1/gateways"


def status(gateway_id: str) -> str:
    return f"{PREFIX}/{gateway_id}/status"


def inventory(gateway_id: str, rack_id: int) -> str:
    return f"{PREFIX}/{gateway_id}/racks/{rack_id}/inventory"


def rack_health(gateway_id: str, rack_id: int) -> str:
    return f"{PREFIX}/{gateway_id}/racks/{rack_id}/health"


def slot(gateway_id: str, rack_id: int, slot_id: int, leaf: str) -> str:
    return f"{PREFIX}/{gateway_id}/racks/{rack_id}/slots/{slot_id}/{leaf}"


def telemetry(gateway_id: str, rack_id: int) -> str:
    return f"{PREFIX}/{gateway_id}/racks/{rack_id}/telemetry"


def event(gateway_id: str, rack_id: int, kind: str) -> str:
    return f"{PREFIX}/{gateway_id}/racks/{rack_id}/events/{kind}"


def command_request_filter(gateway_id: str) -> str:
    return f"{PREFIX}/{gateway_id}/racks/+/commands/request"


def command_response(gateway_id: str, rack_id: int) -> str:
    return f"{PREFIX}/{gateway_id}/racks/{rack_id}/commands/response"
