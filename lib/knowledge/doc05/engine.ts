/**
 * The DOC-05 decision engine — severity, confidence, impact, priority, action.
 *
 * Three rules from the document shape every function here, and each is a rule
 * about *not* collapsing two things that look alike:
 *
 * §5 HARD LIMITS ALWAYS WIN. Severity is set by the highest authority that
 * applies, and a learned anomaly never redefines plant severity. A pressure
 * above an approved Danger is DANGER whatever the analytics think.
 *
 * §16 LOW CONFIDENCE + HIGH SEVERITY. Weak evidence for a serious condition
 * does not lower the severity — it changes the action to urgent verification.
 * The wrong behaviour DOC-05 names is "ignore or downgrade because confidence
 * is low", and `decide` cannot express it: severity is computed before
 * confidence is consulted, and confidence only reaches the recommendation.
 *
 * §23 TIMING IS CUSTOMER-CONFIGURABLE. Priority is a class, never a deadline.
 * Nothing here converts P2 into four hours.
 */

import type {
  ActionLevel,
  ActionStep,
  ConfidenceLevel,
  ConfidenceSet,
  DecisionObject,
  ImpactLevel,
  ImpactSet,
  LimitAuthority,
  Priority,
  ProgressionStage,
  Recommendation,
  Severity,
} from './types';
import { AUTHORITY_SEVERITY_FLOOR, PRIORITY_MEANING } from './types';

const SEVERITY_ORDER: Severity[] = ['NORMAL', 'ALERT', 'DANGER'];

function maxSeverity(a: Severity, b: Severity): Severity {
  return SEVERITY_ORDER.indexOf(a) >= SEVERITY_ORDER.indexOf(b) ? a : b;
}

/* 7 — Severity --------------------------------------------------------------------- */

export type SeverityInput = {
  /** Which approved limits the reading has reached. */
  tripActive: boolean;
  customerDangerReached: boolean;
  customerAlertReached: boolean;
  oemLimitReached: boolean;
  /** Whether a learned anomaly fired, and how strongly. */
  anomalyStrength: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';
  /**
   * Set when the fault's own engineering rule sets severity by mechanism
   * rather than by a scalar limit (§7's "severe physical fault with no scalar
   * plant limit"). Null when the fault has no such rule.
   */
  faultSeverityFloor: Severity | null;
  /** True when a measurement the severity would rest on is BAD or MISSING. */
  requiredMeasurementUnusable: boolean;
};

export type SeverityResult = {
  severity: Severity;
  authority: LimitAuthority | null;
  reason: string;
};

/**
 * DOC-05 §7's decision table.
 *
 * Read top down: the highest authority that applies sets the floor, and the
 * learned anomaly is consulted last and cannot raise severity on its own. That
 * ordering is the document's central claim about severity, and reversing it
 * would let analytics quietly redefine a customer's protection philosophy.
 */
export function assessSeverity(input: SeverityInput): SeverityResult {
  if (input.tripActive) {
    return {
      severity: 'DANGER',
      authority: 'SAFETY_TRIP',
      reason: 'A trip or protection state is active. Protection logic has the highest authority and is never downgraded by analytics.',
    };
  }
  if (input.customerDangerReached) {
    return {
      severity: 'DANGER',
      authority: 'CUSTOMER_DANGER',
      reason: 'An approved customer Danger limit has been reached.',
    };
  }
  if (input.customerAlertReached) {
    return {
      severity: 'ALERT',
      authority: 'CUSTOMER_ALERT',
      reason: 'An approved customer Alert limit has been reached.',
    };
  }
  if (input.oemLimitReached) {
    return {
      severity: AUTHORITY_SEVERITY_FLOOR.OEM_ENGINEERING,
      authority: 'OEM_ENGINEERING',
      reason: 'An OEM or approved engineering limit applies in this context.',
    };
  }

  // §7 — a required measurement that cannot be trusted may not found a physical
  // severity claim. Independent hard-limit evidence above still applies, which
  // is why this is checked only after the limits.
  if (input.requiredMeasurementUnusable) {
    return {
      severity: 'NORMAL',
      authority: null,
      reason:
        'A measurement this severity would rest on is BAD or MISSING, so no physical severity is claimed from it. The instrumentation problem is the finding.',
    };
  }

  if (input.faultSeverityFloor) {
    return {
      severity: input.faultSeverityFloor,
      authority: 'OEM_ENGINEERING',
      reason: 'The fault definition sets severity by mechanism rather than by a scalar process limit.',
    };
  }

  // The rule that keeps analytics in their place.
  return {
    severity: 'NORMAL',
    authority: input.anomalyStrength === 'NONE' ? null : 'ULTRON_LEARNED',
    reason:
      input.anomalyStrength === 'NONE'
        ? 'No approved limit is reached and no anomaly is present.'
        : 'A learned anomaly is present but no approved Alert or Danger has been reached. Early analytics do not redefine approved plant severity.',
  };
}

