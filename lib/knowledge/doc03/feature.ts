/**
 * The DOC-03 §36 standard feature object, and the §37/§38 rules that govern it.
 *
 * This is what DOC-04 receives: a value, what was expected, how far apart they
 * are, how much of the window the condition held, and — crucially — how much of
 * that is trustworthy.
 *
 * §2's QUALITY GATE is enforced structurally. `computeFeature` gates on input
 * quality *before* any arithmetic, so there is no path that produces a
 * deviation from BAD data. §38's propagation table is implemented in
 * `propagateQuality`: a feature is never stronger than its weakest mandatory
 * input, and a GOOD signal compared against a LOW-confidence baseline yields a
 * GOOD value with a low-confidence deviation — two different statements the
 * object keeps apart.
 */

import type { QualityVerdict } from '../doc02/types';
import { worstQuality } from '../doc02/types';
import {
  absoluteDeviation,
  percentDeviation,
  robustScore,
  slopePerMinute,
  zScore,
} from './formulas';
import type {
  BaselineConfidence,
  BaselineRecord,
  FeatureObject,
  SymbolicState,
  TrendDirection,
  VariabilityState,
} from './types';

export type FeatureInput = {
  featureId: string;
  timestamp: string;
  machineId: string;
  configurationVersion: string | null;
  state: string | null;
  stateConfidence: number | null;
  contextId: string | null;
  value: number | null;
  unit: string;
  /** Quality of every mandatory input this feature reads. */
  inputQualities: readonly QualityVerdict[];
  /** Recent values and their timestamps, for trend and variability. */
  window?: readonly number[];
  windowTimestampsMs?: readonly number[];
  /** Per-sample truth of the condition, for persistence. */
  conditionFlags?: readonly boolean[];
  baseline: BaselineRecord | null;
  baselineConfidence: BaselineConfidence;
  formulaIds: string[];
  lineage: string[];
};

/**
 * DOC-03 §38 — how a derived feature inherits its inputs' quality.
 *
 * A feature is never better than its weakest mandatory input. The baseline's
 * confidence is deliberately *not* folded in here: a reading can be perfectly
 * measured and compared against a poor baseline, and collapsing those into one
 * number would lose which of the two is the problem.
 */
export function propagateQuality(inputQualities: readonly QualityVerdict[]): QualityVerdict {
  if (inputQualities.length === 0) return 'MISSING';
  return worstQuality(inputQualities);
}

/** Trend from the window's slope, with a null slope reported as UNKNOWN. */
export function classifyTrend(slope: number | null, flatBand: number): TrendDirection {
  if (slope === null) return 'UNKNOWN';
  if (Math.abs(slope) <= flatBand) return 'FLAT';
  return slope > 0 ? 'RISING' : 'FALLING';
}

/**
 * Variability against what the baseline learned.
 *
 * Returns UNKNOWN rather than NORMAL when there is nothing to compare against.
 * NORMAL would be a claim; UNKNOWN is the absence of one.
 */
export function classifyVariability(
  windowStdDev: number | null,
  baselineStdDev: number | null,
  elevatedRatio = 2,
  suppressedRatio = 0.3,
): VariabilityState {
  if (windowStdDev === null || baselineStdDev === null || baselineStdDev === 0) return 'UNKNOWN';
  const ratio = windowStdDev / baselineStdDev;
  if (ratio >= elevatedRatio) return 'ELEVATED';
  if (ratio <= suppressedRatio) return 'SUPPRESSED';
  return 'NORMAL';
}

/**
 * The symbolic state DOC-04 reasons over (§35).
 *
 * Thresholds are arguments, not constants. DOC-03 defines that a symbolic state
 * exists and what it means; where the boundary sits is an analytics
 * configuration a site tunes, and hard-coding 2σ here would be the same mistake
 * as inventing a plant limit.
 */
export function classifySymbolicState(input: {
  zScore: number | null;
  robustScore: number | null;
  quality: QualityVerdict;
  hasBaseline: boolean;
  hasContext: boolean;
  deviationBand: number;
  anomalyBand: number;
}): SymbolicState {
  if (input.quality === 'BAD' || input.quality === 'MISSING') return 'INSUFFICIENT_DATA';
  if (!input.hasContext) return 'INSUFFICIENT_CONTEXT';
  if (!input.hasBaseline) return 'NOT_APPLICABLE';

  // Robust score preferred where available: it is not dragged by the spike that
  // a z score would fold into its own standard deviation.
  const score = input.robustScore ?? input.zScore;
  if (score === null) return 'NOT_APPLICABLE';

  const magnitude = Math.abs(score);
  if (magnitude >= input.anomalyBand) return score > 0 ? 'HIGH_ANOMALY' : 'LOW_ANOMALY';
  if (magnitude >= input.deviationBand) return score > 0 ? 'HIGH_DEVIATION' : 'LOW_DEVIATION';
  return 'NORMAL';
}

