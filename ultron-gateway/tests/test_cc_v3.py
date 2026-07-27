import json
from pathlib import Path

from ultron_gateway.cc_source import CcV3Feed, FileSnapshotReader
from ultron_gateway.cc_v3 import normalize, rack_id_for
from ultron_gateway.validators import validate_envelope
from ultron_gateway.envelope import EnvelopeBuilder
from ultron_gateway.sequence import Sequence

FIXTURE = Path(__file__).parent / "fixtures" / "cc_v3_telemetry.json"


def frame() -> dict:
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


def test_rack_number_maps_to_an_exact_string_rack_id():
    assert rack_id_for("CC_Card_UID1", {}, "fallback") == "CC_Card_UID1"
    assert rack_id_for("001", {}, "fallback") == "001"
    assert rack_id_for("CC_Card_UID1", {"CC_Card_UID1": "Rack-A"}, "fallback") == "Rack-A"


def test_every_channel_becomes_its_own_slot_with_a_canonical_card_type():
    snapshot = normalize(frame())
    assert snapshot is not None
    assert snapshot.rack_id == "CC_Card_UID1"
    assert len(snapshot.measurements) == 12

    by_slot = {m.slot_number: m for m in snapshot.measurements}
    assert sorted(by_slot) == list(range(1, 13))
    assert all(m.channel_id == 1 for m in snapshot.measurements)

    rtd = by_slot[1]
    assert (rtd.card_type, rtd.measurement_type, rtd.value, rtd.unit) == ("PROCESS", "TEMPERATURE", 72.57, "degC")
    assert (rtd.alert_threshold, rtd.danger_threshold) == (80.0, 90.0)
    assert rtd.quality == "GOOD" and rtd.freshness == "FRESH"

    assert by_slot[2].card_type == "SPEED" and by_slot[2].measurement_type == "SPEED"
    assert by_slot[3].card_type == "VIBRATION" and by_slot[3].value == 7.374
    assert by_slot[9].measurement_type == "PROXIMITY_STATE" and by_slot[9].value == 1.0
    assert by_slot[11].card_type == "PROCESS" and by_slot[11].measurement_type == "TEMPERATURE"

    # Every published card type must be one the contract enum accepts.
    assert {m.card_type for m in snapshot.measurements} <= {"VIBRATION", "PROCESS", "SPEED", "COMMUNICATION_CONTROLLER"}


def test_channel_slot_map_can_group_channels_onto_one_card():
    snapshot = normalize(frame(), channel_slot_map={1: (1, 1), 7: (1, 2)})
    assert snapshot is not None
    slot_one = sorted((m.channel_id, m.value) for m in snapshot.measurements if m.slot_number == 1)
    assert slot_one == [(1, 72.57), (2, 82.42)]


def test_inventory_covers_the_slots_supplied_by_the_rack():
    snapshot = normalize(frame())
    assert snapshot is not None
    slots = {slot["slot_number"]: slot for slot in snapshot.inventory_payload(1)["slots"]}
    assert len(slots) == 12
    assert slots[1]["card_type"] == "rtd"


def test_alarms_follow_alert_and_danger_status():
    snapshot = normalize(frame())
    assert snapshot is not None
    active = {(a.slot_number, a.severity) for a in snapshot.alarms if a.state == "ACTIVE"}
    assert active == {(3, "WARNING"), (3, "CRITICAL"), (7, "WARNING")}
    critical = next(a for a in snapshot.alarms if a.slot_number == 3 and a.severity == "CRITICAL")
    assert critical.threshold == 7.1 and critical.unit == "mm/s"
    assert critical.to_payload()["alarm_id"] == "slot3-critical"


