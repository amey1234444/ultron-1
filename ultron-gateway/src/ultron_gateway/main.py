"""Gateway entrypoint — startup sequence per handover §12:

boot id -> gateway_id -> gateway_ip -> sequence -> TLS + Last Will -> connect
-> subscribe commands -> retained ONLINE status -> data source -> retained
inventory -> telemetry loop.

Two data sources feed the same canonical rack model: the simulator (Colab/dev)
and Ultron Gateway v3 CC telemetry (Raspberry Pi), selected with DATA_SOURCE.
"""

from __future__ import annotations

import signal
import time
from typing import Callable

from .cc_source import CcV3Feed, build_looping_fixture_reader, build_reader
from .cc_v3 import CcSnapshot
from .command_consumer import CommandConsumer
from .config import Config
from .envelope import EnvelopeBuilder
from .identity import new_boot_id, resolve_gateway_ip
from .mqtt_client import MqttClient
from .publisher import Publisher
from .sequence import Sequence
from .simulator import Simulator
from .spool import Spool
from . import topics


def _install_signal_handlers(stop: Callable[[], None]) -> None:
    def handle(_sig, _frame) -> None:  # noqa: ANN001
        stop()

    signal.signal(signal.SIGINT, handle)
    signal.signal(signal.SIGTERM, handle)


def run_simulator(config: Config, publisher: Publisher, is_running: Callable[[], bool], status: Callable[[str], None]) -> None:
    sources = {rack_id: Simulator(rack_id) for rack_id in config.rack_ids}
    publisher.topology(
        {
            "source_schema": "ultron.gateway.multi_rack_live_state",
            "source_version": 2,
            "known_racks": len(config.rack_ids),
            "connected_racks": len(config.rack_ids),
            "stale_racks": 0,
            "disconnected_racks": 0,
            "blocked_racks": 0,
            "unidentified_connections": 0,
            "active_tcp_connections": len(config.rack_ids),
            "racks": [{"rack_id": rack_id, "status": "connected", "data_current": True} for rack_id in config.rack_ids],
        }
    )
    for rack_id, source in sources.items():
        publisher.inventory(rack_id, source.rack.inventory_payload())
        publisher.rack_health(rack_id, {"rack_id": rack_id, "status": "connected", "data_current": True, "connection": {}, "telemetry": {"data_current": True, "data_status": "current"}})

    batch_sequence = 0
    last_status = time.monotonic()
    while is_running():
        batch_sequence += 1
        for rack_id, source in sources.items():
            records = [m.to_record() for m in source.sample()]
            publisher.telemetry(
                rack_id,
                {
                    "rack_id": rack_id,
                    "source_schema": "ultron.gateway.multi_rack_live_state",
                    "source_version": 2,
                    "telemetry": {"data_current": True, "data_status": "current"},
                    "slot_count": len(records),
                    "slots": records,
                },
            )
        publisher.replay_spool()
        if time.monotonic() - last_status >= 5:
            status("ONLINE")
            last_status = time.monotonic()
        time.sleep(config.telemetry_interval_s)


