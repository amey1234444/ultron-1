import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { pruneLiveMeasurements, publishLiveMeasurements } from '../lib/liveMeasurementBus';
import { EMPTY_LIVE_STATE, mergeLiveFrame, withClockOffset, type LiveFrame, type LiveMeasurement, type LiveState } from '../lib/liveTelemetry';
import { apiFetch } from '../src/lib/apiClient';
import { fetchBrokerConfig, subscribeBrokerFrames, type BrokerSubscription } from '../src/lib/brokerFrames';

// Live state has three transports, in order of latency:
//
//   1. MQTT over WebSocket straight from the broker (when configured): one hop
//      from the gateway, at the gateway's own publish rate. This is the only
//      transport allowed to paint channel telemetry/measurements.
//   2. SSE (/api/live/stream): backend structure snapshots and non-measurement
//      frames, used only until broker WebSocket takes over.
//   3. Polling /api/live/state: backend structure reconciliation.
//
// Backend snapshots still decide which gateways may be shown at all and carry
// what broker frames cannot describe (alerts, racks going away), but persisted
// telemetry rows are deliberately ignored so channels reflect broker data only.
const VISIBLE_POLL_INTERVAL_MS = 500;
const HIDDEN_POLL_INTERVAL_MS = 5000;
// Reconciliation cadence while the broker feeds the values.
const BROKER_SNAPSHOT_INTERVAL_MS = 5000;
const REQUEST_TIMEOUT_MS = 4000;
// Consecutive stream failures before giving up on push for this page view.
const MAX_STREAM_FAILURES = 3;
// End-to-end budget: gateway sample → applied to state.
const LATENCY_BUDGET_MS = 1000;
const BROKER_STATE_TTL_MS = 30_000;

// Measured gateway→browser latency of the most recent frames, so the budget can
// be checked from the console (`__ultronLiveLatency`) instead of eyeballed.
export const liveLatency: {
  brokerConnected: boolean;
  lastFrameAt: string | null;
  lastMeasurementFrameAt: string | null;
  lastMs: number | null;
  maxMs: number | null;
  overBudgetCount: number;
} = {
  brokerConnected: false,
  lastFrameAt: null,
  lastMeasurementFrameAt: null,
  lastMs: null,
  maxMs: null,
  overBudgetCount: 0,
};

function recordLatency(sourceCreatedAtMs: number | null | undefined, clockOffsetMs: number) {
  if (typeof sourceCreatedAtMs !== 'number') return;
  // The gateway timestamp is on the server clock, like every other timestamp.
  const latencyMs = Date.now() - (sourceCreatedAtMs + clockOffsetMs);
  liveLatency.lastMs = latencyMs;
  liveLatency.maxMs = Math.max(liveLatency.maxMs ?? 0, latencyMs);
  if (latencyMs > LATENCY_BUDGET_MS) {
    liveLatency.overBudgetCount += 1;
    console.warn(`[live] gateway→UI ${Math.round(latencyMs)}ms over ${LATENCY_BUDGET_MS}ms budget`);
  }
}

function isRecent(iso: string | null | undefined) {
  const parsed = Date.parse(iso ?? '');
  return Number.isFinite(parsed) && Date.now() - parsed <= BROKER_STATE_TTL_MS;
}

