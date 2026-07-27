import tempfile

from ultron_gateway.envelope import EnvelopeBuilder
from ultron_gateway.sequence import Sequence
from ultron_gateway.validators import validate_envelope


def make_builder(state_dir: str) -> EnvelopeBuilder:
    return EnvelopeBuilder("GW-001", "7d9933be-744c-49f5-a017-20523b477e7c", "192.168.50.10", Sequence(state_dir))


def test_envelope_has_all_mandatory_fields():
    with tempfile.TemporaryDirectory() as tmp:
        msg = make_builder(tmp).build("ultron.gateway.status", None, {"state": "ONLINE"})
    validate_envelope(msg)  # raises on failure
    assert msg["gateway_ip"] == "192.168.50.10"
    assert msg["schema_version"] == "2.0"
    assert "rack_id" not in msg
    assert msg["replayed"] is False
    assert msg["created_at_us"].isdigit()


def test_sequence_is_monotonic_and_persistent():
    with tempfile.TemporaryDirectory() as tmp:
        b = make_builder(tmp)
        first = b.build("ultron.gateway.status", None, {"state": "ONLINE"})["gateway_sequence"]
        second = b.build("ultron.gateway.status", None, {"state": "ONLINE"})["gateway_sequence"]
        assert second == first + 1
        # New builder over the same state dir continues, never restarts.
        again = make_builder(tmp).build("ultron.gateway.status", None, {"state": "ONLINE"})["gateway_sequence"]
        assert again == second + 1


def test_source_controller_is_optional():
    with tempfile.TemporaryDirectory() as tmp:
        b = make_builder(tmp)
        plain = b.build("ultron.rack.telemetry", "001", {"rack_id": "001", "slot_count": 0, "slots": []})
        assert plain["rack_id"] == "001"
