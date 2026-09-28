/**
 * Component health index and remaining-useful-life, as the ML service reports it.
 *
 * `GET /api/ml/health/:machineId/components/:componentId/rul`
 *
 * **This parser rejects rather than repairs.** Every other contract in this
 * layer is permissive, because a diagnosis that arrives slightly malformed is
 * still worth showing. This one is not: a health index is a number an engineer
 * schedules maintenance against, and a silently coerced percentile or an
 * out-of-order interval is worse than no chart. A payload that fails any check
 * below produces an error the UI renders as "invalid health data", with the
 * reason available to whoever has to fix it.
 *
 * **The frontend computes none of this.** No projection, no crossing date, no
 * threshold, no health state is derived here or in any component that consumes
 * this. Where the service did not send a value, the UI shows that it is missing.
 * That rule is what makes the chart trustworthy, and it is why the parser's job
 * is to verify the service's arithmetic rather than to complete it.
 */

/** What the service was able to answer. Only AVAILABLE carries a projection. */
export const RUL_STATUSES = [
  'AVAILABLE',
  'NOT_DEGRADING',
  'INSUFFICIENT_HISTORY',
  'THRESHOLD_NOT_CONFIGURED',
  'RUL_NOT_AVAILABLE',
  'DEGRADED',
  'ML_UNAVAILABLE',
] as const;
export type RulStatus = (typeof RUL_STATUSES)[number];

export const HEALTH_STATES = ['HEALTHY', 'DEGRADING', 'CRITICAL', 'UNKNOWN'] as const;
export type HealthState = (typeof HEALTH_STATES)[number];

export const SUFFICIENCY = ['OK', 'INSUFFICIENT'] as const;
export type Sufficiency = (typeof SUFFICIENCY)[number];

export const CONFIDENCE_LEVELS = ['LOW', 'MEDIUM', 'HIGH'] as const;
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];

export const EVENT_TYPES = ['INSTALL', 'REPLACEMENT', 'INSPECTION', 'REPAIR'] as const;
export type MaintenanceEventType = (typeof EVENT_TYPES)[number];

export type RulComponent = {
  componentId: string;
  componentType: string;
  displayName: string;
  /** ISO instant. Starts the component's current life. */
  installedAt: string;
};

export type Percentiles = { p10: number; p50: number; p90: number };

export type FailureProbability = { d7: number; d30: number; d60: number };

export type HealthDriver = {
  indicator: string;
  label: string;
  /** Share of the current health index movement, 0..1. */
  contribution: number;
};

export type RulSummary = {
  healthIndex: number;
  healthState: HealthState;
  degradationRatePerDay: number;
  /** Plain date, or null when no onset has been detected. */
  onsetDetectedAt: string | null;
  rulDays: Percentiles | null;
  rulOperatingHours: Percentiles | null;
  failureProbability: FailureProbability | null;
  confidence: ConfidenceLevel;
  topDrivers: HealthDriver[];
};

export type RulThresholds = {
  /** Health index at which the component is considered failed. */
  failureHi: number | null;
  warningHi: number | null;
};

export type HealthHistoryPoint = {
  date: string;
  hi: number;
  validSteadyHours: number;
  sufficiency: Sufficiency;
  healthState: HealthState;
};

/**
 * One projected day.
 *
 * `hiP10` is the pessimistic bound and `hiP90` the optimistic one, so the
 * ordering is hiP10 <= hiP50 <= hiP90. That is the opposite of the RUL
 * percentiles, where p10 is the *shortest* remaining life; both orderings are
 * asserted below because getting either backwards inverts the band.
 */
export type ProjectionPoint = {
  date: string;
  daysFromToday: number;
  hiP10: number;
  hiP50: number;
  hiP90: number;
};

export type ThresholdCrossings = { p10: string | null; p50: string | null; p90: string | null };

export type MaintenanceEvent = { date: string; type: MaintenanceEventType; label: string };

export type RulEstimatePoint = {
  date: string;
  rulP50Days: number;
  rulP10Days: number;
  rulP90Days: number;
};

export type RulProvenance = {
  method: string;
  methodVersion: string;
  trainedOnRealData: boolean;
  labelQuality: string;
  computedAt: string;
  dataQualityDaysUsed: number;
};

export type ComponentRul = {
  status: RulStatus;
  component: RulComponent;
  summary: RulSummary;
  thresholds: RulThresholds;
  history: HealthHistoryPoint[];
  /** Present only when status is AVAILABLE. */
  projection: ProjectionPoint[];
  thresholdCrossings: ThresholdCrossings | null;
  events: MaintenanceEvent[];
  rulEstimateHistory: RulEstimatePoint[];
  provenance: RulProvenance;
  /** The service's own words when it is degraded or cannot answer. */
  detail: string | null;
};

export type RulParseResult =
  | { ok: true; value: ComponentRul }
  | { ok: false; errors: string[] };

/* -- validation ------------------------------------------------------------ */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T[\d:.]+(Z|[+-]\d{2}:\d{2})$/;

class Reject extends Error {}

function fail(path: string, why: string): never {
  throw new Reject(`${path}: ${why}`);
}

