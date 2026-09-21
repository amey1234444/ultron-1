/**
 * ULTRON DOC-05 types — severity, confidence, impact, priority and action.
 *
 * DOC-05 answers the question DOC-04 deliberately refuses: how serious is this,
 * how sure are we, what does it affect, how urgently must someone respond, and
 * what should they actually do.
 *
 * §3 is the spine of the whole document, and of these types: **the five outputs
 * must stay separate.** Each answers a different question and each is routinely
 * confused with the one next to it —
 *
 *   Severity   how serious the physical condition is       ≠ Confidence
 *   Confidence how certain the diagnosis is                 ≠ Severity
 *   Impact     what the condition can affect                ≠ Priority
 *   Priority   how urgently to respond                      ≠ physical severity
 *   Action     what to do                                   ≠ the diagnosis text
 *
 * Collapsing any two is the failure DOC-05 exists to prevent, and §16 names the
 * worst case explicitly: a pressure above an approved Danger limit whose sensor
 * evidence is weak must stay DANGER and be urgently verified — not downgraded
 * because confidence is low. Low confidence changes the *action*, never the
 * severity.
 */

/* 4 — Severity ------------------------------------------------------------------- */

export type Severity = 'NORMAL' | 'ALERT' | 'DANGER';

export const SEVERITY_MEANING: Record<Severity, string> = {
  NORMAL:
    'No approved Alert or Danger condition, and nothing requiring elevated physical severity. An anomaly may still exist as an early advisory.',
  ALERT: 'Requires attention, investigation, trending, or planned or current-shift intervention.',
  DANGER: 'Serious condition requiring urgent verification, intervention or escalation under approved procedure.',
};

/**
 * DOC-05 §5, the authority ladder. Hard limits always win.
 *
 * Identical in shape to DOC-01 §17, and deliberately so: the same hierarchy
 * that decides which *limit* governs also decides which limit sets severity.
 */
export type LimitAuthority =
  | 'SAFETY_TRIP'
  | 'CUSTOMER_DANGER'
  | 'CUSTOMER_ALERT'
  | 'OEM_ENGINEERING'
  | 'ULTRON_LEARNED';

export const AUTHORITY_SEVERITY_FLOOR: Record<LimitAuthority, Severity> = {
  SAFETY_TRIP: 'DANGER',
  CUSTOMER_DANGER: 'DANGER',
  CUSTOMER_ALERT: 'ALERT',
  OEM_ENGINEERING: 'ALERT',
  // The rule that matters: a learned anomaly never redefines plant severity.
  ULTRON_LEARNED: 'NORMAL',
};

/** DOC-05 §8. How far the fault has developed — separate from how serious it is. */
export type ProgressionStage = 'EARLY' | 'DEVELOPING' | 'ADVANCED' | 'SEVERE';

export const PROGRESSION_MEANING: Record<ProgressionStage, string> = {
  EARLY: 'Small but persistent abnormal departure; near the anomaly boundary, no approved Alert.',
  DEVELOPING: 'Clear sustained deterioration; deviation and persistence increasing.',
  ADVANCED: 'Large deviation or strong fault pattern; multiple related features abnormal.',
  SEVERE: 'Near or at serious engineering or approved limits; rapid deterioration or high consequence.',
};

/* 11 — Confidence ----------------------------------------------------------------- */

export type ConfidenceLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'INSUFFICIENT_EVIDENCE';

export const CONFIDENCE_MEANING: Record<ConfidenceLevel, string> = {
  LOW: 'Some evidence but major uncertainty, or missing or contradictory inputs.',
  MEDIUM: 'Reasonable evidence, but not all key evidence or localisation is available.',
  HIGH: 'Strong required evidence, good data and context, and multi-sensor agreement.',
  INSUFFICIENT_EVIDENCE: 'A required measurement is BAD or MISSING and no documented degraded rule exists.',
};

/**
 * DOC-05 §13 — three confidences, not one.
 *
 * "Process restriction = 94%, screen/downstream = 76%, screen contamination =
 * 45%" is one finding with three different certainties, and reporting only the
 * first would send someone to strip a screen on 45% evidence.
 */
export type ConfidenceSet = {
  fault: number;
  faultLevel: ConfidenceLevel;
  location: number;
  locationLevel: ConfidenceLevel;
  rootCause: number;
  rootCauseLevel: ConfidenceLevel;
};

/* 17 — Impact --------------------------------------------------------------------- */

export type ImpactLevel = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'POTENTIAL';

