import { useEffect, useMemo, useRef, useState } from 'react';

import { loadLocal, saveLocal } from '../../../../lib/localPersist';
import { LIVE_RANGE_FOR_LETTER, type LiveKindLetter } from '../liveValue';

// A rolling reading buffer shaped for prognostics rather than for a pretty line.
//
// liveValue.ts's useLiveHistory random-walks with no drift, which is right for a
// "what is it doing right now" sparkline but useless to fit a trend to: a walk
// has no slope to find, so every remaining-life projection over it would be
// noise dressed up as a forecast. This hook keeps the same shape and tick rate
// but generates readings from an explicit degradation model instead:
//
//     value(i) = baseline + drift * i + correlated noise
//
// with baseline and drift derived deterministically from the channel's own key,
// so a given point behaves consistently across reloads and roughly a third of
// the points on a machine are actually degrading. That gives lib/condition.ts's
// least-squares fit something real to find, and its r-squared gate something
// real to reject.
//
// This is still demo data. In production the buffer comes from the historian and
// this whole file is replaced by that query — everything downstream only needs
// `samples` plus the interval they were taken at.

// 96 samples, and the length is load-bearing rather than a round number.
//
// Whether a trend can be told apart from a steady-but-noisy signal depends on
// the window: a real drift's rise grows with the sample count while the noise's
// apparent slope does not, so separability improves as the window lengthens.
// Measured against the two populations this model actually produces (steady and
// drifting, same noise), at 48 samples they overlap — steady points reach |t|
// around 9.5 at the 99th percentile while genuinely drifting ones start around
// 6, so no threshold separates them and the projection is a coin toss. At 96 the
// distributions come apart: steady tops out near 11 and drifting starts near 13.
// MIN_T_FOR_PROJECTION in lib/condition.ts sits in that gap. Shortening this
// buffer without re-measuring that threshold quietly re-breaks the gate.
export const HISTORY_LENGTH = 96;
const TICK_MS = 1500;
const PERSIST_EVERY_N_TICKS = 4;

// Demo time compression: one sample stands for six hours of plant time, so a
// full buffer is roughly 24 days of history.
//
// This constant is what makes the remaining-life numbers land in a plausible
// range, and it is worth understanding why. The trend fit's r-squared depends
// only on drift per *sample* against the noise, so it is unaffected by this
// value — but the projection divides by slope per *day*, so the plant-time
// mapping sets the timescale of every remaining-life figure on the page. At one
// hour per sample the same signals project to hours and single-digit days: a
// machine failing within the week, which is arithmetically consistent and
// useless to plan against. Six hours per sample puts a degrading point two to
// six weeks out, which is the window where a planner can actually do something.
//
// Real deployments set this from the historian's actual sample interval, and
// then this is just a fact rather than a tuning knob.
export const SAMPLE_INTERVAL_HOURS = 6;

export type ConditionHistory = {
  samples: number[];
  // How much plant time the buffer represents — the timescale the UI has to show
  // alongside "rising" for the word to mean anything.
  windowHours: number;
  sampleIntervalHours: number;
};

type Stored = { samples: number[]; tick: number };

