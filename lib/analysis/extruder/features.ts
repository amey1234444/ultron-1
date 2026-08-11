// Feature extraction: measurements -> normalised -> baseline-relative -> features.
//
// Ported from the digital twin's `diagnostics/features.py`. Three feature
// families are produced, each with an explicit availability status so a missing
// input is never silently converted to zero:
//
//   scalar      baseline-relative ratios and residuals from the current snapshot
//   vibration   per-channel amplitude in both domains, plus order-domain structure
//               when a raw waveform is supplied
//   temporal    trend, repetition and dispersion descriptors from recent history
//
// Equations
//   ratio_to_baseline  = x / x_baseline                    (dimensionless)
//   residual           = x - x_reference                   (unit of x)
//   monotonic_fraction = max(#dx>0, #dx<0) / #dx           (dimensionless)
//   slope_per_sample   = SUM((i-i_)(x_i-x_)) / SUM((i-i_)^2)
//   sample_std         = sqrt( SUM((x_i-x_)^2) / (n-1) )   (unit of x)

import { baselineOf, screwRpm, type BaselineContext } from './baseline';
import { CANONICAL_UNITS, type ExtruderTag } from './signalMap';

/** Statuses used when a feature cannot be produced. */
export const NOT_AVAILABLE = 'NOT_EVALUATED_MISSING_INPUT';
export const BASELINE_REQUIRED = 'NOT_EVALUATED_BASELINE_REQUIRED';
export const WAVEFORM_REQUIRED = 'NOT_EVALUATED_WAVEFORM_REQUIRED';
export const HISTORY_REQUIRED = 'NOT_EVALUATED_HISTORY_REQUIRED';
export const AVAILABLE = 'AVAILABLE';

/** Number of consecutive samples inspected for instrumentation-fault inference. */
export const HISTORY_WINDOW_SAMPLES = 20;
/** Minimum samples before any temporal feature is reported. */
export const MINIMUM_TEMPORAL_SAMPLES = 4;

export type TelemetryEnvelope = {
  sequenceNumbers?: number[];
  arrivalOffsetsS?: number[];
  expectedIntervalS?: number | null;
  missingTags?: string[];
  sampleTimestamps?: string[];
};

export type ExtruderSnapshot = {
  timestamp: string;
  /** Canonical-unit values, keyed by pilot tag. `null` means the tag reported nothing. */
  normalised: Partial<Record<ExtruderTag, number | null>>;
  /** Unit conversion applied to each tag, for the traceability report. */
  conversions: Partial<Record<ExtruderTag, string>>;
  /** Broadband acceleration RMS in g, for channels that reported in the acceleration domain. */
  accelerationRmsG: Partial<Record<'V1' | 'V2', number>>;
  /** Recent scalar history per tag, oldest first. */
  history: Partial<Record<ExtruderTag, (number | null)[]>>;
  telemetry?: TelemetryEnvelope | null;
};

export type FeatureSet = {
  normalised: Partial<Record<ExtruderTag, number | null>>;
  conversions: Partial<Record<ExtruderTag, string>>;
  scalar: Record<string, number>;
  vibration: Record<'V1' | 'V2', Record<string, number | string>>;
  temporal: Record<string, number>;
  telemetry: Record<string, number>;
  availability: Record<string, string>;
};

function linearSlope(series: number[]): number {
  const count = series.length;
  const meanIndex = (count - 1) / 2;
  const meanValue = series.reduce((sum, value) => sum + value, 0) / count;
  let denominator = 0;
  for (let index = 0; index < count; index += 1) denominator += (index - meanIndex) ** 2;
  if (denominator <= 0) return 0;
  let numerator = 0;
  for (let index = 0; index < count; index += 1) numerator += (index - meanIndex) * (series[index] - meanValue);
  return numerator / denominator;
}

function sampleStd(series: number[]): number {
  const count = series.length;
  if (count < 2) return 0;
  const meanValue = series.reduce((sum, value) => sum + value, 0) / count;
  return Math.sqrt(series.reduce((sum, value) => sum + (value - meanValue) ** 2, 0) / (count - 1));
}

function monotonicFraction(series: number[]): number {
  if (series.length < 2) return 0;
  let rising = 0;
  let falling = 0;
  for (let index = 1; index < series.length; index += 1) {
    const delta = series[index] - series[index - 1];
    if (delta > 0) rising += 1;
    else if (delta < 0) falling += 1;
  }
  return Math.max(rising, falling) / (series.length - 1);
}

