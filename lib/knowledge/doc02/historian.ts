/**
 * The DOC-02 §33 historian schema, and §34 missing-data behaviour.
 *
 * §33 carries the rule this module is built around: "ML training should not
 * retain only final fault labels. Store the raw/validated data and the
 * state/context/configuration that made those labels meaningful." A label
 * without the context that produced it cannot be retrained against, cannot be
 * audited, and cannot be explained to the engineer who has to act on it.
 *
 * The layers are declared as data rather than as a table definition because the
 * storage engine is not DOC-02's decision. What DOC-02 fixes is *what must be
 * retained together*, and that is what `HISTORIAN_LAYERS` states and
 * `describeRetentionGap` checks.
 */

import type { QualityVerdict } from './types';

export type HistorianLayer = {
  layer: string;
  fields: string[];
  /** Why losing this layer breaks something later. */
  whyRetained: string;
  /** The document that fills this layer in. */
  filledBy: 'DOC-02' | 'DOC-03' | 'DOC-04' | 'DOC-05' | 'FEEDBACK';
};

export const HISTORIAN_LAYERS: readonly HistorianLayer[] = [
  {
    layer: 'Identity',
    fields: ['Timestamp', 'Plant / machine ID', 'Template / variant', 'Configuration version'],
    whyRetained: 'Without it, two machines or two configurations blur into one history.',
    filledBy: 'DOC-02',
  },
  {
    layer: 'Raw / validated signals',
    fields: ['Canonical values', 'Units', 'Source', 'Quality', 'Original source reference'],
    whyRetained: 'A validated value with no raw counterpart cannot be re-derived when a scaling error is found later.',
    filledBy: 'DOC-02',
  },
  {
    layer: 'Operating context',
    fields: ['State', 'State confidence', 'Recipe / material', 'RPM / feed context', 'Product / batch', 'Mode'],
    whyRetained: 'The context is what made a reading normal or abnormal; without it a label cannot be reproduced.',
    filledBy: 'DOC-02',
  },
  {
    layer: 'Configuration',
    fields: ['Customer / OEM limits', 'Instrument range and version', 'Active authority records'],
    whyRetained: 'A limit breach is only meaningful against the limit that was actually in force at the time.',
    filledBy: 'DOC-02',
  },
  {
    layer: 'Features',
    fields: ['Formula / feature values', 'Baseline ID', 'Baseline confidence', 'Deviations', 'Trends'],
    whyRetained: 'Lets a feature be recomputed and compared against what was actually used.',
    filledBy: 'DOC-03',
  },
  {
    layer: 'Diagnosis',
    fields: ['Anomaly / fault labels', 'Evidence', 'Location', 'Root-cause candidates'],
    whyRetained: 'The labels themselves, which are useless without the layers above.',
    filledBy: 'DOC-04',
  },
  {
    layer: 'Decision',
    fields: ['Severity', 'Confidence', 'Impact', 'Priority', 'Actions'],
    whyRetained: 'What was recommended, so the recommendation can be judged against the outcome.',
    filledBy: 'DOC-05',
  },
  {
    layer: 'Feedback',
    fields: ['Engineer confirmation', 'Maintenance finding', 'Post-maintenance outcome'],
    whyRetained: 'The ground truth. Without it the model never learns whether it was right.',
    filledBy: 'FEEDBACK',
  },
] as const;

/** One stored observation, in the shape §33 requires DOC-02 to supply. */
export type HistorianRecord = {
  timestamp: string;
  machineId: string;
  variantId: string | null;
  configurationVersion: string | null;
  canonicalTag: string;
  value: number | null;
  unit: string;
  quality: QualityVerdict;
  sourceReference: string | null;
  operatingState: string | null;
  stateConfidence: number | null;
  contextId: string | null;
  recipeId: string | null;
  /** The limit records in force at this moment, by fact id. */
  activeAuthorityRecords: string[];
};

/** Layers of §33 that a record set does not yet populate. */
export function describeRetentionGap(record: Partial<HistorianRecord>): string[] {
  const gaps: string[] = [];
  if (!record.configurationVersion) {
    gaps.push('Configuration version is absent, so this observation cannot be tied to the machine geometry that produced it.');
  }
  if (!record.contextId) {
    gaps.push('Context id is absent, so no baseline can be reproduced for this observation.');
  }
  if (!record.operatingState) {
    gaps.push('Operating state is absent, so a startup transient is indistinguishable from steady production.');
  }
  if (record.quality === undefined) {
    gaps.push('Quality is absent, so a bad reading is indistinguishable from a good one.');
  }
  if (!record.sourceReference) {
    gaps.push('Source reference is absent, so the value cannot be traced back to the tag it came from.');
  }
  return gaps;
}

/* 34 — Missing data behaviour ----------------------------------------------------- */

export type MissingDataSituation =
  | 'MANDATORY_STATE_SIGNAL_MISSING'
  | 'MANDATORY_FORMULA_INPUT_MISSING'
  | 'MANDATORY_FAULT_EVIDENCE_MISSING'
  | 'SUPPORTING_SIGNAL_MISSING'
  | 'SIGNAL_TIMED_OUT'
  | 'SIGNAL_BAD'
  | 'CONTEXT_MISSING'
  | 'CUSTOMER_LIMIT_MISSING';

/**
 * DOC-02 §34, the required behaviour for each way data can be absent.
 *
 * Worth having as data rather than as prose, because every row is a rule
 * against a specific plausible shortcut — substituting zero for a timed-out
 * signal, or inventing a plant Alert because none was supplied.
 */
export const MISSING_DATA_BEHAVIOUR: Record<MissingDataSituation, string> = {
  MANDATORY_STATE_SIGNAL_MISSING:
    'Reduce state confidence or return UNKNOWN. Never infer STEADY_PRODUCTION blindly.',
  MANDATORY_FORMULA_INPUT_MISSING: 'DOC-03 returns INSUFFICIENT_DATA or NOT_APPLICABLE as appropriate.',
  MANDATORY_FAULT_EVIDENCE_MISSING:
    'DOC-04 returns INSUFFICIENT_EVIDENCE, or a degraded mode only where one is explicitly defined.',
  SUPPORTING_SIGNAL_MISSING: 'Continue if allowed; lower evidence and confidence, and list the missing input.',
  SIGNAL_TIMED_OUT: 'Report MISSING. Never silently substitute zero.',
  SIGNAL_BAD: 'Do not use as GOOD evidence. The instrumentation or data event must be visible.',
  CONTEXT_MISSING: 'Use an approved fallback hierarchy only, and carry the context uncertainty forward.',
  CUSTOMER_LIMIT_MISSING:
    'Do not invent a plant Alert or Danger. ULTRON anomaly analytics may still operate if a baseline exists.',
};
