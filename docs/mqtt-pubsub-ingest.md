# MQTT: the end-to-end pub/sub path

Everything between a rack and the browser canvas is a publication onto a topic
somebody is subscribed to. This document is the reference for that path: the
shape of the tree, who publishes and subscribes where, what each hop guarantees,
how to configure both ends, and what to look at when a reading does not appear.

- Ingest code: [`src/server/ingest/`](../src/server/ingest)
- Gateway code: [`ultron-gateway/src/ultron_gateway/`](../ultron-gateway/src/ultron_gateway)
- Contract: [`contracts/mqtt/topics.yaml`](../contracts/mqtt/topics.yaml),
  [`contracts/json-schema/`](../contracts/json-schema)

> **Contract drift, on purpose.** The files in `contracts/` describe the v1.1
> tree. What is actually enforced is v2.0 current-state: `schema_version` must be
> `"2.0"`, telemetry carries `ultron.rack.telemetry` rather than
> `ultron.measurement.batch`, and `gateways/{gw}/topology` was added. Where this
> document and `contracts/` disagree, this document describes the running code —
> [`validate.mjs`](../src/server/ingest/validate.mjs) is the authority.

---

## 1. Why pub/sub, and not HTTP

The path used to be half and half: the gateway published to EMQX, and EMQX
called the application over HTTP (an EMQX HTTP Action into `/api/mqtt/ingest`).
That works until you ask three questions.

**Who can reach whom?** A gateway sits on a plant network behind NAT. Nothing on
the internet can open a connection to it. An HTTP ingest endpoint solves this in
one direction only — data can come up, but no command can go down, because going
down means dialling the gateway. With pub/sub both sides dial *out* to the
broker and the broker matches them up, so control and telemetry use the same
route in opposite directions.

**What happens when a hop is down?** An HTTP POST that fails is a message that
has to be retried by the sender or lost. A broker holds QoS 1 messages for a
disconnected subscriber and the gateway spools locally when the broker itself is
unreachable, so an outage costs latency rather than data.

**Who pays for fan-out?** With HTTP, every new consumer is another integration
the broker has to be configured for. With pub/sub, a consumer subscribes and the
broker copies. Adding the browser as a consumer cost one WebSocket, not a second
ingest endpoint.

The whole path is now:

```text
┌────────────┐   MQTT publish    ┌────────┐   MQTT subscribe   ┌───────────────┐
│  gateway   │ ────────────────▶ │  EMQX  │ ─────────────────▶ │  Next.js app  │
│ (Raspberry │                   │        │                    │  + ingest     │
│  Pi, plant)│ ◀──────────────── │        │ ◀───────────────── │  (Render)     │
└────────────┘   MQTT subscribe  └────────┘   MQTT publish     └───────┬───────┘
                 (commands)                   (commands)               │
                                                                       │ WebSocket
                                                                       │ publish
                                                                       ▼
                                                                  ┌─────────┐
                                                                  │ browser │
                                                                  └─────────┘
```

Three hops, three subscriptions, no inbound connections to anything on a plant
network and no webhook to expose.

---

## 2. The topic tree

Prefix `ultron/v1`. Identity lives in the path segments — never the gateway IP,
which belongs in the payload where it can be verified against what the workspace
has commissioned. Segments are percent-encoded, so a rack named `Rack/A` is
`Rack%2FA` on the wire.

### Gateway → application

| Topic | Schema | QoS | Retained | Ingested |
| --- | --- | --- | --- | --- |
| `gateways/{gw}/status` | `ultron.gateway.status` | 1 | **yes** | yes |
| `gateways/{gw}/topology` | `ultron.gateway.topology` | 1 | **yes** | yes |
| `gateways/{gw}/racks/{rack}/health` | `ultron.rack.health` | 1 | **yes** | yes |
| `gateways/{gw}/racks/{rack}/inventory` | `ultron.rack.inventory` | 1 | **yes** | yes |
| `gateways/{gw}/racks/{rack}/telemetry` | `ultron.rack.telemetry` | 0¹ | no | yes |
| `gateways/{gw}/racks/{rack}/telemetry/latest` | `ultron.rack.telemetry` | 0¹ | **yes** | no² |
| `gateways/{gw}/racks/{rack}/events/alarm` | `ultron.event.alarm` | 1 | no | yes |
| `gateways/{gw}/racks/{rack}/commands/response` | `ultron.command.response` | 1 | no | yes |

