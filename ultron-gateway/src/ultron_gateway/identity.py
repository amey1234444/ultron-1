"""Gateway identity: stable gateway_id, per-process boot id, and the mandatory
gateway_ip binding field.

IP resolution priority (handover §10):
  1. explicit configured GATEWAY_IP
  2. IP of the configured primary network interface
  3. fail startup — never guess a random interface
"""

from __future__ import annotations

import socket
import struct
import uuid

from .config import Config


def new_boot_id() -> str:
    return str(uuid.uuid4())


def _interface_ip(interface: str) -> str:
    try:
        import fcntl  # Linux only (Raspberry Pi target)

        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        packed = struct.pack("256s", interface[:15].encode())
        return socket.inet_ntoa(fcntl.ioctl(s.fileno(), 0x8915, packed)[20:24])  # SIOCGIFADDR
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(f"could not resolve IP of interface {interface!r}: {exc}") from exc


def resolve_gateway_ip(config: Config) -> str:
    if config.gateway_ip:
        return config.gateway_ip
    if config.primary_interface:
        return _interface_ip(config.primary_interface)
    raise RuntimeError(
        "no gateway IP configured: set GATEWAY_IP or GATEWAY_PRIMARY_INTERFACE "
        "(refusing to start without a deterministic operational IP)"
    )
