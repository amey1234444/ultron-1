/**
 * The DOC-03 baseline engine — §12 fallback, §14 eligibility, §26 lifecycle,
 * §27 freeze rules, §29 confidence.
 *
 * A baseline is what "normal" means for one feature in one context, and almost
 * everything that goes wrong with condition monitoring goes wrong here: a
 * baseline learned during a fault teaches the fault as normal, one learned
 * across a recipe change averages two different machines, and one learned from
 * BAD data is arithmetic on noise.
 *
 * So §14's eligibility gate is implemented as a gate — eight conditions, all of
 * which must hold before a sample may be learned from, each recorded by name
 * when it fails. The document asks for exactly that: "Each sample/window should
 * carry an explicit Eligible_For_Baseline flag. Learning must be deterministic
 * and auditable."
 *
 * And §12's FALLBACK TRACEABILITY is enforced by making the level part of the
 * record rather than a comment: "A result using a weak fallback must not look
 * identical to one using a high-confidence exact-context baseline."
 */

import type { QualityVerdict } from '../doc02/types';
import type {
  BaselineConfidence,
  BaselineLevel,
  BaselineRecord,
  BaselineStatus,
} from './types';
import { BASELINE_LEVEL_ORDER, baselineIsUsable } from './types';

/* 14 — The eligibility gate --------------------------------------------------------- */

/** What the gate is told about one candidate sample or window. */
export type EligibilityInput = {
  dataQuality: QualityVerdict;
  operatingState: string | null;
  /** States in which this feature's baseline may be learned. */
  approvedStates: readonly string[];
  contextKnown: boolean;
  contextStable: boolean;
  activeAlertOrDanger: boolean;
  activeTrip: boolean;
  activeFaultOrStrongAnomaly: boolean;
  inMaintenanceOrTransition: boolean;
  configurationValid: boolean;
  /** Set when an instrument is known to be uncalibrated or faulty. */
  sensorIssue: boolean;
};

export type EligibilityResult = {
  eligible: boolean;
  /** Every condition that failed, worded as the document words it. */
  exclusions: string[];
};

/**
 * DOC-03 §14, as a gate.
 *
 * Every failing condition is collected rather than short-circuiting on the
 * first, because a commissioning engineer asking "why is nothing being learned"
 * needs the whole list, not the first item on it.
 */
export function evaluateEligibility(input: EligibilityInput): EligibilityResult {
  const exclusions: string[] = [];

  if (input.dataQuality !== 'GOOD') {
    exclusions.push(`Data quality is ${input.dataQuality}, which would corrupt the normal distribution.`);
  }
  if (input.operatingState === null) {
    exclusions.push('Operating state is unknown, so the sample cannot be safely assigned to a baseline.');
  } else if (!input.approvedStates.includes(input.operatingState)) {
    exclusions.push(
      `Operating state ${input.operatingState} is not approved for this baseline; transient physics differ from the state it describes.`,
    );
  }
  if (!input.contextKnown) {
    exclusions.push('Context is unrecognised, so the sample cannot be safely assigned.');
  } else if (!input.contextStable) {
    exclusions.push('Context is not stable, so the window spans more than one operating point.');
  }
  if (input.activeAlertOrDanger) {
    exclusions.push('A customer Alert or Danger condition is active, which is an abnormal condition by definition.');
  }
  if (input.activeTrip) {
    exclusions.push('A trip or protection condition is active.');
  }
  if (input.activeFaultOrStrongAnomaly) {
    exclusions.push('An active fault or strong anomaly would be normalised into the baseline.');
  }
  if (input.inMaintenanceOrTransition) {
    exclusions.push('Maintenance, manual intervention or a recipe transition is in progress, which is not normal production.');
  }
  if (input.sensorIssue) {
    exclusions.push('A sensor calibration or known instrument issue means the measurement is not comparable.');
  }
  if (!input.configurationValid) {
    exclusions.push('The configuration changed and no new baseline has been established; the physical relationship differs.');
  }

  return { eligible: exclusions.length === 0, exclusions };
}

/* 27 — Freeze rules ------------------------------------------------------------------ */

export const FREEZE_TRIGGERS: readonly { trigger: string; reason: string }[] = [
  { trigger: 'Strong anomaly or fault', reason: 'Do not teach a fault as normal.' },
  { trigger: 'Customer Alert, Danger or Trip', reason: 'An approved abnormal or protection state.' },
  { trigger: 'Startup, shutdown or recipe transition for a steady baseline', reason: 'Wrong state or context.' },
  { trigger: 'BAD or MISSING critical signal', reason: 'Untrustworthy evidence.' },
  { trigger: 'Maintenance or manual intervention', reason: 'Non-production condition.' },
  { trigger: 'Sensor replacement or re-range', reason: 'The measurement relationship changed.' },
  { trigger: 'Screw, die or screen configuration change', reason: 'The physical process relationship changed.' },
  { trigger: 'Unrecognised or unknown context', reason: 'The sample cannot be safely assigned.' },
] as const;

/**
 * Whether learning must be frozen, and why.
 *
 * Shares its inputs with the eligibility gate because they answer the same
 * question at two scopes: eligibility rejects one sample, a freeze suspends the
 * baseline. Both are derived from the same conditions so the two can never
 * disagree.
 */
export function freezeReason(input: EligibilityInput): string | null {
  const result = evaluateEligibility(input);
  return result.eligible ? null : result.exclusions[0];
}

/* 12 — Fallback selection ------------------------------------------------------------ */

