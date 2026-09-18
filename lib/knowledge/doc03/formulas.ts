/**
 * The DOC-03 formula library — §6 Part A (common) and §8 Part B (TSE-specific).
 *
 * Forty-nine formulas: twenty-six COMMON and twenty-three TSE_SPECIFIC, each
 * carrying the full §5 definition standard — id, name, category, logic, inputs,
 * output, purpose, applicable states, guardrail, example and version.
 *
 * The `guardrail` field is the one that earns its keep. Every formula here can
 * be computed on data it should not be computed on — a mean across two
 * different contexts, a ratio with a near-zero denominator, a rate of change
 * across a bad timestamp — and the guardrail is the document's statement of
 * when the arithmetic is valid but the answer is meaningless.
 *
 * `example` is transcribed but must never be used as a plant value. §5 is
 * explicit: "Example — Illustrative, never a universal plant value."
 */

import type { FormulaCategory, FormulaDefinition } from './types';

function formula(
  formulaId: string,
  name: string,
  category: FormulaCategory,
  logic: string,
  inputs: string,
  output: string,
  purpose: string,
  applicableStates: string,
  guardrail: string,
  example: string,
): FormulaDefinition {
  return {
    formulaId,
    name,
    category,
    logic,
    inputs,
    output,
    purpose,
    applicableStates,
    guardrail,
    example,
    version: '1.0',
  };
}

