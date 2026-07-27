// Ultron backend MQTT ingestion service (Phase D + E of the handover).
//
//   EMQX  →  this service  →  PostgreSQL  →  Next.js REST (/api/live) → UI
//
// Pipeline per message: topic parse → JSON parse → schema validation →
// identity validation (topic vs payload) → gateway/rack/IP binding →
// message_id dedup → handler → DB → WebSocket broadcast.

import mqtt from 'mqtt';
import { readFileSync } from 'node:fs';
import { WebSocketServer } from 'ws';

import { ensureSchema } from './db.js';
import {
  bind,
  bumpMetric,
  claimMessage,
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
const STALE_AFTER_S = Number(process.env.STALE_AFTER_S ?? 15);
const MAX_PAYLOAD_BYTES = Number(process.env.MQTT_MAX_PAYLOAD_BYTES ?? 262_144);
const SUBSCRIPTIONS = [
  'ultron/v1/gateways/+/status',
  'ultron/v1/gateways/+/topology',
  'ultron/v1/gateways/+/racks/+/health',
  'ultron/v1/gateways/+/racks/+/inventory',
  'ultron/v1/gateways/+/racks/+/telemetry',
  'ultron/v1/gateways/+/racks/+/events/alarm',
  'ultron/v1/gateways/+/racks/+/commands/response',
];

// --- Optional realtime broadcast -------------------------------------------
let wss = null;
if (process.env.WS_PORT) {
  wss = new WebSocketServer({ port: Number(process.env.WS_PORT) });
  console.log(`[ws] broadcasting on :${process.env.WS_PORT}`);
}

function broadcast(event) {
  if (!wss) return;
  const data = JSON.stringify(event);
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(data);
  }
}

// --- Message pipeline --------------------------------------------------------
async function onMessage(topic, buf) {
  const parsed = parseTopic(topic);
  if (!parsed) return quarantine(topic, 'unknown topic', null);
  if (parsed.kind === 'command_request') return; // backend-originated; not ingested
  if (buf.length === 0) {
    await handleTombstone(topic, parsed);
    return;
  }
  if (buf.length > MAX_PAYLOAD_BYTES) {
    await bumpMetric('payload_too_large');
    return quarantine(topic, 'payload too large', null);
  }

  let msg;
  try {
    msg = JSON.parse(buf.toString('utf8'));
  } catch {
    await bumpMetric('parse_failures');
    return quarantine(topic, 'invalid JSON', null);
  }

  const envelopeErrors = validateEnvelope(msg);
  if (envelopeErrors.length > 0) {
    await bumpMetric('schema_failures');
    return quarantine(topic, `envelope: ${envelopeErrors.join('; ')}`, msg);
  }

  const expectedSchema = SCHEMA_FOR_KIND[parsed.kind];
  if (expectedSchema && msg.schema !== expectedSchema) {
    await bumpMetric('schema_failures');
    return quarantine(topic, `schema ${msg.schema} does not match topic kind ${parsed.kind}`, msg);
  }

  const payloadErrors = validatePayload(msg.schema, msg.payload);
  if (payloadErrors.length > 0) {
    await bumpMetric('schema_failures');
    return quarantine(topic, `payload: ${payloadErrors.join('; ')}`, msg);
  }

  const isRackTopic = parsed.rackId !== null;
  if (!isRackTopic && msg.rack_id !== undefined) {
    await bumpMetric('identity_mismatches');
    return quarantine(topic, 'gateway topic must not contain rack_id', msg);
  }
  if (isRackTopic && typeof msg.rack_id !== 'string') {
    await bumpMetric('identity_mismatches');
    return quarantine(topic, 'rack topic missing rack_id', msg);
  }

  // Identity validation: topic segments must match the payload envelope.
  if (parsed.gatewayId !== msg.gateway_id) {
    await bumpMetric('identity_mismatches');
    console.warn(`[reject] topic gateway ${parsed.gatewayId} != payload ${msg.gateway_id} (${topic})`);
    return quarantine(topic, 'topic/payload gateway_id mismatch', msg);
  }
  if (parsed.rackId !== null && parsed.rackId !== msg.rack_id) {
    await bumpMetric('identity_mismatches');
    console.warn(`[reject] topic rack ${parsed.rackId} != payload ${msg.rack_id} (${topic})`);
    return quarantine(topic, 'topic/payload rack_id mismatch', msg);
  }

  const binding = await bind(msg);
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
    case 'telemetry': {
      const stored = await handleTelemetry(msg);
      console.log(`[telemetry] ${msg.gateway_id}/rack ${msg.rack_id}: ${stored}/${msg.payload.slots.length} slots`);
      break;
    }
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

  await bumpMetric(`messages_schema_${msg.schema.replaceAll('.', '_')}`);
  await bumpMetric('messages_total');
  await setMetric('last_message_unix_seconds', Math.floor(Date.now() / 1000));
  broadcast({ kind: parsed.kind, topic, message: msg });
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
async function main() {
  await ensureSchema();
  console.log('[db] schema ready');

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

  setInterval(() => {
    markStaleGateways(STALE_AFTER_S).catch((err) => console.error('[stale]', err.message));
  }, 5000);
}

main().catch((err) => {
  console.error('fatal:', err);
  process.exit(1);
});
