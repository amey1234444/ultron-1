// The browser leg of the pub/sub chain.
//
//   broker ──▶ pipeline ──▶ publishToSubscribers() ──▶ every socket whose
//                                                      filters match the topic
//
// Browsers are subscribers, not pollers: they open one socket, send the topic
// filters they care about, and receive frames as the broker delivers them. The
// filters are real MQTT filters (`ultron/v1/gateways/+/racks/+/telemetry`), so
// the subscription a page asks for is expressed in the same language the
// gateways publish in. A socket that never subscribes gets everything, which
// keeps the existing dashboard working unchanged.
//
// A second, optional server handles gateways that cannot reach the broker
// (`INGEST_TRANSPORT=websocket|both`). It is off by default: in the normal
// configuration the broker is the only way into the pipeline.

import { WebSocketServer } from 'ws';

import { topicForMessage, topicMatchesFilter } from './topics.mjs';
import { sessionUserId } from './wsSession.mjs';

export const GATEWAY_WS_PATH = process.env.GATEWAY_WS_PATH ?? '/ws/gateway';
export const LIVE_WS_PATH = process.env.LIVE_WS_PATH ?? '/ws/live';
const GATEWAY_WS_SECRET = process.env.DIRECT_WS_GATEWAY_SECRET ?? process.env.GATEWAY_WS_SECRET ?? '';
// Escape hatch for local development against a database with no session rows.
const LIVE_WS_REQUIRE_SESSION = !['0', 'false', 'no'].includes(
  String(process.env.LIVE_WS_REQUIRE_SESSION ?? (process.env.NODE_ENV === 'production' ? 'true' : 'false')).toLowerCase(),
);
const MAX_SUBSCRIPTIONS = 64;
const HEARTBEAT_INTERVAL_MS = 30_000;

const liveWss = new WebSocketServer({ noServer: true });
const gatewayWss = new WebSocketServer({ noServer: true });

let gatewayIngest = null; // set by the runtime when the fallback door is enabled

export function liveSocketStats() {
  return {
    liveClients: liveWss.clients.size,
    gatewayClients: gatewayWss.clients.size,
    gatewayDoorEnabled: gatewayIngest !== null,
    sessionRequired: LIVE_WS_REQUIRE_SESSION,
  };
}

// --- Publish ----------------------------------------------------------------
export function publishToSubscribers(topic, event) {
  if (liveWss.clients.size === 0) return;
  const data = JSON.stringify(event);
  for (const client of liveWss.clients) {
    if (client.readyState !== 1) continue;
    if (client.filters && !client.filters.some((filter) => topicMatchesFilter(topic, filter))) continue;
    client.send(data);
  }
}

// --- Upgrade routing ---------------------------------------------------------
function bearerToken(req, url) {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) return auth.slice('Bearer '.length);
  return url.searchParams.get('token') ?? '';
}

function reject(socket, status, reason) {
  socket.write(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\n\r\n`);
  socket.destroy();
}

export function attachIngestWebSockets(server) {
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

    if (url.pathname === LIVE_WS_PATH) {
      void (async () => {
        const userId = await sessionUserId(req);
        if (!userId && LIVE_WS_REQUIRE_SESSION) return reject(socket, 401, 'Unauthorized');
        liveWss.handleUpgrade(req, socket, head, (ws) => {
          ws.userId = userId;
          liveWss.emit('connection', ws, req);
        });
      })();
      return;
    }

    if (url.pathname === GATEWAY_WS_PATH) {
      if (!gatewayIngest) return reject(socket, 404, 'Not Found');
      // An empty secret used to mean "no check", which turns the fallback door
      // into an unauthenticated write path into the pipeline. Enabling the door
      // without a secret is a misconfiguration, not permission to skip auth.
      if (!GATEWAY_WS_SECRET || bearerToken(req, url) !== GATEWAY_WS_SECRET) return reject(socket, 401, 'Unauthorized');
      gatewayWss.handleUpgrade(req, socket, head, (ws) => gatewayWss.emit('connection', ws, req));
      return;
    }

    reject(socket, 404, 'Not Found');
  });
}

// --- Live (browser) sockets --------------------------------------------------
function heartbeat(ws) {
  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
  });
}

function applySubscription(ws, message) {
  const topics = Array.isArray(message.topics) ? message.topics : [message.topic];
  const filters = topics.filter((topic) => typeof topic === 'string' && topic.length > 0).slice(0, MAX_SUBSCRIPTIONS);
  if (message.type === 'unsubscribe') {
    if (!ws.filters) return;
    ws.filters = ws.filters.filter((filter) => !filters.includes(filter));
    if (ws.filters.length === 0) ws.filters = null; // back to the full feed
    return;
  }
  ws.filters = [...new Set([...(ws.filters ?? []), ...filters])].slice(0, MAX_SUBSCRIPTIONS);
}

liveWss.on('connection', (ws) => {
  heartbeat(ws);
  ws.filters = null; // null = every topic; set by an explicit subscribe
  ws.send(JSON.stringify({ type: 'hello', serverNowMs: Date.now(), authenticated: Boolean(ws.userId) }));

  ws.on('message', (raw) => {
    let message;
    try {
      message = JSON.parse(raw.toString('utf8'));
    } catch {
      return;
    }
    if (message?.type === 'subscribe' || message?.type === 'unsubscribe') {
      applySubscription(ws, message);
      ws.send(JSON.stringify({ type: 'subscribed', topics: ws.filters ?? ['#'] }));
    } else if (message?.type === 'ping') {
      ws.send(JSON.stringify({ type: 'pong', serverNowMs: Date.now() }));
    }
  });
});

// --- Gateway sockets (fallback door, disabled unless configured) -------------
function normalizeGatewayPacket(raw) {
  const packet = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!packet || typeof packet !== 'object') throw new Error('packet must be a JSON object');
  const message = packet.message ?? packet.payload ?? packet;
  const topic = typeof packet.topic === 'string' ? packet.topic : topicForMessage(message);
  if (!topic) throw new Error('missing topic');
  return { topic, message };
}

export function enableGatewaySocketDoor(onMessage, maxPayloadBytes) {
  if (!GATEWAY_WS_SECRET) {
    console.error(`[ws:gateway] ${GATEWAY_WS_PATH} NOT opened: DIRECT_WS_GATEWAY_SECRET is unset`);
    return false;
  }
  gatewayIngest = onMessage;
  gatewayWss.on('connection', (ws, req) => {
    heartbeat(ws);
    const peer = req.socket.remoteAddress ?? 'unknown';
    console.log(`[ws:gateway] connected ${peer}`);
    ws.on('message', (raw) => {
      const text = Buffer.isBuffer(raw) ? raw.toString('utf8') : Buffer.from(raw).toString('utf8');
      if (Buffer.byteLength(text, 'utf8') > maxPayloadBytes) {
        ws.send(JSON.stringify({ type: 'error', error: 'payload too large' }));
        return;
      }
      let packet;
      try {
        packet = normalizeGatewayPacket(text);
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
  return true;
}

export function startSocketHeartbeat() {
  const timer = setInterval(() => {
    for (const ws of [...liveWss.clients, ...gatewayWss.clients]) {
      if (ws.isAlive === false) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, HEARTBEAT_INTERVAL_MS);
  timer.unref?.();
  return timer;
}