function obj(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path, 'expected an object');
  return value as Record<string, unknown>;
}

function arr(source: Record<string, unknown>, key: string, path: string): unknown[] {
  const value = source[key];
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) fail(`${path}.${key}`, 'expected an array');
  return value;
}

function str(source: Record<string, unknown>, key: string, path: string): string {
  const value = source[key];
  if (typeof value !== 'string' || value.length === 0) fail(`${path}.${key}`, 'expected a non-empty string');
  return value;
}

function optionalStr(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function num(source: Record<string, unknown>, key: string, path: string): number {
  const value = source[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(`${path}.${key}`, 'expected a finite number');
  return value;
}

/** A health index is a fraction. Anything outside [0,1] is a unit bug upstream. */
function unitInterval(source: Record<string, unknown>, key: string, path: string): number {
  const value = num(source, key, path);
  if (value < 0 || value > 1) fail(`${path}.${key}`, `expected 0..1, got ${value}`);
  return value;
}

function enumOf<T extends string>(
  source: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
  path: string,
): T {
  const value = source[key];
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    fail(`${path}.${key}`, `expected one of ${allowed.join(' | ')}, got ${JSON.stringify(value)}`);
  }
  return value as T;
}

function date(source: Record<string, unknown>, key: string, path: string): string {
  const value = str(source, key, path);
  if (!ISO_DATE.test(value)) fail(`${path}.${key}`, `expected YYYY-MM-DD, got ${value}`);
  return value;
}

function optionalDate(source: Record<string, unknown>, key: string, path: string): string | null {
  const value = source[key];
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || !ISO_DATE.test(value)) fail(`${path}.${key}`, `expected YYYY-MM-DD or null`);
  return value;
}

function instant(source: Record<string, unknown>, key: string, path: string): string {
  const value = str(source, key, path);
  if (!ISO_INSTANT.test(value)) fail(`${path}.${key}`, `expected an ISO instant, got ${value}`);
  return value;
}

/** Ascending percentiles. p10 <= p50 <= p90, or the interval is inverted. */
function percentiles(value: unknown, path: string, allowNull = true): Percentiles | null {
  if (value === null || value === undefined) {
    if (allowNull) return null;
    fail(path, 'is required');
  }
  const source = obj(value, path);
  const out = { p10: num(source, 'p10', path), p50: num(source, 'p50', path), p90: num(source, 'p90', path) };
  if (!(out.p10 <= out.p50 && out.p50 <= out.p90)) {
    fail(path, `expected p10 <= p50 <= p90, got ${out.p10} / ${out.p50} / ${out.p90}`);
  }
  return out;
}

function parseComponent(value: unknown): RulComponent {
  const source = obj(value, 'component');
  return {
    componentId: str(source, 'component_id', 'component'),
    componentType: str(source, 'component_type', 'component'),
    displayName: str(source, 'display_name', 'component'),
    installedAt: instant(source, 'installed_at', 'component'),
  };
}

function parseSummary(value: unknown): RulSummary {
  const source = obj(value, 'summary');
  const failureRaw = source.failure_probability;
  let failure: FailureProbability | null = null;
  if (failureRaw !== null && failureRaw !== undefined) {
    const f = obj(failureRaw, 'summary.failure_probability');
    failure = {
      d7: unitInterval(f, 'd7', 'summary.failure_probability'),
      d30: unitInterval(f, 'd30', 'summary.failure_probability'),
      d60: unitInterval(f, 'd60', 'summary.failure_probability'),
    };
  }
  return {
    healthIndex: unitInterval(source, 'health_index', 'summary'),
    healthState: enumOf(source, 'health_state', HEALTH_STATES, 'summary'),
    degradationRatePerDay: num(source, 'degradation_rate_per_day', 'summary'),
    onsetDetectedAt: optionalDate(source, 'onset_detected_at', 'summary'),
    rulDays: percentiles(source.rul_days, 'summary.rul_days'),
    rulOperatingHours: percentiles(source.rul_operating_hours, 'summary.rul_operating_hours'),
    failureProbability: failure,
    confidence: enumOf(source, 'confidence', CONFIDENCE_LEVELS, 'summary'),
    topDrivers: arr(source, 'top_drivers', 'summary').map((entry, index) => {
      const path = `summary.top_drivers[${index}]`;
      const driver = obj(entry, path);
      return {
        indicator: str(driver, 'indicator', path),
        label: str(driver, 'label', path),
        contribution: unitInterval(driver, 'contribution', path),
      };
    }),
  };
}

function parseHistory(value: unknown[]): HealthHistoryPoint[] {
  return value.map((entry, index) => {
    const path = `history[${index}]`;
    const point = obj(entry, path);
    return {
      date: date(point, 'date', path),
      hi: unitInterval(point, 'hi', path),
      validSteadyHours: num(point, 'valid_steady_hours', path),
      sufficiency: enumOf(point, 'sufficiency', SUFFICIENCY, path),
      healthState: enumOf(point, 'health_state', HEALTH_STATES, path),
    };
  });
}

