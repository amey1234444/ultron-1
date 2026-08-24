// Real live values for mapped channels.
//
// Everything that displays a channel reading - canvas boxes, machine overview,
// trends, alarms, analysis - resolves it here, from the measurement bus fed by
// the ingest pipeline (and by Simulation Mode, which publishes through the same
// pipeline). There is no generated data in this module: a channel with nothing
// behind it reports `none` and the UI says so, rather than showing a plausible
// number that is not a measurement.

import { useEffect, useMemo, useRef, useState } from 'react';

import { deviceWithGatewayConnectionState, gatewayForRack, type DeviceNode } from './devices';
import { liveMeasurementKey, useLiveMeasurement } from './liveMeasurementBus';
import { latestMeasurementForChannel, type LiveState } from './liveTelemetry';
import { loadLocal, saveLocal } from './localPersist';
import type { CardNode, ChannelRef } from './rack';

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
  // When the sample itself was taken, as an absolute epoch time.
  //
  // `ageMs` is recomputed from `Date.now()` on every render, so it is a
  // different number each pass and cannot identify a sample. Anything that
  // appends to a buffer has to key off this instead: reconstructing the
  // timestamp as `Date.now() - ageMs` inside an effect uses a *later* clock
  // reading than the render that produced `ageMs`, so it drifts by a few
  // milliseconds each time, never matches the last appended value, and appends
  // the same sample forever.
  atMs: number | null;
};

export const NO_READING: LiveChannelReading = { value: null, unit: undefined, status: 'none', ageMs: null, atMs: null };

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
    atMs: current.atMs,
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

/**
 * How many samples a channel keeps.
 *
 * This was 40, which is a sparkline's worth of history and nothing more. The
 * Trends screen selects a window inside the session and brackets it against the
 * whole session on a strip below the plot, and at 40 samples that structure is
 * a window of 20 inside a session of 40 — an arrangement with nothing to say.
 *
 * Everything that reads a history slices from the newest end, so a longer
 * buffer costs the sparklines nothing. The persisted cost is a few kilobytes
 * per channel in local storage.
 */
export const HISTORY_LENGTH = 240;
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
  const atMs = reading.atMs;

  useEffect(() => {
    if (!isLive || typeof value !== 'number' || atMs === null) return;
    if (appendedAt.current === atMs) return;
    appendedAt.current = atMs;
    setHistory((prev) => {
      const next = [...prev, value];
      const trimmed = next.length > HISTORY_LENGTH ? next.slice(next.length - HISTORY_LENGTH) : next;
      tickRef.current += 1;
      if (storageKey && tickRef.current % PERSIST_EVERY_N === 0) saveLocal(storageKey, trimmed);
      return trimmed;
    });
  }, [atMs, isLive, storageKey, value]);

  return history;
}

// --- Timestamped history, for the trends workspace ---------------------------

/** One sample: when it was taken, and what it read. */
export type TrendSample = { t: number; v: number };

/**
 * The trends buffer, in samples.
 *
 * Longer than `HISTORY_LENGTH` because the trends workspace offers windows in
 * minutes and hours, and a 240-sample buffer at 1 Hz is four minutes of screen.
 * It is still a bounded in-memory ring: there is no history endpoint behind
 * this app, so a window longer than what has actually been received is reported
 * as unavailable rather than drawn short and passed off as complete.
 */
export const TREND_BUFFER_LENGTH = 3600;
/**
 * How much of it survives a reload. The whole buffer would be ~100 kB per
 * channel in local storage; the tail is enough to reopen the page on a
 * populated chart rather than an empty one.
 */
const TREND_PERSIST_LENGTH = 480;
const TREND_PERSIST_EVERY_N = 8;

function isSample(value: unknown): value is TrendSample {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as TrendSample).t === 'number' &&
    typeof (value as TrendSample).v === 'number' &&
    Number.isFinite((value as TrendSample).t) &&
    Number.isFinite((value as TrendSample).v)
  );
}

function loadSamples(storageKey: string | undefined): TrendSample[] {
  const saved = storageKey ? loadLocal<unknown[]>(storageKey) : null;
  return Array.isArray(saved) ? saved.filter(isSample) : [];
}

/**
 * A channel's samples, each carrying the time it was taken.
 *
 * `useLiveChannelHistory` above returns bare numbers, which is all a sparkline
 * needs and is why every existing caller uses it. A trend chart with a real
 * time axis cannot: without `t` there is no way to honour a "last 30 seconds"
 * window, tell a 1 Hz channel from a 10 Hz one, or draw a gap where the feed
 * stopped. The timestamp is the sample's own `updatedAt`, not the clock at the
 * moment it was appended — see the note on `LiveChannelReading.atMs`.
 *
 * One deliberate difference from `useLiveChannelHistory`: going stale does NOT
 * clear the buffer. A channel that stops reporting still has a real history,
 * and a trend screen that blanks itself the moment a feed pauses cannot show
 * what happened before it paused — which is exactly what it is for. The caller
 * is told the reading is stale and says so; the samples stay.
 */
