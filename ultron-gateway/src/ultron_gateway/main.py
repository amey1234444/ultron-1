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

from .cc_source import CcV3Feed, build_reader
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
    for rack_id, source in sources.items():
        publisher.inventory(rack_id, source.rack.inventory_payload())

    batch_sequence = 0
    last_status = time.monotonic()
    while is_running():
        batch_sequence += 1
        for rack_id, source in sources.items():
            publisher.telemetry(rack_id, batch_sequence, [m.to_record() for m in source.sample()])
        publisher.replay_spool()
        if time.monotonic() - last_status >= 5:
            status("ONLINE")
            last_status = time.monotonic()
        time.sleep(config.telemetry_interval_s)


def run_cc_v3(config: Config, publisher: Publisher, is_running: Callable[[], bool], status: Callable[[str], None]) -> None:
    """Republish v3 CC frames: retained inventory on layout changes, telemetry
    per frame, edge-triggered alarms, and link health as the gateway state."""
    reader = build_reader(config.cc_v3_path, config.cc_v3_tcp_host, config.cc_v3_tcp_port)
    feed = CcV3Feed(
        reader,
        rack_number_map=config.rack_number_map,
        channel_slot_map=config.channel_slot_map,
        fallback_rack_id=config.primary_rack_id,
        controller_slot_id=config.controller_slot_id,
    )
    source_label = f"{config.cc_v3_tcp_host}:{config.cc_v3_tcp_port}" if config.cc_v3_tcp_host and config.cc_v3_tcp_port else config.cc_v3_path
    print(f"[cc-v3] reading CC telemetry from {source_label}")

    batch_sequence = 0
    last_status = time.monotonic()
    last_frame_at: float | None = None
    latest: CcSnapshot | None = None
    try:
        while is_running():
            snapshot = feed.poll()
            if snapshot is not None:
                latest = snapshot
                inventory = feed.inventory_if_changed(snapshot)
                if inventory is not None:
                    publisher.inventory(snapshot.rack_id, inventory)
                    print(f"[cc-v3] rack {snapshot.rack_number} -> rack_id {snapshot.rack_id}: inventory revision {inventory['snapshot_revision']}")

                batch_sequence += 1
                publisher.telemetry(snapshot.rack_id, batch_sequence, [m.to_record() for m in snapshot.measurements])
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

    will = envelope.build("ultron.gateway.status", config.primary_rack_id, {"state": "OFFLINE"})
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
            config.primary_rack_id,
            {
                "state": state,
                "mqtt_state": "CONNECTED" if client.connected else "DISCONNECTED",
                "uptime_s": int(time.monotonic() - started),
                "network": {"primary_interface": config.primary_interface or "configured", "primary_ip": gateway_ip},
            },
        )

    publish_status("ONLINE")

    running = True

    def stop() -> None:
        nonlocal running
        running = False

    _install_signal_handlers(stop)

    run = run_cc_v3 if config.data_source in {"cc_v3", "cc-v3", "cc"} else run_simulator
    run(config, publisher, lambda: running, publish_status)

    publish_status("OFFLINE")
    spool.close()
    client.disconnect()


if __name__ == "__main__":
    main()
