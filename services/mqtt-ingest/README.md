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
- `gateway_ip` is mandatory verification metadata — an IP change is recorded in
  `gateway_ip_history` (unapproved) without creating a new gateway or rack.
- Unknown `gateway_id`s are registered as `QUARANTINED`, never silently bound,
  unless a studio device is already commissioned with that exact IP.
- Topic identity must match the payload envelope or the message is rejected.

## Frontend liveness

The devices strip goes **Online** when a studio device's IP matches a bound
gateway's `current_ip` and that gateway reported within `STALE_AFTER_S`
(default 15 s). Latest values come from `measurement_latest`.
