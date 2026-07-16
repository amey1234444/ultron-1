from ultron_gateway import topics


def test_topic_tree_matches_contract():
    assert topics.status("GW-001") == "ultron/v1/gateways/GW-001/status"
    assert topics.inventory("GW-001", 1) == "ultron/v1/gateways/GW-001/racks/1/inventory"
    assert topics.telemetry("GW-001", 1) == "ultron/v1/gateways/GW-001/racks/1/telemetry"
    assert topics.event("GW-001", 1, "alarm") == "ultron/v1/gateways/GW-001/racks/1/events/alarm"
    assert topics.slot("GW-001", 1, 3, "health") == "ultron/v1/gateways/GW-001/racks/1/slots/3/health"
    assert topics.command_request_filter("GW-001") == "ultron/v1/gateways/GW-001/racks/+/commands/request"
    assert topics.command_response("GW-001", 1) == "ultron/v1/gateways/GW-001/racks/1/commands/response"


def test_no_ip_in_topics():
    for topic in (topics.status("GW-001"), topics.telemetry("GW-001", 1)):
        assert "192." not in topic