export function useLiveChannelSamples(key: string | null | undefined, storageKey?: string): TrendSample[] {
  const reading = useLiveChannelReading(key);
  const [samples, setSamples] = useState<TrendSample[]>(() => (key ? loadSamples(storageKey) : []));

  // A changed key is a different channel: its samples must never be continued
  // with another channel's.
  const lastKey = useRef(key);
  useEffect(() => {
    if (lastKey.current === key) return;
    lastKey.current = key;
    setSamples(key ? loadSamples(storageKey) : []);
  }, [key, storageKey]);

  const appendedAt = useRef<number | null>(null);
  const tickRef = useRef(0);
  const value = reading.value;
  const isLive = reading.status === 'live';
  const atMs = reading.atMs;

  useEffect(() => {
    if (!isLive || typeof value !== 'number' || atMs === null) return;
    if (appendedAt.current === atMs) return;
    appendedAt.current = atMs;
    setSamples((previous) => {
      // Out-of-order frames would draw a line that goes backwards in time.
      const last = previous[previous.length - 1];
      if (last && atMs < last.t) return previous;
      const next = [...previous, { t: atMs, v: value }];
      const trimmed = next.length > TREND_BUFFER_LENGTH ? next.slice(next.length - TREND_BUFFER_LENGTH) : next;
      tickRef.current += 1;
      if (storageKey && tickRef.current % TREND_PERSIST_EVERY_N === 0) {
        saveLocal(storageKey, trimmed.slice(Math.max(0, trimmed.length - TREND_PERSIST_LENGTH)));
      }
      return trimmed;
    });
  }, [atMs, isLive, storageKey, value]);

  return samples;
}

// --- The reading a mapped channel actually resolves to ------------------------

/**
 * A mapped channel's reading, resolved the way the canvas resolves it.
 *
 * There are two ways a value reaches the UI and a channel may only be reachable
 * by one of them:
 *
 *   1. The measurement bus, keyed by gateway/rack/slot/channel. This needs the
 *      rack to carry a `realRackId` and to resolve to a gateway with a
 *      `realGatewayId`. A rack that has neither is unaddressable here.
 *   2. The `LiveState` the caller already holds — what MQTT ingest and the
 *      in-app simulation engine both build — matched through
 *      `latestMeasurementForChannel`, which can find the rack by its configured
 *      ids or by falling back to the gateway's own measurement list.
 *
 * MappableBox has always used both, in this order, which is why a canvas box
 * shows a value on racks where a bus-only reader shows nothing. Every screen
 * that displays the same channel has to resolve it identically or two pages will
 * report different numbers for one sensor — which is exactly what happened when
 * the overview read the bus alone.
 */
export function useMappedChannelReading(
  channel: ChannelRef | null | undefined,
  devices: DeviceNode[],
  cards: CardNode[],
  live?: LiveState,
): LiveChannelReading {
  const key = useMemo(
    () => (channel ? liveMeasurementKeyForChannel(channel, channelNumberFor(channel), devices) : null),
    [channel, devices],
  );
  const bus = useLiveChannelReading(key);

  // Only consulted when the bus has nothing, so a bus-addressable channel keeps
  // the held-value and staleness behaviour above rather than two competing ones.
  const fromState = useMemo(() => {
    if (!channel || !live) return null;
    const rack = devices.find((device) => device.id === channel.rackId);
    const card = cards.find((c) => c.deviceId === channel.rackId && c.slot === channel.slot);
    if (!rack || !card) return null;
    const rackState = deviceWithGatewayConnectionState(rack, devices);
    if (rackState.status !== 'Online') return null;
    return latestMeasurementForChannel(rackState, card, channelNumberFor(channel), live) ?? null;
  }, [channel, cards, devices, live]);

  if (bus.status !== 'none') return bus;
  if (!fromState || typeof fromState.value !== 'number' || !Number.isFinite(fromState.value)) return NO_READING;

  const parsed = Date.parse(fromState.updatedAt);
  const atMs = Number.isFinite(parsed) ? parsed : Date.now();
  const ageMs = Date.now() - atMs;
  return {
    value: fromState.value,
    unit: fromState.unit,
    status: ageMs > STALE_AFTER_MS ? 'stale' : 'live',
    ageMs,
    atMs,
  };
}