¹ `MQTT_TELEMETRY_QOS` on the gateway, default 0. At 2 Hz per rack the broker
round trip of QoS 1 buys little — a lost sample is replaced 500 ms later, and
current-state topics are last-writer-wins by design.

² Deliberately not in the app's subscription list. It exists so a *new*
subscriber can pick up the last reading immediately without waiting for the next
publish. The app does not need it (it has the database for cold start) and
subscribing would double every telemetry message.

### Application → gateway

| Topic | Schema | QoS | Retained |
| --- | --- | --- | --- |
| `gateways/{gw}/racks/{rack}/commands/request` | `ultron.command.request` | 1 | no |

Never retained: a retained command would be re-delivered to a gateway that
reconnects hours later and re-executed out of context.

### Retention, in one rule

Retain the topics that describe **what is true right now** (status, topology,
health, inventory) so a subscriber that connects late learns the current state
without waiting. Do not retain the topics that describe **something that
happened** (telemetry samples, alarms, commands) — a replay of those is a lie
about the present.

This is why the deployment order in §6 matters: retained topics replay on
connect, telemetry does not.

---

## 3. The envelope

Every gateway-originated message is built in one place
([`envelope.py`](../ultron-gateway/src/ultron_gateway/envelope.py)) so no
publisher can forget a mandatory field.

```json
{
  "schema": "ultron.rack.telemetry",
  "schema_version": "2.0",
  "message_id": "7d9933be-744c-49f5-a017-20523b477e7c",
  "gateway_id": "gw-3ml32wam",
  "gateway_boot_id": "a0af6812-c88b-4b30-a236-e007ed24ddfb",
  "gateway_ip": "192.168.30.11",
  "gateway_sequence": 1284,
  "created_at": "2026-09-09T08:24:27.123456+00:00",
  "created_at_us": "1785140667123456",
  "replayed": false,
  "rack_id": "Rack-A",
  "payload": { }
}
```

| Field | Why it exists |
| --- | --- |
| `message_id` | QoS 1 dedup key. Inserted with `ON CONFLICT DO NOTHING`, which is also what makes running several app instances safe. |
| `gateway_boot_id` | New on every gateway restart, so a sequence reset is distinguishable from a sequence gap. |
| `gateway_ip` | Mandatory verification metadata, checked against the commissioned address. See §5. |
| `gateway_sequence` | Monotonic per boot; gaps mean loss, repeats mean replay. |
| `created_at_us` | Microsecond source timestamp, as a string so no JSON parser rounds it. Drives the end-to-end latency metric. |
| `replayed` | `true` when the message comes off the offline spool. |

The application re-validates all of it
([`validate.mjs`](../src/server/ingest/validate.mjs)) and additionally requires
that the topic's `{gw}`/`{rack}` segments match `gateway_id`/`rack_id` in the
payload. A mismatch is quarantined, not corrected: a gateway publishing another
gateway's identity is either misconfigured or hostile, and both cases want a
record rather than a merge.

---

## 4. What each hop does

### Hop 1 — gateway to broker

[`publisher.py`](../ultron-gateway/src/ultron_gateway/publisher.py) validates the
envelope before publishing (an invalid envelope is a gateway bug, so it fails
loudly instead of letting the backend quarantine it), then either publishes or
spools.

**The offline spool** ([`spool.py`](../ultron-gateway/src/ultron_gateway/spool.py))
is a local SQLite queue. When the broker is unreachable, messages are buffered
and replayed in order on reconnect with their *original* timestamps and
sequence, flagged `replayed: true`. Because `message_id` is preserved, anything
that did make it through is deduplicated on arrival rather than double-counted.
The spool is the reason a plant link that drops for ten minutes costs history
resolution rather than history.

