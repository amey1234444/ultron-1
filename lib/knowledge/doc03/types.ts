/**
 * BLACKGATE DOC-03 types — formulas, baselines and features.
 *
 * DOC-03 answers the third question: "What is normal, mathematically?" It takes
 * DOC-02's validated data, state and context, computes features from them,
 * compares each against the right baseline, and hands DOC-04 a feature object
 * that says how far from expected a reading is and how much to trust that
 * statement.
 *
 * Two rules from the document shape everything here.
 *
 * §2 QUALITY GATE — "DOC-03 must never turn BAD/MISSING inputs into apparently
 * valid features. Every derived feature inherits or calculates an output quality
 * and preserves source lineage." So a feature carries its own quality, derived
 * from its inputs, and there is no path that produces a number without one.
 *
 * §4 AUTHORITY RULE — "A learned baseline or anomaly score must never silently
 * replace an approved Alert, Danger or Trip value." The learned and the approved
 * are separate types here, as they are in the DOC-01 layer, for the same reason.
 */

import type { QualityVerdict } from '../doc02/types';

export type FormulaCategory = 'COMMON' | 'TSE_SPECIFIC' | 'MACHINE_SPECIFIC';

/** One row of the §6 / §8 formula library, in the §5 definition standard. */
export type FormulaDefinition = {
  formulaId: string;
  name: string;
  category: FormulaCategory;
  /** The deterministic calculation, as the document states it. */
  logic: string;
  inputs: string;
  output: string;
  purpose: string;
  applicableStates: string;
  /** Invalid or unsafe use. The reason the formula can be wrong. */
  guardrail: string;
  /** Illustrative only — §5 is explicit that an example is never a plant value. */
  example: string;
  version: string;
};

/* 26 — Baseline lifecycle --------------------------------------------------------- */

export type BaselineStatus =
  | 'NOT_AVAILABLE'
  | 'LEARNING'
  | 'PROVISIONAL'
  | 'VALID'
  | 'FROZEN'
  | 'REVIEW_REQUIRED'
  | 'SUPERSEDED'
  | 'RETIRED';

export const BASELINE_STATUS_USE: Record<BaselineStatus, string> = {
  NOT_AVAILABLE: 'No suitable reference exists. Use an approved fallback and report low confidence.',
  LEARNING: 'Collecting eligible data. Not to be treated as a mature baseline.',
  PROVISIONAL: 'Enough data for limited use but not fully validated. Analytics allowed at reduced confidence.',
  VALID: 'Approved, mature contextual baseline. Normal use.',
  FROZEN: 'No learning updates permitted. Use the current baseline for comparison if still applicable.',
  REVIEW_REQUIRED: 'Drift or a configuration change demands review. Use according to policy, with a warning.',
  SUPERSEDED: 'Replaced by a newer version but preserved. Historical replay only.',
  RETIRED: 'No longer active or applicable. Historical only.',
};

/** Whether analytics may compare against a baseline in this status. */
export function baselineIsUsable(status: BaselineStatus): boolean {
  return status === 'VALID' || status === 'PROVISIONAL' || status === 'FROZEN' || status === 'REVIEW_REQUIRED';
}

/* 12 — Fallback hierarchy --------------------------------------------------------- */

/**
 * Which level of baseline a comparison actually used (§12).
 *
 * The document attaches FALLBACK TRACEABILITY to this: "A result using a weak
 * fallback must not look identical to one using a high-confidence exact-context
 * baseline." So the level travels on every feature, and confidence is derived
 * from it rather than asserted separately.
 */
export type BaselineLevel =
  | 'EXACT_CONTEXT'
  | 'CONTEXT_BAND'
  | 'BROADER_CONTEXT'
  | 'TEMPLATE_REFERENCE'
  | 'CUSTOMER_OEM_REFERENCE';

export const BASELINE_LEVEL_ORDER: readonly BaselineLevel[] = [
  'EXACT_CONTEXT',
  'CONTEXT_BAND',
  'BROADER_CONTEXT',
  'TEMPLATE_REFERENCE',
  'CUSTOMER_OEM_REFERENCE',
] as const;

export const BASELINE_LEVEL_MEANING: Record<BaselineLevel, { whenUsed: string; confidence: string }> = {
  EXACT_CONTEXT: { whenUsed: 'Enough healthy history exists for this exact validated context.', confidence: 'Highest' },
  CONTEXT_BAND: { whenUsed: 'Exact match is sparse but a comparable context band is available.', confidence: 'High / medium' },
  BROADER_CONTEXT: { whenUsed: 'Limited history; a broader recipe or configuration context is used.', confidence: 'Medium' },
  TEMPLATE_REFERENCE: { whenUsed: 'Commissioning or cold start, from the machine template or variant.', confidence: 'Low / medium' },
  CUSTOMER_OEM_REFERENCE: { whenUsed: 'No healthy history yet; a customer or OEM reference is used.', confidence: 'Declared by the source' },
};

