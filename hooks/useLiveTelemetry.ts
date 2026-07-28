import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { EMPTY_LIVE_STATE, mergeLiveFrame, withClockOffset, type LiveFrame, type LiveState } from '../lib/liveTelemetry';
import { apiFetch } from '../src/lib/apiClient';

// Live state arrives over SSE (/api/live/stream): the ingest pipeline pushes a
// frame the moment a message is validated, so a reading renders without waiting
// for the writes it triggers. Snapshots on the same stream reconcile everything
// a frame cannot describe (alerts, racks going away).
//
// Polling /api/live/state remains as a fallback for browsers or proxies where
// the stream cannot be established.
const VISIBLE_POLL_INTERVAL_MS = 500;
const HIDDEN_POLL_INTERVAL_MS = 5000;
const REQUEST_TIMEOUT_MS = 4000;
// Consecutive stream failures before giving up on push for this page view.
const MAX_STREAM_FAILURES = 3;

function normalizeLiveState(json: Partial<LiveState>): LiveState {
  return {
    gateways: json.gateways ?? [],
    racks: json.racks ?? [],
    slots: json.slots ?? [],
    measurements: json.measurements ?? [],
    alerts: json.alerts ?? [],
  };
}

export function useLiveTelemetry(): LiveState {
  const [state, setState] = useState<LiveState>(EMPTY_LIVE_STATE);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastPayload = '';
    let inFlight: AbortController | null = null;
    let source: EventSource | null = null;
    let streamFailures = 0;
    let clockOffsetMs = 0;

    const applySnapshot = (json: Partial<LiveState> & { serverNowMs?: number }) => {
      if (typeof json.serverNowMs === 'number') clockOffsetMs = Date.now() - json.serverNowMs;
      setState(withClockOffset(normalizeLiveState(json), clockOffsetMs));
    };

    // --- Fallback polling ---------------------------------------------------
    const nextDelay = () => (document.visibilityState === 'visible' ? VISIBLE_POLL_INTERVAL_MS : HIDDEN_POLL_INTERVAL_MS);

    const schedule = (delay = nextDelay()) => {
      if (!cancelled && !source) timer = setTimeout(poll, delay);
    };

    const poll = async () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      inFlight?.abort();
      const controller = new AbortController();
      inFlight = controller;
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      try {
        const res = await apiFetch('/api/live/state', {
          cache: 'no-store',
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        });
        if (res.ok) {
          const payload = await res.text();
          if (payload === lastPayload) return;
          const json = JSON.parse(payload) as Partial<LiveState> & { persisted?: boolean };
          if (!cancelled && json.persisted) {
            lastPayload = payload;
            applySnapshot(json);
          }
        }
      } catch {
        // Offline / transient - next tick retries.
      } finally {
        clearTimeout(timeout);
        if (inFlight === controller) inFlight = null;
        schedule();
      }
    };

    const startPolling = () => {
      if (cancelled || timer) return;
      schedule(0);
    };

    // --- Push stream -------------------------------------------------------
    const closeStream = () => {
      source?.close();
      source = null;
    };

    const openStream = () => {
      if (cancelled || typeof EventSource === 'undefined') return false;
      const stream = new EventSource('/api/live/stream');
      source = stream;

      stream.addEventListener('snapshot', (event) => {
        if (cancelled) return;
        streamFailures = 0;
        applySnapshot(JSON.parse((event as MessageEvent<string>).data) as Partial<LiveState> & { serverNowMs?: number });
      });

      stream.addEventListener('frame', (event) => {
        if (cancelled) return;
        const frame = JSON.parse((event as MessageEvent<string>).data) as LiveFrame;
        setState((current) => mergeLiveFrame(current, frame, clockOffsetMs));
      });

      // The server ends each stream before its host's function timeout; the
      // browser reconnects on its own. Only give up once reconnects keep failing.
      stream.onerror = () => {
        if (cancelled || stream.readyState !== EventSource.CLOSED) return;
        streamFailures += 1;
        closeStream();
        if (streamFailures >= MAX_STREAM_FAILURES) startPolling();
        else setTimeout(() => { if (!cancelled) openStream(); }, 1000);
      };
      return true;
    };

    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      if (source) return;
      if (timer) clearTimeout(timer);
      schedule(0);
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    if (!openStream()) void poll();

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      closeStream();
      inFlight?.abort();
      if (timer) clearTimeout(timer);
    };
  }, []);

  return state;
}
