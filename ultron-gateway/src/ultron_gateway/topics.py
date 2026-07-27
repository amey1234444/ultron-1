"""Topic builders for the frozen ultron/v1 tree (contracts/mqtt/topics.yaml).

Identity lives in path segments; the gateway IP never appears in a topic.
"""

from __future__ import annotations

from urllib.parse import quote

PREFIX = "ultron/v1/gateways"


def _segment(value: str) -> str:
    return quote(value, safe="")


def status(gateway_id: str) -> str:
    return f"{PREFIX}/{_segment(gateway_id)}/status"


def topology(gateway_id: str) -> str:
    return f"{PREFIX}/{_segment(gateway_id)}/topology"


def inventory(gateway_id: str, rack_id: str) -> str:
    return f"{PREFIX}/{_segment(gateway_id)}/racks/{_segment(rack_id)}/inventory"


def rack_health(gateway_id: str, rack_id: str) -> str:
    return f"{PREFIX}/{_segment(gateway_id)}/racks/{_segment(rack_id)}/health"


def telemetry(gateway_id: str, rack_id: str) -> str:
    return f"{PREFIX}/{_segment(gateway_id)}/racks/{_segment(rack_id)}/telemetry"


def command_request_filter(gateway_id: str) -> str:
    return f"{PREFIX}/{_segment(gateway_id)}/racks/+/commands/request"


def event(gateway_id: str, rack_id: str, kind: str) -> str:
    return f"{PREFIX}/{_segment(gateway_id)}/racks/{_segment(rack_id)}/events/{kind}"


def command_response(gateway_id: str, rack_id: str) -> str:
    return f"{PREFIX}/{_segment(gateway_id)}/racks/{_segment(rack_id)}/commands/response"
