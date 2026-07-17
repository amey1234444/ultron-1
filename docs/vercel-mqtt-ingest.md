# Vercel MQTT Ingestion

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
  flags,
  headers,
  pub_props,
  timestamp,
  publish_received_at,
  node,
  client_attrs
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
  "flags": ${flags},
  "headers": ${headers},
  "pub_props": ${pub_props},
  "timestamp": ${timestamp},
  "publish_received_at": ${publish_received_at},
  "node": "${node}",
  "client_attrs": ${client_attrs}
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

The frontend polls `/api/live/state` every second, so rack LEDs should update shortly after rows are written.

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
