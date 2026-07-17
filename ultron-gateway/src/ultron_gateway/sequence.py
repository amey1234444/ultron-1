"""Monotonic gateway_sequence counter, persisted across restarts."""

from __future__ import annotations

import os
import threading


class Sequence:
    def __init__(self, state_dir: str) -> None:
        os.makedirs(state_dir, exist_ok=True)
        self._path = os.path.join(state_dir, "gateway_sequence")
        self._lock = threading.Lock()
        self._value = self._load()

    def _load(self) -> int:
        try:
            with open(self._path, encoding="utf-8") as f:
                return int(f.read().strip() or "0")
        except (OSError, ValueError):
            return 0

    def next(self) -> int:
        with self._lock:
            self._value += 1
            tmp = self._path + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                f.write(str(self._value))
            try:
                os.replace(tmp, self._path)
            except PermissionError:
                # Some Windows/AV setups briefly lock the target and reject the
                # atomic replace. The sequence is best-effort persistence, so a
                # direct rewrite is preferable to stopping telemetry.
                with open(self._path, "w", encoding="utf-8") as f:
                    f.write(str(self._value))
            return self._value
