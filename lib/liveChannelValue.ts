// Real live values for mapped channels.
//
// Everything that displays a channel reading - canvas boxes, machine overview,
// trends, alarms, analysis - resolves it here, from the measurement bus fed by
// the ingest pipeline (and by Simulation Mode, which publishes through the same
// pipeline). There is no generated data in this module: a channel with nothing
// behind it reports `none` and the UI says so, rather than showing a plausible
// number that is not a measurement.

import { useEffect, useMemo, useRef, useState } from 'react';

import { gatewayForRack, type DeviceNode } from './devices';
import { liveMeasurementKey, useLiveMeasurement } from './liveMeasurementBus';
import { loadLocal, saveLocal } from './localPersist';
import type { ChannelRef } from './rack';

/**
 * `live`  - a reading arrived recently.
 * `stale` - a reading arrived, but not lately: the value is real but ageing,
 *           which is a different (and more alarming) condition than never
 *           having reported at all.
 * `none`  - nothing has ever been received for this channel.
 */
export type LiveReadingStatus = 'live' | 'stale' | 'none';

export type LiveChannelReading = {
  value: number | null;
  unit: string | undefined;
  status: LiveReadingStatus;
  ageMs: number | null;
};

export const NO_READING: LiveChannelReading = { value: null, unit: undefined, status: 'none', ageMs: null };

// A channel is called stale once it has missed roughly three seconds. Slow
// channels legitimately publish at 1 Hz, so this must not be tighter.
const STALE_AFTER_MS = 3000;
// How often staleness is re-evaluated. Only runs while a channel has a value.
const AGE_TICK_MS = 1000;

/**
 * The channel number within its card, parsed from the `S06.CH2` style id that
 * `listChannels` builds. Defaults to 1 for ids that carry no suffix.
 */
export function channelNumberFor(channel: Pick<ChannelRef, 'id'>): number {
  const match = channel.id.match(/\.CH(\d+)$/);
  return match ? Number(match[1]) : 1;
}

/**
 * Measurement-bus key for a mapped channel, or null when the channel cannot be
 * addressed yet - no rack, no gateway id, or a rack that has never been given a
 * `rack_id`. Callers treat null as "nothing to subscribe to".
 */
export function liveMeasurementKeyForChannel(
  channel: Pick<ChannelRef, 'rackId' | 'slot'> | null | undefined,
  channelNumber: number,
  devices: DeviceNode[],
): string | null {
  if (!channel) return null;
  const rack = devices.find((device) => device.id === channel.rackId);
  if (!rack) return null;
  const gateway = gatewayForRack(rack, devices);
  const gatewayId = rack.realGatewayId ?? gateway?.realGatewayId;
  const rackId = rack.realRackId;
  if (!gatewayId || rackId === undefined || rackId === null || String(rackId) === '') return null;
  return liveMeasurementKey(gatewayId, String(rackId), channel.slot, channelNumber);
}

/**
 * The current reading for a channel.
 *
 * The last real value is held across the gap between frames (and across a stream
 * reconnect) so a mapped point does not flicker to a dash between samples - but
 * it is reported as `stale` once it stops being refreshed, never as `live`.
 */
export function useLiveChannelReading(key: string | null | undefined): LiveChannelReading {
  const measurement = useLiveMeasurement(key);

  // Held so a momentary gap between frames does not blank the display.
  const held = useRef<{ value: number; unit?: string; atMs: number } | null>(null);
  // A changed key is a different channel: the previous channel's value must not
  // be shown against it, even for one frame.
  const heldKey = useRef<string | null | undefined>(key);
  if (heldKey.current !== key) {
    heldKey.current = key;
    held.current = null;
  }
  if (typeof measurement?.value === 'number') {
    const atMs = Date.parse(measurement.updatedAt);
    held.current = { value: measurement.value, unit: measurement.unit, atMs: Number.isFinite(atMs) ? atMs : Date.now() };
  }

  // Re-render on a slow tick so a channel that goes quiet transitions to stale
  // on its own, without needing another frame to arrive to trigger it.
  const [, setTick] = useState(0);
  const hasValue = held.current !== null;
  useEffect(() => {
    if (!hasValue) return;
    const id = setInterval(() => setTick((n) => n + 1), AGE_TICK_MS);
    return () => clearInterval(id);
  }, [hasValue]);

  const current = held.current;
  if (!current) return NO_READING;
  const ageMs = Date.now() - current.atMs;
  return {
    value: current.value,
    unit: current.unit,
    status: ageMs > STALE_AFTER_MS ? 'stale' : 'live',
    ageMs,
  };
}

