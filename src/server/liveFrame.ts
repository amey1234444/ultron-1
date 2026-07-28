// Live frames: the low-latency half of ingestion.
//
//   ingest ──frame──> pg_notify('ultron_live') ──> /api/live/stream (SSE) ──> UI
//           └─persist─> PostgreSQL (behind the frame, not in front of it)
//
// A frame is a partial LiveState built straight from a validated MQTT envelope,
// so the browser can render a reading without waiting for the writes that frame
// triggers. NOTIFY is used purely as a broker: no rows, no transaction, one
// round trip, and every Next.js instance can LISTEN for it.
//
// Frame construction itself lives in lib/liveFrame.ts because the browser builds
// frames too when it subscribes to the broker directly.
//
// Mirrored in services/mqtt-ingest/liveFrame.js for the standalone worker; keep
// both in sync.

import { Client } from 'pg';

import type { LiveFrame } from '../../lib/liveTelemetry';
import { query } from './db';
import { logServerError } from './errors';

export { buildLiveFrame } from '../../lib/liveFrame';
export type { LiveFrame } from '../../lib/liveTelemetry';

export const LIVE_CHANNEL = 'ultron_live';
const MAX_NOTIFY_BYTES = 7000;

export async function publishLiveFrame(frame: LiveFrame): Promise<void> {
  let json = JSON.stringify(frame);
  if (Buffer.byteLength(json, 'utf8') > MAX_NOTIFY_BYTES) {
    json = JSON.stringify({ serverNowMs: frame.serverNowMs, invalidate: true });
  }
  try {
    await query('SELECT pg_notify($1, $2)', [LIVE_CHANNEL, json]);
  } catch (err) {
    // The realtime path must never fail an ingest request.
    logServerError('live frame notify failed', err);
  }
}

// --- Subscription -----------------------------------------------------------
// LISTEN needs a session-scoped connection, so it uses a dedicated client (kept
// per process and shared by all open streams) rather than the request pool.
// PgBouncer in transaction mode swallows LISTEN, hence LIVE_NOTIFY_DATABASE_URL
// for a direct (session-mode) URL; without it streams fall back to polling.

type Subscriber = (frame: LiveFrame) => void;

const globalRef = globalThis as unknown as {
  __ultronLiveSubscribers?: Set<Subscriber>;
  __ultronLiveListener?: Promise<boolean>;
};

function notifyUrl(): string | undefined {
  return process.env.LIVE_NOTIFY_DATABASE_URL ?? process.env.DATABASE_URL;
}

function stripSslParams(url: string): string {
  try {
    const parsed = new URL(url);
    for (const key of ['sslmode', 'ssl', 'sslcert', 'sslkey', 'sslrootcert']) parsed.searchParams.delete(key);
    return parsed.toString();
  } catch {
    return url;
  }
}

function subscribers(): Set<Subscriber> {
  if (!globalRef.__ultronLiveSubscribers) globalRef.__ultronLiveSubscribers = new Set();
  return globalRef.__ultronLiveSubscribers;
}

async function startListener(): Promise<boolean> {
  const url = notifyUrl();
  if (!url) return false;
  const client = new Client({
    connectionString: stripSslParams(url),
    ssl: /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: false },
  });
  client.on('notification', (message) => {
    if (message.channel !== LIVE_CHANNEL || !message.payload) return;
    let frame: LiveFrame;
    try {
      frame = JSON.parse(message.payload) as LiveFrame;
    } catch {
      return;
    }
    for (const subscriber of subscribers()) subscriber(frame);
  });
  client.on('error', (err) => {
    logServerError('live frame listener error', err);
    globalRef.__ultronLiveListener = undefined;
    client.end().catch(() => {});
  });
  await client.connect();
  await client.query(`LISTEN ${LIVE_CHANNEL}`);
  return true;
}

// Resolves false when push is unavailable (no database URL, or a pooler that
// does not support LISTEN) so callers can fall back to polling.
export function subscribeLiveFrames(onFrame: Subscriber): () => void {
  subscribers().add(onFrame);
  if (!globalRef.__ultronLiveListener) {
    globalRef.__ultronLiveListener = startListener().catch((err) => {
      logServerError('live frame listener failed to start', err);
      globalRef.__ultronLiveListener = undefined;
      return false;
    });
  }
  return () => {
    subscribers().delete(onFrame);
  };
}

// A stream must not wait on a slow LISTEN connection to start serving, so an
// undecided listener counts as unavailable and the caller polls until it settles.
export async function liveFramesAvailable(timeoutMs = 1500): Promise<boolean> {
  const pending = globalRef.__ultronLiveListener;
  if (!pending) return false;
  return Promise.race([
    pending,
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), timeoutMs)),
  ]);
}
