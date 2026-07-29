// Ultron backend MQTT ingestion service (Phase D + E of the handover).
//
//   EMQX ─┬→ live frame → pg_notify → Next.js /api/live/stream (SSE) → UI
//         └→ persistence queue → PostgreSQL
//
// Pipeline per message: topic parse → JSON parse → schema validation →
// identity validation (topic vs payload) → publish live frame → queue
// persistence (binding, dedup, handler, DB).
//
// The two branches are deliberately split: the UI is fed from the validated
// message itself, so a reading reaches the canvas in one broker hop instead of
// waiting for every write the frame triggers.

import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

import { ensureSchema } from './db.js';
import { buildLiveFrame } from './liveFrame.js';
import { publishLiveFrame } from './liveBus.js';
import { coalescedCount, enqueue, queueDepth } from './persistQueue.js';
import {
  bind,
  bumpMetric,
  claimMessage,
  flushMetrics,
  handleEvent,
  handleInventory,
  handleRackHealth,
  handleStatus,
  handleTelemetry,
  handleTombstone,
  handleTopology,
  markStaleGateways,
  quarantine,
  setMetric,
} from './handlers.js';
import { parseTopic } from './topics.js';
import { SCHEMA_FOR_KIND, validateEnvelope, validatePayload } from './validate.js';

const MQTT_HOST = process.env.MQTT_HOST ?? 'localhost';
const MQTT_PORT = Number(process.env.MQTT_PORT ?? 8883);
const MQTT_USE_TLS = !['0', 'false', 'no'].includes(String(process.env.MQTT_USE_TLS ?? 'true').toLowerCase());
const CLIENT_ID = process.env.MQTT_BACKEND_CLIENT_ID ?? process.env.MQTT_CLIENT_ID ?? 'ultron-backend-ingress-01';
const INGEST_TRANSPORT = (process.env.INGEST_TRANSPORT ?? 'websocket').trim().toLowerCase();
export const INGEST_PORT = Number(process.env.PORT ?? process.env.WS_PORT ?? 8081);
const GATEWAY_WS_PATH = process.env.GATEWAY_WS_PATH ?? '/ws/gateway';
const LIVE_WS_PATH = process.env.LIVE_WS_PATH ?? '/ws/live';
const DIRECT_WS_GATEWAY_SECRET = process.env.DIRECT_WS_GATEWAY_SECRET ?? process.env.GATEWAY_WS_SECRET ?? '';
const DIRECT_WS_BROWSER_TOKEN = process.env.DIRECT_WS_BROWSER_TOKEN ?? process.env.LIVE_WS_TOKEN ?? '';
const PERSISTENCE_ENABLED = !['0', 'false', 'no'].includes(
  String(process.env.PERSISTENCE_ENABLED ?? (process.env.DATABASE_URL ? 'true' : 'false')).toLowerCase(),
);
const STALE_AFTER_S = Number(process.env.STALE_AFTER_S ?? 15);
const MAX_PAYLOAD_BYTES = Number(process.env.DIRECT_WS_MAX_PAYLOAD_BYTES ?? process.env.MQTT_MAX_PAYLOAD_BYTES ?? 262_144);
const METRICS_FLUSH_INTERVAL_MS = Number(process.env.METRICS_FLUSH_INTERVAL_MS ?? 2000);
// Budget for gateway sample → frame published. Exceeding it means the broker,
// the network or the gateway clock is the bottleneck, not this service.
const LATENCY_BUDGET_MS = Number(process.env.LATENCY_BUDGET_MS ?? 1000);
const LATENCY_WARN_INTERVAL_MS = 5000;
// Kinds whose handler writes the full rack row, so binding must not write it too.
const KINDS_UPSERTING_RACK = new Set(['telemetry', 'rack_health', 'topology']);
const SUBSCRIPTIONS = [
  'ultron/v1/gateways/+/status',
  'ultron/v1/gateways/+/topology',
  'ultron/v1/gateways/+/racks/+/health',
  'ultron/v1/gateways/+/racks/+/inventory',
  'ultron/v1/gateways/+/racks/+/telemetry',
  'ultron/v1/gateways/+/racks/+/events/alarm',
  'ultron/v1/gateways/+/racks/+/commands/response',
];

// --- Direct WebSocket server -------------------------------------------------
export function handleIngestHealth(req, res) {
  if (req.url?.startsWith('/health')) {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ ok: true, transport: INGEST_TRANSPORT, persistence: PERSISTENCE_ENABLED, serverNowMs: Date.now() }));
    return true;
  }
  return false;
}

const gatewayWss = new WebSocketServer({ noServer: true });
const liveWss = new WebSocketServer({ noServer: true });

function tokenFrom(req, url) {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) return auth.slice('Bearer '.length);
  return url.searchParams.get('token') ?? '';
}

