/**
 * Assemble the contract payload the health-and-RUL chart consumes.
 *
 * Every field the parser requires is produced here or explicitly omitted, and
 * nothing is completed on the client — `rulContract.ts` says so in its own
 * first paragraph, and the reason this file exists rather than a few helpers
 * in the component is that the rule only holds if there is one place that can
 * break it.
 *
 * See `healthIndex.ts` for what kind of RUL this is and why the inputs are
 * not invented.
 */
import type {
  ComponentRul,
  ConfidenceLevel,
  HealthDriver,
  HealthState,
  MaintenanceEvent,
  ProjectionPoint,
  RulComponent,
  RulStatus,
} from '../knowledge/ml/rulContract';
import { addDays, daysBetween, daysToTarget, fitTrend, type DailyHealth, type TrendFit } from './healthIndex';

export const RUL_METHOD = 'trend-to-threshold';
export const RUL_METHOD_VERSION = '1.0.0';

/** Days of usable history below which no trend is reported. */
export const MIN_HISTORY_DAYS = 7;
/** Hours in a day below which that day is evidence of nothing. */
export const MIN_STEADY_HOURS = 2;
/**
 * Health lost per day below which a component is called stable.
 *
 * 0.02%/day is roughly one health point over fourteen years. Below that the
 * slope is indistinguishable from the noise of the daily median, and calling
 * it degradation would put a date on a flat line.
 */
export const MIN_DEGRADATION_PER_DAY = 0.0002;

/** How far the chart projects. Beyond this the line says more than the data. */
export const PROJECTION_DAYS = 90;

export type ComponentInput = {
  component: RulComponent;
  /** Health at the alert limit. Null when no alert limit is configured. */
  warningHi: number | null;
  /** Always 0 by construction: the danger limit is where health is spent. */
  failureHi: number | null;
  history: DailyHealth[];
  drivers: HealthDriver[];
  events: MaintenanceEvent[];
  /** Null when the component's channels carry no danger threshold. */
  thresholdConfigured: boolean;
  /** What the service wants to say when it cannot answer. */
  detail?: string | null;
};

function stateFor(hi: number, warningHi: number | null): HealthState {
  if (!Number.isFinite(hi)) return 'UNKNOWN';
  if (hi <= 0) return 'CRITICAL';
  if (warningHi !== null && hi <= warningHi) return 'DEGRADING';
  return 'HEALTHY';
}

/**
 * How much to trust the line.
 *
 * Three things make an extrapolation believable: enough days, enough span, and
 * pairwise slopes that agree. Any one of them missing caps the answer.
 */
function confidenceFor(fit: TrendFit, usableDays: number): ConfidenceLevel {
  const disagreement = Math.abs(fit.slopeP10 - fit.slopeP90);
  const magnitude = Math.abs(fit.slopePerDay);
  // The band as a multiple of the slope itself. A band wider than the slope
  // means the sign is the only thing the data supports.
  const relative = magnitude > 0 ? disagreement / magnitude : Infinity;
  if (usableDays >= 30 && fit.spanDays >= 30 && relative <= 1) return 'HIGH';
  if (usableDays >= 14 && fit.spanDays >= 14 && relative <= 3) return 'MEDIUM';
  return 'LOW';
}

/** Health at a day offset, clamped to the interval a health index lives in. */
function project(hi: number, slope: number, days: number): number {
  return Math.min(1, Math.max(0, hi + slope * days));
}

/**
 * The share of observed slopes that reach the limit within `days`.
 *
 * Derived from the same pairwise spread as the band rather than from a
 * distribution nobody fitted. It is a coarse number and is reported as one.
 */
function failureProbabilityWithin(hi: number, fit: TrendFit, days: number): number {
  const needed = hi > 0 ? -hi / days : 0;
  if (hi <= 0) return 1;
  // Steeper than `needed` means it arrives in time. The three order statistics
  // are all that is available, so this interpolates between them.
  const { slopeP10: steep, slopePerDay: mid, slopeP90: shallow } = fit;
  if (needed <= steep) return 0;
  if (needed >= shallow) return 1;
  if (needed <= mid) return 0.1 + (0.4 * (needed - steep)) / Math.max(1e-12, mid - steep);
  return 0.5 + (0.4 * (needed - mid)) / Math.max(1e-12, shallow - mid);
}

