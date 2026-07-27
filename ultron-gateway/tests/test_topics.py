from ultron_gateway import topics


def test_topic_tree_matches_contract():
    assert topics.status("GW-001") == "ultron/v1/gateways/GW-001/status"
    assert topics.topology("GW-001") == "ultron/v1/gateways/GW-001/topology"
    assert topics.inventory("GW-001", "001") == "ultron/v1/gateways/GW-001/racks/001/inventory"
    assert topics.telemetry("GW-001", "Rack-A") == "ultron/v1/gateways/GW-001/racks/Rack-A/telemetry"
    assert topics.event("GW-001", "Rack-A", "alarm") == "ultron/v1/gateways/GW-001/racks/Rack-A/events/alarm"
    assert topics.command_request_filter("GW-001") == "ultron/v1/gateways/GW-001/racks/+/commands/request"
    assert topics.command_response("GW-001", "Rack-A") == "ultron/v1/gateways/GW-001/racks/Rack-A/commands/response"


def test_topic_segments_are_percent_encoded():
    assert topics.telemetry("Gateway Alpha", "rack/A+#% বাংলা") == "ultron/v1/gateways/Gateway%20Alpha/racks/rack%2FA%2B%23%25%20%E0%A6%AC%E0%A6%BE%E0%A6%82%E0%A6%B2%E0%A6%BE/telemetry"


def test_no_ip_in_topics():
    for topic in (topics.status("GW-001"), topics.telemetry("GW-001", "1")):
        assert "192." not in topic
