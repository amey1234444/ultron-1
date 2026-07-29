# Vercel MQTT Ingestion

This is the legacy broker path. For the brokerless Render WebSocket deployment,
use `docs/direct-websocket-render-vercel.md` instead.

Use this path when you want MQTT ingestion to live in the Vercel application
instead of redeploying/running the standalone `services/mqtt-ingest` worker:

```text
Gateway -> EMQX -> EMQX Webhook/HTTP Action -> Vercel /api/mqtt/ingest -> Supabase -> Frontend
```

Do not run this path and the standalone `mqtt-ingest` worker long-term at the
same time. The `message_id` deduplication protects the database, but duplicate
ingestion wastes requests and makes logs confusing.

Vercel serverless functions are request-driven, so the production-safe design is
for EMQX to keep the MQTT subscription and push each message into the Vercel app
over HTTP. The app still owns validation, binding, deduplication, telemetry
storage, and live-state reads through `src/server/mqttIngest.ts`.

## Vercel Environment

Set this in GitHub repository secrets and/or Vercel Production environment:

```env
MQTT_INGEST_SECRET=generate-a-long-random-secret
# Optional. Vercel Cron sends this as Authorization: Bearer <secret>.
CRON_SECRET=generate-another-long-random-secret
MQTT_STALE_AFTER_S=15
# Session-mode connection string (port 5432) used only for LISTEN/NOTIFY, which
# carries live frames to /api/live/stream. Falls back to DATABASE_URL; Supabase's
# transaction pooler (6543) cannot LISTEN, and the stream then degrades to
# snapshot polling.
LIVE_NOTIFY_DATABASE_URL=postgresql://postgres.PROJECT_REF:PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres?sslmode=require
```

The existing deployment workflow syncs it to Vercel.

## EMQX Rule

Create an EMQX rule for gateway messages:

```sql
SELECT
  id,
  topic,
  payload,
  clientid,
  username,
  peerhost,
  qos,
  json_encode(flags) as flags_json,
  json_encode(headers) as headers_json,
  json_encode(pub_props) as pub_props_json,
  timestamp,
  publish_received_at,
  node,
  json_encode(client_attrs) as client_attrs_json
FROM
  "ultron/v1/gateways/#"
```

## EMQX HTTP Action

Action URL:

```text
https://YOUR-VERCEL-DOMAIN/api/mqtt/ingest
```

Method:

```text
POST
```

Headers:

```text
content-type: application/json
x-ultron-ingest-secret: same value as MQTT_INGEST_SECRET
```

Body:

```json
{
  "id": "${id}",
  "topic": "${topic}",
  "payload": ${payload},
  "clientid": "${clientid}",
  "username": "${username}",
  "peerhost": "${peerhost}",
  "qos": ${qos},
  "flags": ${flags_json},
  "headers": ${headers_json},
  "pub_props": ${pub_props_json},
  "timestamp": ${timestamp},
  "publish_received_at": ${publish_received_at},
  "node": "${node}",
  "client_attrs": ${client_attrs_json}
}
```

The app stores this full webhook object in `mqtt_messages.source_event`. It also
extracts `payload` as the canonical gateway envelope and writes the normalized
gateway, rack, inventory, event, latest telemetry, and history tables.

## Validation

After running the gateway, check Supabase:

```sql
select
  gateway_id,
  rack_id,
  slot_id,
  channel_id,
  measurement_type,
  value,
  unit,
  updated_at,
  now() - updated_at as age
from measurement_latest
where gateway_id = 'GW-001'
  and rack_id = 1
order by slot_id, channel_id;
```

The frontend subscribes to `/api/live/stream`, which pushes each validated
message as a live frame before the write above happens, so rack LEDs and channel
values update as the message arrives rather than after it is persisted. It falls
back to polling `/api/live/state` when the stream cannot be established.

## Browser-Direct MQTT (lowest latency)

The HTTP action above is a *persistence* path: every message costs a serverless
invocation and a set of writes, and nothing the function is slow to accept ever
reaches the UI. For display, the browser can subscribe to the broker itself:

```text
Gateway -> EMQX ─┬─ wss ────────────────────────────────> browser (renders immediately)
                 └─ HTTP action -> /api/mqtt/ingest -> Supabase (history)
```

This is the only way to get MQTT into a Vercel deployment: a function cannot hold
a broker connection open, but the page can. Values then arrive at the gateway's
own publish rate, one broker hop behind the sample, and the database is entirely
off the display path.

Set up a **subscribe-only** broker user (EMQX: Access Control -> Authentication
for the credentials, then Authorization with a rule allowing only `subscribe` on
`ultron/v1/#` and denying publish). Then, in the Vercel Production environment:

```env
MQTT_BROWSER_WS_URL=wss://YOUR-EMQX-HOST:8084/mqtt
MQTT_BROWSER_USERNAME=ultron-ui-readonly
MQTT_BROWSER_PASSWORD=...
```

`/api/live/broker` serves these to authenticated sessions only, and the browser
connects with a per-tab client id. Anything the browser receives is still checked
against the persisted snapshot before it is displayed: `mergeLiveFrame` drops
frames for gateways the database does not list as commissioned, so a rogue
publisher cannot invent a device or resurrect a quarantined one. Snapshots keep
arriving every 5s to reconcile alerts and removals, and never overwrite a reading
that is newer than the persisted one.

Leave `MQTT_BROWSER_WS_URL` unset to keep the UI on `/api/live/stream`.

## Stale Gateway Backstop

The live-state API already reports a gateway as `OFFLINE` when it has not
published within `MQTT_STALE_AFTER_S` seconds, even if the retained MQTT last
will was missed.

For persisted database status, the app exposes:

```text
GET /api/mqtt/stale
Authorization: Bearer <CRON_SECRET or MQTT_INGEST_SECRET>
```

On Vercel Pro/Enterprise, you can register this as a one-minute Vercel Cron. On
Vercel Hobby, do not add a one-minute cron because deployment will fail; the
read-time stale check still keeps the frontend correct.
