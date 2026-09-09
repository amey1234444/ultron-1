// The application's own broker connection: one MQTT client per app instance,
// subscribing to the gateway tree and publishing command requests back down it.
//
//   gateway ──publish──▶ EMQX ──subscribe──▶ this process ──publish──▶ EMQX ──▶ gateway
//
// This is the only door into the pipeline in the default configuration. There is
// no HTTP action, no webhook and no polling: the broker pushes to a connection
// this process holds open, which is what makes the path end-to-end pub/sub.
//
// Every app instance subscribes with its own client id and receives every
// message, so each instance can serve the frames to the browsers connected to
// it. Duplicate persistence across instances is not a concern: `claimMessage`
// inserts on `message_id` with ON CONFLICT DO NOTHING, so exactly one instance
// writes each message and the rest see a QoS duplicate.

import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

import { GATEWAY_SUBSCRIPTIONS } from './topics.mjs';

const RESPONSE_TIMEOUT_MS = Number(process.env.MQTT_COMMAND_TIMEOUT_MS ?? 10_000);

function flag(value, fallback) {
  if (value === undefined || value === '') return fallback;
  return !['0', 'false', 'no', 'off'].includes(String(value).trim().toLowerCase());
}

function cert(path) {
  return path ? readFileSync(path) : undefined;
}

export function brokerConfig() {
  const host = (process.env.MQTT_HOST ?? '').trim();
  const useTls = flag(process.env.MQTT_USE_TLS, true);
  // A stable prefix keeps the client recognisable in the EMQX dashboard; the
  // random suffix keeps two app instances from evicting each other, which a
  // shared client id would do on every deploy and every scale-up.
  const prefix = process.env.MQTT_BACKEND_CLIENT_ID ?? process.env.MQTT_CLIENT_ID ?? 'ultron-app-ingest';
  return {
    host,
    port: Number(process.env.MQTT_PORT ?? (useTls ? 8883 : 1883)),
    useTls,
    clientId: `${prefix}-${randomUUID().slice(0, 8)}`,
    username: process.env.MQTT_USERNAME || undefined,
    password: process.env.MQTT_PASSWORD || undefined,
    rejectUnauthorized: flag(process.env.MQTT_REJECT_UNAUTHORIZED, true),
    // EMQX speaks MQTT 5, which is what the contract assumes. Brokers that only
    // speak 3.1.1 need 4 here, or every PUBACK comes back unparseable.
    protocolVersion: Number(process.env.MQTT_PROTOCOL_VERSION ?? 5),
    qos: Math.max(0, Math.min(1, Number(process.env.MQTT_SUBSCRIBE_QOS ?? 1))),
    caCert: process.env.MQTT_CA_CERT,
    clientCert: process.env.MQTT_CLIENT_CERT,
    clientKey: process.env.MQTT_CLIENT_KEY,
  };
}

function connectOptions(config) {
  return {
    host: config.host,
    port: config.port,
    protocol: config.useTls ? 'mqtts' : 'mqtt',
    clientId: config.clientId,
    protocolVersion: config.protocolVersion,
    username: config.username,
    password: config.password,
    clean: true,
    reconnectPeriod: 1000,
    connectTimeout: 30_000,
    resubscribe: true,
    rejectUnauthorized: config.rejectUnauthorized,
    ca: cert(config.caCert),
    cert: cert(config.clientCert),
    key: cert(config.clientKey),
  };
}

const state = {
  client: null,
  config: null,
  connected: false,
  connectedAt: null,
  reconnects: 0,
  lastError: null,
};

// request_id -> resolve, for command responses arriving on the ingest topic.
const pendingCommands = new Map();

export function brokerStatus() {
  return {
    configured: Boolean(state.config?.host),
    connected: state.connected,
    clientId: state.config?.clientId ?? null,
    host: state.config?.host ? `${state.config.host}:${state.config.port}` : null,
    tls: state.config?.useTls ?? null,
    protocolVersion: state.config?.protocolVersion ?? null,
    connectedAt: state.connectedAt,
    reconnects: state.reconnects,
    lastError: state.lastError,
    pendingCommands: pendingCommands.size,
  };
}

// `onMessage(topic, buffer)` is the pipeline. Returns false when no broker is
// configured, so startup can say so plainly instead of failing silently.
export async function connectBroker(onMessage) {
  if (state.client) return true;
  const config = brokerConfig();
  state.config = config;
  if (!config.host) {
    console.warn('[mqtt] MQTT_HOST is not set; the broker subscription is disabled');
    return false;
  }

  const { default: mqtt } = await import('mqtt');
  const client = mqtt.connect(connectOptions(config));
  state.client = client;

  client.on('connect', () => {
    state.connected = true;
    state.connectedAt = new Date().toISOString();
    state.lastError = null;
    console.log(`[mqtt] connected to ${config.host}:${config.port} as ${config.clientId}`);
    client.subscribe(
      Object.fromEntries(GATEWAY_SUBSCRIPTIONS.map((filter) => [filter, { qos: config.qos }])),
      (err) => {
        if (err) console.error('[mqtt] subscribe failed', err.message);
        else console.log(`[mqtt] subscribed to ${GATEWAY_SUBSCRIPTIONS.length} gateway filters at qos ${config.qos}`);
      },
    );
  });

  client.on('reconnect', () => {
    state.reconnects += 1;
    console.warn(`[mqtt] reconnecting to ${config.host}:${config.port} (attempt ${state.reconnects})`);
  });

  client.on('close', () => {
    if (state.connected) console.warn('[mqtt] connection closed');
    state.connected = false;
  });

  client.on('error', (err) => {
    state.lastError = err.message;
    console.error('[mqtt] error', err.message);
  });

  client.on('message', (topic, payload) => {
    onMessage(topic, payload).catch((err) => console.error(`[mqtt:pipeline] ${topic}:`, err.message));
  });

  return true;
}

// Downlink. QoS 1 and no retain: a command must be delivered once, and must not
// be replayed to a gateway that reconnects later.
export function publishToBroker(topic, message, { qos = 1, retain = false } = {}) {
  if (!state.client) throw new Error('broker is not configured');
  if (!state.connected) throw new Error('broker is not connected');
  return new Promise((resolve, reject) => {
    state.client.publish(topic, JSON.stringify(message), { qos, retain }, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

export function awaitCommandResponse(requestId, timeoutMs = RESPONSE_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingCommands.delete(requestId);
      reject(new Error(`no gateway response for ${requestId} within ${timeoutMs}ms`));
    }, timeoutMs);
    pendingCommands.set(requestId, (payload) => {
      clearTimeout(timer);
      pendingCommands.delete(requestId);
      resolve(payload);
    });
  });
}

// Called by the pipeline when a `commands/response` message is ingested, which
// closes the request/response loop over pub/sub rather than over a return HTTP
// call the gateway would have to be reachable for.
export function resolveCommandResponse(msg) {
  const requestId = msg?.payload?.request_id;
  if (typeof requestId !== 'string') return false;
  const resolver = pendingCommands.get(requestId);
  if (!resolver) return false;
  resolver(msg.payload);
  return true;
}

export async function disconnectBroker() {
  if (!state.client) return;
  await new Promise((resolve) => state.client.end(false, {}, resolve));
  state.client = null;
  state.connected = false;
}
