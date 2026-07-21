# Ultron MQTT ingest service

Long-running backend MQTT 5 subscriber (Phases D + E of the handover):

```
Gateway → EMQX → this service → PostgreSQL → Next.js /api/live → frontend
```

Per-message pipeline: topic parse → JSON parse → schema validation (v1.1
contract, `contracts/json-schema/`) → topic/payload identity validation →
gateway/rack/IP binding → `message_id` dedup (QoS 1) → handler → DB →
optional WebSocket broadcast.

## Run

```bash
cd services/mqtt-ingest
npm install
cp .env.example .env   # fill in EMQX + DATABASE_URL
node --env-file=.env index.js
```

Requires Node 20+. The service creates its own tables (idempotent) from
`supabase/migrations/20260716000000_mqtt_telemetry.sql`.

## Binding rules

- Permanent identity: `gateway_id + rack_id` (`UNIQUE(gateway_id, rack_id)`).
- `gateway_ip` is mandatory verification metadata. When a known Studio
  `real_gateway_id` reports a new IP, the service updates the Studio Gateway IP,
  records it in `gateway_ip_history`, and continues processing the message.
- If that reported gateway IP is already configured on one of the gateway's
  child racks, the message is quarantined as a rack IP conflict instead of
  updating the gateway IP.
- Unknown `gateway_id`s are quarantined and do not update live gateway, rack,
  inventory, telemetry, or event state.
- Topic identity must match the payload envelope or the message is rejected.

## Frontend liveness

The devices strip goes **Online** when a studio device's Script ID matches a
bound gateway and that gateway reported within `STALE_AFTER_S` (default 15 s).
The displayed Gateway IP follows the bound gateway's `current_ip`. Latest
values come from `measurement_latest`. Racks go **Online** only when that rack
has recent measurement data; registered racks without telemetry remain **Not
Connected**.
