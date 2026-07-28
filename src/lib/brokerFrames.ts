// Direct broker subscription from the browser.
//
//   gateway → EMQX ──wss──> browser (render)
//                  └─HTTP──> Vercel → PostgreSQL (history, behind the render)
//
// One broker hop replaces gateway → HTTP action → serverless function → database
// → poll, so a reading is on screen in the time a WebSocket frame takes to
// arrive, at whatever rate the gateway publishes. Nothing here is trusted for
// authorization: frames are merged only into gateways the persisted snapshot
// already shows (see mergeLiveFrame), and the broker user is subscribe-only.

import { buildLiveFrame, parseLiveTopic } from '../../lib/liveFrame';
import type { LiveFrame } from '../../lib/liveTelemetry';
import { apiFetch } from './apiClient';

export type BrokerConfig = {
  enabled: boolean;
  url?: string;
  username?: string;
  password?: string;
  topics?: string[];
  clientIdPrefix?: string;
};

export type BrokerSubscription = { close: () => void };

// Kinds a frame can describe; the rest (alarms, command responses) reach the UI
// through the persisted snapshot.
const RENDERABLE = new Set(['status', 'topology', 'rack_health', 'inventory', 'telemetry']);
const MAX_RETAINED_TELEMETRY_AGE_MS = 5_000;

export async function fetchBrokerConfig(): Promise<BrokerConfig> {
  try {
    const res = await apiFetch('/api/live/broker', { cache: 'no-store', headers: { Accept: 'application/json' } });
    if (!res.ok) return { enabled: false };
    return (await res.json()) as BrokerConfig;
  } catch {
    return { enabled: false };
  }
}

function sourceCreatedAtMs(message: unknown): number | null {
  const msg = message as { created_at_us?: unknown; created_at?: unknown };
  const micros = Number(msg.created_at_us);
  if (Number.isFinite(micros) && micros > 0) return Math.round(micros / 1000);
  const parsed = Date.parse(typeof msg.created_at === 'string' ? msg.created_at : '');
  return Number.isNaN(parsed) ? null : parsed;
}

function frameFrom(topic: string, payload: Uint8Array, retained = false): LiveFrame | null {
  const parsed = parseLiveTopic(topic);
  if (!parsed || !RENDERABLE.has(parsed.kind)) return null;
  let message: unknown;
  try {
    message = JSON.parse(new TextDecoder().decode(payload));
  } catch {
    return null;
  }
  const envelope = message as { gateway_id?: unknown; rack_id?: unknown };
  // Topic and payload must agree, exactly as the ingest pipeline requires.
  if (envelope.gateway_id !== parsed.gatewayId) return null;
  if (parsed.rackId !== null && envelope.rack_id !== parsed.rackId) return null;
  if (retained && parsed.kind === 'telemetry') {
    const sourceMs = sourceCreatedAtMs(message);
    if (sourceMs === null || Date.now() - sourceMs > MAX_RETAINED_TELEMETRY_AGE_MS) return null;
  }
  return buildLiveFrame(parsed.kind, message);
}

export async function subscribeBrokerFrames(
  config: BrokerConfig,
  onFrame: (frame: LiveFrame) => void,
  onStatus?: (connected: boolean) => void,
): Promise<BrokerSubscription | null> {
  if (!config.enabled || !config.url) return null;
  const { default: mqtt } = await import('mqtt');

  const client = mqtt.connect(config.url, {
    // A duplicate client id makes the broker evict the other tab, so every
    // subscriber gets its own.
    clientId: `${config.clientIdPrefix ?? 'ultron-ui'}-${Math.random().toString(16).slice(2, 10)}`,
    username: config.username,
    password: config.password,
    protocolVersion: 5,
    clean: true,
    keepalive: 30,
    reconnectPeriod: 2000,
    connectTimeout: 10_000,
  });

  client.on('connect', () => {
    onStatus?.(true);
    const topics = config.topics ?? [];
    if (topics.length > 0) client.subscribe(Object.fromEntries(topics.map((topic) => [topic, { qos: 1 as const }])));
  });
  client.on('close', () => onStatus?.(false));
  client.on('error', () => onStatus?.(false));
  client.on('message', (topic, payload, packet) => {
    const frame = frameFrom(topic, payload, packet.retain);
    if (frame) onFrame(frame);
  });

  return {
    close: () => {
      client.removeAllListeners();
      client.end(true);
    },
  };
}
