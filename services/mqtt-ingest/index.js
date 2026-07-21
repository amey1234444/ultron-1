// Ultron backend MQTT ingestion service (Phase D + E of the handover).
//
//   EMQX  →  this service  →  PostgreSQL  →  Next.js REST (/api/live) → UI
//
// Pipeline per message: topic parse → JSON parse → schema validation →
// identity validation (topic vs payload) → gateway/rack/IP binding →
// message_id dedup → handler → DB → WebSocket broadcast.

import mqtt from 'mqtt';
import { WebSocketServer } from 'ws';

import { ensureSchema } from './db.js';
import {
  bind,
  claimMessage,
  handleEvent,
  handleInventory,
  handleStatus,
  handleTelemetry,
  markStaleGateways,
  quarantine,
} from './handlers.js';
import { parseTopic } from './topics.js';
import { SCHEMA_FOR_KIND, validateEnvelope, validatePayload } from './validate.js';

const MQTT_URL = process.env.MQTT_URL ?? 'mqtt://localhost:1883';
const CLIENT_ID = process.env.MQTT_CLIENT_ID ?? 'ultron-backend-ingress-01';
const STALE_AFTER_S = Number(process.env.STALE_AFTER_S ?? 15);
const SUBSCRIPTION = 'ultron/v1/gateways/#';

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

  let msg;
  try {
    msg = JSON.parse(buf.toString('utf8'));
  } catch {
    return quarantine(topic, 'invalid JSON', null);
  }

  const envelopeErrors = validateEnvelope(msg);
  if (envelopeErrors.length > 0) return quarantine(topic, `envelope: ${envelopeErrors.join('; ')}`, msg);

  const expectedSchema = SCHEMA_FOR_KIND[parsed.kind];
  if (expectedSchema && msg.schema !== expectedSchema) {
    return quarantine(topic, `schema ${msg.schema} does not match topic kind ${parsed.kind}`, msg);
  }

  const payloadErrors = validatePayload(msg.schema, msg.payload);
  if (payloadErrors.length > 0) return quarantine(topic, `payload: ${payloadErrors.join('; ')}`, msg);

  // Identity validation: topic segments must match the payload envelope.
  if (parsed.gatewayId !== msg.gateway_id) {
    console.warn(`[reject] topic gateway ${parsed.gatewayId} != payload ${msg.gateway_id} (${topic})`);
    return quarantine(topic, 'topic/payload gateway_id mismatch', msg);
  }
  if (parsed.rackId !== null && parsed.rackId !== msg.rack_id) {
    console.warn(`[reject] topic rack ${parsed.rackId} != payload ${msg.rack_id} (${topic})`);
    return quarantine(topic, 'topic/payload rack_id mismatch', msg);
  }

  const binding = await bind(msg);
  if (binding.event === 'UNCLAIMED') {
    console.warn(`[quarantine] unknown gateway ${msg.gateway_id} @ ${msg.gateway_ip} — awaiting commissioning`);
  } else if (binding.event === 'IP_CONFLICT') {
    console.warn(`[quarantine] ${msg.gateway_id} configured gateway_ip ${msg.gateway_ip} is already assigned to another device`);
  } else if (binding.event === 'UNCONFIGURED') {
    console.warn(`[quarantine] ${msg.gateway_id} has no gateway IP configured in Studio — configure it before it can publish`);
  } else if (binding.event === 'IP_MISMATCH') {
    console.warn(`[quarantine] ${msg.gateway_id} reported ${msg.gateway_ip} which does not match its configured Studio IP`);
  } else if (binding.event === 'COMMISSIONED') {
    console.log(`COMMISSIONED: ${msg.gateway_id} Rack ${msg.rack_id} ${msg.gateway_ip}`);
  } else {
    console.log(`BOUND: ${msg.gateway_id} Rack ${msg.rack_id} ${msg.gateway_ip}`);
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
    case 'inventory':
      await handleInventory(msg);
      break;
    case 'telemetry': {
      const stored = await handleTelemetry(msg);
      console.log(`[telemetry] ${msg.gateway_id}/rack ${msg.rack_id}: ${stored}/${msg.payload.records.length} records`);
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

  broadcast({ kind: parsed.kind, topic, message: msg });
}

// --- Startup -----------------------------------------------------------------
async function main() {
  await ensureSchema();
  console.log('[db] schema ready');

  const client = mqtt.connect(MQTT_URL, {
    clientId: CLIENT_ID,
    protocolVersion: 5,
    username: process.env.MQTT_USERNAME,
    password: process.env.MQTT_PASSWORD,
    clean: true,
    reconnectPeriod: 2000,
    rejectUnauthorized: process.env.MQTT_REJECT_UNAUTHORIZED !== '0',
  });

  client.on('connect', () => {
    console.log(`[mqtt] connected to ${MQTT_URL} as ${CLIENT_ID}`);
    client.subscribe(SUBSCRIPTION, { qos: 1 }, (err) => {
      if (err) console.error('[mqtt] subscribe failed', err);
      else console.log(`[mqtt] subscribed to ${SUBSCRIPTION}`);
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
