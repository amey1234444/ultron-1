// One message, one pass. Unchanged from the standalone worker apart from where
// it now lives and where the frames go:
//
//   topic parse → JSON parse → schema validation → topic/payload identity
//   → publish live frame (browser sockets + pg_notify) → queue persistence
//
// Delivery to the UI never waits on the database: everything before the frame is
// pure validation, so a reading is on the wire in roughly the time it takes to
// parse it. Frames carry no authorization — the browser applies them only for
// gateways its persisted snapshot already shows as commissioned — and
// persistence keeps full binding, dedup and quarantine semantics.

import { buildLiveFrame } from './liveFrame.mjs';
import { publishLiveFrame } from './liveBus.mjs';
import { enqueue } from './persistQueue.mjs';
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
  quarantine,
  setMetric,
} from './handlers.mjs';
import { maybeLogPayload, recordGatewayToApp, recordPipeline } from './latency.mjs';
import { resolveCommandResponse } from './mqttClient.mjs';
import { publishToSubscribers } from './liveSocket.mjs';
import { parseTopic } from './topics.mjs';
import { SCHEMA_FOR_KIND, validateEnvelope, validatePayload } from './validate.mjs';

export const PERSISTENCE_ENABLED = !['0', 'false', 'no'].includes(
  String(process.env.PERSISTENCE_ENABLED ?? (process.env.DATABASE_URL ? 'true' : 'false')).toLowerCase(),
);
export const MAX_PAYLOAD_BYTES = Number(
  process.env.MQTT_MAX_PAYLOAD_BYTES ?? process.env.DIRECT_WS_MAX_PAYLOAD_BYTES ?? 262_144,
);
// Budget for gateway sample → frame published. Exceeding it means the broker,
// the network or the gateway clock is the bottleneck, not this application.
const LATENCY_BUDGET_MS = Number(process.env.LATENCY_BUDGET_MS ?? 1000);
const LATENCY_WARN_INTERVAL_MS = 5000;
// Kinds whose handler writes the full rack row, so binding must not write it too.
const KINDS_UPSERTING_RACK = new Set(['telemetry', 'rack_health', 'topology']);

async function rejectMessage(topic, reason, msg) {
  bumpMetric('quarantine_messages');
  if (PERSISTENCE_ENABLED) return quarantine(topic, reason, msg);
  console.warn(`[reject] ${topic}: ${reason}`);
  return undefined;
}

export async function onMessage(topic, buf) {
  // Started before any parsing so the pipeline figure covers everything this
  // process does to a payload, not just the interesting part.
  const startedAt = performance.now();
  const arrivedAtMs = Date.now();
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

  // A response to a command this application published: hand it to whoever is
  // waiting on that request_id before it falls through to the generic branches.
  if (parsed.kind === 'command_response') resolveCommandResponse(msg);

  // ---- Realtime branch: straight to the subscribers, no database involved ---
  // The browser leg is the third hop of the same pub/sub chain: gateway →
  // broker → this process → subscribed sockets. pg_notify carries the same frame
  // to any other app instance so its SSE clients see it too.
  const frame = buildLiveFrame(parsed.kind, msg);
  if (frame) {
    // Sockets first, deliberately. pg_notify is a database round trip; even
    // un-awaited it does synchronous work (serialising the frame, building the
    // statement) before yielding, and that work would sit between the message
    // arriving and the browser seeing it. Presentation is the priority, so
    // nothing database-shaped runs ahead of it.
    publishToSubscribers(topic, { type: 'frame', kind: parsed.kind, topic, frame, serverNowMs: Date.now() });
    // Measured at the moment the frame is on the wire to the browser, which is
    // the point the reading is actually visible. Anything after this (pg_notify,
    // persistence) is storage and must not count against it.
    const pipelineMs = performance.now() - startedAt;
    recordPipeline(pipelineMs);
    const gatewayToAppMs = recordGatewayToApp(msg.gateway_id, frame.sourceCreatedAtMs, arrivedAtMs);
    maybeLogPayload(topic, gatewayToAppMs, pipelineMs);
    recordPublishLatency(frame);
    if (PERSISTENCE_ENABLED) void publishLiveFrame(frame);
  }

  bumpMetric(`messages_schema_${msg.schema.replaceAll('.', '_')}`);
  bumpMetric('messages_total');
  setMetric('last_message_unix_seconds', Math.floor(Date.now() / 1000));

  if (!PERSISTENCE_ENABLED) return;

  // ---- Persistence branch: queued, coalesced, off the latency path ---------
  const persistKey = parsed.kind === 'alarm' || parsed.kind === 'fault' || parsed.kind === 'system'
    ? `${parsed.kind}|${msg.message_id}`
    : `${parsed.kind}|${msg.gateway_id}|${msg.rack_id ?? ''}`;
  enqueue(persistKey, () => persist(topic, parsed, msg));
}

// Gateway sample → frame published, the part of end-to-end latency this
// application owns. Exported as a metric so the budget is observable rather
// than assumed.
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
  if (!fresh) return; // QoS 1 duplicate — already ingested, here or on another instance

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
