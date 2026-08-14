import { useEffect, useMemo, useRef, useState } from 'react';

import { publishLiveMeasurements } from '../lib/liveMeasurementBus';
import { EMPTY_LIVE_STATE, mergeLiveFrame, type LiveFrame, type LiveState } from '../lib/liveTelemetry';
import type { DeviceNode } from '../lib/devices';
import type { CardNode } from '../lib/rack';
import {
  createSimulationRuntime,
  simulatedGateways,
  simulatedRacksForGateway,
  simulationFramesForGateway,
  type SimulatedRackInput,
} from '../lib/simulation';

// The engine ticks at a fixed cadence and each channel publishes at its own
// configured sample rate (see simulationFramesForGateway). 100ms is fast enough
// for a 10 samples/sec channel — the highest rate the UI can usefully paint —
// while costing one batched state update per animation frame.
const TICK_MS = 20;

type SimulationPlan = {
  gateway: DeviceNode;
  racks: SimulatedRackInput[];
}[];

/**
 * Runs the in-app virtual gateway and returns the live state it produces.
 *
 * The returned state is an ordinary `LiveState`, built by the same
 * `buildLiveFrame`/`mergeLiveFrame` pipeline that serves real MQTT traffic, so
 * callers merge it with real telemetry and hand it to any component that already
 * accepts live data.
 */
export function useSimulationEngine(devices: DeviceNode[], cards: CardNode[], running = true): LiveState {
  const [state, setState] = useState<LiveState>(EMPTY_LIVE_STATE);

  // Rebuilt only when something the simulator actually reads changes, so
  // unrelated workspace edits don't restart every channel's walk.
  const plan = useMemo<SimulationPlan>(
    () =>
      simulatedGateways(devices).map((gateway) => ({
        gateway,
        racks: simulatedRacksForGateway(gateway, devices)
          .filter((rack) => rack.realRackId !== undefined && rack.realRackId !== null && String(rack.realRackId) !== '')
          .map<SimulatedRackInput>((rack) => ({
            rackId: String(rack.realRackId),
            cards: cards.filter((card) => card.deviceId === rack.id),
            online: true,
          })),
      })),
    [devices, cards],
  );

  // The plan is read by the tick rather than closed over, so adding a channel
  // takes effect on the next tick instead of restarting the timer.
  const planRef = useRef<SimulationPlan>(plan);
  planRef.current = plan;

  const runtime = useRef(createSimulationRuntime());
  const hasWork = plan.length > 0;

  useEffect(() => {
    if (!running || !hasWork) {
      // Drop simulated state on stop so racks read Not Connected instead of
      // freezing on their last value.
      setState((current) => (current === EMPTY_LIVE_STATE ? current : EMPTY_LIVE_STATE));
      return;
    }

    let cancelled = false;
    let lastTickMs = Date.now();
    let queued: LiveFrame[] = [];
    let flushHandle: number | null = null;
    let cancelFlush: (handle: number) => void = () => {};

    const flush = () => {
      flushHandle = null;
      const frames = queued;
      queued = [];
      if (cancelled || frames.length === 0) return;
      frames.forEach((frame) => publishLiveMeasurements(frame.measurements));
      setState((current) => frames.reduce((next, frame) => mergeLiveFrame(next, frame, 0), current));
    };

    const scheduleFlush = () => {
      if (flushHandle !== null) return;
      if (typeof requestAnimationFrame === 'function') {
        flushHandle = requestAnimationFrame(flush);
        cancelFlush = cancelAnimationFrame;
      } else {
        flushHandle = setTimeout(flush, TICK_MS) as unknown as number;
        cancelFlush = clearTimeout as unknown as (handle: number) => void;
      }
    };

    const tick = () => {
      const nowMs = Date.now();
      const elapsedMs = Math.max(1, nowMs - lastTickMs);
      lastTickMs = nowMs;
      for (const { gateway, racks } of planRef.current) {
        const frames = simulationFramesForGateway(gateway, racks, runtime.current, nowMs, elapsedMs);
        if (frames.length > 0) queued.push(...frames);
      }
      if (queued.length > 0) scheduleFlush();
    };

    tick();
    const timer = setInterval(tick, TICK_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
      if (flushHandle !== null) cancelFlush(flushHandle);
    };
  }, [running, hasWork]);

  return state;
}

/**
 * Real telemetry and simulated telemetry, in one state. Simulated gateways use
 * their own script ids and a reserved IP block, so the two never collide and a
 * plain concatenation is the whole merge.
 */
export function mergeLiveStates(real: LiveState, simulated: LiveState): LiveState {
  if (simulated === EMPTY_LIVE_STATE || simulated.gateways.length === 0) return real;
  if (real === EMPTY_LIVE_STATE || real.gateways.length === 0) return simulated;
  return {
    gateways: [...real.gateways, ...simulated.gateways],
    racks: [...real.racks, ...simulated.racks],
    slots: [...real.slots, ...simulated.slots],
    measurements: [...real.measurements, ...simulated.measurements],
    alerts: [...real.alerts, ...simulated.alerts],
  };
}