function authorize(req, url, expected) {
  if (!expected) return true;
  return tokenFrom(req, url) === expected;
}

export function attachIngestWebSockets(server) {
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    if (url.pathname === GATEWAY_WS_PATH) {
      if (!authorize(req, url, DIRECT_WS_GATEWAY_SECRET)) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
      gatewayWss.handleUpgrade(req, socket, head, (ws) => gatewayWss.emit('connection', ws, req));
      return;
    }
    if (url.pathname === LIVE_WS_PATH) {
      if (!authorize(req, url, DIRECT_WS_BROWSER_TOKEN)) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
      liveWss.handleUpgrade(req, socket, head, (ws) => liveWss.emit('connection', ws, req));
      return;
    }
    socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
    socket.destroy();
  });
}

function heartbeat(ws) {
  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
  });
}

function broadcast(event) {
  const data = JSON.stringify(event);
  for (const client of liveWss.clients) {
    if (client.readyState === 1) client.send(data);
  }
}

function topicFromMessage(message) {
  if (message.schema === 'ultron.gateway.status') return `ultron/v1/gateways/${message.gateway_id}/status`;
  if (message.schema === 'ultron.gateway.topology') return `ultron/v1/gateways/${message.gateway_id}/topology`;
  if (message.schema === 'ultron.rack.health') return `ultron/v1/gateways/${message.gateway_id}/racks/${message.rack_id}/health`;
  if (message.schema === 'ultron.rack.inventory') return `ultron/v1/gateways/${message.gateway_id}/racks/${message.rack_id}/inventory`;
  if (message.schema === 'ultron.rack.telemetry') return `ultron/v1/gateways/${message.gateway_id}/racks/${message.rack_id}/telemetry`;
  if (message.schema === 'ultron.event.alarm') return `ultron/v1/gateways/${message.gateway_id}/racks/${message.rack_id}/events/alarm`;
  if (message.schema === 'ultron.command.response') return `ultron/v1/gateways/${message.gateway_id}/racks/${message.rack_id}/commands/response`;
  return null;
}

function normalizeWsPacket(raw) {
  const packet = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!packet || typeof packet !== 'object') throw new Error('packet must be a JSON object');
  const message = packet.message ?? packet.payload ?? packet;
  const topic = typeof packet.topic === 'string' ? packet.topic : topicFromMessage(message);
  if (!topic) throw new Error('missing topic');
  return { topic, message };
}

gatewayWss.on('connection', (ws, req) => {
  heartbeat(ws);
  const peer = req.socket.remoteAddress ?? 'unknown';
  console.log(`[ws:gateway] connected ${peer}`);
  ws.on('message', (raw) => {
    const text = Buffer.isBuffer(raw)
      ? raw.toString('utf8')
      : typeof raw === 'string'
        ? raw
        : Array.isArray(raw)
          ? Buffer.concat(raw).toString('utf8')
          : Buffer.from(raw).toString('utf8');
    if (Buffer.byteLength(text, 'utf8') > MAX_PAYLOAD_BYTES) {
      ws.send(JSON.stringify({ type: 'error', error: 'payload too large' }));
      return;
    }
    let packet;
    try {
      packet = normalizeWsPacket(text);
    } catch (err) {
      ws.send(JSON.stringify({ type: 'error', error: err.message }));
      return;
    }
    onMessage(packet.topic, Buffer.from(JSON.stringify(packet.message))).catch((err) => {
      console.error(`[ws:pipeline] ${packet.topic}:`, err.message);
      if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'error', topic: packet.topic, error: err.message }));
    });
  });
  ws.on('close', () => console.log(`[ws:gateway] disconnected ${peer}`));
});

liveWss.on('connection', (ws) => {
  heartbeat(ws);
  ws.send(JSON.stringify({ type: 'hello', serverNowMs: Date.now() }));
});

// --- Message pipeline --------------------------------------------------------
async function rejectMessage(topic, reason, msg) {
  bumpMetric('quarantine_messages');
  if (PERSISTENCE_ENABLED) return quarantine(topic, reason, msg);
  console.warn(`[reject] ${topic}: ${reason}`);
  return undefined;
}