/**
 * The reading for a mapped channel - the form most callers want, since they
 * hold a `ChannelRef` and the device list rather than a bus key.
 *
 * `devices` may be omitted by callers that do not have the list in scope; the
 * channel is then unaddressable and the result is `none`, which is the honest
 * answer rather than a fabricated one.
 */
export function useChannelReading(
  channel: ChannelRef | null | undefined,
  devices: DeviceNode[] = [],
): LiveChannelReading {
  const key = useMemo(
    () => (channel ? liveMeasurementKeyForChannel(channel, channelNumberFor(channel), devices) : null),
    [channel, devices],
  );
  return useLiveChannelReading(key);
}

// --- History ----------------------------------------------------------------

export const HISTORY_LENGTH = 40;
const PERSIST_EVERY_N = 4;

/**
 * A rolling window of the real values seen for a channel, for sparklines and
 * trend charts.
 *
 * There is no server-side history endpoint, so the window is built from live
 * frames as they arrive and persisted per channel. A channel that has never
 * reported returns an empty array - callers must render an empty state rather
 * than draw a flat line, which would read as a real measurement of zero.
 */
export function useLiveChannelHistory(key: string | null | undefined, storageKey?: string): number[] {
  const reading = useLiveChannelReading(key);
  const [history, setHistory] = useState<number[]>(() => {
    if (!key) return [];
    const saved = storageKey ? loadLocal<number[]>(storageKey) : null;
    return Array.isArray(saved) ? saved.filter((n) => typeof n === 'number' && Number.isFinite(n)) : [];
  });

  // Reset when the subscription moves to a different channel, so one channel's
  // trend is never continued with another's samples.
  const lastKey = useRef(key);
  useEffect(() => {
    if (lastKey.current === key) return;
    lastKey.current = key;
    if (!key) {
      setHistory([]);
      return;
    }
    const saved = storageKey ? loadLocal<number[]>(storageKey) : null;
    setHistory(Array.isArray(saved) ? saved.filter((n) => typeof n === 'number' && Number.isFinite(n)) : []);
  }, [key, storageKey]);

  // Append only genuinely new samples - `ageMs` ticking does not add a point,
  // and a stale value is not resampled into the series.
  useEffect(() => {
    if (!key || reading.status !== 'live') setHistory([]);
  }, [key, reading.status]);

  const appendedAt = useRef<number | null>(null);
  const tickRef = useRef(0);
  const value = reading.value;
  const isLive = reading.status === 'live';
  const ageMs = reading.ageMs;

  useEffect(() => {
    if (!isLive || typeof value !== 'number' || ageMs === null) return;
    const sampleAt = Date.now() - ageMs;
    if (appendedAt.current === sampleAt) return;
    appendedAt.current = sampleAt;
    setHistory((prev) => {
      const next = [...prev, value];
      const trimmed = next.length > HISTORY_LENGTH ? next.slice(next.length - HISTORY_LENGTH) : next;
      tickRef.current += 1;
      if (storageKey && tickRef.current % PERSIST_EVERY_N === 0) saveLocal(storageKey, trimmed);
      return trimmed;
    });
  }, [ageMs, isLive, storageKey, value]);

  return history;
}
