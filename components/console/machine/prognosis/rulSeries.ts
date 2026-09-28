/**
 * Turning a parsed health/RUL payload into drawable geometry.
 *
 * Everything here is a pure function over plain data. None of it decides
 * anything about the component's health: it takes the values the service sent
 * and answers where they go on a plane. That split is what lets the chart stay
 * presentational and lets the awkward parts — gaps, the band polygon, label
 * collisions — be tested without rendering anything.
 *
 * Coordinates are produced in the chart's own space: x in days from the domain
 * start, y as a fraction of the plot height with 0 at the top, because that is
 * the direction SVG counts in and converting once here beats converting at
 * every call site.
 */
import type {
  ComponentRul,
  HealthHistoryPoint,
  MaintenanceEvent,
  ProjectionPoint,
} from '../../../../lib/knowledge/ml/rulContract';

export type ChartRange = '30d' | '90d' | 'life' | 'all';

const DAY_MS = 86_400_000;

export function toDayIndex(date: string, origin: number): number {
  return (Date.parse(`${date}T00:00:00Z`) - origin) / DAY_MS;
}

/* -- domain ---------------------------------------------------------------- */

export type Domain = { startMs: number; endMs: number; days: number };

/**
 * The x window, from the selected range and the data actually present.
 *
 * The end is the latest p90 crossing plus 5%, because that is the last thing
 * worth seeing; when there is no projection the window stops at the last
 * observation instead of running on into empty space.
 */
export function buildDomain(value: ComponentRul, range: ChartRange, todayIso: string): Domain {
  const today = Date.parse(`${todayIso}T00:00:00Z`);
  const firstHistory = value.history.length > 0 ? Date.parse(`${value.history[0].date}T00:00:00Z`) : today;
  const installed = Date.parse(value.component.installedAt);

  // A replacement starts a new life, so "life" begins at the most recent one.
  const lastReplacement = value.events
    .filter((event) => event.type === 'REPLACEMENT')
    .map((event) => Date.parse(`${event.date}T00:00:00Z`))
    .sort((a, b) => b - a)[0];

  let startMs: number;
  if (range === '30d') startMs = today - 30 * DAY_MS;
  else if (range === '90d') startMs = today - 90 * DAY_MS;
  else if (range === 'life') startMs = lastReplacement ?? installed;
  else startMs = Math.min(installed, firstHistory);

  // Never start after the data: a 30-day window on a component with nine days
  // of history should still show those nine days rather than an empty plot.
  startMs = Math.min(startMs, firstHistory);

  const lastHistory =
    value.history.length > 0 ? Date.parse(`${value.history[value.history.length - 1].date}T00:00:00Z`) : today;
  const crossing = value.thresholdCrossings?.p90
    ? Date.parse(`${value.thresholdCrossings.p90}T00:00:00Z`)
    : null;
  const lastProjection =
    value.projection.length > 0
      ? Date.parse(`${value.projection[value.projection.length - 1].date}T00:00:00Z`)
      : null;

  const rawEnd = Math.max(today, lastHistory, crossing ?? 0, lastProjection ?? 0);
  const span = Math.max(DAY_MS, rawEnd - startMs);
  const endMs = rawEnd + span * 0.05;

  return { startMs, endMs, days: (endMs - startMs) / DAY_MS };
}

/* -- observed history ------------------------------------------------------ */

export type SeriesPoint = { x: number; y: number; point: HealthHistoryPoint };

/**
 * Observed history, split into segments at days with insufficient data.
 *
 * A gap is not a straight line between the days either side of it. Connecting
 * across an insufficient day draws a trend through hours the machine was not
 * in steady production, which is exactly the inference the sufficiency flag
 * exists to prevent. Each run of sufficient days becomes its own segment, and
 * the insufficient days are returned separately so the chart can mark them
 * without joining them.
 */