async function onMessage(topic, buf) {
  const parsed = parseTopic(topic);
  if (!parsed) return rejectMessage(topic, 'unknown topic', null);
  if (parsed.kind === 'command_request') return; // backend-originated; not ingested
  if (buf.length === 0) {
    if (PERSISTENCE_ENABLED) await handleTombstone(topic, parsed);
    return;
  }
  if (buf.length > MAX_PAYLOAD_BYTES) {
    bumpMetric('payload_too_large');
    return rejectMessage(topic, 'payload too large', null);
  }

  let msg;
  try {
    msg = JSON.parse(buf.toString('utf8'));
  } catch {
    bumpMetric('parse_failures');
    return rejectMessage(topic, 'invalid JSON', null);
  }

  const envelopeErrors = validateEnvelope(msg);
  if (envelopeErrors.length > 0) {
    bumpMetric('schema_failures');
    return rejectMessage(topic, `envelope: ${envelopeErrors.join('; ')}`, msg);
  }

  const expectedSchema = SCHEMA_FOR_KIND[parsed.kind];
  if (expectedSchema && msg.schema !== expectedSchema) {
    bumpMetric('schema_failures');
    return rejectMessage(topic, `schema ${msg.schema} does not match topic kind ${parsed.kind}`, msg);
  }

  const payloadErrors = validatePayload(msg.schema, msg.payload);
  if (payloadErrors.length > 0) {
    bumpMetric('schema_failures');
    return rejectMessage(topic, `payload: ${payloadErrors.join('; ')}`, msg);
  }

  const isRackTopic = parsed.rackId !== null;
  if (!isRackTopic && msg.rack_id !== undefined) {
    bumpMetric('identity_mismatches');
    return rejectMessage(topic, 'gateway topic must not contain rack_id', msg);
  }
  if (isRackTopic && typeof msg.rack_id !== 'string') {
    bumpMetric('identity_mismatches');
    return rejectMessage(topic, 'rack topic missing rack_id', msg);
  }

  // Identity validation: topic segments must match the payload envelope.
  if (parsed.gatewayId !== msg.gateway_id) {
    bumpMetric('identity_mismatches');
    console.warn(`[reject] topic gateway ${parsed.gatewayId} != payload ${msg.gateway_id} (${topic})`);
    return rejectMessage(topic, 'topic/payload gateway_id mismatch', msg);
  }
  if (parsed.rackId !== null && parsed.rackId !== msg.rack_id) {
    bumpMetric('identity_mismatches');
    console.warn(`[reject] topic rack ${parsed.rackId} != payload ${msg.rack_id} (${topic})`);
    return rejectMessage(topic, 'topic/payload rack_id mismatch', msg);
  }

  // ---- Realtime branch: straight to the UI, no database involved ----------
  // Everything above is pure validation, so the frame ships now — binding,
  // deduplication and quarantine all run in the persistence branch. A frame
  // therefore carries no authorization of its own: the browser only applies
  // frames for gateways its persisted snapshot already shows as commissioned,
  // which is what keeps an unknown or quarantined gateway off the canvas.
  const frame = buildLiveFrame(parsed.kind, msg);
  if (frame) {
    if (PERSISTENCE_ENABLED) void publishLiveFrame(frame);
    broadcast({ type: 'frame', kind: parsed.kind, topic, frame, serverNowMs: Date.now() });
    recordPublishLatency(frame);
  }

  bumpMetric(`messages_schema_${msg.schema.replaceAll('.', '_')}`);
  bumpMetric('messages_total');
  setMetric('last_message_unix_seconds', Math.floor(Date.now() / 1000));

  if (!PERSISTENCE_ENABLED) return;

  // ---- Persistence branch: queued, coalesced, off the latency path --------
  const persistKey = parsed.kind === 'alarm' || parsed.kind === 'fault' || parsed.kind === 'system'
    ? `${parsed.kind}|${msg.message_id}`
    : `${parsed.kind}|${msg.gateway_id}|${msg.rack_id ?? ''}`;
  enqueue(persistKey, () => persist(topic, parsed, msg));
}

// Gateway sample → frame published, the part of end-to-end latency this service
// owns. Exported as a metric so the budget is observable rather than assumed.
let lastLatencyWarnAt = 0;

function recordPublishLatency(frame) {
  if (typeof frame.sourceCreatedAtMs !== 'number') return;
  const latencyMs = frame.serverNowMs - frame.sourceCreatedAtMs;
  setMetric('gateway_to_publish_latency_ms', Math.max(0, Math.round(latencyMs)));
  if (latencyMs > LATENCY_BUDGET_MS && Date.now() - lastLatencyWarnAt > LATENCY_WARN_INTERVAL_MS) {
    lastLatencyWarnAt = Date.now();
    console.warn(`[latency] gateway→publish ${Math.round(latencyMs)}ms over ${LATENCY_BUDGET_MS}ms budget (broker backlog or gateway clock skew)`);
  }
}

