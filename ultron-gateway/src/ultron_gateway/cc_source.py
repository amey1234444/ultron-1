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
import os
import random
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


class LoopingFixtureSnapshotReader:
    """Replays the tested CC v3 fixture, with each channel's value moving.

    The fixture is one frozen instant of a real rack. Replayed verbatim it
    produces a technically valid feed in which nothing ever changes, so a
    dashboard reading it cannot be told apart from a dashboard that is stuck.
    Every numeric channel therefore random-walks around its recorded value, and
    the alert/danger flags are recomputed from the thresholds already in the
    fixture, so alarm states genuinely come and go.

    Only the value fields move. Card type, sensor, unit and channel identity
    stay exactly as recorded, so rack inventory keeps its revision and the
    workspace mapping does not churn.

    CC_FIXTURE_JITTER is the walk step as a fraction of the seed value per poll
    (default 0.05, so a 72.57 degC channel moves by up to ~3.6 degC a sample and
    the swing is obvious on a trend; 0 restores verbatim replay).
    """

    # How far a channel may wander from its recorded value.
    _DRIFT_LIMIT = 0.30
    # Pull back towards the recorded reading each poll. A pure random walk with
    # a visible step size reaches the drift limit quickly and then hugs it,
    # which reads as another kind of stuck; reverting keeps the movement
    # centred on the real value and continuously visible.
    _REVERSION = 0.12
    # Discrete channels flip state occasionally rather than drifting.
    _DISCRETE_FLIP_CHANCE = 0.03

    def __init__(self, path: str) -> None:
        fixture_path = Path(path)
        if not fixture_path.is_absolute():
            candidates = [
                Path.cwd() / fixture_path,
                Path(__file__).resolve().parents[2] / fixture_path,
            ]
            fixture_path = next((candidate for candidate in candidates if candidate.exists()), candidates[0])
        self._path = fixture_path
        self._frame = json.loads(self._path.read_text(encoding="utf-8"))
        self._jitter = float(os.environ.get("CC_FIXTURE_JITTER", "0.05"))
        # Seeded from the fixture, then walked. Keyed by channel number.
        self._values: dict[int, float] = {}
        for channel in self._frame.get("channels", []) or []:
            number = channel.get("channel")
            raw = channel.get("value_raw")
            if isinstance(number, int) and isinstance(raw, (int, float)):
                self._values[number] = float(raw)

    @staticmethod
    def _is_discrete(channel: dict[str, Any]) -> bool:
        return str(channel.get("unit", "")).lower() == "state" or str(channel.get("card_type", "")).lower() in {
            "digital_input",
            "proximity",
        }

    def _next_raw(self, channel: dict[str, Any], seed: float, current: float) -> float:
        if self._is_discrete(channel):
            if random.random() < self._DISCRETE_FLIP_CHANCE:
                return 0.0 if current >= 0.5 else 1.0
            return current
        magnitude = abs(seed) if seed else 1.0
        step = magnitude * self._jitter
        walked = current + random.uniform(-step, step) + (seed - current) * self._REVERSION
        low = seed - magnitude * self._DRIFT_LIMIT
        high = seed + magnitude * self._DRIFT_LIMIT
        return max(low, min(high, walked))

    @staticmethod
    def _threshold_states(value: float, alert: Any, danger: Any) -> tuple[str, str]:
        """Alarm direction comes from the two thresholds, not from the reading.

        Danger is always further into the fault than alert, so their order says
        which way the alarm points: rising for an RTD (alert 80, danger 90) and
        falling for the pressure channel (alert 3.00, danger 1.50). Reading the
        direction off the current value instead would invert every channel that
        happens to start out already in alarm.
        """
        usable_alert = isinstance(alert, (int, float)) and alert != 0
        usable_danger = isinstance(danger, (int, float)) and danger != 0
        if not usable_alert and not usable_danger:
            return "inactive", "inactive"
        rising = True
        if usable_alert and usable_danger:
            rising = danger >= alert

        def state(threshold: Any, usable: bool) -> str:
            if not usable:
                return "inactive"
            crossed = value >= threshold if rising else value <= threshold
            return "active" if crossed else "inactive"

        return state(alert, usable_alert), state(danger, usable_danger)

    def read(self) -> dict[str, Any] | None:
        frame = json.loads(json.dumps(self._frame))
        if self._jitter <= 0:
            return frame
        for channel in frame.get("channels", []) or []:
            number = channel.get("channel")
            if number not in self._values:
                continue
            seed = float(self._frame_seed(number))
            raw = self._next_raw(channel, seed, self._values[number])
            self._values[number] = raw

            places = channel.get("decimal_places")
            places = places if isinstance(places, int) and places >= 0 else 0
            rounded = int(round(raw))
            channel["value_raw"] = rounded
            scaled = rounded / (10 ** places)
            channel["value_formatted"] = f"{scaled:.{places}f}"
            unit = channel.get("unit")
            if unit:
                channel["value_with_unit"] = f"{channel['value_formatted']} {unit}"

            alert, danger = self._threshold_states(
                rounded, channel.get("alert_value_raw"), channel.get("danger_value_raw")
            )
            channel["alert_status"] = alert
            channel["alert_status_code"] = 1 if alert == "active" else 0
            channel["danger_status"] = danger
            channel["danger_status_code"] = 1 if danger == "active" else 0
        return frame

    def _frame_seed(self, number: int) -> float:
        for channel in self._frame.get("channels", []) or []:
            if channel.get("channel") == number:
                return float(channel.get("value_raw") or 0.0)
        return 0.0

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
        rack_number_map: dict[str, str] | None = None,
        channel_slot_map: dict[int, tuple[int, int]] | None = None,
        fallback_rack_id: str = "1",
        controller_slot_id: int = 13,
        rack_id_pool: tuple[str, ...] | None = None,
    ) -> None:
        self._reader = reader
        self._rack_number_map = rack_number_map or {}
        self._channel_slot_map = channel_slot_map or {}
        self._fallback_rack_id = fallback_rack_id
        self._controller_slot_id = controller_slot_id
        # With no explicit RACK_NUMBER_MAP, CC racks are assigned to the
        # configured RACK_IDS in first-seen order (RACK_IDS=2,3 -> first CC rack
        # is 2, second is 3). The assignment is stable per raw rack name; once
        # the pool is exhausted the exact CC rack name is kept unchanged.
        self._rack_id_pool = tuple(rack_id_pool or ())
        self._auto_map: dict[str, str] = {}
        self._layouts: dict[str, str] = {}
        self._alarms: dict[tuple[str, int, int, str], bool] = {}
        self._revisions: dict[str, int] = {}

    def _rack_overrides(self, frame: dict[str, Any]) -> dict[str, str]:
        # An explicit RACK_NUMBER_MAP always wins and disables auto-assignment.
        if self._rack_number_map or not self._rack_id_pool:
            return self._rack_number_map
        rack_number = str(frame.get("rack_number") or "").strip()
        if rack_number and rack_number not in self._auto_map and len(self._auto_map) < len(self._rack_id_pool):
            self._auto_map[rack_number] = self._rack_id_pool[len(self._auto_map)]
        return self._auto_map

    def poll(self) -> CcSnapshot | None:
        frame = self._reader.read()
        if frame is None:
            return None
        return normalize(
            frame,
            rack_number_map=self._rack_overrides(frame),
            channel_slot_map=self._channel_slot_map,
            fallback_rack_id=self._fallback_rack_id,
            controller_slot_id=self._controller_slot_id,
        )

    def inventory_if_changed(self, snapshot: CcSnapshot) -> dict[str, Any] | None:
        """Retained inventory is republished only when the layout changes."""
        layout = json.dumps(snapshot.slot_payloads, sort_keys=True)
        if self._layouts.get(snapshot.rack_id) == layout:
            return None
        self._layouts[snapshot.rack_id] = layout
        # Revisions must never go backwards: the backend drops older snapshots.
        revision = max(1, self._revisions.get(snapshot.rack_id, 0) + 1)
        self._revisions[snapshot.rack_id] = revision
        return snapshot.inventory_payload(revision)

    def alarm_transitions(self, snapshot: CcSnapshot) -> list[Alarm]:
        """Only ACTIVE/CLEARED edges, so a steady alarm is published once."""
        transitions: list[Alarm] = []
        for alarm in snapshot.alarms:
            key = (snapshot.rack_id, alarm.slot_number, alarm.channel_id, alarm.severity)
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


def build_looping_fixture_reader(path: str) -> SnapshotReader:
    return LoopingFixtureSnapshotReader(path)