export function buildHistorySegments(
  history: readonly HealthHistoryPoint[],
  domain: Domain,
): { segments: SeriesPoint[][]; insufficient: SeriesPoint[] } {
  const segments: SeriesPoint[][] = [];
  const insufficient: SeriesPoint[] = [];
  let current: SeriesPoint[] = [];

  for (const point of history) {
    const ms = Date.parse(`${point.date}T00:00:00Z`);
    if (ms < domain.startMs || ms > domain.endMs) continue;
    const entry: SeriesPoint = { x: toDayIndex(point.date, domain.startMs), y: 1 - point.hi, point };

    if (point.sufficiency === 'INSUFFICIENT') {
      insufficient.push(entry);
      if (current.length > 0) {
        segments.push(current);
        current = [];
      }
      continue;
    }
    current.push(entry);
  }
  if (current.length > 0) segments.push(current);
  return { segments, insufficient };
}

/* -- projection ------------------------------------------------------------ */

export type BandPoint = { x: number; yLow: number; yHigh: number };

/**
 * The 80% interval as a closed ring.
 *
 * Forward along the optimistic bound, back along the pessimistic one. Returning
 * the ring rather than two lines means the chart fills one path instead of
 * reasoning about winding order.
 */
export function buildProjectionBand(projection: readonly ProjectionPoint[], domain: Domain): BandPoint[] {
  return projection
    .filter((point) => {
      const ms = Date.parse(`${point.date}T00:00:00Z`);
      return ms >= domain.startMs && ms <= domain.endMs;
    })
    .map((point) => ({
      x: toDayIndex(point.date, domain.startMs),
      // hi_p90 is the optimistic bound, so it is the *higher* health index and
      // therefore the *smaller* y once flipped.
      yHigh: 1 - point.hiP90,
      yLow: 1 - point.hiP10,
    }));
}

export function bandRing(band: readonly BandPoint[]): { x: number; y: number }[] {
  if (band.length === 0) return [];
  const forward = band.map((p) => ({ x: p.x, y: p.yHigh }));
  const back = [...band].reverse().map((p) => ({ x: p.x, y: p.yLow }));
  return [...forward, ...back];
}

export function buildMedianLine(projection: readonly ProjectionPoint[], domain: Domain): { x: number; y: number }[] {
  return projection
    .filter((point) => {
      const ms = Date.parse(`${point.date}T00:00:00Z`);
      return ms >= domain.startMs && ms <= domain.endMs;
    })
    .map((point) => ({ x: toDayIndex(point.date, domain.startMs), y: 1 - point.hiP50 }));
}

/* -- crossing labels ------------------------------------------------------- */

export type CrossingLabel = {
  key: 'p10' | 'p50' | 'p90';
  date: string;
  x: number;
  /** Rows below the failure line, 0 nearest. Staggered only where needed. */
  row: number;
  label: string;
  emphasis: boolean;
};

/**
 * Where the P10/P50/P90 markers go, and how to keep their labels apart.
 *
 * Three dates that can land within a day of each other produce three labels on
 * top of one another. Rather than dropping any — each is a different answer to
 * "when" and all three are wanted — they stagger downward: a label moves to the
 * next row only when it would overlap one already placed. P50 is emphasised and
 * always takes its own row, because it is the number a reader quotes.
 */
