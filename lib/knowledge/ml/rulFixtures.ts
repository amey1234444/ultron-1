/**
 * SYNTHETIC health and RUL payloads, one per status.
 *
 * **Every value here is invented.** These exist so the Health & RUL section can
 * be built and reviewed before the service can answer, and so each of the seven
 * statuses has something to render. They are shaped exactly like the wire
 * payload — snake_case, the service's field names — so they go through the same
 * parser as a real response and cannot drift into a shape the parser would
 * reject.
 *
 * `trained_on_real_data` is false in all of them, which is what keeps the
 * "Experimental · synthetic validation only" badge lit wherever they are shown.
 *
 * They are reachable only behind `ULTRON_RUL_FIXTURES`. There is no path from a
 * production build to this file's data: see `useComponentRul`, which asks the
 * service first and only falls back when the flag is on.
 *
 * Why fixtures rather than a Python endpoint: `services/ml/app/evaluation/
 * remaining_time.py` records that component RUL cannot be computed from what
 * this system has — no end-of-life definition per component, no wear model, and
 * no run-to-failure histories. An endpoint returning numbers anyway would look
 * real and be untrustworthy. These are labelled instead.
 */

const TODAY = '2026-09-28';
const NOW = '2026-09-28T02:00:00Z';

function provenance(overrides: Record<string, unknown> = {}) {
  return {
    method: 'bayesian_exponential_v2',
    method_version: '2.0.0',
    trained_on_real_data: false,
    label_quality: 'SYNTHETIC',
    computed_at: NOW,
    data_quality_days_used: 58,
    ...overrides,
  };
}

function component(overrides: Record<string, unknown> = {}) {
  return {
    component_id: 'GBX-01-BRG',
    component_type: 'GEARBOX_BEARING',
    display_name: 'Gearbox main bearing',
    installed_at: '2026-03-02T00:00:00Z',
    ...overrides,
  };
}

/** A descending health history, with a gap of insufficient days in the middle. */
function history(days: number, from: number, to: number, gapAt: number[] = []) {
  const out: Record<string, unknown>[] = [];
  const start = Date.parse('2026-07-30T00:00:00Z');
  for (let i = 0; i < days; i += 1) {
    const hi = from + ((to - from) * i) / Math.max(1, days - 1);
    const insufficient = gapAt.includes(i);
    out.push({
      date: new Date(start + i * 86_400_000).toISOString().slice(0, 10),
      hi: Number(hi.toFixed(4)),
      valid_steady_hours: insufficient ? 2.5 : 19.5,
      sufficiency: insufficient ? 'INSUFFICIENT' : 'OK',
      health_state: hi > 0.5 ? (hi > 0.85 ? 'HEALTHY' : 'DEGRADING') : 'CRITICAL',
    });
  }
  return out;
}

/** A widening band from today, falling towards the failure threshold. */
function projection(days: number, startHi: number) {
  const out: Record<string, unknown>[] = [];
  const start = Date.parse(`${TODAY}T00:00:00Z`);
  for (let i = 0; i < days; i += 1) {
    const median = Math.max(0, startHi - 0.0081 * i);
    const spread = 0.004 * i;
    out.push({
      date: new Date(start + i * 86_400_000).toISOString().slice(0, 10),
      days_from_today: i,
      hi_p10: Number(Math.max(0, median - spread).toFixed(4)),
      hi_p50: Number(median.toFixed(4)),
      hi_p90: Number(Math.min(1, median + spread).toFixed(4)),
    });
  }
  return out;
}

const EVENTS = [
  { date: '2026-03-02', type: 'INSTALL', label: 'Installed' },
  { date: '2026-06-14', type: 'INSPECTION', label: 'Routine inspection' },
];

const RUL_ESTIMATE_HISTORY = [
  { date: '2026-09-01', rul_p50_days: 55, rul_p10_days: 30, rul_p90_days: 90 },
  { date: '2026-09-08', rul_p50_days: 51, rul_p10_days: 31, rul_p90_days: 79 },
  { date: '2026-09-15', rul_p50_days: 45, rul_p10_days: 29, rul_p90_days: 68 },
  { date: '2026-09-22', rul_p50_days: 41, rul_p10_days: 28, rul_p90_days: 61 },
  { date: '2026-09-28', rul_p50_days: 38, rul_p10_days: 26, rul_p90_days: 56 },
];

const AVAILABLE = {
  status: 'AVAILABLE',
  component: component(),
  summary: {
    health_index: 0.72,
    health_state: 'DEGRADING',
    degradation_rate_per_day: -0.0081,
    onset_detected_at: '2026-08-24',
    rul_days: { p10: 26, p50: 38, p90: 56 },
    rul_operating_hours: { p10: 540, p50: 790, p90: 1160 },
    failure_probability: { d7: 0.02, d30: 0.31, d60: 0.93 },
    confidence: 'MEDIUM',
    top_drivers: [
      { indicator: 'vibration_kurtosis_trend', label: 'Vibration kurtosis trend', contribution: 0.41 },
      { indicator: 'oil_temp_residual', label: 'Oil temperature residual', contribution: 0.33 },
      { indicator: 'shaft_order_2x', label: '2× shaft order amplitude', contribution: 0.18 },
    ],
  },
  thresholds: { failure_hi: 0.3, warning_hi: 0.5 },
  history: history(60, 0.96, 0.72, [22, 23, 41]),
  projection: projection(60, 0.72),
  threshold_crossings: { p10: '2026-10-24', p50: '2026-11-05', p90: '2026-11-23' },
  events: EVENTS,
  rul_estimate_history: RUL_ESTIMATE_HISTORY,
  provenance: provenance(),
};

