import { useEffect, useMemo, useRef, useState } from 'react';

import { useMappedChannelReading } from '../../../../lib/liveChannelValue';
import type { DeviceNode } from '../../../../lib/devices';
import type { LiveState } from '../../../../lib/liveTelemetry';
import { loadLocal, saveLocal } from '../../../../lib/localPersist';
import type { CardNode, ChannelRef } from '../../../../lib/rack';

// The reading buffer this machine's condition, trend and prognosis are computed
// from, and the one rule it enforces: every number in it came off the
// measurement bus.
//
// The bus is fed by MQTT ingest for a physical gateway and by the in-app virtual
// gateway for a simulated one (hooks/useSimulationEngine.ts), so a channel whose
// signal was configured in Simulation Mode is trended from exactly the values
// that engine published — the same ones the Rack, Alarm and Trend tabs read
// through lib/liveChannelValue.ts. There is deliberately no generator behind
// this: a channel the gateway has not reported has no history, and the pages
// above say so rather than showing a plausible number nobody measured.
//
// A channel reaches here only if the canvas maps a box to it. The mapping is the
// machine's wiring, so the overview and the analysis layer assess the channels
// the machine is actually built from and nothing else.

// Where the buffer came from. This travels with the samples because everything
// downstream states a condition, a trend and a remaining life, and each means
// something different depending on whether the feed is current, ageing, or has
// never reported at all.
export type ConditionSource = 'live' | 'stale' | 'none';

export type ConditionHistory = {
  samples: number[];
  // Wall-clock span the buffer covers — the timescale the UI has to show
  // alongside "rising" for the word to mean anything.
  windowHours: number;
  sampleIntervalHours: number;
  source: ConditionSource;
};

// Real frames arrive around 1 Hz with no historian behind them, so a live buffer
// is built from the stream as it runs. 240 matches lib/liveChannelValue.ts's own
// history length, so the trend on this page covers the same span as the one on
// the Trends screen rather than a different slice of the same channel.
export const LIVE_HISTORY_LENGTH = 240;
const LIVE_PERSIST_EVERY_N = 4;

// A single sample cannot establish a spacing. Until a second one arrives the
// buffer reports one second, which is the stream's nominal cadence — and with
// fewer than four samples fitTrend refuses to fit anything anyway.
const NOMINAL_LIVE_INTERVAL_HOURS = 1 / 3600;

// `key` identifies the reading, not the channel: several boxes can be mapped to
// the same rack channel, and each keeps its own buffer rather than fighting over
// one storage slot — the same reason TrendView keys by box id.
// v2: v1 buffers were written by a generator and by an earlier bus-only reader
// that could hold a value the channel never reported. Blending those into a live
// trend would carry a wrong number forward and flatten the change percentage
// against it, so the version bump discards them rather than migrating them.
export function conditionHistoryStorageKey(machineId: string, boxId: string) {
  return `ultron.condition.v2.${machineId}.${boxId}`;
}

// --- The real thing ----------------------------------------------------------

type LiveStored = { samples: number[]; stamps: number[] };

const EMPTY_LIVE: LiveStored = { samples: [], stamps: [] };

