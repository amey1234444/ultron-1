"""Reading Ultron Gateway v3 telemetry frames on the Raspberry Pi.

v3 writes every normalized frame to `latest_telemetry.json` and can also stream
newline-delimited frames over TCP, so both intakes are supported. The feed keeps
the little bit of state the publisher needs on top of a stateless frame:
inventory is retained and must only be republished when the rack layout changes,
and alarms are edge-triggered rather than one event per frame.
"""

from __future__ import annotations

import hashlib
import json
import socket
from pathlib import Path
from typing import Any, Protocol

from .cc_v3 import Alarm, CcSnapshot, normalize


class SnapshotReader(Protocol):
    def read(self) -> dict[str, Any] | None:
        """Newest frame, or None when nothing new is available."""

    def close(self) -> None: ...


class FileSnapshotReader:
    """Polls v3's `latest_telemetry.json`, ignoring partially written frames."""

    def __init__(self, path: str) -> None:
        self._path = Path(path)
        self._digest: str | None = None

    def read(self) -> dict[str, Any] | None:
        try:
            raw = self._path.read_bytes()
        except OSError:
            return None
        # Content hash rather than mtime: v3 rewrites the file faster than the
        # filesystem timestamp granularity.
        digest = hashlib.sha1(raw).hexdigest()
        if digest == self._digest:
            return None
        try:
            frame = json.loads(raw)
        except json.JSONDecodeError:
            return None  # half-written frame; the next poll picks it up
        self._digest = digest
        return frame if isinstance(frame, dict) else None

    def close(self) -> None:
        return None


class TcpSnapshotReader:
    """Client for a v3 stream of newline-delimited JSON frames."""

    def __init__(self, host: str, port: int, timeout_s: float = 2.0) -> None:
        self._host = host
        self._port = port
        self._timeout_s = timeout_s
        self._socket: socket.socket | None = None
        self._buffer = b""

    def _connect(self) -> socket.socket | None:
        try:
            sock = socket.create_connection((self._host, self._port), timeout=self._timeout_s)
        except OSError as exc:
            print(f"[cc-v3] tcp {self._host}:{self._port} unavailable: {exc}")
            return None
        sock.settimeout(self._timeout_s)
        self._socket = sock
        self._buffer = b""
        return sock

    def read(self) -> dict[str, Any] | None:
        sock = self._socket or self._connect()
        if sock is None:
            return None
        try:
            chunk = sock.recv(65536)
        except socket.timeout:
            return None
        except OSError:
            self.close()
            return None
        if not chunk:
            self.close()
            return None

        self._buffer += chunk
        *lines, self._buffer = self._buffer.split(b"\n")
        newest: dict[str, Any] | None = None
        for line in lines:
            if not line.strip():
                continue
            try:
                frame = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(frame, dict):
                newest = frame  # only the freshest frame is worth publishing
        return newest

    def close(self) -> None:
        if self._socket is not None:
            try:
                self._socket.close()
            finally:
                self._socket = None
        self._buffer = b""


class CcV3Feed:
    def __init__(
        self,
        reader: SnapshotReader,
        *,
        rack_number_map: dict[str, int] | None = None,
        channel_slot_map: dict[int, tuple[int, int]] | None = None,
        fallback_rack_id: int = 1,
        controller_slot_id: int = 13,
    ) -> None:
        self._reader = reader
        self._rack_number_map = rack_number_map or {}
        self._channel_slot_map = channel_slot_map or {}
        self._fallback_rack_id = fallback_rack_id
        self._controller_slot_id = controller_slot_id
        self._layouts: dict[int, str] = {}
        self._alarms: dict[tuple[int, int, int, str], bool] = {}
        self._revisions: dict[int, int] = {}

    def poll(self) -> CcSnapshot | None:
        frame = self._reader.read()
        if frame is None:
            return None
        return normalize(
            frame,
            rack_number_map=self._rack_number_map,
            channel_slot_map=self._channel_slot_map,
            fallback_rack_id=self._fallback_rack_id,
            controller_slot_id=self._controller_slot_id,
        )

    def inventory_if_changed(self, snapshot: CcSnapshot) -> dict[str, Any] | None:
        """Retained inventory is republished only when the layout changes."""
        payload = snapshot.rack.inventory_payload()
        layout = json.dumps(payload["slots"], sort_keys=True)
        if self._layouts.get(snapshot.rack_id) == layout:
            return None
        self._layouts[snapshot.rack_id] = layout
        # Revisions must never go backwards: the backend drops older snapshots.
        revision = max(payload["snapshot_revision"], self._revisions.get(snapshot.rack_id, 0) + 1)
        self._revisions[snapshot.rack_id] = revision
        payload["snapshot_revision"] = revision
        return payload

    def alarm_transitions(self, snapshot: CcSnapshot) -> list[Alarm]:
        """Only ACTIVE/CLEARED edges, so a steady alarm is published once."""
        transitions: list[Alarm] = []
        for alarm in snapshot.alarms:
            key = (snapshot.rack_id, alarm.slot_id, alarm.channel_id, alarm.severity)
            active = alarm.state == "ACTIVE"
            known = self._alarms.get(key)
            if known is None:
                self._alarms[key] = active
                if active:
                    transitions.append(alarm)
                continue
            if known != active:
                self._alarms[key] = active
                transitions.append(alarm)
        return transitions

    def close(self) -> None:
        self._reader.close()


def build_reader(path: str, tcp_host: str | None, tcp_port: int | None) -> SnapshotReader:
    if tcp_host and tcp_port:
        return TcpSnapshotReader(tcp_host, tcp_port)
    return FileSnapshotReader(path)