def test_disconnected_link_and_invalid_daq_degrade_quality():
    raw = frame()
    raw["daq_valid"] = 0
    raw["daq_state"] = "invalid"
    raw["cc_gateway_communication"]["status"] = "disconnected"
    raw["cc_gateway_communication"]["telemetry_age_seconds"] = 30.0
    raw["channels"][0]["channel_status"] = "fault"

    snapshot = normalize(raw)
    assert snapshot is not None
    assert snapshot.link_connected is False and snapshot.telemetry_fresh is False
    by_slot = {m.slot_number: m for m in snapshot.measurements}
    assert by_slot[1].quality == "BAD"  # channel fault outranks the DAQ state
    assert by_slot[2].quality == "UNCERTAIN"
    assert all(m.freshness == "STALE" for m in snapshot.measurements)
    slots = {slot["slot_number"]: slot for slot in snapshot.inventory_payload(1)["slots"]}
    assert slots[1]["card_type"] == "rtd"


def test_records_and_envelope_satisfy_the_contract():
    snapshot = normalize(frame())
    assert snapshot is not None
    record = snapshot.measurements[0].to_record()
    assert record["source_timestamp_us"].isdigit()
    assert record["slot_number"] == 1
    assert isinstance(record["source_sequence"], int)
    assert record["alert_state"] == "INACTIVE" and record["sensor"] == "pt100"

    builder = EnvelopeBuilder("ultron-gw-demo-01", "7d9933be-744c-49f5-a017-20523b477e7c", "192.168.30.5", Sequence("/tmp/ultron-cc-v3-test"))
    message = builder.build(
        "ultron.rack.telemetry",
        snapshot.rack_id,
        snapshot.telemetry_payload(),
    )
    validate_envelope(message)


def test_feed_republishes_inventory_only_on_layout_changes(tmp_path):
    path = tmp_path / "latest_telemetry.json"
    path.write_text(json.dumps(frame()), encoding="utf-8")
    feed = CcV3Feed(FileSnapshotReader(str(path)))

    first = feed.poll()
    assert first is not None
    initial = feed.inventory_if_changed(first)
    assert initial is not None

    unchanged = frame()
    unchanged["message_sequence"] = 2500
    path.write_text(json.dumps(unchanged), encoding="utf-8")
    second = feed.poll()
    assert second is not None
    assert feed.inventory_if_changed(second) is None

    relayout = frame()
    relayout["channels"] = relayout["channels"][:6]
    path.write_text(json.dumps(relayout), encoding="utf-8")
    third = feed.poll()
    assert third is not None
    changed = feed.inventory_if_changed(third)
    assert changed is not None
    assert changed["snapshot_revision"] > initial["snapshot_revision"] - 1


def test_feed_only_emits_alarm_edges(tmp_path):
    path = tmp_path / "latest_telemetry.json"
    path.write_text(json.dumps(frame()), encoding="utf-8")
    feed = CcV3Feed(FileSnapshotReader(str(path)))

    first = feed.poll()
    assert first is not None
    assert {(a.slot_number, a.severity) for a in feed.alarm_transitions(first)} == {(3, "WARNING"), (3, "CRITICAL"), (7, "WARNING")}

    steady = frame()
    steady["message_sequence"] = 2500
    path.write_text(json.dumps(steady), encoding="utf-8")
    second = feed.poll()
    assert second is not None
    assert feed.alarm_transitions(second) == []

    cleared = frame()
    cleared["channels"][2]["danger_status_code"] = 0
    cleared["channels"][2]["danger_status"] = "inactive"
    path.write_text(json.dumps(cleared), encoding="utf-8")
    third = feed.poll()
    assert third is not None
    transitions = feed.alarm_transitions(third)
    assert [(a.slot_number, a.severity, a.state) for a in transitions] == [(3, "CRITICAL", "CLEARED")]


def test_file_reader_skips_unchanged_and_broken_frames(tmp_path):
    path = tmp_path / "latest_telemetry.json"
    reader = FileSnapshotReader(str(path))
    assert reader.read() is None  # not created yet

    path.write_text(json.dumps(frame()), encoding="utf-8")
    assert reader.read() is not None
    assert reader.read() is None  # unchanged

    path.write_text('{"rack_number": "CC_Card_UID1", "chan', encoding="utf-8")
    assert reader.read() is None  # half-written frame is ignored
