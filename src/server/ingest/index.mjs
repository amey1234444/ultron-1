// Ultron ingest runtime — part of the web application, not a service beside it.
//
//   gateway ──MQTT publish──▶ EMQX ──MQTT subscribe──▶ this Node process
//                                                       ├─ WebSocket publish ─▶ browsers
//                                                       ├─ pg_notify publish ─▶ other app instances → SSE
//                                                       └─ queued persistence ─▶ PostgreSQL
//   this process ──MQTT publish──▶ EMQX ──MQTT subscribe──▶ gateway (commands)
//
// Every hop is a publication onto a topic somebody has subscribed to. Nothing in
// the live path is a request/response HTTP call, so no hop depends on one side
// being reachable from the other: the gateway dials out to the broker, the app
// dials out to the broker, and the browser dials out to the app.
//
// Started by server.mjs, in the same process that serves Next.js, so an API
// route can publish a command through the connection this module holds open.

import { ensureSchema } from './db.mjs';
import { flushMetrics, markStaleGateways, setMetric } from './handlers.mjs';
import {
  GATEWAY_WS_PATH,
  LIVE_WS_PATH,
  attachIngestWebSockets,
  enableGatewaySocketDoor,
  liveSocketStats,
  startSocketHeartbeat,
} from './liveSocket.mjs';
import { brokerStatus, connectBroker, disconnectBroker } from './mqttClient.mjs';
import { coalescedCount, droppedCount, failureCount, queueDepth } from './persistQueue.mjs';
import { MAX_PAYLOAD_BYTES, PERSISTENCE_ENABLED, onMessage } from './pipeline.mjs';
import { sendCommand } from './commands.mjs';

// mqtt = broker subscription only (the default, and the whole point of the
// pub/sub model). websocket/both additionally open the direct gateway door for a
// broker outage or a bench test.
const INGEST_TRANSPORT = (process.env.INGEST_TRANSPORT ?? 'mqtt').trim().toLowerCase();
const BROKER_ENABLED = INGEST_TRANSPORT !== 'websocket';
const GATEWAY_DOOR_ENABLED = INGEST_TRANSPORT === 'websocket' || INGEST_TRANSPORT === 'both';
const STALE_AFTER_S = Number(process.env.STALE_AFTER_S ?? process.env.MQTT_STALE_AFTER_S ?? 15);
const METRICS_FLUSH_INTERVAL_MS = Number(process.env.METRICS_FLUSH_INTERVAL_MS ?? 2000);

export { attachIngestWebSockets, sendCommand };

export function ingestHealth() {
  return {
    ok: true,
    transport: INGEST_TRANSPORT,
    // `enabled` is the intent; `ready` is whether the database is actually
    // answering. enabled && !ready means live data is flowing but not stored.
    persistence: { enabled: PERSISTENCE_ENABLED, ready: schemaReady, queueDepth: queueDepth(), dropped: droppedCount(), failed: failureCount() },
    broker: brokerStatus(),
    sockets: liveSocketStats(),
    serverNowMs: Date.now(),
  };
}

export function handleIngestHealth(req, res) {
  if (!req.url?.startsWith('/health')) return false;
  res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(ingestHealth()));
  return true;
}

let runtimeStarted = false;
// Storage readiness, tracked separately from storage being *wanted*. Presenting
// data matters more than storing it, so an unreachable database degrades this to
// false and the live path carries on without it.
let schemaReady = false;
const SCHEMA_RETRY_MS = Number(process.env.DB_SCHEMA_RETRY_MS ?? 15_000);

// Never throws. A database that is down at boot must not stop the broker
// subscription or the browser sockets from coming up — that would let a storage
// outage take out presentation, which is exactly backwards. Persistence jobs
// already fail individually and are dropped, so the app runs live-only until the
// database answers, then starts writing without a restart.
async function prepareSchema() {
  try {
    await ensureSchema();
    if (!schemaReady) console.log('[db] schema ready');
    schemaReady = true;
  } catch (err) {
    schemaReady = false;
    console.error(`[db] schema not ready (${err.message}); serving live frames and retrying in ${SCHEMA_RETRY_MS}ms`);
    setTimeout(() => void prepareSchema(), SCHEMA_RETRY_MS).unref?.();
  }
}

export async function startIngestRuntime() {
  if (runtimeStarted) return;
  runtimeStarted = true;

  if (PERSISTENCE_ENABLED) {
    // Not awaited. Waiting here would hold the broker subscription and the
    // browser sockets behind a database round trip — up to the connect timeout
    // when the database is unreachable — which is presentation waiting on
    // storage. Schema prep runs alongside; writes that land before it finishes
    // fail individually and are dropped.
    void prepareSchema();
  } else {
    console.log('[db] persistence disabled; live frames are published but not stored');
  }

  startSocketHeartbeat();

  if (GATEWAY_DOOR_ENABLED && enableGatewaySocketDoor(onMessage, MAX_PAYLOAD_BYTES)) {
    console.warn(`[ingest] direct gateway door open at ${GATEWAY_WS_PATH} (INGEST_TRANSPORT=${INGEST_TRANSPORT})`);
  }

  if (BROKER_ENABLED) await connectBroker(onMessage);
  else console.warn('[ingest] broker subscription disabled by INGEST_TRANSPORT=websocket');

  console.log(`[ingest] live subscriptions served at ${LIVE_WS_PATH}`);

  if (PERSISTENCE_ENABLED) {
    // Last-will backstop: a gateway that stops publishing goes OFFLINE even if
    // the broker never delivered its will (process killed, network partition).
    setInterval(() => {
      markStaleGateways(STALE_AFTER_S).catch((err) => console.error('[stale]', err.message));
    }, 5000).unref?.();

    setInterval(() => {
      setMetric('persist_queue_depth', queueDepth());
      setMetric('persist_coalesced_total', coalescedCount());
      setMetric('persist_dropped_total', droppedCount());
      flushMetrics().catch((err) => console.error('[metrics]', err.message));
    }, METRICS_FLUSH_INTERVAL_MS).unref?.();
  }

  // Next.js API routes are bundled separately from this module, so they cannot
  // reach this instance by import. The runtime publishes itself here instead,
  // which is how /api/live/command reaches the live broker connection.
  globalThis.__ultronIngest = { sendCommand, ingestHealth, brokerStatus };
}

export async function stopIngestRuntime() {
  await disconnectBroker();
}
