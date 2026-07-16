# Ultron MQTT ingest service

Long-running backend MQTT 5 subscriber (Phases D + E of the handover):

```
Gateway → EMQX → this service → PostgreSQL → Next.js /api/live → frontend
```

Per-message pipeline: topic parse → JSON parse → schema validation (v1.1
contract, `contracts/json-schema/`) → topic/payload identity validation →
gateway/rack/IP binding → `message_id` dedup (QoS 1) → handler → DB →
optional WebSocket broadcast.

## Deploying on Render (free plan, no card)

Render Blueprints and Background Workers require payment details, so the
service deploys as a **free Web Service** instead: when `PORT` is set (Render
injects it), `index.js` serves a health endpoint on `/healthz` via
`health.js`, and a scheduled GitHub Action pings it every 10 minutes so the
free instance never spins down.

1. Render dashboard → New + → **Web Service** → connect this repo:
   - Instance type: **Free**; Branch: `1783405085-nextjs-vercel-auth`;
     Root directory: empty (repo root — the worker reads `contracts/` and
     `supabase/migrations/` via `../../`)
   - Build: `cd services/mqtt-ingest && npm install`
   - Start: `cd services/mqtt-ingest && node index.js`
2. Set env vars: `MQTT_URL`, `MQTT_USERNAME`, `MQTT_PASSWORD`,
   `DATABASE_URL`, plus `MQTT_CLIENT_ID=ultron-backend-ingress-01`,
   `MQTT_REJECT_UNAUTHORIZED=1`, `STALE_AFTER_S=15`.
3. Add two GitHub repository secrets:
   - `RENDER_DEPLOY_HOOK_MQTT_INGEST` — the service's Deploy Hook URL
     (Settings → Deploy Hook), used by `deploy-mqtt-ingest.yml` to redeploy on
     every push to `main`, `master`, `dev/*`, `feature/*`, or
     `1783405085-nextjs-vercel-auth`.
   - `MQTT_INGEST_URL` — the service URL (`https://...onrender.com`), used by
     `keepalive-mqtt-ingest.yml` for the 10-minute keep-alive ping.

Render builds the single branch configured on the service; switch it in the
Render dashboard if another branch should be deployed.

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