export type BaselineSource =
  | 'CUSTOMER'
  | 'OEM_ENGINEERING'
  | 'COMMISSIONING'
  | 'LEARNED_HISTORICAL'
  | 'FLEET_VARIANT_REFERENCE';

/* 16 — What a baseline stores ------------------------------------------------------ */

export type BaselineRecord = {
  baselineId: string;
  version: string;
  status: BaselineStatus;
  level: BaselineLevel;
  source: BaselineSource;
  /** The context this baseline is valid for. */
  contextId: string | null;
  /** The configuration version it was learned under. */
  configurationVersion: string | null;
  featureId: string;
  unit: string;
  /** Central tendency and spread. Null until enough eligible data exists. */
  mean: number | null;
  median: number | null;
  stdDev: number | null;
  p05: number | null;
  p50: number | null;
  p95: number | null;
  /** Robust spread, preferred over stdDev where the distribution is skewed. */
  iqr: number | null;
  mad: number | null;
  sampleCount: number;
  learnedFrom: string | null;
  learnedTo: string | null;
  confidence: BaselineConfidence;
};

export type BaselineConfidence = 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';

/* 35 — Symbolic feature states ----------------------------------------------------- */

/**
 * What DOC-04 receives instead of a raw number (§35).
 *
 * Symbolic rather than numeric because DOC-04 reasons about patterns across
 * features, and "HIGH_ANOMALY on pressure with NORMAL on feed" is a diagnosable
 * shape in a way that two floats are not.
 */
export type SymbolicState =
  | 'NORMAL'
  | 'LOW_DEVIATION'
  | 'HIGH_DEVIATION'
  | 'LOW_ANOMALY'
  | 'HIGH_ANOMALY'
  | 'RISING'
  | 'FALLING'
  | 'UNSTABLE'
  | 'INSUFFICIENT_DATA'
  | 'INSUFFICIENT_CONTEXT'
  | 'NOT_APPLICABLE';

export type TrendDirection = 'RISING' | 'FALLING' | 'FLAT' | 'UNKNOWN';
export type VariabilityState = 'NORMAL' | 'ELEVATED' | 'SUPPRESSED' | 'UNKNOWN';

/* 36 — The standard feature object -------------------------------------------------- */

/** Every field DOC-03 §36 requires on a feature handed to DOC-04. */
export type FeatureObject = {
  featureId: string;
  timestamp: string;
  machineId: string;
  configurationVersion: string | null;
  state: string | null;
  stateConfidence: number | null;
  contextId: string | null;
  /** The measured or computed value. */
  currentValue: number | null;
  unit: string;
  /** What the baseline says to expect. Null when no baseline applies. */
  expectedValue: number | null;
  baselineId: string | null;
  baselineVersion: string | null;
  baselineLevel: BaselineLevel | null;
  baselineConfidence: BaselineConfidence;
  p05: number | null;
  p50: number | null;
  p95: number | null;
  absoluteDeviation: number | null;
  percentDeviation: number | null;
  zScore: number | null;
  robustScore: number | null;
  rateOfChange: number | null;
  trend: TrendDirection;
  variability: VariabilityState;
  /** Fraction of the window the condition held, 0..1. */
  persistence: number | null;
  symbolicState: SymbolicState;
  dataQuality: QualityVerdict;
  /** Formula and model ids that produced this feature. */
  formulaIds: string[];
  /** Source tags, mapping and versions this traces back to. */
  lineage: string[];
};

/* 37 — Missing and invalid input behaviour ------------------------------------------ */

export type FeatureFailure =
  | 'NOT_APPLICABLE'
  | 'INSUFFICIENT_DATA'
  | 'INSUFFICIENT_CONTEXT'
  | 'BAD_INPUT';

export const FEATURE_FAILURE_RULE: Record<string, string> = {
  DENOMINATOR_ZERO: 'NOT_APPLICABLE or an alternate formula. Never divide silently.',
  MANDATORY_INPUT_MISSING: 'INSUFFICIENT_DATA.',
  MANDATORY_INPUT_BAD: 'BAD or INSUFFICIENT_DATA according to the feature policy.',
  OPTIONAL_INPUT_MISSING: 'Calculate only if a degraded mode is defined, and lower the output quality.',
  CONTEXT_UNKNOWN: 'Use an approved fallback only and reduce confidence; otherwise INSUFFICIENT_CONTEXT.',
  BASELINE_NOT_AVAILABLE: 'Use the approved fallback hierarchy and disclose the level and confidence.',
  TIMESTAMP_INVALID_FOR_ROC: 'Rate of change is invalid. Never fabricate a time delta.',
};
