# Ultron ingest service

Long-running backend ingest worker (Phases D + E of the handover). The default
production transport is direct gateway WebSocket on Render; MQTT/EMQX is kept as
an explicit fallback with `INGEST_TRANSPORT=mqtt` or `both`:

```
                                    ┌─ live frame ─→ pg_notify(ultron_live) ─→ /api/live/stream ─→ frontend
Gateway → EMQX → this service ──────┤
                                    └─ queued persistence ─→ PostgreSQL ─→ /api/live/state (snapshot + fallback)
```

Per-message pipeline: topic parse → JSON parse → schema validation (v1.1
contract, `contracts/json-schema/`) → topic/payload identity validation →
**publish live frame + WebSocket broadcast** → queue persistence
(gateway/rack/IP binding → `message_id` dedup (QoS 1) → handler → DB).

Delivery to the UI never waits on the database: everything before the frame is
pure validation, so a reading is on the wire in roughly the time it takes to
parse it. Frames carry no authorization — the browser applies them only for
gateways its persisted snapshot already shows as commissioned — and persistence
keeps full binding, dedup and quarantine semantics.

Persistence jobs are keyed by `kind|gateway|rack`; a queued current-state job
that has not started yet is replaced by the newer frame, so a slow database costs
history resolution rather than liveness. Depth and coalescing are exported as the
`persist_queue_depth` / `persist_coalesced_total` ingest metrics.

## Run

```bash
cd services/mqtt-ingest
npm install
cp .env.example .env   # fill in DIRECT_WS_GATEWAY_SECRET + DATABASE_URL
node --env-file=.env index.js
```

Requires Node 20+. The service creates its own tables (idempotent) from
`supabase/migrations/20260716000000_mqtt_telemetry.sql`.

## Binding rules

- Permanent identity: `gateway_id + rack_id` (`UNIQUE(gateway_id, rack_id)`).
- `gateway_ip` is mandatory verification metadata. When a known workspace
  `real_gateway_id` reports a new IP, the service updates the workspace Gateway IP,
  records it in `gateway_ip_history`, and continues processing the message.
- If that reported gateway IP is already configured on any other active workspace
  rack or gateway, the message is quarantined as an IP conflict before live
  gateway, rack, inventory, telemetry, or event state can update.
- Unknown `gateway_id`s are quarantined and do not update live gateway, rack,
  inventory, telemetry, or event state.
- Topic identity must match the payload envelope or the message is rejected.

## Frontend liveness

The devices strip goes **Online** when a workspace device's Script ID matches a
bound gateway and that gateway reported within `STALE_AFTER_S` (default 15 s).
The displayed Gateway IP follows the bound gateway's `current_ip`. Latest
values come from `measurement_latest`. Racks go **Online** only when that rack
has recent measurement data; registered racks without telemetry remain **Not
Connected**.