function maxIdenticalRun(series: number[]): number {
  let best = 1;
  let run = 1;
  for (let index = 1; index < series.length; index += 1) {
    run = series[index] === series[index - 1] ? run + 1 : 1;
    if (run > best) best = run;
  }
  return best;
}

/** Trend/repetition/dispersion descriptors for each tag with sufficient history. */
export function temporalFeatures(
  history: Partial<Record<ExtruderTag, (number | null)[]>>,
  minimumSamples = MINIMUM_TEMPORAL_SAMPLES,
  windowSamples = HISTORY_WINDOW_SAMPLES,
): { features: Record<string, number>; availability: Record<string, string> } {
  const features: Record<string, number> = {};
  const availability: Record<string, string> = {};
  for (const [tag, raw] of Object.entries(history) as [ExtruderTag, (number | null)[]][]) {
    const windowed = (raw ?? []).slice(-windowSamples);
    const series = windowed.filter((value): value is number => value !== null && Number.isFinite(value));
    const missing = windowed.length - series.length;
    if (series.length < minimumSamples) {
      availability[`temporal.${tag}`] = HISTORY_REQUIRED;
      features[`${tag}.missing_sample_count`] = missing;
      continue;
    }
    const slope = linearSlope(series);
    availability[`temporal.${tag}`] = AVAILABLE;
    features[`${tag}.sample_count`] = series.length;
    features[`${tag}.missing_sample_count`] = missing;
    features[`${tag}.slope_per_sample`] = slope;
    features[`${tag}.sample_std`] = sampleStd(series);
    // Measurement noise is dispersion ABOUT the trend. Using the raw standard
    // deviation would report a genuine process ramp as an excessively noisy sensor.
    const meanIndex = (series.length - 1) / 2;
    const meanValue = series.reduce((sum, value) => sum + value, 0) / series.length;
    const residuals = series.map((value, index) => value - (meanValue + slope * (index - meanIndex)));
    features[`${tag}.detrended_std`] = sampleStd(residuals);
    features[`${tag}.monotonic_trend_fraction`] = monotonicFraction(series);
    features[`${tag}.identical_sample_run_length`] = maxIdenticalRun(series);
    features[`${tag}.first`] = series[0];
    features[`${tag}.last`] = series[series.length - 1];
    features[`${tag}.range`] = Math.max(...series) - Math.min(...series);
  }
  return { features, availability };
}

/** Transport-layer descriptors: gaps, duplicates, delay and timestamp monotonicity. */
export function telemetryFeatures(
  envelope: TelemetryEnvelope | null | undefined,
): { features: Record<string, number>; availability: Record<string, string> } {
  if (!envelope) return { features: {}, availability: { telemetry: NOT_AVAILABLE } };
  const features: Record<string, number> = {};
  const sequences = envelope.sequenceNumbers ?? [];
  if (sequences.length > 1) {
    const deltas = sequences.slice(1).map((value, index) => value - sequences[index]);
    features.sequence_gap_count = deltas.filter((delta) => delta > 1).length;
    features.sequence_duplicate_count = deltas.filter((delta) => delta === 0).length;
    features.sequence_regression_count = deltas.filter((delta) => delta < 0).length;
    features.missing_sample_estimate = deltas.filter((delta) => delta > 1).reduce((sum, delta) => sum + delta - 1, 0);
  }
  const arrivals = envelope.arrivalOffsetsS ?? [];
  const expected = envelope.expectedIntervalS ?? 0;
  if (arrivals.length > 1 && expected > 0) {
    const gaps = arrivals.slice(1).map((value, index) => value - arrivals[index]);
    features.max_arrival_gap_ratio = Math.max(...gaps) / expected;
    features.mean_arrival_gap_ratio = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length / expected;
  }
  const stamps = envelope.sampleTimestamps ?? [];
  if (stamps.length > 1) {
    features.timestamp_regression_count = stamps.slice(1).filter((value, index) => value < stamps[index]).length;
    features.timestamp_duplicate_count = stamps.slice(1).filter((value, index) => value === stamps[index]).length;
  }
  features.declared_missing_tag_count = (envelope.missingTags ?? []).length;
  return { features, availability: { telemetry: AVAILABLE } };
}