/* 8 — Progression ------------------------------------------------------------------ */

export function assessProgression(input: {
  severity: Severity;
  anomalyStrength: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';
  abnormalFeatureCount: number;
  trend: 'IMPROVING' | 'STABLE' | 'WORSENING' | 'UNKNOWN';
}): ProgressionStage {
  if (input.severity === 'DANGER') return 'SEVERE';
  if (input.abnormalFeatureCount >= 3 || (input.severity === 'ALERT' && input.trend === 'WORSENING')) return 'ADVANCED';
  if (input.anomalyStrength === 'HIGH' || input.trend === 'WORSENING') return 'DEVELOPING';
  return 'EARLY';
}

/* 11–15 — Confidence --------------------------------------------------------------- */

export type ConfidenceInput = {
  /** 0..1 each, from the layers that produced them. */
  dataQuality: number;
  baselineConfidence: number;
  contextConfidence: number;
  requiredEvidenceSatisfied: boolean;
  supportingEvidenceCount: number;
  contradictingEvidenceCount: number;
  missingEvidenceCount: number;
  /** Whether topology allows the fault to be localised. */
  locationResolvable: boolean;
  /** Whether a root cause was proposed at all. */
  rootCauseProposed: boolean;
};

export function confidenceLevel(score: number): ConfidenceLevel {
  if (score >= 0.75) return 'HIGH';
  if (score >= 0.45) return 'MEDIUM';
  return 'LOW';
}

/**
 * The three confidences of §13, computed separately.
 *
 * Location confidence can never exceed fault confidence, and root-cause can
 * never exceed location: you cannot be surer *where* a fault is than that it
 * exists, nor surer *why* than where. The clamps make that ordering structural
 * rather than a coincidence of the arithmetic.
 */
export function assessConfidence(input: ConfidenceInput): ConfidenceSet {
  // §12's MANDATORY EVIDENCE GATE.
  if (!input.requiredEvidenceSatisfied) {
    return {
      fault: 0,
      faultLevel: 'INSUFFICIENT_EVIDENCE',
      location: 0,
      locationLevel: 'INSUFFICIENT_EVIDENCE',
      rootCause: 0,
      rootCauseLevel: 'INSUFFICIENT_EVIDENCE',
    };
  }

  const base = (input.dataQuality + input.baselineConfidence + input.contextConfidence) / 3;
  const support = Math.min(1, input.supportingEvidenceCount / 3);
  const contradiction = Math.min(0.5, input.contradictingEvidenceCount * 0.2);
  const missing = Math.min(0.3, input.missingEvidenceCount * 0.1);

  const fault = Math.max(0, Math.min(1, base * 0.5 + support * 0.5 - contradiction - missing));
  const location = Math.min(fault, input.locationResolvable ? fault * 0.85 : fault * 0.4);
  const rootCause = Math.min(location, input.rootCauseProposed ? location * 0.7 : 0);

  return {
    fault,
    faultLevel: confidenceLevel(fault),
    location,
    locationLevel: confidenceLevel(location),
    rootCause,
    rootCauseLevel: confidenceLevel(rootCause),
  };
}

/* 17–21 — Impact -------------------------------------------------------------------- */

export function assessImpact(input: {
  severity: Severity;
  faultFamily: string | null;
  throughputAffected: boolean;
  qualityRelevant: boolean;
  safetyRelevant: boolean;
}): ImpactSet {
  const bySeverity: ImpactLevel = input.severity === 'DANGER' ? 'HIGH' : input.severity === 'ALERT' ? 'MEDIUM' : 'LOW';
  const mechanical = input.faultFamily === 'MECHANICAL' || input.faultFamily === 'DRIVE_LOAD';
  // An instrumentation fault damages confidence in the data, not the machine.
  const instrumentation = input.faultFamily === 'INSTRUMENTATION';

  return {
    equipment: instrumentation ? 'NONE' : mechanical ? bySeverity : 'LOW',
    process: instrumentation ? 'NONE' : bySeverity,
    production: input.throughputAffected ? bySeverity : 'POTENTIAL',
    quality: input.qualityRelevant ? 'POTENTIAL' : 'LOW',
    energy: input.severity === 'NORMAL' ? 'LOW' : 'MEDIUM',
    safety: input.safetyRelevant ? bySeverity : 'LOW',
    horizon: input.severity === 'NORMAL' ? 'POTENTIAL' : 'CURRENT',
  };
}

const IMPACT_RANK: Record<ImpactLevel, number> = { NONE: 0, LOW: 1, POTENTIAL: 1, MEDIUM: 2, HIGH: 3 };

