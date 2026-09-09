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
import { coalescedCount, queueDepth } from './persistQueue.mjs';
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
    persistence: PERSISTENCE_ENABLED,
    broker: brokerStatus(),
    sockets: liveSocketStats(),
    persistQueueDepth: queueDepth(),
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

export async function startIngestRuntime() {
  if (runtimeStarted) return;
  runtimeStarted = true;

  if (PERSISTENCE_ENABLED) {
    await ensureSchema();
    console.log('[db] schema ready');
  } else {
    console.log('[db] persistence disabled; live frames are published but not stored');
  }

  startSocketHeartbeat();

  if (GATEWAY_DOOR_ENABLED) {
    enableGatewaySocketDoor(onMessage, MAX_PAYLOAD_BYTES);
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
