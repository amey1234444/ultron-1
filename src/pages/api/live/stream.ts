// Server-sent live state. Replaces the UI's REST polling as the primary
// transport: one authenticated connection, frames forwarded the moment ingest
// publishes them (before those readings are persisted), and periodic snapshots
// to reconcile everything the frames cannot express (quarantine alerts, racks
// going away, rows written by another process).
//
// When NOTIFY-based push is unavailable (no LIVE_NOTIFY_DATABASE_URL and the
// pooler swallows LISTEN) the stream degrades to fast snapshot polling, which is
// still cheaper than the client polling /api/live/state because auth, the
// connection and change detection all happen once.

import type { NextApiRequest, NextApiResponse } from 'next';

import { isDbEnabled } from '../../../server/db';
import { sendApiError } from '../../../server/errors';
import { liveFramesAvailable, subscribeLiveFrames, type LiveFrame } from '../../../server/liveFrame';
import { guardRequest } from '../../../server/security';
import { getSessionUser } from '../../../server/session';
import { getLiveState } from '../../../server/telemetry';

const HEARTBEAT_INTERVAL_MS = 15_000;
// Serverless hosts cap function duration; end cleanly just under it and let the
// browser's EventSource reconnect.
const MAX_DURATION_MS = Number(process.env.LIVE_STREAM_MAX_DURATION_MS ?? 50_000);
// Reconciliation cadence while frames are arriving, and the polling cadence when
// they are not.
const SNAPSHOT_INTERVAL_MS = Number(process.env.LIVE_STREAM_SNAPSHOT_INTERVAL_MS ?? 5000);
const POLL_INTERVAL_MS = Number(process.env.LIVE_STREAM_POLL_INTERVAL_MS ?? 500);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (guardRequest(req, res)) return;
    const user = await getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Not authenticated.' });
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ error: 'Method not allowed.' });
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      Connection: 'keep-alive',
      // Disables proxy buffering, which would otherwise batch frames.
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders?.();

    const includeConflictDeviceDetails = user.role === 'super_admin';
    let closed = false;
    let lastSnapshot = '';
    let snapshotInFlight = false;

    const send = (event: string, data: unknown) => {
      if (closed) return;
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const sendSnapshot = async () => {
      if (closed || snapshotInFlight) return;
      snapshotInFlight = true;
      try {
        if (!isDbEnabled()) {
          send('snapshot', { persisted: false, gateways: [], racks: [], slots: [], measurements: [], alerts: [], serverNowMs: Date.now() });
          return;
        }
        const state = await getLiveState({ includeConflictDeviceDetails });
        const payload = JSON.stringify(state);
        if (payload === lastSnapshot) return;
        lastSnapshot = payload;
        send('snapshot', { persisted: true, serverNowMs: Date.now(), ...state });
      } catch (err) {
        send('error', { message: err instanceof Error ? err.message : 'snapshot failed' });
      } finally {
        snapshotInFlight = false;
      }
    };

    const onFrame = (frame: LiveFrame) => {
      if (frame.invalidate) void sendSnapshot();
      else send('frame', frame);
    };
    const unsubscribe = subscribeLiveFrames(onFrame);

    await sendSnapshot();
    const pushAvailable = await liveFramesAvailable();
    send('mode', { push: pushAvailable, snapshotIntervalMs: pushAvailable ? SNAPSHOT_INTERVAL_MS : POLL_INTERVAL_MS });

    const snapshotTimer = setInterval(() => {
      void sendSnapshot();
    }, pushAvailable ? SNAPSHOT_INTERVAL_MS : POLL_INTERVAL_MS);
    const heartbeatTimer = setInterval(() => {
      if (!closed) res.write(': ping\n\n');
    }, HEARTBEAT_INTERVAL_MS);

    const close = () => {
      if (closed) return;
      closed = true;
      clearInterval(snapshotTimer);
      clearInterval(heartbeatTimer);
      unsubscribe();
      res.end();
    };

    const lifetimeTimer = setTimeout(close, MAX_DURATION_MS);
    req.on('close', () => {
      clearTimeout(lifetimeTimer);
      close();
    });
  } catch (err) {
    return sendApiError(res, err, 'api/live/stream');
  }
}