export function peakImpact(impact: ImpactSet): ImpactLevel {
  return (['equipment', 'process', 'production', 'quality', 'energy', 'safety'] as const)
    .map((key) => impact[key])
    .reduce((worst, level) => (IMPACT_RANK[level] > IMPACT_RANK[worst] ? level : worst), 'NONE' as ImpactLevel);
}

/* 25 — Priority ---------------------------------------------------------------------- */

export type PriorityInput = {
  severity: Severity;
  confidence: ConfidenceLevel;
  impact: ImpactLevel;
  trend: 'IMPROVING' | 'STABLE' | 'WORSENING' | 'UNKNOWN';
  assetCritical: boolean;
  redundancyAvailable: boolean;
  safetyRelevant: boolean;
};

/**
 * DOC-05 §25's decision matrix.
 *
 * The row that matters most is DANGER with LOW confidence: it is still P1.
 * §24 says it outright — "Low confidence changes the action toward
 * verification; it does not automatically lower priority" — and the wrong
 * behaviour §16 names is treating an uncertain serious condition as low
 * priority.
 */
export function assessPriority(input: PriorityInput): { priority: Priority; reason: string } {
  if (input.safetyRelevant && input.severity !== 'NORMAL') {
    return { priority: 'P1', reason: 'Safety relevance forces immediate verification and escalation.' };
  }

  if (input.severity === 'DANGER') {
    return {
      priority: 'P1',
      reason:
        input.confidence === 'LOW' || input.confidence === 'INSUFFICIENT_EVIDENCE'
          ? 'An approved Danger condition with weak evidence is still immediate: verify urgently and escalate. Low confidence changes the action, not the urgency.'
          : 'An approved Danger condition requires immediate escalation or intervention per procedure.',
    };
  }

  if (input.severity === 'ALERT') {
    if (input.confidence === 'LOW' || input.confidence === 'INSUFFICIENT_EVIDENCE') {
      return {
        priority: input.assetCritical || IMPACT_RANK[input.impact] >= 2 ? 'P2' : 'P3',
        reason: 'An Alert on uncertain evidence needs prompt verification before intrusive maintenance.',
      };
    }
    if (input.redundancyAvailable && !input.assetCritical && input.trend !== 'WORSENING') {
      return { priority: 'P3', reason: 'Alert on a redundant, non-critical asset with a stable trend can be planned.' };
    }
    // §24: machine criticality raises business priority, and §26 turns on
    // exactly this — the same Alert on a critical asset and on a redundant one
    // must not come out at the same urgency.
    if (input.assetCritical) {
      return {
        priority: 'P2',
        reason: 'Alert on a critical production asset. Criticality raises business priority even when the trend is stable.',
      };
    }
    return {
      priority: input.trend === 'WORSENING' || IMPACT_RANK[input.impact] >= 3 ? 'P2' : 'P3',
      reason: 'Alert severity; urgency follows the trend and the consequence.',
    };
  }

  // NORMAL, but a strong anomaly with a worsening trend still earns attention.
  if (input.trend === 'WORSENING') {
    return { priority: 'P3', reason: 'No approved limit reached, but the trend is worsening. Plan focused monitoring or inspection.' };
  }
  return { priority: 'P4', reason: 'No approved limit reached and the condition is stable. Monitor.' };
}

/* 27–32 — Recommendation -------------------------------------------------------------- */

/**
 * The recommended action, from severity and confidence together (§29, §30).
 *
 * Confidence decides *what kind* of action, severity decides how urgent. That
 * is why a DANGER with LOW confidence yields urgent verification rather than
 * either urgent repair or a shrug.
 */
