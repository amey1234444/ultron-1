"""SQLite offline spool (handover §24).

Telemetry produced while the broker is unreachable is buffered locally and
replayed after reconnect with the original source timestamps/sequence and
"replayed": true, so the backend deduplicates normally.
"""

from __future__ import annotations

import json
import os
import sqlite3
import threading
from typing import Any


class Spool:
    def __init__(self, state_dir: str) -> None:
        os.makedirs(state_dir, exist_ok=True)
        self._lock = threading.Lock()
        self._db = sqlite3.connect(os.path.join(state_dir, "spool.sqlite3"), check_same_thread=False)
        self._db.execute(
            "CREATE TABLE IF NOT EXISTS spool (id INTEGER PRIMARY KEY AUTOINCREMENT, topic TEXT NOT NULL, message TEXT NOT NULL, retain INTEGER NOT NULL DEFAULT 0)"
        )
        self._db.commit()

    def push(self, topic: str, message: dict[str, Any], retain: bool = False) -> None:
        with self._lock:
            self._db.execute("INSERT INTO spool (topic, message, retain) VALUES (?, ?, ?)", (topic, json.dumps(message), int(retain)))
            self._db.commit()

    def drain(self, publish) -> int:  # noqa: ANN001 - publish(topic, message, retain) -> bool
        """Replays buffered messages in order; stops on the first failure."""
        replayed = 0
        with self._lock:
            rows = self._db.execute("SELECT id, topic, message, retain FROM spool ORDER BY id").fetchall()
            for row_id, topic, message_json, retain in rows:
                message = json.loads(message_json)
                message["replayed"] = True
                if not publish(topic, message, bool(retain)):
                    break
                self._db.execute("DELETE FROM spool WHERE id = ?", (row_id,))
                self._db.commit()
                replayed += 1
        return replayed

    def __len__(self) -> int:
        with self._lock:
            return int(self._db.execute("SELECT COUNT(*) FROM spool").fetchone()[0])