**Last Will and Testament**: the gateway registers a retained `OFFLINE` status
message with the broker at connect time. If it dies without a clean disconnect,
the broker publishes it. The app also sweeps for silent gateways every 5 s
(`STALE_AFTER_S`), because a will only fires if the broker noticed the
disconnect — a network partition between broker and app is invisible to it.

### Hop 2 — broker to application

[`mqttClient.mjs`](../src/server/ingest/mqttClient.mjs) holds the subscription.
Each message runs through
[`pipeline.mjs`](../src/server/ingest/pipeline.mjs):

```text
topic parse → JSON parse → envelope validation → payload validation
  → topic/payload identity check
  → ┬─ publish live frame  (WebSocket + pg_notify)   ← the latency path
    └─ enqueue persistence (binding, dedup, handler) ← everything else
```

The split is the point. Everything before the frame is pure validation — no I/O
— so a reading is on the wire to the browser in roughly the time it takes to
parse it. Binding, deduplication, quarantine and the database writes all happen
in the second branch, where a slow database costs history resolution rather than
liveness.

**Presentation before storage, everywhere.** The ordering is deliberate at each
point the two paths meet:

- Browser sockets are written *before* `pg_notify`, because a database round
  trip does synchronous work before it yields and that work would sit between
  the message arriving and the reading appearing.
- Schema preparation is **not awaited at startup**. A database that is
  unreachable at boot used to throw out of `startIngestRuntime` and take the
  whole process with it — a storage outage killing presentation. It now logs,
  retries every `DB_SCHEMA_RETRY_MS`, and the broker subscription and sockets
  come up regardless.
- The persistence queue is **capped** (`PERSIST_QUEUE_MAX`, default 10 000).
  Current-state jobs coalesce and are self-limiting, but append-only work
  (events, quarantine) has a unique key per message, so a database that stopped
  answering would grow the queue until the process died. Past the cap the oldest
  queued write is dropped and counted in `persist_dropped_total`.
- Failed writes log at most once every 10 s with a running count, so a storage
  outage cannot bury the log the live path also writes to.
- In the browser, the live bus and the state merge run before the frame's
  samples are handed to IndexedDB.

The net effect: with the database completely unreachable, the app still starts,
subscribes, and paints live readings. `/health` reports it honestly as
`persistence: { enabled: true, ready: false }` — storage is wanted but not
happening — and writing resumes on its own when the database answers, without a
restart.

Because a frame ships before binding has run, **a frame carries no
authorization**. The browser applies frames only for gateways its persisted
snapshot already shows as commissioned, which is what keeps an unknown or
quarantined gateway off the canvas.

**The persistence queue** ([`persistQueue.mjs`](../src/server/ingest/persistQueue.mjs))
keys jobs by `kind|gateway|rack`. A queued current-state job that has not started
yet is *replaced* by a newer frame rather than piling up — last-writer-wins is
already the semantics of a current-state table. Append-only work (events,
quarantine) passes a unique key and is never coalesced. Depth and coalescing are
exported as the `persist_queue_depth` / `persist_coalesced_total` metrics.

### Hop 3 — application to browser

[`liveSocket.mjs`](../src/server/ingest/liveSocket.mjs) serves `/ws/live`. It is
a subscribe channel, not a firehose you have to take whole:

```js
socket.send(JSON.stringify({
  type: 'subscribe',
  topics: ['ultron/v1/gateways/+/racks/+/telemetry'],
}));
```

Filters are MQTT topic filters matched the way the broker matches them (`+` for
one level, `#` for the rest). A socket that never subscribes receives every
topic, which is what the dashboard does. Authorization is the `ultron_session`
cookie — the same login every API route uses — so nothing ships in the browser
bundle. The client
([`src/lib/liveSocket.ts`](../src/lib/liveSocket.ts)) reconnects with
exponential backoff up to 10 s.

Alongside the socket, each frame is published on the `ultron_live` PostgreSQL
`NOTIFY` channel. That is how a *second* app instance learns about a message its
own subscription also received — it is what feeds `/api/live/stream` (SSE) for
clients that cannot hold a WebSocket. Payloads over the 8 kB NOTIFY limit
degrade to an `invalidate` marker, which makes subscribers pull a snapshot
instead of silently dropping the update.

