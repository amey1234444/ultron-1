import tempfile

from ultron_gateway.envelope import EnvelopeBuilder
from ultron_gateway.sequence import Sequence
from ultron_gateway.validators import validate_envelope


def make_builder(state_dir: str) -> EnvelopeBuilder:
    return EnvelopeBuilder("GW-001", "7d9933be-744c-49f5-a017-20523b477e7c", "192.168.50.10", Sequence(state_dir))


def test_envelope_has_all_mandatory_fields():
    with tempfile.TemporaryDirectory() as tmp:
        msg = make_builder(tmp).build("ultron.gateway.status", 1, {"state": "ONLINE"})
    validate_envelope(msg)  # raises on failure
    assert msg["gateway_ip"] == "192.168.50.10"
    assert msg["schema_version"] == "1.1"
    assert msg["replayed"] is False
    assert msg["created_at_us"].isdigit()


def test_sequence_is_monotonic_and_persistent():
    with tempfile.TemporaryDirectory() as tmp:
        b = make_builder(tmp)
        first = b.build("ultron.gateway.status", 1, {"state": "ONLINE"})["gateway_sequence"]
        second = b.build("ultron.gateway.status", 1, {"state": "ONLINE"})["gateway_sequence"]
        assert second == first + 1
        # New builder over the same state dir continues, never restarts.
        again = make_builder(tmp).build("ultron.gateway.status", 1, {"state": "ONLINE"})["gateway_sequence"]
        assert again == second + 1


def test_source_controller_is_optional():
    with tempfile.TemporaryDirectory() as tmp:
        b = make_builder(tmp)
        plain = b.build("ultron.measurement.batch", 1, {"records": []})
        assert "source_controller" not in plain
        with_ctrl = b.build("ultron.measurement.batch", 1, {"records": []}, source_controller={"controller_id": 13, "role": "ACTIVE", "epoch": 27})
        assert with_ctrl["source_controller"]["role"] == "ACTIVE"
