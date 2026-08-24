// The maths behind the trend plot.
//
// Kept out of the component because every one of these is a pure function of
// numbers and is far easier to reason about — and to correct — on its own than
// inside a render pass. Nothing here reads state, touches React or knows what
// a colour is.

import type { TrendSample } from '../../../../lib/liveChannelValue';

export type Domain = { lo: number; hi: number; step: number };

export function niceStep(raw: number): number {
  if (!(raw > 0)) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / magnitude;
  return (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * magnitude;
}

/** Rounded, evenly spaced ticks that always contain the data AND the references. */
export function niceDomain(low: number, high: number, count: number): Domain {
  let lo = low;
  let hi = high;
  if (!(hi > lo)) {
    const centre = (lo + hi) / 2 || 0;
    lo = centre - 1;
    hi = centre + 1;
  }
  const step = niceStep((hi - lo) / Math.max(1, count - 1));
  const domainLo = Math.floor(lo / step) * step;
  let domainHi = Math.ceil(hi / step) * step;
  while ((domainHi - domainLo) / step < count - 1) domainHi += step;
  return { lo: domainLo, hi: domainHi, step };
}

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// Steps a clock actually has. A "nice" time axis is not the same problem as a
// nice value axis: 2.5 seconds is a perfectly good value step and a nonsense
// time step, and an axis labelled 14:32:17 / 14:32:19.5 is unreadable.
const TIME_STEPS = [
  10, 20, 50, 100, 200, 500,
  SECOND, 2 * SECOND, 5 * SECOND, 10 * SECOND, 15 * SECOND, 30 * SECOND,
  MINUTE, 2 * MINUTE, 5 * MINUTE, 10 * MINUTE, 15 * MINUTE, 30 * MINUTE,
  HOUR, 2 * HOUR, 3 * HOUR, 6 * HOUR, 12 * HOUR,
  DAY, 2 * DAY, 7 * DAY, 14 * DAY, 28 * DAY,
];

export function niceTimeStep(spanMs: number, targetCount: number): number {
  const raw = spanMs / Math.max(1, targetCount);
  return TIME_STEPS.find((step) => step >= raw) ?? TIME_STEPS[TIME_STEPS.length - 1];
}

/** Tick instants inside [from, to], aligned to the step rather than to `from`. */
export function timeTicks(from: number, to: number, step: number): number[] {
  const ticks: number[] = [];
  // Aligned against the local day so an hourly axis lands on the hour rather
  // than on "one hour after whenever this page happened to open".
  const zone = new Date(from).getTimezoneOffset() * MINUTE;
  let t = Math.ceil((from - zone) / step) * step + zone;
  // A guard, not a limit: a pathological span must not spin here.
  for (let guard = 0; t <= to && guard < 256; guard += 1, t += step) ticks.push(t);
  return ticks;
}

/** Axis label for an instant, at the precision the span justifies. */
export function formatTick(ms: number, spanMs: number): string {
  const d = new Date(ms);
  const two = (n: number) => String(n).padStart(2, '0');
  if (spanMs < 2 * SECOND) return `${two(d.getMinutes())}:${two(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, '0')}`;
  if (spanMs < 2 * MINUTE) return `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`;
  if (spanMs < 2 * DAY) return `${two(d.getHours())}:${two(d.getMinutes())}`;
  return `${two(d.getDate())}/${two(d.getMonth() + 1)}`;
}

/** The full timestamp a tooltip carries. Milliseconds, because sub-second telemetry has them. */
export function formatInstant(ms: number): string {
  const d = new Date(ms);
  const two = (n: number) => String(n).padStart(2, '0');
  return `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, '0')}`;
}

/** A duration, said the way an operator would say it. */
export function formatSpan(ms: number): string {
  if (ms < SECOND) return `${Math.round(ms)} ms`;
  if (ms < MINUTE) return `${(ms / SECOND).toFixed(ms < 10 * SECOND ? 1 : 0)} s`;
  if (ms < HOUR) return `${(ms / MINUTE).toFixed(ms < 10 * MINUTE ? 1 : 0)} min`;
  if (ms < DAY) return `${(ms / HOUR).toFixed(ms < 10 * HOUR ? 1 : 0)} h`;
  return `${(ms / DAY).toFixed(1)} d`;
}

export type SignalState = 'normal' | 'alert' | 'danger';

export type Limits = { alert?: number; danger?: number };

/** Which state a value is in. The same precedence the sensor tiles use. */
export function stateOf(value: number, limits: Limits): SignalState {
  if (limits.danger !== undefined && value >= limits.danger) return 'danger';
  if (limits.alert !== undefined && value >= limits.alert) return 'alert';
  return 'normal';
}

/**
 * The visible samples, reduced to at most about two per pixel column.
 *
 * A 3600-sample buffer across an 800px plot is four samples a pixel; drawing
 * all of them costs four times the path for a line that is pixel-identical.
 * The reduction is min/max per column rather than "every Nth sample", because
 * stride decimation drops spikes — and a spike is the one thing on a vibration
 * trend that must never be smoothed away by the renderer.
 */
export function decimate(samples: TrendSample[], from: number, to: number, columns: number): TrendSample[] {
  if (samples.length <= columns * 2 || columns < 2) return samples;
  const span = to - from || 1;
  const out: TrendSample[] = [];
  let bucket = -1;
  let lo: TrendSample | null = null;
  let hi: TrendSample | null = null;

  const flush = () => {
    if (!lo || !hi) return;
    // Emitted in time order so the path never doubles back on itself.
    if (lo.t <= hi.t) {
      out.push(lo);
      if (hi !== lo) out.push(hi);
    } else {
      out.push(hi);
      out.push(lo);
    }
  };

  for (const sample of samples) {
    const column = Math.floor(((sample.t - from) / span) * columns);
    if (column !== bucket) {
      flush();
      bucket = column;
      lo = sample;
      hi = sample;
      continue;
    }
    if (!lo || sample.v < lo.v) lo = sample;
    if (!hi || sample.v > hi.v) hi = sample;
  }
  flush();
  return out;
}

/**
 * The typical interval between samples, as the median of what is on screen.
 *
 * Median rather than mean: one reconnect gap of four minutes would drag a mean
 * far enough that every real gap afterwards looks normal, which is the opposite
 * of what this is for.
 */
export function medianInterval(points: TrendSample[]): number | null {
  if (points.length < 3) return null;
  const deltas: number[] = [];
  for (let i = 1; i < points.length; i += 1) deltas.push(points[i].t - points[i - 1].t);
  deltas.sort((a, b) => a - b);
  const middle = deltas[deltas.length >> 1];
  return middle > 0 ? middle : null;
}

/**
 * Break the series wherever the feed stopped.
 *
 * A buffer survives a reload and a reconnect, so two runs of samples minutes
 * apart routinely sit next to each other in it. Joining them draws a straight
 * line across a period in which nothing was measured — a measurement that was
 * never taken, presented at the same weight as the ones that were. The gap is
 * drawn as a gap.
 *
 * The threshold is relative to the channel's own cadence, because a 1 Hz
 * channel and a 10 Hz one disagree by an order of magnitude about what counts
 * as a pause.
 */
export function splitOnGaps(points: TrendSample[], gapMs: number | null): TrendSample[][] {
  if (points.length === 0) return [];
  if (gapMs === null) return [points];
  const runs: TrendSample[][] = [];
  let run: TrendSample[] = [points[0]];
  for (let i = 1; i < points.length; i += 1) {
    if (points[i].t - points[i - 1].t > gapMs) {
      runs.push(run);
      run = [points[i]];
      continue;
    }
    run.push(points[i]);
  }
  runs.push(run);
  return runs;
}

export type Segment = { state: SignalState; points: TrendSample[] };

/**
 * The series split into runs of one state each.
 *
 * The chart changes colour where the signal crosses a limit, and the join has
 * to land exactly on the limit — otherwise the green run visibly overshoots
 * into the alert band before the amber starts, and the reader is looking at a
 * line that says the threshold is somewhere it is not. So a crossing gets a
 * synthetic point interpolated at the limit, shared by the run that ends and
 * the run that begins: the line stays continuous and the colour changes on the
 * threshold rather than at the next sample.
 */
export function segmentByState(points: TrendSample[], limits: Limits): Segment[] {
  if (points.length === 0) return [];
  const boundaries = [limits.alert, limits.danger].filter((v): v is number => typeof v === 'number').sort((a, b) => a - b);

  const segments: Segment[] = [];
  let current: Segment = { state: stateOf(points[0].v, limits), points: [points[0]] };

  for (let i = 1; i < points.length; i += 1) {
    const previous = points[i - 1];
    const point = points[i];
    const state = stateOf(point.v, limits);
    if (state === current.state) {
      current.points.push(point);
      continue;
    }

    // Every limit strictly between the two samples is a crossing, in the order
    // the signal met them — a jump from normal straight past danger produces
    // both an alert run and a danger run, not one long amber line.
    const lo = Math.min(previous.v, point.v);
    const hi = Math.max(previous.v, point.v);
    const crossed = boundaries.filter((limit) => limit > lo && limit <= hi);
    const ordered = point.v >= previous.v ? crossed : [...crossed].reverse();

    for (const limit of ordered) {
      const fraction = (limit - previous.v) / (point.v - previous.v || 1);
      const at = { t: previous.t + (point.t - previous.t) * fraction, v: limit };
      current.points.push(at);
      segments.push(current);
      // The state on the far side of this particular limit, not the sample's
      // final state — there may be another limit still to cross.
      const nextState: SignalState =
        limits.danger !== undefined && limit >= limits.danger
          ? point.v >= limit
            ? 'danger'
            : 'alert'
          : point.v >= limit
            ? 'alert'
            : 'normal';
      current = { state: nextState, points: [at] };
    }

    current.points.push(point);
    if (current.state !== state) current.state = state;
  }

  segments.push(current);
  return segments.filter((segment) => segment.points.length > 1);
}

/** The index of the sample nearest an instant. Binary search — the buffer is sorted. */
export function nearestIndex(samples: TrendSample[], at: number): number {
  if (samples.length === 0) return -1;
  let lo = 0;
  let hi = samples.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].t < at) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && Math.abs(samples[lo - 1].t - at) <= Math.abs(samples[lo].t - at)) return lo - 1;
  return lo;
}

/** The slice of the buffer inside a viewport, plus one sample each side so the line reaches the edges. */
export function sliceVisible(samples: TrendSample[], from: number, to: number): TrendSample[] {
  if (samples.length === 0) return samples;
  const start = Math.max(0, nearestIndex(samples, from) - 1);
  const end = Math.min(samples.length - 1, nearestIndex(samples, to) + 1);
  return samples.slice(start, end + 1);
}