### Hop 4 — command down and back

```text
POST /api/live/command                                    (admin or above)
  └▶ publish  gateways/{gw}/racks/{rack}/commands/request  QoS 1, not retained
       └▶ gateway CommandConsumer
            └▶ publish  .../commands/response
                 └▶ the app's own subscription
                      └▶ resolveCommandResponse(request_id) → the waiting HTTP response
```

The request carries a `request_id`; the gateway echoes it; the app keeps a map of
pending ids and resolves the one that matches. If no response arrives within
`MQTT_COMMAND_TIMEOUT_MS` (default 10 s) the route answers **504** — a gateway
that does not answer is a plant condition, not a server fault.

```bash
curl -X POST https://YOUR-APP/api/live/command \
  -H 'content-type: application/json' \
  --cookie 'ultron_session=...' \
  -d '{"gatewayId":"gw-3ml32wam","rackId":"Rack-A","command":"PING"}'
```

The gateway currently implements `PING` and rejects anything else with a
`REJECTED` response — the transport is complete, the command set is not.

---

## 5. Binding: which gateways are allowed to change state

Publishing to the broker does not make a gateway trusted. Persistence binds
every message before it can touch live state:

- Permanent identity is `gateway_id + rack_id` (`UNIQUE(gateway_id, rack_id)`).
- `gateway_ip` is mandatory. When a commissioned gateway reports a new address,
  the workspace Gateway IP is updated and the change recorded in
  `gateway_ip_history`.
- If the reported IP is already configured on another active rack or gateway,
  the message is **quarantined as an IP conflict** before any live state can
  update.
- An unknown `gateway_id` is quarantined and updates nothing. Commission it in
  Devices first.
- Topic identity must match the payload envelope.

Quarantined messages are stored whole in `mqtt_quarantine`, so nothing is lost —
it just does not reach the canvas.

---

## 6. Configuration

### Gateway (`ultron-gateway/.env`, or `/etc/ultron-gateway/gateway.env`)

```ini
# identity — must match the Script IDs configured in Devices
GATEWAY_ID=gw-3ml32wam
RACK_IDS=Rack-A,Rack-B          # note: RACK_IDS, uppercase; `rack_id` is ignored
GATEWAY_IP=192.168.30.11        # or GATEWAY_PRIMARY_INTERFACE=eth0

# transport
GATEWAY_TRANSPORT=mqtt
MQTT_HOST=your-broker.emqxsl.com
MQTT_PORT=8883
MQTT_USE_TLS=1
MQTT_USERNAME=gateway-user
MQTT_PASSWORD=...
# MQTT_CA_CERT=...              # only for a private CA; EMQX Cloud uses a public one

# runtime
DATA_SOURCE=cc_v3               # or simulator
TELEMETRY_INTERVAL_S=0.5
MQTT_TELEMETRY_QOS=0
GATEWAY_STATE_DIR=/var/lib/ultron-gateway
```

`DIRECT_WS_URL` / `DIRECT_WS_TOKEN` are only read when
`GATEWAY_TRANSPORT=websocket` (see §8).

### Application (Render environment)

| Variable | Value | Notes |
| --- | --- | --- |
| `INGEST_TRANSPORT` | `mqtt` | `both` also opens the fallback door; `websocket` is broker-less |
| `MQTT_HOST` | your EMQX host | without it the subscription is disabled and the app logs so |
| `MQTT_PORT` / `MQTT_USE_TLS` | `8883` / `true` | |
| `MQTT_USERNAME` / `MQTT_PASSWORD` | a **separate** user from the gateway's | see the ACLs below |
| `MQTT_BACKEND_CLIENT_ID` | `ultron-app-ingest` | a random suffix is appended per instance |
| `MQTT_SUBSCRIBE_QOS` | `1` | |
| `MQTT_PROTOCOL_VERSION` | `5` | set `4` only for a broker limited to 3.1.1 |
| `MQTT_COMMAND_TIMEOUT_MS` | `10000` | |
| `MQTT_MAX_PAYLOAD_BYTES` | `262144` | larger messages are quarantined |
| `LIVE_WS_REQUIRE_SESSION` | on in production | requires a login on `/ws/live` |
| `PERSISTENCE_ENABLED` | `true` | false = publish frames, write nothing |
| `PERSIST_QUEUE_MAX` | `10000` | queued writes before the oldest are shed |
| `DB_SCHEMA_RETRY_MS` | `15000` | retry cadence when the database is unreachable |
| `STALE_AFTER_S` | `15` | silent gateways are marked OFFLINE after this |
| `DATABASE_URL` | Supabase URI | |
| `LIVE_NOTIFY_DATABASE_URL` | **session-mode** URI (port 5432) | the transaction pooler silently drops `NOTIFY` |

