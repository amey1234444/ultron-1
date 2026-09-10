"""The looping fixture must look like a live rack, not a frozen one.

Replayed verbatim it produced a valid feed in which no value ever changed, so a
working dashboard and a stuck one were indistinguishable.
"""

import os

from ultron_gateway.cc_source import build_looping_fixture_reader

FIXTURE = "tests/fixtures/cc_v3_telemetry.json"


def channels(frame):
    return {c["channel"]: c for c in frame["channels"]}


def test_analog_channels_move_between_polls():
    reader = build_looping_fixture_reader(FIXTURE)
    first, second = channels(reader.read()), channels(reader.read())
    analog = [n for n, c in first.items() if c.get("unit") != "state"]
    moved = [n for n in analog if first[n]["value_raw"] != second[n]["value_raw"]]
    assert len(moved) >= len(analog) - 1, f"only {len(moved)} of {len(analog)} analog channels moved"


def test_formatted_value_tracks_raw_and_decimal_places():
    reader = build_looping_fixture_reader(FIXTURE)
    for channel in reader.read()["channels"]:
        places = channel.get("decimal_places") or 0
        expected = f"{channel['value_raw'] / (10 ** places):.{places}f}"
        assert channel["value_formatted"] == expected
        # A blank or "none" display is dropped by the ingest pipeline, so a
        # fluctuating value must never produce one.
        assert channel["value_formatted"].strip().lower() not in {"", "none", "nan"}
        if channel.get("unit"):
            assert channel["value_with_unit"] == f"{channel['value_formatted']} {channel['unit']}"


def test_identity_fields_never_change_so_inventory_does_not_churn():
    reader = build_looping_fixture_reader(FIXTURE)

    def identity(frame):
        return {(c["channel"], c["card_type"], c["sensor"], c.get("unit")) for c in frame["channels"]}

    assert identity(reader.read()) == identity(reader.read())


def test_values_stay_within_a_band_around_the_recorded_reading():
    reader = build_looping_fixture_reader(FIXTURE)
    seed = {n: c["value_raw"] for n, c in channels(reader.read()).items() if c.get("unit") != "state"}
    for _ in range(200):
        for number, channel in channels(reader.read()).items():
            if number not in seed:
                continue
            limit = abs(seed[number]) * 0.35 + 1
            assert abs(channel["value_raw"] - seed[number]) <= limit


def test_alarm_direction_comes_from_the_threshold_pair():
    """Rising alarms (danger above alert) and falling ones (danger below) both
    appear in the fixture; reading direction off the current value would invert
    every channel that starts out already in alarm."""
    reader = build_looping_fixture_reader(FIXTURE)
    fired = set()
    for _ in range(200):
        for channel in reader.read()["channels"]:
            if channel["alert_status"] == "active":
                fired.add(channel["channel"])
            # Pressure: alert 3.00 bar, danger 1.50 -> falling. It sits at
            # ~5.2 bar and must never read as alarmed on the way up.
            if channel["channel"] == 4:
                assert channel["alert_status"] == "inactive"
    # Vibration channel 3 is over both limits in the recorded frame.
    assert 3 in fired


def test_jitter_can_be_switched_off():
    os.environ["CC_FIXTURE_JITTER"] = "0"
    try:
        reader = build_looping_fixture_reader(FIXTURE)
        assert reader.read() == reader.read()
    finally:
        del os.environ["CC_FIXTURE_JITTER"]
