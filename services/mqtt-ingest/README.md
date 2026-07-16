# Ultron MQTT ingest service

Long-running backend MQTT 5 subscriber (Phases D + E of the handover):

```
Gateway → EMQX → this service → PostgreSQL → Next.js /api/live → frontend
```

Per-message pipeline: topic parse → JSON parse → schema validation (v1.1
contract, `contracts/json-schema/`) → topic/payload identity validation →
gateway/rack/IP binding → `message_id` dedup (QoS 1) → handler → DB →
optional WebSocket broadcast.

## Deploying on Render

The repo-root `render.yaml` blueprint defines this worker (builds from the
repo root so `contracts/` and `supabase/migrations/` are available, then
`cd services/mqtt-ingest` for install/start):

1. Render dashboard → New + → **Blueprint** → connect this repo. Render
   creates the `ultron-mqtt-ingest` background worker from `render.yaml`.
2. On the service, fill in the `sync: false` env vars: `MQTT_URL`,
   `MQTT_USERNAME`, `MQTT_PASSWORD`, `DATABASE_URL`.
3. Copy the service's **Deploy Hook** URL (Settings → Deploy Hook) and add it
   as the `RENDER_DEPLOY_HOOK_MQTT_INGEST` GitHub repository secret.

`.github/workflows/deploy-mqtt-ingest.yml` then triggers a Render deploy on
every push to `main`, `master`, `dev/*`, `feature/*`, or
`1783405085-nextjs-vercel-auth` that touches the worker, contracts, or
migrations. Render builds the single branch configured on the service
(`1783405085-nextjs-vercel-auth` per the blueprint); switch it in the Render
dashboard if another branch should be deployed.

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