### Broker ACLs

The two roles are not symmetric, and that shapes the rules.

The **application** is one actor that legitimately speaks to the whole fleet, so
its rules are wildcards and never change as gateways come and go:

| | topic filter |
| --- | --- |
| subscribe | `ultron/v1/gateways/#` |
| publish | `ultron/v1/gateways/+/racks/+/commands/request` |

A **gateway** is one actor that may only speak about *itself*. Writing that as a
literal id (`ultron/v1/gateways/gw-3ml32wam/#`) means editing the broker every
time a gateway is commissioned, which does not scale. Writing it as a bare
wildcard (`ultron/v1/gateways/+/#`) scales but lets any gateway publish as any
other.

Neither is necessary: EMQX interpolates `${username}` as a topic segment, so one
rule covers every gateway and still confines each to its own subtree.

| | topic filter |
| --- | --- |
| publish | `ultron/v1/gateways/${username}/#` |
| subscribe | `ultron/v1/gateways/${username}/racks/+/commands/request` |

The condition is **one broker user per gateway, with the username equal to that
gateway's `GATEWAY_ID`** — so `MQTT_USERNAME=gw-3ml32wam` alongside
`GATEWAY_ID=gw-3ml32wam`. Adding a gateway is then adding a broker user; the ACL
is written once. (The interpolated value may not contain `/`, `+` or `#`, which
is another reason gateway ids should stay in the `gw-xxxxxxxx` shape.)

`${clientid}` will *not* work here: the gateway's client id is
`ultron-gw-{gateway_id}`, and the topic segment is the bare gateway id — EMQX
substitutes whole values and cannot strip the prefix.

Why bother, when the pipeline already rejects a topic/payload identity mismatch?
Because that check only catches a *misconfigured* gateway. A gateway that sets
both the topic and the envelope to another gateway's id passes validation
cleanly; the broker ACL is the only layer that can refuse it. Per-gateway
credentials also mean a compromised site is revoked on its own, instead of
rotating a shared secret across every Pi in the fleet.

### Deployment order

Bring the **application** up on `INGEST_TRANSPORT=mqtt` before switching the
gateway. A gateway publishing to a broker with no subscriber loses its telemetry
(QoS 0, not retained). Status, topology, health and inventory are retained, so
those replay to the app the moment it connects.

---

## 7. Running more than one application instance

Every instance opens its own subscription with its own client id
(`MQTT_BACKEND_CLIENT_ID` + a random suffix) and receives **every** message, so
each can serve frames to the browsers connected to it. Duplicate writes are
prevented at the database, not at the broker: `claimMessage` inserts
`message_id` with `ON CONFLICT DO NOTHING`, so exactly one instance persists each
message and the rest record a QoS duplicate.

The alternative — an EMQX shared subscription (`$share/group/topic`) — would send
each message to only one instance, which is right for persistence and wrong for
the live path, because the instance holding a browser's socket might not be the
one that received the message. Ordinary subscriptions plus database-level dedup
gets both.

**Do not give two instances the same client id.** MQTT evicts the older
connection, so they will kick each other off in a loop.

---

## 8. The fallback door