export function recommend(input: {
  severity: Severity;
  confidence: ConfidenceLevel;
  priority: Priority;
  tripActive: boolean;
  instrumentationSuspect: boolean;
  location: string;
}): Recommendation {
  const steps: ActionStep[] = [];
  let level: ActionLevel;
  let text: string;

  if (input.tripActive) {
    return {
      level: 'IMMEDIATE_ESCALATION',
      steps: ['ESCALATE', 'CONFIRM'],
      text: 'A protection state is active. Follow the approved trip and recovery procedure. ULTRON does not replace the protection system.',
      authority: 'APPROVED_PROCEDURE',
    };
  }

  if (input.instrumentationSuspect) {
    return {
      level: 'VERIFY',
      steps: ['CONFIRM', 'INSPECT'],
      text: `Verify the measurement chain before any process intervention — sensor, port, wiring, scaling and timestamp at ${input.location}.`,
      authority: 'ULTRON_RECOMMENDATION',
    };
  }

  if (input.confidence === 'INSUFFICIENT_EVIDENCE') {
    return {
      level: 'VERIFY',
      steps: ['CONFIRM'],
      text: 'Restore the required measurement before diagnosing. No specific root cause should be acted on from the evidence available.',
      authority: 'ULTRON_RECOMMENDATION',
    };
  }

  if (input.severity === 'DANGER') {
    level = input.confidence === 'LOW' ? 'URGENT_INTERVENTION' : 'IMMEDIATE_ESCALATION';
    steps.push('CONFIRM', 'ESCALATE', 'CORRECT', 'VERIFY');
    text =
      input.confidence === 'LOW'
        ? `Urgently verify the condition with an independent measurement, then escalate per approved procedure. Severity stays DANGER on the approved limit regardless of evidence strength.`
        : `Escalate immediately per approved customer or OEM procedure and intervene at ${input.location}.`;
  } else if (input.severity === 'ALERT') {
    level = input.confidence === 'HIGH' ? 'INSPECT' : 'VERIFY';
    steps.push('CONFIRM', 'INSPECT', 'CORRECT', 'VERIFY');
    text =
      input.confidence === 'HIGH'
        ? `Inspect ${input.location} and apply the approved corrective action, then verify against the baseline.`
        : `Confirm the supporting evidence while preparing to inspect ${input.location}.`;
  } else {
    level = input.priority === 'P3' ? 'PLAN_MAINTENANCE' : 'MONITOR';
    steps.push('CONFIRM');
    text =
      input.priority === 'P3'
        ? `Plan a focused inspection of ${input.location}; the trend is worsening although no approved limit is reached.`
        : 'Continue trend monitoring. No approved limit is reached and the condition is stable.';
  }

  return { level, steps, text, authority: 'ULTRON_RECOMMENDATION' };
}

/* 40 — The decision --------------------------------------------------------------- */

export type DecisionInput = {
  decisionId: string;
  timestamp: string;
  diagnosis: string;
  location: string;
  faultFamily: string | null;
  severity: SeverityInput;
  confidence: ConfidenceInput;
  trend: 'IMPROVING' | 'STABLE' | 'WORSENING' | 'UNKNOWN';
  abnormalFeatureCount: number;
  assetCritical: boolean;
  redundancyAvailable: boolean;
  safetyRelevant: boolean;
  throughputAffected: boolean;
  qualityRelevant: boolean;
  instrumentationSuspect: boolean;
};

/** Produce the §40 decision object, with the five outputs kept apart. */
export function decide(input: DecisionInput): DecisionObject {
  // Severity first, and computed without reference to confidence. That ordering
  // is what makes §16 unexpressible as a bug.
  const severity = assessSeverity(input.severity);
  const confidence = assessConfidence(input.confidence);
  const impact = assessImpact({
    severity: severity.severity,
    faultFamily: input.faultFamily,
    throughputAffected: input.throughputAffected,
    qualityRelevant: input.qualityRelevant,
    safetyRelevant: input.safetyRelevant,
  });
  const progression = assessProgression({
    severity: severity.severity,
    anomalyStrength: input.severity.anomalyStrength,
    abnormalFeatureCount: input.abnormalFeatureCount,
    trend: input.trend,
  });
  const priority = assessPriority({
    severity: severity.severity,
    confidence: confidence.faultLevel,
    impact: peakImpact(impact),
    trend: input.trend,
    assetCritical: input.assetCritical,
    redundancyAvailable: input.redundancyAvailable,
    safetyRelevant: input.safetyRelevant,
  });
  const recommendation = recommend({
    severity: severity.severity,
    confidence: confidence.faultLevel,
    priority: priority.priority,
    tripActive: input.severity.tripActive,
    instrumentationSuspect: input.instrumentationSuspect,
    location: input.location,
  });

  return {
    decisionId: input.decisionId,
    timestamp: input.timestamp,
    diagnosis: input.diagnosis,
    severity: severity.severity,
    severityAuthority: severity.authority,
    severityReason: severity.reason,
    anomalyStrength: input.severity.anomalyStrength,
    progression,
    confidence,
    impact,
    priority: priority.priority,
    priorityReason: priority.reason,
    recommendation,
    customerAlertReached: input.severity.customerAlertReached,
    customerDangerReached: input.severity.customerDangerReached,
    trend: input.trend,
    // §41 — the four questions a decision must be able to answer.
    explainability: [
      { question: 'Why this diagnosis?', answer: input.diagnosis },
      { question: 'Why this severity?', answer: severity.reason },
      {
        question: 'Why this confidence?',
        answer: `Fault ${(confidence.fault * 100).toFixed(0)}%, location ${(confidence.location * 100).toFixed(0)}%, root cause ${(confidence.rootCause * 100).toFixed(0)}%.`,
      },
      { question: 'Why this priority?', answer: `${PRIORITY_MEANING[priority.priority].name} — ${priority.reason}` },
    ],
    ruleVersion: '1.0',
  };
}
