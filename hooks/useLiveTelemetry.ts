import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { EMPTY_LIVE_STATE, mergeLiveFrame, withClockOffset, withFresherMeasurements, type LiveFrame, type LiveState } from '../lib/liveTelemetry';
import { apiFetch } from '../src/lib/apiClient';
import { fetchBrokerConfig, subscribeBrokerFrames, type BrokerSubscription } from '../src/lib/brokerFrames';

// Live state has three transports, in order of latency:
//
//   1. MQTT over WebSocket straight from the broker (when configured): one hop
//      from the gateway, at the gateway's own publish rate.
//   2. SSE (/api/live/stream): frames the ingest pipeline pushes as soon as a
//      message is validated, ahead of the writes it triggers.
//   3. Polling /api/live/state, for browsers or proxies where neither works.
//
// Whichever transport carries frames, snapshots of the persisted state are still
// needed: they decide which gateways may be shown at all and carry what a frame
// cannot describe (alerts, racks going away).
const VISIBLE_POLL_INTERVAL_MS = 500;
const HIDDEN_POLL_INTERVAL_MS = 5000;
// Reconciliation cadence while the broker feeds the values.
const BROKER_SNAPSHOT_INTERVAL_MS = 5000;
const REQUEST_TIMEOUT_MS = 4000;
// Consecutive stream failures before giving up on push for this page view.
const MAX_STREAM_FAILURES = 3;
// End-to-end budget: gateway sample → applied to state.
const LATENCY_BUDGET_MS = 1500;

// Measured gateway→browser latency of the most recent frames, so the budget can
// be checked from the console (`__ultronLiveLatency`) instead of eyeballed.
export const liveLatency: { lastMs: number | null; maxMs: number | null } = { lastMs: null, maxMs: null };

function recordLatency(sourceCreatedAtMs: number | null | undefined, clockOffsetMs: number) {
  if (typeof sourceCreatedAtMs !== 'number') return;
  // The gateway timestamp is on the server clock, like every other timestamp.
  const latencyMs = Date.now() - (sourceCreatedAtMs + clockOffsetMs);
  liveLatency.lastMs = latencyMs;
  liveLatency.maxMs = Math.max(liveLatency.maxMs ?? 0, latencyMs);
  if (latencyMs > LATENCY_BUDGET_MS) {
    console.warn(`[live] gateway→UI ${Math.round(latencyMs)}ms over ${LATENCY_BUDGET_MS}ms budget`);
  }
}

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
    let broker: BrokerSubscription | null = null;
    let brokerConnected = false;
    let streamFailures = 0;
    let clockOffsetMs = 0;

    const applySnapshot = (json: Partial<LiveState> & { serverNowMs?: number }) => {
      if (typeof json.serverNowMs === 'number') clockOffsetMs = Date.now() - json.serverNowMs;
      const snapshot = withClockOffset(normalizeLiveState(json), clockOffsetMs);
      setState((current) => withFresherMeasurements(snapshot, current));
    };

    // --- Fallback polling ---------------------------------------------------
    // While the broker is delivering values, polling is only reconciliation; if
    // that connection drops, polling goes back to carrying the values itself.
    const nextDelay = () => {
      if (broker && brokerConnected) return BROKER_SNAPSHOT_INTERVAL_MS;
      return document.visibilityState === 'visible' ? VISIBLE_POLL_INTERVAL_MS : HIDDEN_POLL_INTERVAL_MS;
    };

    const schedule = (delay = nextDelay()) => {
      if (!cancelled && !source) timer = setTimeout(poll, delay);
    };

    const applyFrame = (frame: LiveFrame, offsetMs: number) => {
      recordLatency(frame.sourceCreatedAtMs, offsetMs);
      setState((current) => mergeLiveFrame(current, frame, offsetMs));
    };

    // A rack publishing at high frequency would otherwise re-render the canvas
    // once per message per rack. Frames are merged in arrival order and applied
    // in a single update per painted frame, so throughput costs one render.
    let queued: LiveFrame[] = [];
    let flushHandle: number | null = null;
    let cancelFlush: (handle: number) => void = () => {};

    const flushFrames = () => {
      flushHandle = null;
      const frames = queued;
      queued = [];
      if (cancelled || frames.length === 0) return;
      for (const frame of frames) recordLatency(frame.sourceCreatedAtMs, 0);
      setState((current) => frames.reduce((state, frame) => mergeLiveFrame(state, frame, 0), current));
    };

    const queueFrame = (frame: LiveFrame) => {
      queued.push(frame);
      if (flushHandle !== null) return;
      if (typeof requestAnimationFrame === 'function') {
        flushHandle = requestAnimationFrame(flushFrames);
        cancelFlush = cancelAnimationFrame;
      } else {
        flushHandle = setTimeout(flushFrames, 50) as unknown as number;
        cancelFlush = clearTimeout as unknown as (handle: number) => void;
      }
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
        applyFrame(JSON.parse((event as MessageEvent<string>).data) as LiveFrame, clockOffsetMs);
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

    // --- Broker subscription ------------------------------------------------
    // Frames built in the browser carry browser-clock timestamps, so they merge
    // with no offset (unlike server-sent frames), and are batched per paint.
    const openBroker = async () => {
      const config = await fetchBrokerConfig();
      if (cancelled || !config.enabled) return false;
      const subscription = await subscribeBrokerFrames(
        config,
        (frame) => { if (!cancelled) queueFrame(frame); },
        (connected) => { brokerConnected = connected; },
      );
      if (!subscription) return false;
      if (cancelled) {
        subscription.close();
        return false;
      }
      broker = subscription;
      // Values now come from the broker; the snapshot only reconciles.
      closeStream();
      if (timer) clearTimeout(timer);
      schedule(0);
      return true;
    };

    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      if (source) return;
      if (timer) clearTimeout(timer);
      schedule(0);
    };

    (window as unknown as { __ultronLiveLatency?: typeof liveLatency }).__ultronLiveLatency = liveLatency;
    document.addEventListener('visibilitychange', onVisibilityChange);
    if (!openStream()) void poll();
    // The broker takes over from the stream once it is connected; until then the
    // stream (or polling) is already serving state.
    void openBroker().catch(() => false);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      broker?.close();
      if (flushHandle !== null) cancelFlush(flushHandle);
      closeStream();
      inFlight?.abort();
      if (timer) clearTimeout(timer);
    };
  }, []);

  return state;
}