`INGEST_TRANSPORT=both` additionally opens `/ws/gateway`, where a gateway running
`GATEWAY_TRANSPORT=websocket` publishes straight into the same pipeline with no
broker involved. It is authorized by `DIRECT_WS_GATEWAY_SECRET` (matching the
gateway's `DIRECT_WS_TOKEN`) and closed in the default configuration.

It exists for a broker outage or a bench test. It is **not** equivalent: there is
no spool replay, no retained state, no last will, no command path, and no second
consumer. Use it to keep data flowing while EMQX is being fixed, then switch
back.

---

## 9. Operating it

### Health

```bash
curl https://YOUR-APP/health
```

```jsonc
// abridged
{
  "ok": true,
  "transport": "mqtt",
  "persistence": true,
  "broker": {
    "configured": true, "connected": true,
    "clientId": "ultron-app-ingest-c13baded",
    "host": "your-broker.emqxsl.com:8883",
    "protocolVersion": 5,
    "connectedAt": "2026-09-09T08:00:11.204Z",
    "reconnects": 0, "lastError": null, "pendingCommands": 0
  },
  "sockets": { "liveClients": 3, "gatewayClients": 0, "gatewayDoorEnabled": false },
  "persistQueueDepth": 0
}
```

### Log lines that mean things are right

```text
[mqtt] connected to your-broker.emqxsl.com:8883 as ultron-app-ingest-c13baded
[mqtt] subscribed to 7 gateway filters at qos 1
[ingest] live subscriptions served at /ws/live
```

### Metrics

Written to the ingest metrics table every `METRICS_FLUSH_INTERVAL_MS` (2 s):
`messages_total`, `messages_schema_*`, `qos_duplicates`, `schema_failures`,
`identity_mismatches`, `quarantine_messages`, `parse_failures`,
`payload_too_large`, `persist_queue_depth`, `persist_coalesced_total`,
`gateway_to_publish_latency_ms`, `last_message_unix_seconds`,
`persist_dropped_total`.

`gateway_to_publish_latency_ms` is gateway sample → frame published, the part of
end-to-end latency this application owns. Over `LATENCY_BUDGET_MS` (1 s) it logs
a warning at most once per 5 s — that measurement is broker backlog, network, or
gateway clock skew, not pipeline cost.

In the browser, `__ultronLiveLatency` in the console holds the gateway → UI
measurement and the live socket's connection state.

### Troubleshooting

| Symptom | Look at |
| --- | --- |
| `broker.configured: false` | `MQTT_HOST` is unset in the app environment |
| `connected: false`, `reconnects` climbing | credentials, TLS, or the ACL; `lastError` names it |
| `Unacceptable protocol version` | broker does not speak MQTT 5 → `MQTT_PROTOCOL_VERSION=4` |
| `Invalid header flag bits ... puback` | same cause, seen from the other side of the handshake |
| Two instances flapping | duplicate `MQTT_BACKEND_CLIENT_ID` |
| Gateway publishes, nothing in the UI | rows in `mqtt_quarantine` — usually an uncommissioned `gateway_id` or an IP conflict |
| Devices strip stuck **Not Connected** | that rack has no recent telemetry; registered racks without data stay Not Connected by design |
| Frames arrive, values do not paint | `measurement_valid`, `channel_status`, and a non-empty `value_display` are all required before a reading reaches the canvas |
| SSE works, WebSocket does not | a proxy not forwarding `Upgrade`, or an expired session cookie (`/ws/live` is session-gated) |
| Values stale after a reconnect | check `persist_queue_depth`; if it is climbing the database is the bottleneck |
| `persistence.ready: false` in `/health` | the database is unreachable; live frames are unaffected, writes are being dropped — check `DATABASE_URL` |

---

## 10. Tests

```bash
npm run test:ingest
```

19 tests: the v2 contract (topic parsing, envelope and payload validation,
percent-encoded segments, spool replays), live frame construction and queue
coalescing, and the pub/sub path itself — topic filter matching, per-subscriber
filtering on `/ws/live`, refusal of unknown upgrade paths, command
request/response correlation, command timeout, and the persistence queue's
load-shedding and coalescing under a stalled database.

The full chain was also verified against a real broker: a gateway publishing a
71.5 °C reading arrives at a browser socket as a measurement, and a `PING`
round-trips application → broker → gateway → broker → application.
