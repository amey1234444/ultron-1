// Fan-out of live frames to the frontend, ahead of any persistence work.
//
//   EMQX → ingest → pg_notify('ultron_live') → Next.js /api/live/stream (SSE) → UI
//
// PostgreSQL's NOTIFY is used purely as a message bus (no rows written, no
// transaction): it is a single round trip and needs no extra infrastructure,
// while every Next.js instance can LISTEN for it. Payloads above the 8 kB
// NOTIFY limit degrade to an `invalidate` marker, which makes subscribers pull a
// snapshot instead of dropping the update.

import { query } from './db.js';

export const LIVE_CHANNEL = 'ultron_live';
const MAX_NOTIFY_BYTES = 7000;

let lastFailureLoggedAt = 0;

export async function publishLiveFrame(frame) {
  let json = JSON.stringify(frame);
  if (Buffer.byteLength(json, 'utf8') > MAX_NOTIFY_BYTES) {
    json = JSON.stringify({ serverNowMs: frame.serverNowMs, invalidate: true });
  }
  try {
    await query('SELECT pg_notify($1, $2)', [LIVE_CHANNEL, json]);
  } catch (err) {
    // Never let the realtime path take the ingest service down; log at most
    // once a minute so a database outage cannot flood the logs.
    if (Date.now() - lastFailureLoggedAt > 60_000) {
      lastFailureLoggedAt = Date.now();
      console.error('[live-bus] notify failed', err.message);
    }
  }
}