export type BaselineCandidate = {
  record: BaselineRecord;
  /** Whether this candidate's context matches the observation's. */
  matchesContext: boolean;
};

export type BaselineSelection =
  | { kind: 'selected'; record: BaselineRecord; level: BaselineLevel; confidence: BaselineConfidence }
  | { kind: 'none'; reason: string };

/**
 * Pick the strongest usable baseline.
 *
 * Walks §12's ladder in order and takes the first usable candidate, so a weak
 * fallback is only reached when nothing stronger exists. The chosen level is
 * returned alongside the record because the caller must record it — a
 * comparison against a template reference and one against exact-context history
 * are different claims and must not look alike.
 */
export function selectBaseline(candidates: readonly BaselineCandidate[]): BaselineSelection {
  if (candidates.length === 0) {
    return { kind: 'none', reason: 'No baseline exists for this feature at any fallback level.' };
  }

  const usable = candidates.filter((candidate) => baselineIsUsable(candidate.record.status));
  if (usable.length === 0) {
    return {
      kind: 'none',
      reason: `Baselines exist but none is usable: ${candidates
        .map((candidate) => `${candidate.record.baselineId} is ${candidate.record.status}`)
        .join(', ')}.`,
    };
  }

  const ranked = [...usable].sort(
    (a, b) => BASELINE_LEVEL_ORDER.indexOf(a.record.level) - BASELINE_LEVEL_ORDER.indexOf(b.record.level),
  );
  const chosen = ranked[0];
  return {
    kind: 'selected',
    record: chosen.record,
    level: chosen.record.level,
    confidence: baselineConfidence(chosen.record),
  };
}

/* 29 — Baseline confidence ----------------------------------------------------------- */

/**
 * How much to trust a baseline.
 *
 * Derived from the fallback level, the maturity of the record and its sample
 * count rather than stored as a free field, so a baseline cannot claim more
 * confidence than its provenance supports. A PROVISIONAL exact-context baseline
 * and a VALID template reference are both mid-confidence for different reasons,
 * and the level travels separately so the caller can say which.
 */
export function baselineConfidence(record: BaselineRecord): BaselineConfidence {
  if (!baselineIsUsable(record.status)) return 'NONE';
  if (record.sampleCount === 0) return 'NONE';

  const levelRank = BASELINE_LEVEL_ORDER.indexOf(record.level);
  const mature = record.status === 'VALID' || record.status === 'FROZEN';

  if (levelRank === 0 && mature && record.sampleCount >= 100) return 'HIGH';
  if (levelRank <= 1 && mature) return 'MEDIUM';
  if (levelRank <= 2) return 'MEDIUM';
  return 'LOW';
}

/* 26 / 28 — Lifecycle transitions ---------------------------------------------------- */

export class BaselineLifecycleError extends Error {}

const ALLOWED_TRANSITIONS: Record<BaselineStatus, BaselineStatus[]> = {
  NOT_AVAILABLE: ['LEARNING'],
  LEARNING: ['PROVISIONAL', 'FROZEN', 'NOT_AVAILABLE'],
  PROVISIONAL: ['VALID', 'LEARNING', 'FROZEN', 'REVIEW_REQUIRED', 'SUPERSEDED', 'RETIRED'],
  VALID: ['FROZEN', 'REVIEW_REQUIRED', 'SUPERSEDED', 'RETIRED'],
  FROZEN: ['VALID', 'REVIEW_REQUIRED', 'SUPERSEDED', 'RETIRED'],
  REVIEW_REQUIRED: ['VALID', 'FROZEN', 'SUPERSEDED', 'RETIRED'],
  // Terminal. A superseded baseline is history and §28 keeps it for replay.
  SUPERSEDED: [],
  RETIRED: [],
};

/**
 * Move a baseline to a new status.
 *
 * Refuses a transition the lifecycle does not allow, and in particular refuses
 * to revive a SUPERSEDED or RETIRED record. §28 keeps superseded baselines for
 * historical replay, and a record that could be revived would make a replay
 * disagree with what actually happened at the time.
 */
export function transitionBaseline(record: BaselineRecord, next: BaselineStatus): BaselineRecord {
  if (record.status === next) return record;
  if (!ALLOWED_TRANSITIONS[record.status].includes(next)) {
    throw new BaselineLifecycleError(
      `A baseline cannot move from ${record.status} to ${next}. ${
        record.status === 'SUPERSEDED' || record.status === 'RETIRED'
          ? 'A superseded or retired baseline is history and is preserved for replay rather than revived.'
          : `Allowed from ${record.status}: ${ALLOWED_TRANSITIONS[record.status].join(', ') || 'nothing'}.`
      }`,
    );
  }
  return { ...record, status: next, confidence: baselineConfidence({ ...record, status: next }) };
}

/** An empty baseline for a feature, before anything has been learned. */
export function emptyBaseline(baselineId: string, featureId: string, unit: string): BaselineRecord {
  return {
    baselineId,
    version: '1',
    status: 'NOT_AVAILABLE',
    level: 'EXACT_CONTEXT',
    source: 'LEARNED_HISTORICAL',
    contextId: null,
    configurationVersion: null,
    featureId,
    unit,
    mean: null,
    median: null,
    stdDev: null,
    p05: null,
    p50: null,
    p95: null,
    iqr: null,
    mad: null,
    sampleCount: 0,
    learnedFrom: null,
    learnedTo: null,
    confidence: 'NONE',
  };
}