// A rolling buffer of what the gateway actually reported for this channel, with
// the wall-clock time of each sample kept beside it.
//
// The timestamps are not decoration. Everything downstream divides by
// `sampleIntervalHours` to turn a slope into a remaining life, and real frames
// arrive about a second apart rather than at the simulator's six-hours-a-sample
// compression. Carrying the simulated interval over a live buffer would report
// "to limit in 40 d" off ninety seconds of watching — a number with the shape of
// a forecast and none of the content.
function useLiveConditionHistory(
  channel: ChannelRef | null,
  devices: DeviceNode[],
  cards: CardNode[],
  live: LiveState | undefined,
  storageKey: string,
): { history: Omit<ConditionHistory, 'source'>; status: 'live' | 'stale' | 'none' } {
  // Resolved exactly the way a canvas box resolves it — bus first, then the
  // LiveState the caller holds. See useMappedChannelReading for why both are
  // needed; reading only the bus is what made this page disagree with the canvas.
  const reading = useMappedChannelReading(channel, devices, cards, live);
  const busKey = channel ? `${channel.rackId}|${channel.slot}|${channel.id}` : null;

  const [state, setState] = useState<LiveStored>(() => {
    const saved = loadLocal<LiveStored>(storageKey);
    return saved && Array.isArray(saved.samples) && saved.samples.length === saved.stamps?.length ? saved : EMPTY_LIVE;
  });

  // A different channel is a different signal. Continuing one channel's trend
  // with another's samples would be the worst kind of wrong: silently plausible.
  const lastKey = useRef(busKey);
  const lastStorage = useRef(storageKey);
  useEffect(() => {
    if (lastKey.current === busKey && lastStorage.current === storageKey) return;
    lastKey.current = busKey;
    lastStorage.current = storageKey;
    const saved = loadLocal<LiveStored>(storageKey);
    setState(saved && Array.isArray(saved.samples) && saved.samples.length === saved.stamps?.length ? saved : EMPTY_LIVE);
  }, [busKey, storageKey]);

  // Keyed on the sample's own timestamp, never on `ageMs`. A sample's value
  // legitimately repeats, so the value cannot say whether it is new — and
  // `ageMs` moves on every render, so an effect depending on it never settles.
  const appendedAt = useRef<number | null>(null);
  const writeCount = useRef(0);
  const { value, atMs } = reading;
  const isLive = reading.status === 'live';

  useEffect(() => {
    if (!isLive || typeof value !== 'number' || !Number.isFinite(value) || atMs === null) return;
    const sampleAtMs = atMs;
    if (appendedAt.current === sampleAtMs) return;
    appendedAt.current = sampleAtMs;

    setState((prev) => {
      const samples = [...prev.samples, value];
      const stamps = [...prev.stamps, sampleAtMs];
      const overflow = Math.max(0, samples.length - LIVE_HISTORY_LENGTH);
      const next = { samples: samples.slice(overflow), stamps: stamps.slice(overflow) };

      writeCount.current += 1;
      if (writeCount.current % LIVE_PERSIST_EVERY_N === 0) saveLocal(storageKey, next);
      return next;
    });
  }, [atMs, isLive, storageKey, value]);

  const history = useMemo(() => {
    const { samples, stamps } = state;
    const spanHours = samples.length >= 2 ? Math.max(0, stamps[stamps.length - 1] - stamps[0]) / 3_600_000 : 0;
    const interval =
      samples.length >= 2 && spanHours > 0 ? spanHours / (samples.length - 1) : NOMINAL_LIVE_INTERVAL_HOURS;
    return { samples, windowHours: spanHours, sampleIntervalHours: interval };
  }, [state]);

  // An empty buffer is `none` even when the channel is addressable and a frame
  // has just arrived: nothing has been trended yet, and callers use this to
  // decide whether there is a real series to work from at all. It flips on the
  // commit after the first sample lands.
  //
  // Once samples do exist, a feed that has gone quiet is `stale` rather than
  // `none` — the values are real but ageing, which is a different and more
  // urgent thing than never having reported.
  const status: 'live' | 'stale' | 'none' =
    state.samples.length === 0 ? 'none' : reading.status === 'none' ? 'stale' : reading.status;

  return { history, status };
}

export type ConditionHistoryInput = {
  // The mapped rack channel. Null while a box is unlinked, which is the one case
  // with genuinely nothing to subscribe to.
  channel: ChannelRef | null;
  devices: DeviceNode[];
  // The cards behind the racks, needed to match a channel against the LiveState
  // fallback, and the LiveState itself where the caller has one.
  cards: CardNode[];
  live?: LiveState;
  // Per-box storage identity — see conditionHistoryStorageKey.
  key: string;
};

// The buffer this machine's condition, trend and prognosis are all computed from.
//
// One source, no fallback. A channel that the gateway has reported is trended
// from those readings, so this page agrees with the Rack, Alarm and Trend tabs
// about what the channel reads — they all resolve through
// lib/liveChannelValue.ts. A channel that has reported nothing returns an empty
// buffer and `none`, and the pages above render it as a point with no reading
// rather than assessing a number that was never measured.
export function useConditionHistory({ channel, devices, cards, live, key }: ConditionHistoryInput): ConditionHistory {
  const resolved = useLiveConditionHistory(channel, devices, cards, live, `${key}.live`);

  return useMemo(
    () => ({ ...resolved.history, source: resolved.status === 'none' ? 'none' : resolved.status }),
    [resolved.history, resolved.status],
  );
}