export function placeCrossingLabels(
  crossings: ComponentRul['thresholdCrossings'],
  rulDays: ComponentRul['summary']['rulDays'],
  domain: Domain,
  minSeparationDays: number,
): CrossingLabel[] {
  if (!crossings) return [];
  const entries: CrossingLabel[] = [];
  const order: Array<['p10' | 'p50' | 'p90', boolean]> = [
    ['p50', true],
    ['p10', false],
    ['p90', false],
  ];

  for (const [key, emphasis] of order) {
    const date = crossings[key];
    if (!date) continue;
    const ms = Date.parse(`${date}T00:00:00Z`);
    if (ms < domain.startMs || ms > domain.endMs) continue;
    const days = rulDays ? rulDays[key] : null;
    entries.push({
      key,
      date,
      x: toDayIndex(date, domain.startMs),
      row: 0,
      label: days === null ? key.toUpperCase() : `${key.toUpperCase()} · ${Math.round(days)} d`,
      emphasis,
    });
  }

  // Place in date order so "already placed" means "to the left of this one".
  const placed: CrossingLabel[] = [];
  for (const entry of [...entries].sort((a, b) => a.x - b.x)) {
    let row = 0;
    while (placed.some((other) => other.row === row && Math.abs(other.x - entry.x) < minSeparationDays)) {
      row += 1;
    }
    placed.push({ ...entry, row });
  }
  return placed.sort((a, b) => a.x - b.x);
}

/* -- events ---------------------------------------------------------------- */

export type EventMarker = { event: MaintenanceEvent; x: number; priorLife: boolean };

export function buildEventMarkers(
  events: readonly MaintenanceEvent[],
  domain: Domain,
  range: ChartRange,
): EventMarker[] {
  const lastReplacement = events
    .filter((event) => event.type === 'REPLACEMENT')
    .map((event) => Date.parse(`${event.date}T00:00:00Z`))
    .sort((a, b) => b - a)[0];

  return events
    .map((event) => {
      const ms = Date.parse(`${event.date}T00:00:00Z`);
      return {
        event,
        x: toDayIndex(event.date, domain.startMs),
        // Only "all history" shows earlier lives, and it greys them out.
        priorLife: lastReplacement !== undefined && ms < lastReplacement,
        ms,
      };
    })
    .filter((marker) => marker.ms >= domain.startMs && marker.ms <= domain.endMs)
    .filter((marker) => (range === 'all' ? true : !marker.priorLife))
    .map(({ event, x, priorLife }) => ({ event, x, priorLife }));
}

/* -- downsampling ---------------------------------------------------------- */

/**
 * Cap the number of drawn history points, keeping the extremes.
 *
 * Averaging a bucket hides the day the index dipped, which on a health chart is
 * the only day anybody cares about. Each bucket contributes its minimum and its
 * maximum in their original order, so the envelope survives even though the
 * point count does not.
 */
export function downsampleHistory(
  history: readonly HealthHistoryPoint[],
  maxPoints: number,
): HealthHistoryPoint[] {
  if (history.length <= maxPoints || maxPoints < 4) return [...history];
  const bucketCount = Math.floor(maxPoints / 2);
  const size = history.length / bucketCount;
  const out: HealthHistoryPoint[] = [];

  for (let bucket = 0; bucket < bucketCount; bucket += 1) {
    const from = Math.floor(bucket * size);
    const to = Math.min(history.length, Math.floor((bucket + 1) * size));
    if (to <= from) continue;
    let min = history[from];
    let max = history[from];
    for (let i = from; i < to; i += 1) {
      if (history[i].hi < min.hi) min = history[i];
      if (history[i].hi > max.hi) max = history[i];
    }
    const [first, second] = min.date <= max.date ? [min, max] : [max, min];
    out.push(first);
    if (second !== first) out.push(second);
  }
  return out;
}

/* -- accessibility --------------------------------------------------------- */

/** One sentence describing the chart, for `aria-label`. */
export function describeChart(value: ComponentRul): string {
  const hi = value.summary.healthIndex.toFixed(2);
  const state = value.summary.healthState.toLowerCase();
  if (value.status !== 'AVAILABLE' || !value.summary.rulDays) {
    return `Health index ${hi}, ${state}. No remaining-life projection is available.`;
  }
  const { p10, p50, p90 } = value.summary.rulDays;
  return `Health index ${hi}, ${state}; median remaining life ${Math.round(p50)} days, 80% interval ${Math.round(
    p10,
  )} to ${Math.round(p90)} days.`;
}
