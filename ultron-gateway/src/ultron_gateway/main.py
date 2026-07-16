"""Gateway entrypoint — startup sequence per handover §12:

boot id -> gateway_id -> gateway_ip -> sequence -> TLS + Last Will -> connect
-> subscribe commands -> retained ONLINE status -> data source -> retained
inventory -> telemetry loop.
"""

from __future__ import annotations

import signal
import time

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


def main() -> None:
    config = Config()
    boot_id = new_boot_id()
    gateway_ip = resolve_gateway_ip(config)
    sequence = Sequence(config.state_dir)
    envelope = EnvelopeBuilder(config.gateway_id, boot_id, gateway_ip, sequence)

    will = envelope.build("ultron.gateway.status", config.rack_id, {"state": "OFFLINE"})
    client = MqttClient(config, topics.status(config.gateway_id), will)

    spool = Spool(config.state_dir)
    publisher = Publisher(envelope, client, spool)
    consumer = CommandConsumer(publisher, config.rack_id)
    client.subscribe_commands(topics.command_request_filter(config.gateway_id), consumer.handle)

    print(f"[gateway] {config.gateway_id} rack {config.rack_id} ip {gateway_ip} -> {config.mqtt_host}:{config.mqtt_port}")
    client.connect()
    started = time.monotonic()

    def status_payload() -> dict:
        return {
            "state": "ONLINE",
            "mqtt_state": "CONNECTED" if client.connected else "DISCONNECTED",
            "uptime_s": int(time.monotonic() - started),
            "network": {"primary_interface": config.primary_interface or "configured", "primary_ip": gateway_ip},
        }

    publisher.status(config.rack_id, status_payload())

    source = Simulator(config.rack_id)  # Raspberry Pi swaps in CcRccClient here
    publisher.inventory(config.rack_id, source.rack.inventory_payload())

    running = True

    def stop(_sig, _frame) -> None:  # noqa: ANN001
        nonlocal running
        running = False

    signal.signal(signal.SIGINT, stop)
    signal.signal(signal.SIGTERM, stop)

    batch_sequence = 0
    last_status = time.monotonic()
    while running:
        batch_sequence += 1
        publisher.telemetry(config.rack_id, batch_sequence, [m.to_record() for m in source.sample()])
        publisher.replay_spool()
        if time.monotonic() - last_status >= 5:
            publisher.status(config.rack_id, status_payload())
            last_status = time.monotonic()
        time.sleep(config.telemetry_interval_s)

    publisher.status(config.rack_id, {**status_payload(), "state": "OFFLINE"})
    client.disconnect()


if __name__ == "__main__":
    main()