function isNewer(candidateIso: string | null | undefined, currentIso: string | null | undefined) {
  const candidate = Date.parse(candidateIso ?? '');
  const current = Date.parse(currentIso ?? '');
  if (!Number.isFinite(candidate)) return false;
  if (!Number.isFinite(current)) return true;
  return candidate > current;
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

function pointKey(measurement: LiveMeasurement): string {
  return `${measurement.gatewayId}|${measurement.rackId}|${measurement.slotId}|${measurement.channelId}`;
}

function gatewayKey(gateway: { gatewayId: string }): string {
  return gateway.gatewayId;
}

function rackKey(rack: { gatewayId: string; rackId: string }): string {
  return `${rack.gatewayId}|${rack.rackId}`;
}

function slotKey(slot: { gatewayId: string; rackId: string; slotId: number }): string {
  return `${slot.gatewayId}|${slot.rackId}|${slot.slotId}`;
}

function withoutMeasurements(frame: LiveFrame): LiveFrame {
  return { ...frame, measurements: [] };
}

function withBrokerRealtime(snapshot: LiveState, previous: LiveState): LiveState {
  const blockedGatewayIds = new Set(
    snapshot.gateways
      .filter((gateway) => ['QUARANTINED', 'BLOCKED'].includes(gateway.status.toUpperCase()))
      .map((gateway) => gateway.gatewayId),
  );

  const gateways = new Map(snapshot.gateways.map((gateway) => [gatewayKey(gateway), gateway]));
  for (const gateway of previous.gateways) {
    const current = gateways.get(gatewayKey(gateway));
    if (blockedGatewayIds.has(gateway.gatewayId) || !isRecent(gateway.lastSeenAt)) continue;
    if (current && !isNewer(gateway.lastSeenAt, current.lastSeenAt)) continue;
    gateways.set(gatewayKey(gateway), gateway);
  }

  const knownGateways = new Set(gateways.keys());
  const racks = new Map(snapshot.racks.map((rack) => [rackKey(rack), rack]));
  for (const rack of previous.racks) {
    const current = racks.get(rackKey(rack));
    if (!knownGateways.has(rack.gatewayId) || blockedGatewayIds.has(rack.gatewayId) || !isRecent(rack.lastSeenAt)) continue;
    if (current && !isNewer(rack.lastSeenAt, current.lastSeenAt)) continue;
    racks.set(rackKey(rack), rack);
  }

  const slots = new Map(snapshot.slots.map((slot) => [slotKey(slot), slot]));
  for (const slot of previous.slots) {
    if (!knownGateways.has(slot.gatewayId) || blockedGatewayIds.has(slot.gatewayId) || slots.has(slotKey(slot))) continue;
    slots.set(slotKey(slot), slot);
  }

  const measurements = new Map<string, LiveMeasurement>();
  for (const measurement of previous.measurements) {
    if (!knownGateways.has(measurement.gatewayId) || blockedGatewayIds.has(measurement.gatewayId) || !isRecent(measurement.updatedAt)) continue;
    measurements.set(pointKey(measurement), measurement);
  }

  return {
    ...snapshot,
    gateways: [...gateways.values()],
    racks: [...racks.values()],
    slots: [...slots.values()],
    measurements: [...measurements.values()],
  };
}

function publishBrokerFrameMeasurements(frame: LiveFrame, blockedGatewayIds: Set<string>) {
  publishLiveMeasurements(frame.measurements?.filter((measurement) => !blockedGatewayIds.has(measurement.gatewayId)));
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
    let blockedGatewayIds = new Set<string>();

    const applySnapshot = (json: Partial<LiveState> & { serverNowMs?: number }) => {
      if (typeof json.serverNowMs === 'number') clockOffsetMs = Date.now() - json.serverNowMs;
      const snapshot = withClockOffset({ ...normalizeLiveState(json), measurements: [] }, clockOffsetMs);
      blockedGatewayIds = new Set(
        snapshot.gateways
          .filter((gateway) => ['QUARANTINED', 'BLOCKED'].includes(gateway.status.toUpperCase()))
          .map((gateway) => gateway.gatewayId),
      );
      pruneLiveMeasurements((measurement) => !blockedGatewayIds.has(measurement.gatewayId) && isRecent(measurement.updatedAt));
      setState((current) => withBrokerRealtime(snapshot, current));
    };

    // --- Fallback polling ---------------------------------------------------
    // Polling is structure-only reconciliation. It never carries channel
    // telemetry; if broker frames stop, channel readings age out naturally.
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
      const now = new Date().toISOString();
      liveLatency.lastFrameAt = now;
      if (frames.some((frame) => (frame.measurements?.length ?? 0) > 0)) liveLatency.lastMeasurementFrameAt = now;
      for (const frame of frames) recordLatency(frame.sourceCreatedAtMs, 0);
      frames.forEach((frame) => publishBrokerFrameMeasurements(frame, blockedGatewayIds));
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
        applyFrame(withoutMeasurements(JSON.parse((event as MessageEvent<string>).data) as LiveFrame), clockOffsetMs);
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
        (connected) => {
          brokerConnected = connected;
          liveLatency.brokerConnected = connected;
        },
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
