import { useSyncExternalStore } from 'react';

import type { LiveMeasurement } from './liveTelemetry';

type Listener = () => void;

const measurements = new Map<string, LiveMeasurement>();
const listeners = new Map<string, Set<Listener>>();

export function liveMeasurementKey(gatewayId: string, rackId: string, slotId: number, channelId: number): string {
  return `${gatewayId}|${rackId}|${slotId}|${channelId}`;
}

export function liveMeasurementKeyOf(measurement: LiveMeasurement): string {
  return liveMeasurementKey(measurement.gatewayId, measurement.rackId, measurement.slotId, measurement.channelId);
}

function emit(key: string) {
  listeners.get(key)?.forEach((listener) => listener());
}

export function publishLiveMeasurements(nextMeasurements: LiveMeasurement[] | undefined) {
  if (!nextMeasurements || nextMeasurements.length === 0) return;
  for (const measurement of nextMeasurements) {
    const key = liveMeasurementKeyOf(measurement);
    const current = measurements.get(key);
    if (current && Date.parse(current.updatedAt) > Date.parse(measurement.updatedAt)) continue;
    measurements.set(key, measurement);
    emit(key);
  }
}

export function pruneLiveMeasurements(accept: (measurement: LiveMeasurement) => boolean) {
  for (const [key, measurement] of measurements) {
    if (accept(measurement)) continue;
    measurements.delete(key);
    emit(key);
  }
}

export function getLiveMeasurement(key: string | null | undefined): LiveMeasurement | undefined {
  return key ? measurements.get(key) : undefined;
}

export function subscribeLiveMeasurement(key: string | null | undefined, listener: Listener): () => void {
  if (!key) return () => {};
  const current = listeners.get(key);
  if (current) current.add(listener);
  else listeners.set(key, new Set([listener]));
  return () => {
    const next = listeners.get(key);
    if (!next) return;
    next.delete(listener);
    if (next.size === 0) listeners.delete(key);
  };
}

export function useLiveMeasurement(key: string | null | undefined): LiveMeasurement | undefined {
  return useSyncExternalStore(
    (listener) => subscribeLiveMeasurement(key, listener),
    () => getLiveMeasurement(key),
    () => undefined,
  );
}