function hash32(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Small LCG so the seeded history is reproducible: the page shows meaningful
// trends on first paint instead of after a minute of watching, and it shows the
// same ones after a reload.
function lcg(seed: number) {
  let s = seed || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

type Model = {
  // Value at tick 0 — the point as-new, before any wear.
  baseline: number;
  baselineFraction: number;
  driftPerSample: number;
  driftFraction: number;
  noiseAmplitude: number;
  // Noise autocorrelation. Real vibration and temperature readings wander
  // smoothly rather than jumping independently each sample, and uncorrelated
  // noise would also inflate the trend fit's residuals in an unrealistic way.
  phi: number;
  // Where in its band this point sits *now*, as a fraction.
  //
  // Wear starts long before anyone opens the screen, so a degrading point is
  // observed partway along its path rather than at the start of it. Setting the
  // observed position directly and solving backwards for how long it has been
  // degrading (see initialTick) is what spreads a machine's points across
  // healthy, elevated and over-limit the way a real machine's are spread.
  //
  // Doing it the other way round — picking an age and seeing where the point
  // lands — gives no control over that spread at all: it depends on the drift
  // rate and the window length together, and the two settings that make the
  // trend gate work also push every degrading point straight to the top, so the
  // page shows nothing but already-failed machines.
  observedFraction: number;
};

// Fraction of a point's band that a degrading channel climbs per sample. The top
// of the range crosses the inferred critical limit in well under one buffer, so
// the demo shows the full spread: healthy points, points mid-degradation with a
// projectable slope, and points already past the line.
const DRIFT_MIN = 0.0006;
const DRIFT_MAX = 0.0024;

// Noise, as a multiple of the measurement kind's nominal step. This and the drift
// range above are a matched pair, and only their *ratio* decides whether a trend
// clears MIN_T_FOR_PROJECTION — so the way to slow the simulated degradation down
// without breaking the gate is to quieten the signal by the same factor, not to
// reduce the drift alone. liveValue's own walk is far noisier than this (it moves
// up to a full step every sample, traversing a whole band in ~15), which is fine
// for a live readout and far too noisy to trend.
const NOISE_FACTOR = 0.35;

// Above this the channel degrades; below it, it holds steady.
const DEGRADING_ABOVE = 0.5;

// Where degrading points are caught, in band fractions. Spanning the warning
// (0.75) and critical (0.92) fractions that resolveThresholds infers means a
// machine typically shows a couple of healthy-but-trending points, one elevated,
// and sometimes one over the limit. Stopping just short of 1.0 keeps the worst
// point off the clamp at the top of the band, where the trend would flatten and
// the projection would vanish precisely when it matters most.
const OBSERVED_MIN = 0.35;
const OBSERVED_MAX = 0.98;

function modelFor(key: string, letter: LiveKindLetter): Model {
  const band = LIVE_RANGE_FOR_LETTER[letter];
  const span = band.max - band.min;
  const rand = lcg(hash32(key));

  const startRoll = rand();
  const degradingRoll = rand();
  const driftRoll = rand();
  const positionRoll = rand();

  const degrading = degradingRoll > DEGRADING_ABOVE;
  const driftFraction = degrading ? DRIFT_MIN + (DRIFT_MAX - DRIFT_MIN) * driftRoll : 0;

  // A steady point never moves, so where it sits *is* its level. Spreading those
  // more widely than the as-new band lets a machine also show a point that runs
  // persistently elevated without degrading — which is a real condition, and the
  // case that proves the page can report "elevated, but no trend" rather than
  // inventing a date for it.
  const baselineFraction = degrading ? 0.1 + 0.2 * startRoll : 0.1 + 0.55 * positionRoll;

  return {
    baseline: band.min + span * baselineFraction,
    baselineFraction,
    driftPerSample: span * driftFraction,
    driftFraction,
    noiseAmplitude: band.step * NOISE_FACTOR,
    phi: 0.72,
    observedFraction: degrading ? OBSERVED_MIN + (OBSERVED_MAX - OBSERVED_MIN) * positionRoll : baselineFraction,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function sampleAt(model: Model, letter: LiveKindLetter, index: number, noise: number) {
  const band = LIVE_RANGE_FOR_LETTER[letter];
  return clamp(model.baseline + model.driftPerSample * index + noise, band.min, band.max);
}

function stepNoise(model: Model, previous: number, roll: number) {
  return model.phi * previous + (1 - model.phi) * (roll * 2 - 1) * model.noiseAmplitude * 3;
}

// Builds a full buffer ending at `endTick` using the deterministic noise stream,
// so a freshly loaded page starts with real history instead of a single point.
// Exported because it is the whole simulation in one pure function: the checks in
// overview/__tests__ fit trends to its output to confirm the drift constants
// above actually produce a spread of projectable and non-projectable points,
// rather than everything reading flat or everything pinned at critical.
export function seedHistory(key: string, letter: LiveKindLetter, endTick: number): { samples: number[]; noise: number } {
  const model = modelFor(key, letter);
  const rand = lcg(hash32(`${key}:noise`));
  const startTick = Math.max(0, endTick - (HISTORY_LENGTH - 1));

  const samples: number[] = [];
  let noise = 0;
  for (let index = startTick; index <= endTick; index++) {
    noise = stepNoise(model, noise, rand());
    samples.push(sampleAt(model, letter, index, noise));
  }

  return { samples, noise };
}

// "Now" for a freshly seeded buffer, solved backwards from where the point is
// meant to be observed: the tick at which its drift has carried it from as-new to
// its observed position. Never earlier than one full window, so the buffer always
// has a complete history behind it.
//
// Exported alongside seedHistory so the whole first-paint state of a point is
// reproducible outside React — that pair is what the numeric checks drive.
export function initialTick(key: string, letter: LiveKindLetter) {
  const model = modelFor(key, letter);
  if (model.driftFraction <= 0) return HISTORY_LENGTH - 1;

  const ticksToObserved = (model.observedFraction - model.baselineFraction) / model.driftFraction;
  return Math.max(HISTORY_LENGTH - 1, Math.round(ticksToObserved));
}

// One timer for the whole page rather than one per sensor.
//
// A tile-per-interval design costs a timer, a wake-up and an independent React
// update per sensor, and on a machine with dozens of channels that is dozens of
// separate render passes per tick instead of one batched pass. It also lets the
// tiles drift out of step, so two sensors sampled "at the same time" carry
// timestamps a second apart. The ticker is created on first subscription and
// cleared when the last tile unmounts, so nothing runs when the page is closed.
type Tick = () => void;

const subscribers = new Set<Tick>();
let ticker: ReturnType<typeof setInterval> | null = null;

function subscribeToTick(fn: Tick): () => void {
  subscribers.add(fn);
  if (ticker === null) {
    ticker = setInterval(() => {
      // Copy before iterating: a subscriber unmounting during the tick would
      // otherwise mutate the set being walked.
      for (const sub of Array.from(subscribers)) sub();
    }, TICK_MS);
  }
  return () => {
    subscribers.delete(fn);
    if (subscribers.size === 0 && ticker !== null) {
      clearInterval(ticker);
      ticker = null;
    }
  };
}

export function conditionHistoryStorageKey(machineId: string, boxId: string) {
  return `ultron.condition.v1.${machineId}.${boxId}`;
}

// `key` identifies the reading, not the channel: several boxes can be mapped to
// the same rack channel, and each should keep its own independent history rather
// than fighting over one storage slot — the same reason TrendView keys by box id.
export function useConditionHistory(letter: LiveKindLetter, key: string, isLive = true): ConditionHistory {
  const [state, setState] = useState<Stored>(() => {
    const saved = loadLocal<Stored>(key);
    if (saved && saved.samples.length > 0) return saved;
    const tick = initialTick(key, letter);
    return { samples: seedHistory(key, letter, tick).samples, tick };
  });

  const noiseRef = useRef(0);
  const modelRef = useRef(modelFor(key, letter));
  const tickCountRef = useRef(0);

  // The letter can change after mount (a box goes from unlinked 'X' to a real
  // kind once a channel is picked). The old band's history is meaningless under
  // the new one, so reseed rather than leaving values to be merely clamped.
  const letterRef = useRef(letter);
  useEffect(() => {
    if (letterRef.current === letter) return;
    letterRef.current = letter;
    modelRef.current = modelFor(key, letter);
    const tick = initialTick(key, letter);
    const seeded = seedHistory(key, letter, tick);
    noiseRef.current = seeded.noise;
    setState({ samples: seeded.samples, tick });
  }, [key, letter]);

  useEffect(() => {
    if (!isLive) return;
    return subscribeToTick(() => {
      setState((prev) => {
        const tick = prev.tick + 1;
        noiseRef.current = stepNoise(modelRef.current, noiseRef.current, Math.random());
        const next = sampleAt(modelRef.current, letterRef.current, tick, noiseRef.current);

        const appended = [...prev.samples, next];
        const samples = appended.length > HISTORY_LENGTH ? appended.slice(appended.length - HISTORY_LENGTH) : appended;

        tickCountRef.current += 1;
        const updated = { samples, tick };
        // Persist every few ticks rather than every tick, matching how the rest
        // of the app keeps localStorage writes infrequent.
        if (tickCountRef.current % PERSIST_EVERY_N_TICKS === 0) saveLocal(key, updated);
        return updated;
      });
    });
  }, [isLive, key]);

  // Memoized on the buffer itself, not rebuilt per render. Callers derive from
  // this and report the result upward, so a fresh object on every render would
  // invalidate their memos every render and turn one tick into an unbounded
  // update loop.
  return useMemo(
    () => ({
      samples: state.samples,
      windowHours: (state.samples.length - 1) * SAMPLE_INTERVAL_HOURS,
      sampleIntervalHours: SAMPLE_INTERVAL_HOURS,
    }),
    [state.samples],
  );
}