export function buildComponentRul(input: ComponentInput, now = Date.now()): ComponentRul {
  const computedAt = new Date(now).toISOString();
  const usable = input.history.filter((day) => day.validSteadyHours >= MIN_STEADY_HOURS);
  const latest = usable[usable.length - 1];
  // The last day with enough steady running, or failing that the last day
  // recorded at all. Never a default of 1: reporting perfect health for a
  // component nothing is known about is the one number that must not appear
  // on a maintenance chart.
  const lastRecorded = input.history[input.history.length - 1];
  const hi = latest ? latest.hi : lastRecorded ? lastRecorded.hi : NaN;
  const warningHi = input.warningHi;

  const history = input.history.map((day) => ({
    date: day.date,
    hi: day.hi,
    validSteadyHours: day.validSteadyHours,
    sufficiency: (day.validSteadyHours >= MIN_STEADY_HOURS ? 'OK' : 'INSUFFICIENT') as 'OK' | 'INSUFFICIENT',
    healthState: stateFor(day.hi, warningHi),
  }));

  const base = {
    component: input.component,
    thresholds: { failureHi: input.failureHi, warningHi },
    history,
    projection: [] as ProjectionPoint[],
    thresholdCrossings: null,
    events: input.events,
    rulEstimateHistory: [],
    provenance: {
      method: RUL_METHOD,
      methodVersion: RUL_METHOD_VERSION,
      // Nothing here was fitted on confirmed failures, and the chart says so
      // wherever a number from it is shown.
      trainedOnRealData: false,
      labelQuality: 'no confirmed end-of-life events',
      computedAt,
      dataQualityDaysUsed: usable.length,
    },
  };

  const unavailable = (status: RulStatus, detail: string): ComponentRul => ({
    ...base,
    status,
    summary: {
      healthIndex: Number.isFinite(hi) ? hi : 0,
      // UNKNOWN whenever the figure did not come from a day with enough
      // steady running, whatever that figure happens to be.
      healthState: latest && Number.isFinite(hi) ? stateFor(hi, warningHi) : 'UNKNOWN',
      degradationRatePerDay: 0,
      onsetDetectedAt: null,
      rulDays: null,
      rulOperatingHours: null,
      failureProbability: null,
      confidence: 'LOW',
      topDrivers: input.drivers,
    },
    detail,
  });

  if (!input.thresholdConfigured || input.failureHi === null) {
    return unavailable(
      'THRESHOLD_NOT_CONFIGURED',
      'No danger threshold is configured on this component’s channels, so there is no limit to project towards.',
    );
  }
  if (usable.length < MIN_HISTORY_DAYS) {
    return unavailable(
      'INSUFFICIENT_HISTORY',
      `${usable.length} day${usable.length === 1 ? '' : 's'} of steady running recorded; ${MIN_HISTORY_DAYS} are needed before a trend means anything.`,
    );
  }

  const fit = fitTrend(usable);
  if (!fit) return unavailable('RUL_NOT_AVAILABLE', 'The history could not be fitted.');

  if (fit.slopePerDay > -MIN_DEGRADATION_PER_DAY) {
    return {
      ...unavailable('NOT_DEGRADING', 'Health is stable or improving over the recorded history.'),
      summary: {
        ...unavailable('NOT_DEGRADING', '').summary,
        degradationRatePerDay: fit.slopePerDay,
        confidence: confidenceFor(fit, usable.length),
      },
    };
  }

  const today = latest.date;
  // Steepest credible slope gives the shortest life and the lowest health;
  // shallowest gives the longest and the highest. The two orderings the
  // contract asserts are the same fact seen from either end.
  const steep = Math.min(fit.slopeP10, fit.slopePerDay);
  const shallow = Math.min(-MIN_DEGRADATION_PER_DAY, Math.max(fit.slopeP90, fit.slopePerDay));

  const projection: ProjectionPoint[] = [];
  for (let day = 0; day <= PROJECTION_DAYS; day += 1) {
    projection.push({
      date: addDays(today, day),
      daysFromToday: day,
      hiP10: project(hi, steep, day),
      hiP50: project(hi, fit.slopePerDay, day),
      hiP90: project(hi, shallow, day),
    });
  }

  const crossing = (slope: number, target: number): string | null => {
    const days = daysToTarget(hi, slope, target);
    return days === null || days > PROJECTION_DAYS * 4 ? null : addDays(today, Math.ceil(days));
  };

  const p50 = daysToTarget(hi, fit.slopePerDay, input.failureHi);
  const p10 = daysToTarget(hi, steep, input.failureHi);
  const p90 = daysToTarget(hi, shallow, input.failureHi);

  // Operating hours, not calendar days: a component that runs eight hours a
  // day has three times the calendar life of one that runs all of them.
  const hoursPerDay = usable.reduce((sum, day) => sum + day.validSteadyHours, 0) / usable.length;
  const asHours = (days: number | null) => (days === null ? null : days * hoursPerDay);

  // Onset is the first day health left the healthy band and did not return.
  const onsetIndex = warningHi === null ? -1 : usable.findIndex((day, i) =>
    day.hi <= warningHi && usable.slice(i).every((later) => later.hi <= warningHi));
  const rulDaysFinite = p10 !== null && p50 !== null && p90 !== null;

  const rulEstimateHistory = usable.slice(-30).map((day) => {
    const atDay = fitTrend(usable.filter((point) => point.date <= day.date));
    const mid = atDay ? daysToTarget(day.hi, atDay.slopePerDay, input.failureHi!) : null;
    const low = atDay ? daysToTarget(day.hi, Math.min(atDay.slopeP10, atDay.slopePerDay), input.failureHi!) : null;
    const high = atDay
      ? daysToTarget(day.hi, Math.min(-MIN_DEGRADATION_PER_DAY, Math.max(atDay.slopeP90, atDay.slopePerDay)), input.failureHi!)
      : null;
    return mid === null || low === null || high === null
      ? null
      : { date: day.date, rulP50Days: mid, rulP10Days: low, rulP90Days: high };
  }).filter((point): point is NonNullable<typeof point> => point !== null);

  return {
    ...base,
    status: 'AVAILABLE',
    summary: {
      healthIndex: hi,
      healthState: stateFor(hi, warningHi),
      degradationRatePerDay: fit.slopePerDay,
      onsetDetectedAt: onsetIndex >= 0 ? usable[onsetIndex].date : null,
      rulDays: rulDaysFinite ? { p10: p10!, p50: p50!, p90: p90! } : null,
      rulOperatingHours: rulDaysFinite
        ? { p10: asHours(p10)!, p50: asHours(p50)!, p90: asHours(p90)! }
        : null,
      failureProbability: {
        d7: failureProbabilityWithin(hi, fit, 7),
        d30: failureProbabilityWithin(hi, fit, 30),
        d60: failureProbabilityWithin(hi, fit, 60),
      },
      confidence: confidenceFor(fit, usable.length),
      topDrivers: input.drivers,
    },
    projection,
    thresholdCrossings: {
      p10: crossing(steep, input.failureHi),
      p50: crossing(fit.slopePerDay, input.failureHi),
      p90: crossing(shallow, input.failureHi),
    },
    rulEstimateHistory,
    detail: input.detail ?? null,
  };
}