const NOT_DEGRADING = {
  status: 'NOT_DEGRADING',
  component: component({ component_id: 'SCR-01-A', component_type: 'SCREW_SHAFT', display_name: 'Screw A shaft' }),
  summary: {
    health_index: 0.94,
    health_state: 'HEALTHY',
    degradation_rate_per_day: -0.0002,
    onset_detected_at: null,
    rul_days: null,
    rul_operating_hours: null,
    failure_probability: null,
    confidence: 'HIGH',
    top_drivers: [],
  },
  thresholds: { failure_hi: 0.3, warning_hi: 0.5 },
  history: history(60, 0.97, 0.94),
  projection: [],
  threshold_crossings: null,
  events: [{ date: '2026-03-02', type: 'INSTALL', label: 'Installed' }],
  rul_estimate_history: [],
  provenance: provenance({ data_quality_days_used: 60 }),
};

const INSUFFICIENT_HISTORY = {
  status: 'INSUFFICIENT_HISTORY',
  component: component({ component_id: 'MTR-01', component_type: 'MAIN_MOTOR', display_name: 'Main drive motor' }),
  summary: {
    health_index: 0.88,
    health_state: 'UNKNOWN',
    degradation_rate_per_day: 0,
    onset_detected_at: null,
    rul_days: null,
    rul_operating_hours: null,
    failure_probability: null,
    confidence: 'LOW',
    top_drivers: [],
  },
  thresholds: { failure_hi: 0.3, warning_hi: 0.5 },
  history: history(9, 0.91, 0.88, [2, 5, 6]),
  projection: [],
  threshold_crossings: null,
  events: [],
  rul_estimate_history: [],
  provenance: provenance({ data_quality_days_used: 6 }),
  detail: 'Not enough valid steady-production data yet (6 of 21 days).',
};

const THRESHOLD_NOT_CONFIGURED = {
  status: 'THRESHOLD_NOT_CONFIGURED',
  component: component({ component_id: 'DIE-01', component_type: 'DIE_PLATE', display_name: 'Die plate' }),
  summary: {
    health_index: 0.64,
    health_state: 'DEGRADING',
    degradation_rate_per_day: -0.0045,
    onset_detected_at: '2026-09-02',
    rul_days: null,
    rul_operating_hours: null,
    failure_probability: null,
    confidence: 'LOW',
    top_drivers: [{ indicator: 'melt_pressure_residual', label: 'Melt pressure residual', contribution: 0.52 }],
  },
  thresholds: { failure_hi: null, warning_hi: null },
  history: history(40, 0.88, 0.64),
  projection: [],
  threshold_crossings: null,
  events: [{ date: '2026-03-02', type: 'INSTALL', label: 'Installed' }],
  rul_estimate_history: [],
  provenance: provenance({ data_quality_days_used: 40 }),
  detail: 'Failure threshold not configured for this component — RUL cannot be computed.',
};

const RUL_NOT_AVAILABLE = {
  ...THRESHOLD_NOT_CONFIGURED,
  status: 'RUL_NOT_AVAILABLE',
  thresholds: { failure_hi: 0.3, warning_hi: 0.5 },
  detail: 'The degradation fit did not converge on this component’s history.',
};

const DEGRADED = {
  ...INSUFFICIENT_HISTORY,
  status: 'DEGRADED',
  detail: 'The forecasting component is degraded; the last completed estimate is shown.',
};

const ML_UNAVAILABLE = {
  status: 'ML_UNAVAILABLE',
  component: component(),
  summary: {
    health_index: 0,
    health_state: 'UNKNOWN',
    degradation_rate_per_day: 0,
    onset_detected_at: null,
    rul_days: null,
    rul_operating_hours: null,
    failure_probability: null,
    confidence: 'LOW',
    top_drivers: [],
  },
  thresholds: { failure_hi: null, warning_hi: null },
  history: [],
  projection: [],
  threshold_crossings: null,
  events: [],
  rul_estimate_history: [],
  provenance: provenance({ data_quality_days_used: 0 }),
  detail: 'ML service unavailable — engineering diagnostics unaffected.',
};

/** Every status, keyed by the component the fixture describes. */
export const RUL_FIXTURES: Record<string, unknown> = {
  'GBX-01-BRG': AVAILABLE,
  'SCR-01-A': NOT_DEGRADING,
  'MTR-01': INSUFFICIENT_HISTORY,
  'DIE-01': THRESHOLD_NOT_CONFIGURED,
  'DIE-02': RUL_NOT_AVAILABLE,
  'VNT-01': DEGRADED,
  'OFFLINE-01': ML_UNAVAILABLE,
};

export const RUL_FIXTURE_BY_STATUS: Record<string, unknown> = {
  AVAILABLE,
  NOT_DEGRADING,
  INSUFFICIENT_HISTORY,
  THRESHOLD_NOT_CONFIGURED,
  RUL_NOT_AVAILABLE,
  DEGRADED,
  ML_UNAVAILABLE,
};

/** The components a fixture run offers, in the order the selector shows them. */
export const RUL_FIXTURE_COMPONENTS = [
  { componentId: 'GBX-01-BRG', displayName: 'Gearbox main bearing' },
  { componentId: 'SCR-01-A', displayName: 'Screw A shaft' },
  { componentId: 'MTR-01', displayName: 'Main drive motor' },
  { componentId: 'DIE-01', displayName: 'Die plate' },
  { componentId: 'DIE-02', displayName: 'Die plate (secondary)' },
  { componentId: 'VNT-01', displayName: 'Vent section' },
  { componentId: 'OFFLINE-01', displayName: 'Unreachable component' },
];
