/**
 * Component health index and remaining useful life, by trend to threshold.
 *
 * **What this is, stated plainly, because the distinction decides whether the
 * number is usable.** This is not a learned wear model. `app/evaluation/
 * remaining_time.py` sets out why one cannot be built here — no end-of-life
 * definition in the knowledge layer, no degradation model, no run-to-failure
 * histories — and that argument still holds. What follows is the other kind of
 * RUL: a measured indicator, an approved limit, and the time for the observed
 * trend to carry one to the other.
 *
 * The three inputs it needs are therefore not invented:
 *
 *   the end-of-life limit   the channel's own configured danger threshold, the
 *                           one an engineer already approved and the console
 *                           already alarms on. Where a channel has none, this
 *                           reports THRESHOLD_NOT_CONFIGURED and no number.
 *   the degradation model   a straight line through the measured daily health
 *                           index. Declared as such in `provenance.method`, so
 *                           nobody reads it as a fitted wear curve.
 *   the history             `measurement_history`, which the ingest path has
 *                           been writing all along.
 *
 * So every number traces to a stored measurement and an approved limit. It is
 * an engineering extrapolation, and it is labelled as one.
 *
 * **Theil–Sen, not least squares.** The median of pairwise slopes ignores up to
 * 29% of the points being outliers. A process line produces exactly that: a
 * bad day of startups, a sensor dropout, a recipe nobody recorded. Least
 * squares would let one such day set the maintenance date.
 *
 * **The pessimistic bound is the short one.** `rulDays.p10` is the *shortest*
 * remaining life and `projection.hiP10` the *lowest* health — both come from
 * the steepest credible slope, so they agree, and the contract asserts both
 * orderings because getting either backwards inverts the band an engineer
 * schedules against.
 */

/** Health is a fraction of life remaining: 1 is as-new, 0 is at the limit. */
export type DailyHealth = {
  /** Plain ISO date, `YYYY-MM-DD`. */
  date: string;
  hi: number;
  /** Hours that day that were steady-state and quality-good. */
  validSteadyHours: number;
};

export type IndicatorSample = {
  /** Milliseconds. */
  t: number;
  value: number;
  /** The healthy reference this indicator is measured against. */
  baseline: number;
  /** The approved limit that defines end of life. */
  danger: number;
  /** The approved limit that defines "degrading". */
  alert: number | null;
  /** False for a sample the quality engine rejected. */
  usable: boolean;
};

export type TrendFit = {
  /** Health index per day. Negative is degrading. */
  slopePerDay: number;
  /** Steepest and shallowest credible slopes, from the pairwise spread. */
  slopeP10: number;
  slopeP90: number;
  intercept: number;
  /** Days spanned by the fitted points. */
  spanDays: number;
  points: number;
};

const DAY_MS = 86_400_000;

/** `YYYY-MM-DD` in UTC. Dates are days, not instants: a local day would move. */
export function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(day: string, days: number): string {
  return isoDay(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/**
 * One sample's health, as a fraction of the distance from baseline to limit.
 *
 * Direction is read from the limits rather than configured: a danger threshold
 * above the baseline means the indicator rises as the component wears, one
 * below means it falls. Vibration rises, a flow or an efficiency falls, and
 * neither needs to be declared twice.
 *
 * Null when the limit and the baseline are the same value, which is not a
 * scale anything can be placed on.
 */
export function healthOfSample(sample: IndicatorSample): number | null {
  const span = sample.danger - sample.baseline;
  if (!Number.isFinite(span) || Math.abs(span) < 1e-9) return null;
  const consumed = (sample.value - sample.baseline) / span;
  if (!Number.isFinite(consumed)) return null;
  return Math.min(1, Math.max(0, 1 - consumed));
}

/**
 * Daily health from raw samples: the worst indicator, on the median of the day.
 *
 * The median because a process line spikes, and a single excursion is not a
 * day's wear. The worst indicator because a component is as healthy as its
 * least healthy measurement — averaging a failing bearing against a
 * comfortable winding temperature hides the bearing.
 */
export function dailyHealth(byIndicator: Record<string, IndicatorSample[]>): DailyHealth[] {
  const days = new Map<string, { worst: Map<string, number[]>; usableMs: Set<number> }>();

  for (const [indicator, samples] of Object.entries(byIndicator)) {
    for (const sample of samples) {
      if (!sample.usable) continue;
      const health = healthOfSample(sample);
      if (health === null) continue;
      const day = isoDay(sample.t);
      let entry = days.get(day);
      if (!entry) {
        entry = { worst: new Map(), usableMs: new Set() };
        days.set(day, entry);
      }
      const bucket = entry.worst.get(indicator) ?? [];
      bucket.push(health);
      entry.worst.set(indicator, bucket);
      // Counted to the hour: a day with four usable samples is not a day of
      // evidence, and `sufficiency` is how the chart says so.
      entry.usableMs.add(Math.floor(sample.t / 3_600_000));
    }
  }

  return [...days.entries()]
    .map(([date, entry]) => ({
      date,
      hi: Math.min(...[...entry.worst.values()].map(median)),
      validSteadyHours: entry.usableMs.size,
    }))
    .filter((point) => Number.isFinite(point.hi))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  if (sorted.length === 1) return sorted[0];
  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

/**
 * Theil–Sen slope, with the spread of the pairwise slopes as the band.
 *
 * The 10th and 90th percentiles of those slopes are the band rather than a
 * formal confidence interval, and that is the weaker and more honest claim:
 * they describe how much the observed pairs disagree, which is what an
 * engineer wants to know before booking a shutdown.
 */
export function fitTrend(history: readonly DailyHealth[]): TrendFit | null {
  const points = history.filter((point) => Number.isFinite(point.hi));
  if (points.length < 2) return null;

  const origin = points[0].date;
  const xs = points.map((point) => daysBetween(origin, point.date));
  const ys = points.map((point) => point.hi);

  const slopes: number[] = [];
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      const dx = xs[j] - xs[i];
      if (dx === 0) continue;
      slopes.push((ys[j] - ys[i]) / dx);
    }
  }
  if (slopes.length === 0) return null;
  slopes.sort((a, b) => a - b);

  const slopePerDay = quantile(slopes, 0.5);
  // The intercept that puts the fitted line through the median residual, which
  // is the Theil–Sen companion to the slope and is not the mean.
  const intercept = median(ys.map((y, i) => y - slopePerDay * xs[i]));

  return {
    slopePerDay,
    slopeP10: quantile(slopes, 0.1),
    slopeP90: quantile(slopes, 0.9),
    intercept,
    spanDays: xs[xs.length - 1] - xs[0],
    points: points.length,
  };
}

/**
 * Days until the health index reaches `target`, at a given slope.
 *
 * Null when the slope is not carrying it there — a flat or improving component
 * has no date, and returning a very large number instead would put one on a
 * chart.
 */
export function daysToTarget(currentHi: number, slopePerDay: number, target: number): number | null {
  if (!(slopePerDay < 0)) return null;
  const remaining = currentHi - target;
  if (remaining <= 0) return 0;
  const days = remaining / -slopePerDay;
  return Number.isFinite(days) ? days : null;
}