function parseProjection(value: unknown[]): ProjectionPoint[] {
  return value.map((entry, index) => {
    const path = `projection[${index}]`;
    const point = obj(entry, path);
    const out = {
      date: date(point, 'date', path),
      daysFromToday: num(point, 'days_from_today', path),
      hiP10: unitInterval(point, 'hi_p10', path),
      hiP50: unitInterval(point, 'hi_p50', path),
      hiP90: unitInterval(point, 'hi_p90', path),
    };
    // Pessimistic <= median <= optimistic. Inverted here, the band renders
    // upside down and the chart says the opposite of what the model meant.
    if (!(out.hiP10 <= out.hiP50 && out.hiP50 <= out.hiP90)) {
      fail(path, `expected hi_p10 <= hi_p50 <= hi_p90, got ${out.hiP10} / ${out.hiP50} / ${out.hiP90}`);
    }
    return out;
  });
}

export function parseComponentRul(payload: unknown): RulParseResult {
  try {
    const source = obj(payload, 'response');
    const status = enumOf(source, 'status', RUL_STATUSES, 'response');

    const projection = parseProjection(arr(source, 'projection', 'response'));
    const crossingsRaw = source.threshold_crossings;
    const thresholdCrossings =
      crossingsRaw === null || crossingsRaw === undefined
        ? null
        : {
            p10: optionalDate(obj(crossingsRaw, 'threshold_crossings'), 'p10', 'threshold_crossings'),
            p50: optionalDate(obj(crossingsRaw, 'threshold_crossings'), 'p50', 'threshold_crossings'),
            p90: optionalDate(obj(crossingsRaw, 'threshold_crossings'), 'p90', 'threshold_crossings'),
          };

    // The status is a promise about the payload. AVAILABLE without a projection
    // is the shape that would render an empty chart as though it were a
    // forecast, so it is rejected rather than tolerated.
    if (status === 'AVAILABLE' && projection.length === 0) {
      fail('response', 'status is AVAILABLE but projection is empty');
    }
    if (status === 'NOT_DEGRADING' && projection.length > 0) {
      fail('response', 'status is NOT_DEGRADING but a projection was supplied');
    }

    const thresholdsSource = obj(source.thresholds ?? {}, 'thresholds');

    const value: ComponentRul = {
      status,
      component: parseComponent(source.component),
      summary: parseSummary(source.summary),
      thresholds: {
        failureHi:
          thresholdsSource.failure_hi === null || thresholdsSource.failure_hi === undefined
            ? null
            : unitInterval(thresholdsSource, 'failure_hi', 'thresholds'),
        warningHi:
          thresholdsSource.warning_hi === null || thresholdsSource.warning_hi === undefined
            ? null
            : unitInterval(thresholdsSource, 'warning_hi', 'thresholds'),
      },
      history: parseHistory(arr(source, 'history', 'response')),
      projection,
      thresholdCrossings,
      events: arr(source, 'events', 'response').map((entry, index) => {
        const path = `events[${index}]`;
        const event = obj(entry, path);
        return {
          date: date(event, 'date', path),
          type: enumOf(event, 'type', EVENT_TYPES, path),
          label: str(event, 'label', path),
        };
      }),
      rulEstimateHistory: arr(source, 'rul_estimate_history', 'response').map((entry, index) => {
        const path = `rul_estimate_history[${index}]`;
        const point = obj(entry, path);
        const out = {
          date: date(point, 'date', path),
          rulP50Days: num(point, 'rul_p50_days', path),
          rulP10Days: num(point, 'rul_p10_days', path),
          rulP90Days: num(point, 'rul_p90_days', path),
        };
        if (!(out.rulP10Days <= out.rulP50Days && out.rulP50Days <= out.rulP90Days)) {
          fail(path, 'expected rul_p10_days <= rul_p50_days <= rul_p90_days');
        }
        return out;
      }),
      provenance: (() => {
        const p = obj(source.provenance, 'provenance');
        return {
          method: str(p, 'method', 'provenance'),
          methodVersion: str(p, 'method_version', 'provenance'),
          trainedOnRealData: p.trained_on_real_data === true,
          labelQuality: str(p, 'label_quality', 'provenance'),
          computedAt: instant(p, 'computed_at', 'provenance'),
          dataQualityDaysUsed: num(p, 'data_quality_days_used', 'provenance'),
        };
      })(),
      detail: optionalStr(source, 'detail'),
    };

    return { ok: true, value };
  } catch (error) {
    if (error instanceof Reject) return { ok: false, errors: [error.message] };
    return { ok: false, errors: [`response: ${(error as Error).message}`] };
  }
}

/* -- derived reads, not derived values ------------------------------------- */

/**
 * Whether the reading is old enough to mistrust.
 *
 * Reading a timestamp the service sent is not computing a health value; the
 * threshold is presentational and the badge says what it means.
 */
export const STALE_AFTER_HOURS = 36;

export function isStale(value: ComponentRul, now = Date.now()): boolean {
  const computed = Date.parse(value.provenance.computedAt);
  if (!Number.isFinite(computed)) return false;
  return now - computed > STALE_AFTER_HOURS * 3_600_000;
}