def run_cc_v3(config: Config, publisher: Publisher, is_running: Callable[[], bool], status: Callable[[str], None]) -> None:
    """Republish v3 CC frames: retained inventory on layout changes, telemetry
    per frame, edge-triggered alarms, and link health as the gateway state."""
    use_test_loop = config.data_source in {"cc_v3_test_loop", "cc-v3-test-loop", "cc_test_loop", "test_loop"}
    reader = (
        build_looping_fixture_reader(config.cc_v3_test_fixture_path)
        if use_test_loop
        else build_reader(config.cc_v3_path, config.cc_v3_tcp_host, config.cc_v3_tcp_port)
    )
    feed = CcV3Feed(
        reader,
        rack_number_map=config.rack_number_map,
        channel_slot_map=config.channel_slot_map,
        fallback_rack_id=config.primary_rack_id,
        controller_slot_id=config.controller_slot_id,
    )
    source_label = (
        f"looping fixture {config.cc_v3_test_fixture_path}"
        if use_test_loop
        else f"{config.cc_v3_tcp_host}:{config.cc_v3_tcp_port}" if config.cc_v3_tcp_host and config.cc_v3_tcp_port else config.cc_v3_path
    )
    print(f"[cc-v3] reading CC telemetry from {source_label}")

    batch_sequence = 0
    last_status = time.monotonic()
    last_frame_at: float | None = None
    latest: CcSnapshot | None = None
    try:
        while is_running():
            snapshot = feed.poll()
            if snapshot is not None:
                snapshot = feed.complete_snapshot(snapshot)
                latest = snapshot
                inventory = feed.inventory_if_changed(snapshot)
                if inventory is not None:
                    publisher.inventory(snapshot.rack_id, inventory)
                    print(f"[cc-v3] rack {snapshot.rack_number} -> rack_id {snapshot.rack_id}: inventory revision {inventory['snapshot_revision']}")

                batch_sequence += 1
                publisher.rack_health(snapshot.rack_id, snapshot.health_payload())
                publisher.topology(
                    {
                        "source_schema": "ultron.gateway.multi_rack_live_state",
                        "source_version": 2,
                        "source_snapshot_updated_at": snapshot.raw_frame.get("snapshot_updated_at"),
                        "known_racks": 1,
                        "connected_racks": 1 if snapshot.link_connected else 0,
                        "stale_racks": 0 if snapshot.telemetry_fresh else 1,
                        "disconnected_racks": 0 if snapshot.link_connected else 1,
                        "blocked_racks": 0,
                        "unidentified_connections": 0,
                        "active_tcp_connections": 1 if snapshot.link_connected else 0,
                        "racks": [
                            {
                                "rack_id": snapshot.rack_id,
                                "status": "connected" if snapshot.link_connected else "disconnected",
                                "data_current": snapshot.link_connected and snapshot.telemetry_fresh and snapshot.daq_valid,
                            }
                        ],
                    }
                )
                publisher.telemetry(snapshot.rack_id, snapshot.telemetry_payload())
                for alarm in feed.alarm_transitions(snapshot):
                    publisher.event(snapshot.rack_id, "alarm", alarm.to_payload())
                last_frame_at = time.monotonic()

            publisher.replay_spool()
            if time.monotonic() - last_status >= 5:
                fresh = last_frame_at is not None and time.monotonic() - last_frame_at <= config.cc_stale_after_s
                healthy = fresh and latest is not None and latest.link_connected and latest.daq_valid
                status("ONLINE" if healthy else "DEGRADED")
                last_status = time.monotonic()
            time.sleep(config.telemetry_interval_s)
    finally:
        feed.close()


def main() -> None:
    config = Config()
    boot_id = new_boot_id()
    gateway_ip = resolve_gateway_ip(config)
    sequence = Sequence(config.state_dir)
    envelope = EnvelopeBuilder(config.gateway_id, boot_id, gateway_ip, sequence)

    will = envelope.build("ultron.gateway.status", None, {"state": "OFFLINE", "mqtt_state": "DISCONNECTED", "reason": "unexpected_disconnect"})
    client = MqttClient(config, topics.status(config.gateway_id), will)

    spool = Spool(config.state_dir)
    publisher = Publisher(envelope, client, spool)
    consumer = CommandConsumer(publisher, set(config.rack_ids))
    client.subscribe_commands(topics.command_request_filter(config.gateway_id), consumer.handle)

    rack_label = ",".join(str(rack_id) for rack_id in config.rack_ids)
    print(f"[gateway] {config.gateway_id} racks {rack_label} ip {gateway_ip} -> {config.mqtt_host}:{config.mqtt_port} source {config.data_source}")
    client.connect()
    started = time.monotonic()

    def publish_status(state: str) -> None:
        publisher.status(
            {
                "state": "ONLINE" if state == "ONLINE" else "OFFLINE",
                "mqtt_state": "CONNECTED" if client.connected else "DISCONNECTED",
                "uptime_s": int(time.monotonic() - started),
                "source_gateway_state": "running" if state == "ONLINE" else "stopping",
                "rack_summary": {
                    "known_racks": len(config.rack_ids),
                    "connected_racks": len(config.rack_ids) if state == "ONLINE" else 0,
                    "stale_racks": 0,
                    "disconnected_racks": 0 if state == "ONLINE" else len(config.rack_ids),
                    "blocked_racks": 0,
                    "unidentified_connections": 0,
                    "active_tcp_connections": len(config.rack_ids) if state == "ONLINE" else 0,
                },
            }
        )

    publish_status("ONLINE")

    running = True

    def stop() -> None:
        nonlocal running
        running = False

    _install_signal_handlers(stop)

    run = run_cc_v3 if config.data_source in {"cc_v3", "cc-v3", "cc", "cc_v3_test_loop", "cc-v3-test-loop", "cc_test_loop", "test_loop"} else run_simulator
    run(config, publisher, lambda: running, publish_status)

    publish_status("OFFLINE")
    spool.close()
    client.disconnect()


if __name__ == "__main__":
    main()