/** DOC-03 §6 and §8, all forty-nine formulas in document order. */
export const DOC03_FORMULAS: readonly FormulaDefinition[] = [
  formula(
    'F-COM-001',
    'Arithmetic Mean',
    'COMMON',
    'mean = sum(x_i) / N',
    'N valid samples in a defined window',
    'Same unit as input',
    'Average behaviour in a stable/contextual window',
    'Any state where a window summary is meaningful',
    'Do not average across different contexts or BAD/MISSING samples',
    'Values 10, 12, 14 -> mean = 12',
  ),
  formula(
    'F-COM-002',
    'Median / P50',
    'COMMON',
    'Median of ordered valid samples',
    'Window of valid samples',
    'Same unit as input',
    'Robust central value; less sensitive to spikes than mean',
    'Contextual windows',
    'Must use enough representative samples',
    '72, 74, 75, 76, 110 -> median = 75',
  ),
  formula(
    'F-COM-003',
    'Minimum / Maximum',
    'COMMON',
    'min(x), max(x)',
    'Window of valid samples',
    'Same unit as input',
    'Operating envelope and excursion summary',
    'All applicable states',
    'Extremes are sensitive to spikes; retain quality/spike flags',
    'Window min 72 bar, max 91 bar',
  ),
  formula(
    'F-COM-004',
    'Percentiles',
    'COMMON',
    'P05, P25, P50, P75, P95, P99 from ordered valid data',
    'Healthy contextual sample set',
    'Same unit as input',
    'Distribution-based baseline and robust operating bands',
    'Primarily steady/context-specific baseline',
    'Percentile method must be consistent/versioned across implementation',
    'Pressure P50=78 bar, P95=82 bar (example only)',
  ),
  formula(
    'F-COM-005',
    'Sample Standard Deviation',
    'COMMON',
    's = sqrt(sum((x_i - mean)^2)/(N-1))',
    'N >= 2 valid samples',
    'Same unit as input',
    'Quantify normal variability around mean',
    'Stable/contextual windows',
    'Sensitive to outliers; pair with quality/outlier review',
    'Mean 100, s 2.5 -> normal variability approximately 2.5 units',
  ),
  formula(
    'F-COM-006',
    'Variance',
    'COMMON',
    'variance = s^2',
    'Standard deviation or raw samples',
    'Input unit squared',
    'Internal statistical calculation',
    'Analytical windows',
    'Less intuitive for UI; mostly internal',
    's=3 -> variance=9',
  ),
  formula(
    'F-COM-007',
    'Range',
    'COMMON',
    'range = max(x) - min(x)',
    'Valid window',
    'Same unit as input',
    'Simple oscillation/instability measure',
    'Any window',
    'Uses only extremes; spike-sensitive',
    '207 - 197 = 10 degC',
  ),
  formula(
    'F-COM-008',
    'Coefficient of Variation',
    'COMMON',
    'CV = s / abs(mean) * 100',
    'Mean and standard deviation',
    '%',
    'Compare relative variability at different operating magnitudes',
    'Positive non-near-zero signals',
    'Do not use when mean is zero/near-zero',
    'mean=100, s=4 -> CV=4%',
  ),
  formula(
    'F-COM-009',
    'Median Absolute Deviation',
    'COMMON',
    'MAD = median(abs(x_i - median(x)))',
    'Valid sample window',
    'Same unit as input',
    'Robust measure of spread for noisy/outlier-prone data',
    'Contextual windows',
    'Use versioned implementation; not interchangeable with standard deviation',
    'Useful for robust anomaly scoring',
  ),
  formula(
    'F-COM-010',
    'Absolute Deviation',
    'COMMON',
    'D = Current - Expected',
    'Current X; expected/baseline B',
    'Same unit as X',
    'Preserve direction and engineering magnitude of deviation',
    'Whenever expected value exists',
    'Expected value must match current context',
    '92 bar - 80 bar = +12 bar',
  ),
  formula(
    'F-COM-011',
    'Percentage Deviation',
    'COMMON',
    'D_pct = (Current - Expected) / Expected * 100',
    'Current X; expected B',
    '%',
    'Normalize deviation across operating magnitudes',
    'Where expected value is meaningfully nonzero',
    'If expected is zero/near-zero, return NOT_APPLICABLE and use absolute/robust normalization',
    '92 vs 80 -> +15%',
  ),
  formula(
    'F-COM-012',
    'Setpoint Error',
    'COMMON',
    'Error = Actual - Setpoint',
    'Actual; setpoint',
    'Same unit',
    'Control-loop tracking and process deviation',
    'States where setpoint applies',
    'Setpoint change itself is context, not automatically a fault',
    '207 degC - 200 degC = +7 degC',
  ),
  formula(
    'F-COM-013',
    'Normalized Residual',
    'COMMON',
    'Residual_norm = (Actual - Expected) / Scale',
    'Actual, expected model, scale such as baseline s or robust scale',
    'Dimensionless',
    'Compare model residuals across operating ranges',
    'When expected-value model and valid scale exist',
    'Scale definition must be versioned; avoid divide by near-zero',
    'Actual 75, expected 63, scale 4 -> 3.0',
  ),
  formula(
    'F-COM-014',
    'Rate of Change',
    'COMMON',
    'ROC = (X_t2 - X_t1) / (t2 - t1)',
    'Two or more time-aligned valid samples',
    'unit/time',
    'Detect rapid deterioration or transition',
    'All relevant states',
    'Use true timestamps; reject duplicate/invalid time deltas',
    '95 to 100 bar in 1 min -> +5 bar/min',
  ),
  formula(
    'F-COM-015',
    'Simple Moving Average',
    'COMMON',
    'MA_N = sum(last N samples) / N',
    'Window of N valid samples',
    'Same unit',
    'Noise reduction / smoothed trend',
    'Configured per signal',
    'Window must be signal-specific; do not hide short dangerous excursions from hard-limit handling',
    'N=5 moving average',
  ),
  formula(
    'F-COM-016',
    'Rolling Standard Deviation',
    'COMMON',
    's_window over current rolling window',
    'Window of valid samples',
    'Same unit',
    'Detect increasing process variability',
    'Steady/ramp/warm-up depending feature',
    'Window and minimum N are parameter-specific',
    'Feed s rises from 1.5 to 8 kg/h',
  ),
  formula(
    'F-COM-017',
    'Linear Trend Slope',
    'COMMON',
    'Fit X = a + b*t; output b',
    'Time-aligned window',
    'unit/time',
    'Separate flat behaviour from sustained rise/fall',
    'When enough stable-window samples exist',
    'Do not over-interpret nonlinear/transient windows',
    'Gearbox temp slope +0.8 degC/min',
  ),
  formula(
    'F-COM-018',
    'Exponentially Weighted Moving Average',
    'COMMON',
    'EWMA_t = alpha*X_t + (1-alpha)*EWMA_(t-1)',
    'Current sample, previous EWMA, alpha',
    'Same unit',
    'Smooth while weighting recent values more strongly',
    'Optional common feature',
    'alpha must be configured/versioned; hard limits bypass smoothing',
    'alpha=0.2 example',
  ),
  formula(
    'F-COM-019',
    'Z-Score',
    'COMMON',
    'Z = (X - mean) / s',
    'Current X; contextual mean and s',
    'Dimensionless',
    'Express deviation in baseline standard-deviation units',
    'Stable distributions with valid s',
    'Z-score is evidence, not a fault; unreliable if s near zero or baseline poor',
    'X=86, mean=78, s=3 -> Z=2.67',
  ),
  formula(
    'F-COM-020',
    'Modified Z-Score',
    'COMMON',
    'M = 0.6745*(X - median)/MAD',
    'Current X; contextual median and MAD',
    'Dimensionless',
    'Robust distance when outliers distort mean/s',
    'Where MAD > 0',
    'Return NOT_APPLICABLE if MAD is zero/too small',
    'Use as optional robust alternative',
  ),
  formula(
    'F-COM-021',
    'Persistence',
    'COMMON',
    'Persistence_pct = N_abnormal / N_valid * 100',
    'Window labels + valid sample count',
    '%',
    'Separate transient spikes from sustained abnormality',
    'Anomaly/fault windows',
    'Minimum valid N and duration must be configured per feature/fault',
    '48 abnormal of 60 valid -> 80%',
  ),
  formula(
    'F-COM-022',
    'Pearson Correlation',
    'COMMON',
    'r = cov(X,Y)/(s_X*s_Y)',
    'Time-aligned X/Y windows',
    '-1 to +1',
    'Quantify linear co-movement as supporting evidence',
    'Stable comparable windows',
    'Correlation is not causation; require physical relationship from DOC-01',
    'Torque-current may be strongly positive in stable context',
  ),
  formula(
    'F-COM-023',
    'Expected-Value Residual',
    'COMMON',
    'Residual = Actual - Expected(context)',
    'Actual value; expected model output',
    'Same unit as target',
    'Core relationship-anomaly feature',
    'Where contextual expected model exists',
    'Expected model must match state/config/recipe',
    'Actual torque 75%, expected 63% -> +12 points',
  ),
  formula(
    'F-COM-024',
    'Missing Data Percentage',
    'COMMON',
    'Missing_pct = N_missing / N_expected * 100',
    'Expected and missing sample counts',
    '%',
    'Quantify data completeness',
    'Any acquisition window',
    'Expected count comes from acquisition metadata',
    '5 missing of 100 -> 5%',
  ),
  formula(
    'F-COM-025',
    'Stability State',
    'COMMON',
    'STABLE when configured variability + abs(ROC) + context-change conditions remain inside healthy limits for the required persistence window',
    'Current-window variability, ROC, context changes',
    'Enum: STABLE / UNSTABLE / UNKNOWN',
    'State transitions, baseline learning and fault logic',
    'State-specific',
    'Thresholds are contextual/machine-configured; no universal number',
    'RPM and feed both STABLE before steady baseline learning',
  ),
  formula(
    'F-COM-026',
    'Change State',
    'COMMON',
    'Compare current context/setpoint to previous validated context using configured change rules',
    'Recipe/RPM/feed/setpoints/mode',
    'UNCHANGED / CHANGED / TRANSITIONING / UNKNOWN',
    'Suppress false faults during intentional operating changes',
    'All states',
    'Do not infer unchanged if context input is missing',
    'Recipe changed -> CHANGED',
  ),
  formula(
    'F-TSE-001',
    'Specific Energy from Active Power',
    'TSE_SPECIFIC',
    'SE = Active_Power_kW / Throughput_kg_per_h',
    'Active power; throughput',
    'kWh/kg',
    'Energy input per unit production; compare like contexts',
    'Production states with throughput > 0',
    'If throughput <= configured minimum or BAD, return NOT_APPLICABLE/INSUFFICIENT_DATA',
    '120 kW / 600 kg/h = 0.20 kWh/kg',
  ),
  formula(
    'F-TSE-002',
    'Mechanical Shaft Power',
    'TSE_SPECIFIC',
    'P_kW = 2*pi*RPM*Torque_Nm / (60*1000)',
    'Screw/shaft RPM; torque in N*m',
    'kW',
    'Estimate mechanical power when true torque is available',
    'Production / test states',
    'Do not apply to torque % without rated torque definition; know whether torque is per shaft or total drive',
    '350 rpm and 1000 N*m -> about 36.65 kW',
  ),
  formula(
    'F-TSE-003',
    'Specific Mechanical Energy',
    'TSE_SPECIFIC',
    'SME = Mechanical_Power_kW / Throughput_kg_per_h',
    'Mechanical power; throughput',
    'kWh/kg',
    'Mechanical energy intensity of extrusion',
    'Production',
    'Drive efficiency and torque basis must be documented; not interchangeable with consumed electrical specific energy',
    'Mechanical 90 kW / 600 kg/h = 0.15 kWh/kg',
  ),
  formula(
    'F-TSE-004',
    'Torque per Throughput',
    'TSE_SPECIFIC',
    'TQ_norm = Torque / Throughput',
    'Torque; throughput',
    'N*m/(kg/h) or %/(kg/h)',
    'Simple contextual load indicator',
    'Steady production',
    'Supporting feature only; preserve torque basis and avoid near-zero throughput',
    'Compare same machine/context',
  ),
  formula(
    'F-TSE-005',
    'Current Load Percentage',
    'TSE_SPECIFIC',
    'I_load_pct = Motor_Current / Rated_Current * 100',
    'Motor current; rated current',
    '%',
    'Drive loading relative to nameplate',
    'Running states',
    'Rated current is MACHINE-SPECIFIC authority metadata; current is not a substitute for torque',
    '80 A / 100 A = 80%',
  ),
  formula(
    'F-TSE-006',
    'Power Load Percentage',
    'TSE_SPECIFIC',
    'P_load_pct = Active_Power / Rated_Power * 100',
    'Active power; rated power',
    '%',
    'Drive utilization',
    'Running states',
    'Use correct rated active power basis',
    '75 kW / 90 kW = 83.3%',
  ),
  formula(
    'F-TSE-007',
    'Differential Melt Pressure',
    'TSE_SPECIFIC',
    'dP = P_upstream - P_downstream',
    'Synchronized upstream/downstream melt pressures',
    'bar or canonical pressure unit',
    'Localize screen/filter/downstream restriction',
    'Production where both taps valid',
    'Pressure tap locations and units must be known; do not compute across unrelated locations',
    '105 - 78 = 27 bar',
  ),
  formula(
    'F-TSE-008',
    'Pressure per Feed',
    'TSE_SPECIFIC',
    'P_feed = Melt_Pressure / Feed_Rate',
    'Pressure; feed rate',
    'bar/(kg/h)',
    'Simple relationship feature for like contexts',
    'Steady production',
    'Pressure-feed relation can be nonlinear; supporting feature only',
    'Compare to contextual baseline, not universal limit',
  ),
  formula(
    'F-TSE-009',
    'Pressure per Throughput',
    'TSE_SPECIFIC',
    'P_Q = Melt_Pressure / Throughput',
    'Pressure; product throughput',
    'bar/(kg/h)',
    'Process resistance intensity',
    'Steady production',
    'Supporting feature only; guard low throughput',
    'Useful for trend comparison',
  ),
  formula(
    'F-TSE-010',
    'Expected Pressure Residual',
    'TSE_SPECIFIC',
    'P_resid = P_actual - P_expected(context)',
    'Actual pressure; expected model from recipe/RPM/feed/temp/config',
    'bar',
    'Relationship anomaly that adjusts for normal context',
    'Steady production / validated stable context',
    'Expected model version and confidence required',
    'Actual 92, expected 78 -> +14 bar',
  ),
  formula(
    'F-TSE-011',
    'Zone Temperature Error',
    'TSE_SPECIFIC',
    'E_Zn = T_actual_Zn - T_SP_Zn',
    'Actual and setpoint for each of Z1-Z7',
    'degC',
    'Zone control tracking',
    'Warm-up, ready, production',
    'Do not compare zone values without setpoint/context',
    'Z4 207 - 200 = +7 degC',
  ),
  formula(
    'F-TSE-012',
    'Zone-to-Zone Temperature Gradient',
    'TSE_SPECIFIC',
    'Grad_n = T_(n+1) - T_n',
    'Adjacent actual temperatures',
    'degC',
    'Spatial thermal profile',
    'Warm-up/production',
    'Interpret against the commanded recipe profile',
    'T4 205 - T3 190 = +15 degC',
  ),
  formula(
    'F-TSE-013',
    'Thermal Profile Error Vector',
    'TSE_SPECIFIC',
    'Profile_Error = [T1-SP1, ..., T7-SP7]',
    'Z1-Z7 actual + setpoints',
    '7-element vector',
    'Detect localized or distributed profile abnormality',
    'Warm-up/ready/production',
    'Use vector magnitude/pattern only with documented method/version',
    '[0,+1,+1,+11,+1,0,0] highlights Z4',
  ),
  formula(
    'F-TSE-014',
    'Melt-vs-Barrel Temperature Difference',
    'TSE_SPECIFIC',
    'dT_melt_zone = T_melt - selected_reference_barrel_temp',
    'Melt temperature; configured reference zone/profile',
    'degC',
    'Separate material thermal state from barrel temperature',
    'Production',
    'Reference zone/profile must be explicit; not universal',
    'Use as contextual feature',
  ),
  formula(
    'F-TSE-015',
    'Cooling Delta-T',
    'TSE_SPECIFIC',
    'dT_cooling = T_return - T_supply',
    'Cooling supply/return temperatures',
    'degC',
    'Supporting cooling performance evidence',
    'When cooling flow path active',
    'Interpret with flow; temperature difference alone cannot prove heat duty',
    'Return 32 - supply 25 = 7 degC',
  ),
  formula(
    'F-TSE-016',
    'Feed Command Error',
    'TSE_SPECIFIC',
    'Feed_Error = Feed_Actual - Feed_Setpoint',
    'Actual and setpoint feed',
    'kg/h',
    'Feeder control/mismatch',
    'Feed-active states',
    'Account for refill/transient status',
    '450 - 460 = -10 kg/h',
  ),
  formula(
    'F-TSE-017',
    'Feed Stability State',
    'TSE_SPECIFIC',
    'Combine feed rolling s/CV, ROC, range and persistence against contextual healthy limits',
    'Feed time series + baseline stats',
    'STABLE / UNSTABLE / SURGING / UNKNOWN',
    'Feeding anomaly and steady-state qualification',
    'Ramp/steady',
    'Thresholds from healthy context, not universal',
    'Stable mean can still hide surging',
  ),
  formula(
    'F-TSE-018',
    'Pressure Stability State',
    'TSE_SPECIFIC',
    'Combine pressure variability, ROC, range, trend and residual',
    'Pressure time series + baseline/model',
    'STABLE / OSCILLATING / RISING / FALLING / UNKNOWN',
    'Pressure-process behaviour',
    'Production',
    'Classify only with GOOD synchronized data',
    'Used by DOC-04 fault signatures',
  ),
  formula(
    'F-TSE-019',
    'Torque Stability State',
    'TSE_SPECIFIC',
    'Combine torque variability, ROC, residual and persistence',
    'Torque time series + baseline/model',
    'STABLE / UNSTABLE / SPIKING / UNKNOWN',
    'Load-process behaviour',
    'Running/production',
    'VFD torque estimate quality must be known',
    'Used with feed/pressure relationships',
  ),
  formula(
    'F-TSE-020',
    'Expected Torque Model',
    'TSE_SPECIFIC',
    'Torque_expected = f(recipe, feed, RPM, melt_temp, screw_config, optional side_feed)',
    'Context + healthy historical data',
    '% or N*m',
    'Model normal process load instead of using one fixed threshold',
    'Steady production',
    'Start with bins/lookup surfaces; regression/ML only after validated data. Store model confidence/version.',
    'Actual torque - expected torque becomes residual',
  ),
  formula(
    'F-TSE-021',
    'Expected Pressure Model',
    'TSE_SPECIFIC',
    'Pressure_expected = f(recipe, feed, RPM, melt_temp, screw_config, die/screen_config)',
    'Context + healthy historical data',
    'bar',
    'Context-aware pressure expectation',
    'Steady production',
    'Model must change/version with downstream configuration',
    'Supports restriction detection',
  ),
  formula(
    'F-TSE-022',
    'Expected Specific Energy Model',
    'TSE_SPECIFIC',
    'SE_expected = f(recipe, feed, RPM, screw_config, product)',
    'Context + healthy history',
    'kWh/kg',
    'Detect energy-intensity drift',
    'Steady production',
    'Compare like contexts; power meter/VFD basis must remain consistent',
    'SE residual used in DOC-04',
  ),
  formula(
    'F-TSE-023',
    'Current-Torque Consistency Residual',
    'TSE_SPECIFIC',
    'I_resid = I_actual - I_expected(torque, RPM, drive_config)',
    'Motor current; torque; RPM; drive config',
    'A',
    'Detect drive/measurement inconsistency vs process load',
    'Running stable states',
    'Expected relationship is machine/drive-specific; not a universal equation',
    'Torque high with normal current may indicate contradictory evidence',
  ),
];

