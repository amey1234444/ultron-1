import tempfile

from ultron_gateway.spool import Spool


def make_message(i: int) -> dict:
    return {"message_id": f"m-{i}", "replayed": False, "payload": {"n": i}}


def test_spool_replays_in_order_with_replayed_flag():
    with tempfile.TemporaryDirectory() as tmp:
        spool = Spool(tmp)
        for i in range(3):
            spool.push("t/topic", make_message(i))
        assert len(spool) == 3

        sent = []
        assert spool.drain(lambda topic, msg, retain: sent.append(msg) or True) == 3
        assert [m["payload"]["n"] for m in sent] == [0, 1, 2]
        assert all(m["replayed"] is True for m in sent)
        assert len(spool) == 0


def test_spool_stops_on_publish_failure_and_keeps_rest():
    with tempfile.TemporaryDirectory() as tmp:
        spool = Spool(tmp)
        for i in range(3):
            spool.push("t/topic", make_message(i))

        calls = []

        def flaky(topic, msg, retain):
            calls.append(msg)
            return len(calls) < 2  # second publish fails

        assert spool.drain(flaky) == 1
        assert len(spool) == 2