export { daysBetween };

/**
 * The payload as the service puts it on the wire.
 *
 * `rulContract.ts` parses snake_case and produces camelCase, so the two
 * namings are the wire format and the domain shape rather than an
 * inconsistency. Emitting from the domain type keeps one of them checked by
 * the compiler and the other checked by that parser, which is the arrangement
 * that caught this file getting it wrong the first time.
 */
export function serializeComponentRul(rul: ComponentRul): Record<string, unknown> {
  const percentiles = (value: { p10: number; p50: number; p90: number } | null) =>
    value === null ? null : { p10: value.p10, p50: value.p50, p90: value.p90 };

  return {
    status: rul.status,
    component: {
      component_id: rul.component.componentId,
      component_type: rul.component.componentType,
      display_name: rul.component.displayName,
      installed_at: rul.component.installedAt,
    },
    summary: {
      health_index: rul.summary.healthIndex,
      health_state: rul.summary.healthState,
      degradation_rate_per_day: rul.summary.degradationRatePerDay,
      onset_detected_at: rul.summary.onsetDetectedAt,
      rul_days: percentiles(rul.summary.rulDays),
      rul_operating_hours: percentiles(rul.summary.rulOperatingHours),
      failure_probability: rul.summary.failureProbability
        ? {
            d7: rul.summary.failureProbability.d7,
            d30: rul.summary.failureProbability.d30,
            d60: rul.summary.failureProbability.d60,
          }
        : null,
      confidence: rul.summary.confidence,
      top_drivers: rul.summary.topDrivers.map((driver) => ({
        indicator: driver.indicator,
        label: driver.label,
        contribution: driver.contribution,
      })),
    },
    thresholds: { failure_hi: rul.thresholds.failureHi, warning_hi: rul.thresholds.warningHi },
    history: rul.history.map((point) => ({
      date: point.date,
      hi: point.hi,
      valid_steady_hours: point.validSteadyHours,
      sufficiency: point.sufficiency,
      health_state: point.healthState,
    })),
    projection: rul.projection.map((point) => ({
      date: point.date,
      days_from_today: point.daysFromToday,
      hi_p10: point.hiP10,
      hi_p50: point.hiP50,
      hi_p90: point.hiP90,
    })),
    threshold_crossings: rul.thresholdCrossings,
    events: rul.events.map((event) => ({ date: event.date, type: event.type, label: event.label })),
    rul_estimate_history: rul.rulEstimateHistory.map((point) => ({
      date: point.date,
      rul_p50_days: point.rulP50Days,
      rul_p10_days: point.rulP10Days,
      rul_p90_days: point.rulP90Days,
    })),
    provenance: {
      method: rul.provenance.method,
      method_version: rul.provenance.methodVersion,
      trained_on_real_data: rul.provenance.trainedOnRealData,
      label_quality: rul.provenance.labelQuality,
      computed_at: rul.provenance.computedAt,
      data_quality_days_used: rul.provenance.dataQualityDaysUsed,
    },
    detail: rul.detail,
  };
}