const BY_ID = new Map(DOC03_FORMULAS.map((entry) => [entry.formulaId, entry]));

export function formulaById(formulaId: string): FormulaDefinition | undefined {
  return BY_ID.get(formulaId);
}

export function formulasByCategory(category: FormulaCategory): FormulaDefinition[] {
  return DOC03_FORMULAS.filter((entry) => entry.category === category);
}

/** Every formula carries a guardrail; this is the audit that none was dropped. */
export function formulasWithoutGuardrail(): FormulaDefinition[] {
  return DOC03_FORMULAS.filter((entry) => !entry.guardrail || entry.guardrail.trim().length === 0);
}

/* A runnable core ------------------------------------------------------------------ */

/**
 * The common statistics, implemented.
 *
 * Only the formulas whose logic is fully determined by the document are
 * implemented here. The rest stay as definitions: several TSE features depend
 * on a site-declared reference — a clean-screen differential, a commissioned
 * throughput — and computing them without one would be inventing the number
 * DOC-03 §4 says ULTRON may not invent.
 *
 * Every function takes already-validated samples. Gating on quality is the
 * caller's job and is done once, in `computeFeature`, rather than repeated in
 * each statistic.
 */

/** F-COM-001 — arithmetic mean. */
export function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** F-COM-002 — median. */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