/** DOC-05 §18 — what it affects now, and what it could affect if it progresses. */
export type ImpactSet = {
  equipment: ImpactLevel;
  process: ImpactLevel;
  production: ImpactLevel;
  quality: ImpactLevel;
  energy: ImpactLevel;
  safety: ImpactLevel;
  /** Current versus potential, kept apart per §18. */
  horizon: 'CURRENT' | 'POTENTIAL';
};

/* 23 — Priority -------------------------------------------------------------------- */

export type Priority = 'P1' | 'P2' | 'P3' | 'P4';

export const PRIORITY_MEANING: Record<Priority, { name: string; window: string }> = {
  P1: { name: 'IMMEDIATE', window: 'Now, according to plant emergency or operating procedure.' },
  P2: { name: 'URGENT', window: 'Current shift or very near term, according to plant procedure.' },
  P3: { name: 'PLANNED', window: 'Scheduled intervention in a planned maintenance or operation window.' },
  P4: { name: 'MONITOR', window: 'No immediate intervention; continue trending and verify on routine basis.' },
};

/**
 * DOC-05 §23's TIMING IS CUSTOMER-CONFIGURABLE note, carried into the type.
 *
 * The document is explicit that exact response times — 30 minutes, 4 hours, 24
 * hours — come from customer and OEM policy, "not a universal hard-coded
 * table". So `window` above is a philosophy, never a number, and nothing in
 * this module converts a priority into a deadline.
 */
export const PRIORITY_TIMING_NOTE =
  'Priority classes and their decision logic are defined here. Exact response times come from customer and OEM maintenance policy and are never hard-coded.';

/* 28 — Action ---------------------------------------------------------------------- */

export type ActionLevel =
  | 'MONITOR'
  | 'VERIFY'
  | 'INSPECT'
  | 'PLAN_MAINTENANCE'
  | 'URGENT_INTERVENTION'
  | 'IMMEDIATE_ESCALATION';

export const ACTION_LEVEL_USE: Record<ActionLevel, string> = {
  MONITOR: 'Early anomaly, low impact, stable trend. Continue trend monitoring.',
  VERIFY: 'High consequence but uncertain evidence. Check independent measurements and related process values.',
  INSPECT: 'Fault evidence is credible and the component is accessible.',
  PLAN_MAINTENANCE: 'Condition is stable but requires corrective work. Schedule it.',
  URGENT_INTERVENTION: 'Alert or Danger, or a worsening high-impact fault. Act in the current shift or per plant procedure.',
  IMMEDIATE_ESCALATION: 'Danger, protection or safety-relevant. Follow the approved emergency procedure immediately.',
};

/** DOC-05 §27, the five steps a recommendation walks through. */
export type ActionStep = 'CONFIRM' | 'INSPECT' | 'CORRECT' | 'VERIFY' | 'ESCALATE';

export const ACTION_STEP_PURPOSE: Record<ActionStep, string> = {
  CONFIRM: 'Verify the diagnosis and the measurement before unnecessary maintenance.',
  INSPECT: 'Tell the team where and what to inspect.',
  CORRECT: 'Apply the approved corrective action.',
  VERIFY: 'Prove the condition actually improved.',
  ESCALATE: 'Escalate when unresolved, severe, or outside local authority.',
};

export type Recommendation = {
  level: ActionLevel;
  /** The ordered steps, from §27. */
  steps: ActionStep[];
  /** One sentence an operator can act on. */
  text: string;
  /**
   * Whether this is an ULTRON suggestion or an approved plant procedure.
   *
   * §32's authority hierarchy: ULTRON recommends, the plant's approved SOP
   * decides. Nothing here ever presents itself as the procedure.
   */
  authority: 'ULTRON_RECOMMENDATION' | 'APPROVED_PROCEDURE';
};

/* 40 — The decision object ---------------------------------------------------------- */

/** Every field DOC-05 §40 requires on a decision handed to an operator. */
export type DecisionObject = {
  decisionId: string;
  timestamp: string;
  /** Carried from DOC-04 rather than restated. */
  diagnosis: string;
  severity: Severity;
  /** Which authority set the severity floor. */
  severityAuthority: LimitAuthority | null;
  /** Why the severity is what it is, in a sentence. */
  severityReason: string;
  anomalyStrength: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';
  progression: ProgressionStage;
  confidence: ConfidenceSet;
  impact: ImpactSet;
  priority: Priority;
  priorityReason: string;
  recommendation: Recommendation;
  /** Limit status, reported separately from severity per §40. */
  customerAlertReached: boolean;
  customerDangerReached: boolean;
  trend: 'IMPROVING' | 'STABLE' | 'WORSENING' | 'UNKNOWN';
  /** §41 — the four questions a decision must be able to answer. */
  explainability: { question: string; answer: string }[];
  ruleVersion: string;
};