/**
 * Per-channel vibration features.
 *
 * Two amplitude domains are reported and never mixed:
 *
 *   amplitude_ratio_to_baseline             velocity RMS (mm/s) against the declared
 *                                           velocity baseline. Operator-facing, and the
 *                                           right severity domain for imbalance,
 *                                           alignment and looseness, whose energy sits
 *                                           at the low shaft orders.
 *   acceleration_rms_ratio_to_baseline      broadband acceleration RMS (g) against the
 *                                           declared acceleration baseline. The right
 *                                           domain for rolling-element and gear-mesh
 *                                           damage, whose energy sits at high frequency
 *                                           where 1/f velocity integration suppresses it.
 *
 * Order-domain structure (1x/2x fractions, harmonic count, envelope kurtosis,
 * mesh order) requires a raw waveform. The app's gateway carries scalar
 * measurements only, so those features report WAVEFORM_REQUIRED and the
 * mechanical sub-type rules decline rather than guess.
 */
function vibrationFeatures(
  tag: 'V1' | 'V2',
  velocityScalar: number | null,
  accelerationRmsG: number | undefined,
  velocityBaseline: number | null,
  accelerationBaseline: number | null,
): { features: Record<string, number | string>; status: string } {
  const features: Record<string, number | string> = {
    scalar_unit: CANONICAL_UNITS[tag],
    scalar_domain: 'BAND_LIMITED_VELOCITY_RMS',
  };
  if (velocityScalar !== null && Number.isFinite(velocityScalar)) {
    features.amplitude = velocityScalar;
    if (velocityBaseline !== null && velocityBaseline !== 0) {
      features.amplitude_ratio_to_baseline = velocityScalar / velocityBaseline;
    }
  }
  if (accelerationRmsG !== undefined && Number.isFinite(accelerationRmsG)) {
    features.acceleration_rms_g = accelerationRmsG;
    features.waveform_unit = 'g';
    if (accelerationBaseline !== null && accelerationBaseline !== 0) {
      features.acceleration_rms_ratio_to_baseline = accelerationRmsG / accelerationBaseline;
    }
  }
  const measured = 'amplitude' in features || 'acceleration_rms_g' in features;
  if (!measured) return { features, status: NOT_AVAILABLE };
  // A scalar alone cannot separate a bearing defect from imbalance, misalignment,
  // looseness or gear mesh — those live in the order domain.
  return { features, status: WAVEFORM_REQUIRED };
}