/** Percentile by linear interpolation, the basis of P05 / P50 / P95. */
export function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];
  const rank = (p / 100) * (sorted.length - 1);
  const low = Math.floor(rank);
  const high = Math.ceil(rank);
  if (low === high) return sorted[low];
  return sorted[low] + (sorted[high] - sorted[low]) * (rank - low);
}

/** Sample standard deviation. Null below two samples, where spread is undefined. */
export function stdDev(values: readonly number[]): number | null {
  if (values.length < 2) return null;
  const m = mean(values) as number;
  const variance = values.reduce((sum, value) => sum + (value - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/** Interquartile range — robust spread, unaffected by a single spike. */
export function iqr(values: readonly number[]): number | null {
  const q1 = percentile(values, 25);
  const q3 = percentile(values, 75);
  if (q1 === null || q3 === null) return null;
  return q3 - q1;
}

/** Median absolute deviation, the robust counterpart to standard deviation. */
export function mad(values: readonly number[]): number | null {
  const med = median(values);
  if (med === null) return null;
  return median(values.map((value) => Math.abs(value - med)));
}

/**
 * Z score.
 *
 * Returns null rather than Infinity when the spread is zero. A baseline with no
 * spread cannot say how unusual anything is, and Infinity would propagate into
 * a symbolic state as a confident extreme.
 */
export function zScore(value: number, baselineMean: number, baselineStdDev: number | null): number | null {
  if (baselineStdDev === null || baselineStdDev === 0) return null;
  return (value - baselineMean) / baselineStdDev;
}

/** Robust z, using MAD scaled to be comparable with a standard deviation. */
export function robustScore(value: number, baselineMedian: number, baselineMad: number | null): number | null {
  if (baselineMad === null || baselineMad === 0) return null;
  return (value - baselineMedian) / (1.4826 * baselineMad);
}

/** Absolute deviation from expected. */
export function absoluteDeviation(value: number, expected: number): number {
  return value - expected;
}

/**
 * Percent deviation from expected.
 *
 * Null when expected is zero or near it. §37 requires NOT_APPLICABLE rather than
 * a silent division, and a percentage of zero is exactly the case that produces
 * an enormous meaningless number.
 */
export function percentDeviation(value: number, expected: number, epsilon = 1e-9): number | null {
  if (Math.abs(expected) < epsilon) return null;
  return ((value - expected) / expected) * 100;
}

/**
 * Rate of change per minute.
 *
 * Returns null when the time delta is zero, negative or not finite. §37:
 * "Timestamp invalid for ROC — ROC invalid; do not fabricate time delta."
 */
export function rateOfChangePerMinute(
  first: number,
  last: number,
  firstMs: number,
  lastMs: number,
): number | null {
  const deltaMs = lastMs - firstMs;
  if (!Number.isFinite(deltaMs) || deltaMs <= 0) return null;
  return (last - first) / (deltaMs / 60_000);
}

/**
 * Persistence — the fraction of a window in which a condition held.
 *
 * Kept separate from the condition itself so a rule can ask "how much of the
 * last ten minutes was this true" without the statistic knowing what the
 * condition was.
 */
export function persistence(flags: readonly boolean[]): number | null {
  if (flags.length === 0) return null;
  return flags.filter(Boolean).length / flags.length;
}

/** Linear-regression slope per minute, for trend where a window is available. */
export function slopePerMinute(values: readonly number[], timestampsMs: readonly number[]): number | null {
  if (values.length < 2 || values.length !== timestampsMs.length) return null;
  const minutes = timestampsMs.map((ms) => (ms - timestampsMs[0]) / 60_000);
  const meanX = mean(minutes) as number;
  const meanY = mean(values) as number;
  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < values.length; i += 1) {
    numerator += (minutes[i] - meanX) * (values[i] - meanY);
    denominator += (minutes[i] - meanX) ** 2;
  }
  if (denominator === 0) return null;
  return numerator / denominator;
}