async function persist(topic, parsed, msg) {
  const binding = await bind(msg, { ensureRackRow: !KINDS_UPSERTING_RACK.has(parsed.kind) });
  if (binding.event === 'UNCLAIMED') {
    console.warn(`[quarantine] unknown gateway ${msg.gateway_id} @ ${msg.gateway_ip} — awaiting commissioning`);
  } else if (binding.event === 'IP_NOT_CONFIGURED') {
    console.warn(`[quarantine] ${msg.gateway_id} has no configured gateway IP; ignoring ${msg.gateway_ip}`);
  } else if (binding.event === 'IP_CONFLICT') {
    console.warn(`[quarantine] ${msg.gateway_id} configured gateway_ip ${msg.gateway_ip} is already assigned to another device`);
  } else if (binding.event === 'IP_CHANGED') {
    console.warn(`[binding] ${msg.gateway_id} IP changed to commissioned address ${msg.gateway_ip}`);
  }

  const fresh = await claimMessage(msg, topic);
  if (!fresh) return; // QoS 1 duplicate — already ingested

  if (binding.status === 'QUARANTINED') {
    await quarantine(topic, binding.reason ?? 'gateway not commissioned', msg);
    return; // stored envelope only; no state until commissioned
  }

  switch (parsed.kind) {
    case 'status':
      await handleStatus(msg);
      break;
    case 'topology':
      await handleTopology(msg);
      break;
    case 'rack_health':
      await handleRackHealth(msg);
      break;
    case 'inventory':
      await handleInventory(msg);
      break;
    case 'telemetry':
      await handleTelemetry(msg);
      break;
    case 'alarm':
    case 'fault':
    case 'system':
      await handleEvent(msg, parsed.kind);
      break;
    default:
      // rack/slot health, identity, capabilities, configuration, command &
      // diagnostics responses: envelope stored; dedicated handlers arrive with
      // the command phase.
      break;
  }
}

function cert(path) {
  return path ? readFileSync(path) : undefined;
}

function mqttOptions() {
  return {
    host: MQTT_HOST,
    port: MQTT_PORT,
    protocol: MQTT_USE_TLS ? 'mqtts' : 'mqtt',
    clientId: CLIENT_ID,
    protocolVersion: 5,
    username: process.env.MQTT_USERNAME,
    password: process.env.MQTT_PASSWORD,
    clean: true,
    reconnectPeriod: 1000,
    connectTimeout: 30_000,
    resubscribe: true,
    rejectUnauthorized: true,
    ca: cert(process.env.MQTT_CA_CERT),
    cert: cert(process.env.MQTT_CLIENT_CERT),
    key: cert(process.env.MQTT_CLIENT_KEY),
  };
}

// --- Startup -----------------------------------------------------------------
let runtimeStarted = false;

export async function startIngestRuntime() {
  if (runtimeStarted) return;
  runtimeStarted = true;

  if (PERSISTENCE_ENABLED) {
    await ensureSchema();
    console.log('[db] schema ready');
  } else {
    console.log('[db] persistence disabled; live WebSocket frames will not be stored');
  }

  setInterval(() => {
    for (const ws of [...gatewayWss.clients, ...liveWss.clients]) {
      if (ws.isAlive === false) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, 30_000);

  if (INGEST_TRANSPORT === 'mqtt' || INGEST_TRANSPORT === 'both') {
    const { default: mqtt } = await import('mqtt');
    const client = mqtt.connect(mqttOptions());

    client.on('connect', () => {
      console.log(`[mqtt] connected to ${MQTT_HOST}:${MQTT_PORT} as ${CLIENT_ID}`);
      client.subscribe(Object.fromEntries(SUBSCRIPTIONS.map((topic) => [topic, { qos: 1 }])), (err) => {
        if (err) console.error('[mqtt] subscribe failed', err);
        else console.log(`[mqtt] subscribed to ${SUBSCRIPTIONS.length} v2 filters`);
      });
    });

    client.on('message', (topic, buf) => {
      onMessage(topic, buf).catch((err) => console.error(`[pipeline] ${topic}:`, err.message));
    });

    client.on('error', (err) => console.error('[mqtt] error', err.message));
  } else {
    console.log('[mqtt] disabled; accepting direct gateway WebSocket ingest');
  }

  if (PERSISTENCE_ENABLED) {
    setInterval(() => {
      markStaleGateways(STALE_AFTER_S).catch((err) => console.error('[stale]', err.message));
    }, 5000);

    setInterval(() => {
      setMetric('persist_queue_depth', queueDepth());
      setMetric('persist_coalesced_total', coalescedCount());
      flushMetrics().catch((err) => console.error('[metrics]', err.message));
    }, METRICS_FLUSH_INTERVAL_MS);
  }
}

async function main() {
  const server = createServer((req, res) => {
    if (handleIngestHealth(req, res)) return;
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
  });
  attachIngestWebSockets(server);
  await startIngestRuntime();
  server.listen(INGEST_PORT, () => {
    console.log(`[ws] gateway ${GATEWAY_WS_PATH} and live ${LIVE_WS_PATH} listening on :${INGEST_PORT}`);
  });
}

const isEntrypoint = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isEntrypoint) main().catch((err) => {
  console.error('fatal:', err);
  process.exit(1);
});