export type FeatureBands = {
  /** |score| at which a reading is a deviation. */
  deviationBand: number;
  /** |score| at which it is an anomaly. */
  anomalyBand: number;
  /** Slope magnitude below which a trend counts as flat, per minute. */
  flatBand: number;
};

/**
 * Build the §36 feature object.
 *
 * The quality gate runs first and short-circuits: a feature computed from BAD
 * or MISSING inputs returns with `symbolicState: INSUFFICIENT_DATA` and null
 * deviations rather than numbers nobody should read. That ordering is the §2
 * QUALITY GATE, and it is why the arithmetic below can assume its inputs.
 */
export function computeFeature(input: FeatureInput, bands: FeatureBands): FeatureObject {
  const quality = propagateQuality(input.inputQualities);

  const base: FeatureObject = {
    featureId: input.featureId,
    timestamp: input.timestamp,
    machineId: input.machineId,
    configurationVersion: input.configurationVersion,
    state: input.state,
    stateConfidence: input.stateConfidence,
    contextId: input.contextId,
    currentValue: input.value,
    unit: input.unit,
    expectedValue: null,
    baselineId: input.baseline?.baselineId ?? null,
    baselineVersion: input.baseline?.version ?? null,
    baselineLevel: input.baseline?.level ?? null,
    baselineConfidence: input.baselineConfidence,
    p05: input.baseline?.p05 ?? null,
    p50: input.baseline?.p50 ?? null,
    p95: input.baseline?.p95 ?? null,
    absoluteDeviation: null,
    percentDeviation: null,
    zScore: null,
    robustScore: null,
    rateOfChange: null,
    trend: 'UNKNOWN',
    variability: 'UNKNOWN',
    persistence: null,
    symbolicState: 'INSUFFICIENT_DATA',
    dataQuality: quality,
    formulaIds: input.formulaIds,
    lineage: input.lineage,
  };

  // §2 quality gate. No arithmetic on untrustworthy input.
  if (quality === 'BAD' || quality === 'MISSING' || input.value === null) {
    return base;
  }

  const value = input.value;
  const window = input.window ?? [];
  const timestamps = input.windowTimestampsMs ?? [];

  const slope = window.length >= 2 && timestamps.length === window.length ? slopePerMinute(window, timestamps) : null;
  const persistenceValue =
    input.conditionFlags && input.conditionFlags.length > 0
      ? input.conditionFlags.filter(Boolean).length / input.conditionFlags.length
      : null;

  const hasContext = input.contextId !== null;
  const baseline = input.baseline;
  const expected = baseline?.mean ?? baseline?.median ?? null;

  const z = expected !== null && baseline ? zScore(value, expected, baseline.stdDev) : null;
  const robust = baseline?.median != null ? robustScore(value, baseline.median, baseline.mad) : null;

  return {
    ...base,
    expectedValue: expected,
    absoluteDeviation: expected === null ? null : absoluteDeviation(value, expected),
    percentDeviation: expected === null ? null : percentDeviation(value, expected),
    zScore: z,
    robustScore: robust,
    rateOfChange: slope,
    trend: classifyTrend(slope, bands.flatBand),
    variability: 'UNKNOWN',
    persistence: persistenceValue,
    symbolicState: classifySymbolicState({
      zScore: z,
      robustScore: robust,
      quality,
      hasBaseline: baseline !== null && expected !== null,
      hasContext,
      deviationBand: bands.deviationBand,
      anomalyBand: bands.anomalyBand,
    }),
  };
}

/**
 * Whether a feature is safe for DOC-04 to diagnose from.
 *
 * A feature can be arithmetically fine and still not diagnosable — because its
 * context is unknown, or its baseline is a weak fallback. Returning the reason
 * keeps that distinction available to whatever presents the finding.
 */
export function featureIsDiagnosable(feature: FeatureObject): { ok: boolean; reason: string | null } {
  if (feature.dataQuality === 'BAD' || feature.dataQuality === 'MISSING') {
    return { ok: false, reason: `Input data is ${feature.dataQuality}; the instrumentation problem is the finding.` };
  }
  if (feature.symbolicState === 'INSUFFICIENT_CONTEXT') {
    return { ok: false, reason: 'No context is known, so there is no baseline this value can be compared against.' };
  }
  if (feature.baselineId === null) {
    return { ok: false, reason: 'No baseline applies to this feature yet.' };
  }
  if (feature.baselineConfidence === 'NONE') {
    return { ok: false, reason: `Baseline ${feature.baselineId} carries no confidence.` };
  }
  return { ok: true, reason: null };
}