/** Run the full measurement -> feature chain for one snapshot. */
export function extractFeatures(snapshot: ExtruderSnapshot, baseline: BaselineContext): FeatureSet {
  const { normalised } = snapshot;
  const availability: Record<string, string> = {};
  const scalar: Record<string, number> = {};

  const valueOf = (tag: ExtruderTag): number | null => {
    const value = normalised[tag];
    return value === undefined || value === null || !Number.isFinite(value) ? null : value;
  };

  // --- baseline-relative scalar features -----------------------------------
  const ratioTags: [ExtruderTag, string][] = [
    ['P1', 'pressure'],
    ['PM1.current', 'current'],
    ['E1', 'speed'],
  ];
  for (const [tag, key] of ratioTags) {
    const value = valueOf(tag);
    const reference = baselineOf(baseline, tag);
    if (value === null) {
      availability[`scalar.${key}`] = NOT_AVAILABLE;
    } else if (reference === null || reference === 0) {
      availability[`scalar.${key}`] = BASELINE_REQUIRED;
    } else {
      scalar[`${key}_ratio_to_baseline`] = value / reference;
      scalar[`${key}_residual`] = value - reference;
      availability[`scalar.${key}`] = AVAILABLE;
    }
  }

  const zoneResiduals: number[] = [];
  for (const tag of ['T1', 'T2', 'T3'] as const) {
    const value = valueOf(tag);
    const setpoint = baseline.zoneSetpointsC[tag];
    if (value === null || setpoint === undefined) {
      availability[`scalar.${tag}`] = NOT_AVAILABLE;
      continue;
    }
    const residual = value - setpoint;
    scalar[`${tag}.zone_setpoint_residual_c`] = residual;
    zoneResiduals.push(residual);
    availability[`scalar.${tag}`] = AVAILABLE;
  }
  if (zoneResiduals.length > 0) {
    scalar.zones_above_setpoint_count = zoneResiduals.filter((residual) => residual > 0).length;
    scalar.zones_below_setpoint_count = zoneResiduals.filter((residual) => residual < 0).length;
    scalar.zone_residual_max_c = Math.max(...zoneResiduals);
    scalar.zone_residual_min_c = Math.min(...zoneResiduals);
    scalar.zone_residual_spread_c = Math.max(...zoneResiduals) - Math.min(...zoneResiduals);
    scalar.measured_zone_count = zoneResiduals.length;
  }

  for (const tag of ['T4', 'T5'] as const) {
    const value = valueOf(tag);
    const reference = baselineOf(baseline, tag);
    if (value === null) availability[`scalar.${tag}`] = NOT_AVAILABLE;
    else if (reference === null) availability[`scalar.${tag}`] = BASELINE_REQUIRED;
    else {
      scalar[`${tag}.temperature_residual_c`] = value - reference;
      availability[`scalar.${tag}`] = AVAILABLE;
    }
  }

  const level = valueOf('L1');
  if (level === null) availability['scalar.L1'] = NOT_AVAILABLE;
  else {
    scalar.level_percent = level;
    availability['scalar.L1'] = AVAILABLE;
  }

  const motorRpm = valueOf('E1');
  if (motorRpm !== null) {
    scalar.motor_rpm = motorRpm;
    const screw = screwRpm(baseline, motorRpm);
    if (screw !== null) scalar.derived_screw_rpm = screw;
  }

  // --- vibration -----------------------------------------------------------
  const vibration = {} as FeatureSet['vibration'];
  for (const tag of ['V1', 'V2'] as const) {
    const { features, status } = vibrationFeatures(
      tag,
      valueOf(tag),
      snapshot.accelerationRmsG[tag],
      baselineOf(baseline, tag),
      baselineOf(baseline, `${tag}.acceleration_rms_g`),
    );
    vibration[tag] = features;
    availability[`vibration.${tag}`] = status;
  }

  // --- temporal and telemetry ----------------------------------------------
  const { features: temporal, availability: temporalAvailability } = temporalFeatures(snapshot.history);
  Object.assign(availability, temporalAvailability);

  // Instrumentation-fault features. A bias and a gain error look identical at a
  // single operating point, so both are computed and the rules keep them as an
  // ambiguous pair unless observations at two distinct process levels exist.
  const tags = new Set<ExtruderTag>([
    ...(Object.keys(normalised) as ExtruderTag[]),
    ...(Object.keys(snapshot.history) as ExtruderTag[]),
  ]);
  for (const tag of tags) {
    const reference = baselineOf(baseline, tag);
    const noiseReference = baselineOf(baseline, `${tag}.noise_std`);
    const detrended = temporal[`${tag}.detrended_std`];
    if (detrended !== undefined && noiseReference) {
      temporal[`${tag}.noise_ratio_to_baseline`] = detrended / noiseReference;
    }
    const window = (snapshot.history[tag] ?? []).filter((value): value is number => value !== null && Number.isFinite(value));
    if (window.length > 0 && reference) {
      const observedMean = window.reduce((sum, value) => sum + value, 0) / window.length;
      temporal[`${tag}.persistent_bias_ratio`] = Math.abs(observedMean - reference) / Math.abs(reference);
      const ratio = observedMean / reference;
      temporal[`${tag}.gain_error_ratio`] = ratio > 0 ? Math.max(ratio, 1 / ratio) : 0;
    }
    // A null counts as a dropout only when the tag was demonstrably reporting.
    // An unmapped point is "not measured", not "the sensor stopped", and must
    // never be reported as an instrumentation fault.
    const wasReporting = (snapshot.history[tag] ?? []).some((value) => value !== null);
    if (tag in normalised && normalised[tag] === null && wasReporting) {
      temporal[`${tag}.missing_sample_count`] = (temporal[`${tag}.missing_sample_count`] ?? 0) + 1;
    }
  }

  const { features: telemetry, availability: telemetryAvailability } = telemetryFeatures(snapshot.telemetry);
  Object.assign(availability, telemetryAvailability);

  return {
    normalised,
    conversions: snapshot.conversions,
    scalar,
    vibration,
    temporal,
    telemetry,
    availability,
  };
}
