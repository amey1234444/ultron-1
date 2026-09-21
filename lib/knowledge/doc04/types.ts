/**
 * ULTRON DOC-04 types — anomaly, pattern and fault diagnosis.
 *
 * DOC-04 answers "what does the abnormal pattern mean?" It takes DOC-03's
 * feature objects and produces a structured WHAT / WHERE / WHY diagnosis with
 * its evidence attached.
 *
 * Four rules from the document shape these types.
 *
 * §17 INSTRUMENTATION-FIRST — when evidence is internally inconsistent, the
 * sensor is the suspect before the machine. "Pressure 80 → 300 → 80 in one
 * sample; torque and feed unchanged" is a data-quality anomaly, not a severe
 * restriction.
 *
 * §18 EVIDENCE MODEL — evidence is REQUIRED, SUPPORTING, CONTRADICTORY, MISSING
 * or NOT_APPLICABLE, and contradiction is never hidden. A diagnosis that
 * discards the evidence against it is not a diagnosis.
 *
 * §19 MULTI-FAULT — a causal chain is one diagnosis with symptoms, not four
 * faults. Two genuinely independent faults stay two.
 *
 * §20 DIAGNOSIS STATES — including FAULT_UNKNOWN, which is a real answer:
 * "Unknown abnormal patterns return FAULT_UNKNOWN rather than forced
 * classification."
 *
 * And the boundary: DOC-04 produces evidence and candidates. Severity,
 * confidence, impact, priority and recommended action are DOC-05's, and nothing
 * here computes them.
 */

import type { QualityVerdict } from '../doc02/types';

/* 10 — Fault families ------------------------------------------------------------- */

export type FaultFamily =
  | 'FEEDING'
  | 'PROCESS'
  | 'THERMAL'
  | 'VENTING'
  | 'DOWNSTREAM'
  | 'DRIVE_LOAD'
  | 'MECHANICAL'
  | 'INSTRUMENTATION'
  | 'CONTROL'
  | 'QUALITY';

export const FAULT_FAMILY_SCOPE: Record<FaultFamily, string> = {
  FEEDING: 'Main feeder, side feeder, hopper, feed throat.',
  PROCESS: 'Melting, mixing, viscosity, shear, residence, throughput.',
  THERMAL: 'Zones, heaters, cooling, melt temperature.',
  VENTING: 'Vents, vacuum pump, devolatilisation.',
  DOWNSTREAM: 'Screen, adapter, die, pressure path.',
  DRIVE_LOAD: 'Motor, VFD, torque, current, power, speed.',
  MECHANICAL: 'Motor, gearbox, coupling, basic vibration, lubrication.',
  INSTRUMENTATION: 'Sensors, wiring, scaling, tags, communication, timestamps.',
  CONTROL: 'Temperature, feed and speed loops and their actuators.',
  QUALITY: 'Dispersion, bubbles, contamination, degradation, product property.',
};

/** One row of the §11 fault master index. */
export type FaultDefinition = {
  faultId: string;
  name: string;
  family: FaultFamily;
  /** Where the fault lives, as the document words it. */
  primaryLocation: string;
  /** Operating states the rule is meaningful in. */
  applicableStates: string;
  /** Minimum evidence the rule needs before it may conclude anything. */
  minimumRequiredEvidence: string;
  ruleVersion: string;
};

/* 7 — Abnormal pattern library ----------------------------------------------------- */

/** One row of the §7 bridge between anomaly and fault. */
export type PatternDefinition = {
  patternId: string;
  name: string;
  typicalEvidence: string;
  faultCandidateDirection: string;
};

/* 3 — The anomaly gates ------------------------------------------------------------ */

/** The nine gates of §3, in order. */
export type AnomalyGate =
  | 'DATA_QUALITY'
  | 'OPERATING_STATE'
  | 'CONTEXT'
  | 'EXPECTED_RANGE'
  | 'MAGNITUDE'
  | 'RATE_OF_CHANGE'
  | 'PERSISTENCE'
  | 'CONTEXT_CHANGE'
  | 'LIMIT_STATUS';

export const ANOMALY_GATE_RULE: Record<AnomalyGate, { question: string; behaviour: string }> = {
  DATA_QUALITY: {
    question: 'Is the measurement trustworthy?',
    behaviour: 'BAD or MISSING — do not declare a physical anomaly; evaluate the instrumentation or data issue instead.',
  },
  OPERATING_STATE: {
    question: 'Is this comparison valid in the present state?',
    behaviour: 'Do not apply a steady-production baseline during startup, shutdown or warm-up.',
  },
  CONTEXT: {
    question: 'Are recipe, RPM, feed and relevant configuration known?',
    behaviour: 'Select the matching baseline; otherwise use an approved fallback at lower confidence.',
  },
  EXPECTED_RANGE: {
    question: 'Is the value outside healthy contextual behaviour?',
    behaviour: 'Use the baseline envelope — percentiles, model residual or the configured anomaly boundary.',
  },
  MAGNITUDE: {
    question: 'How far from expected?',
    behaviour: 'Store absolute and percent deviation. Do not rely on absolute value alone.',
  },
  RATE_OF_CHANGE: {
    question: 'Is the value changing faster than normal?',
    behaviour: 'A fast rate of change can be anomalous before the level reaches any high limit.',
  },
  PERSISTENCE: {
    question: 'Does the deviation last long enough to be meaningful?',
    behaviour: 'A sustained condition is stronger evidence than a single noisy sample.',
  },
  CONTEXT_CHANGE: {
    question: 'Did feed, RPM, recipe or setpoint intentionally change?',
    behaviour: 'If the response is physically expected, classify as EXPECTED_PROCESS_RESPONSE rather than an anomaly.',
  },
  LIMIT_STATUS: {
    question: 'Has an Alert, Danger or Trip been reached?',
    behaviour: 'Keep this separate from anomaly status and pass it to DOC-05.',
  },
};

/** What the anomaly engine concluded about one signal. */
export type AnomalyVerdict =
  | 'NOT_ANOMALOUS'
  | 'HIGH_ANOMALY'
  | 'LOW_ANOMALY'
  | 'RISING_ABNORMAL'
  | 'FALLING_ABNORMAL'
  | 'OSCILLATING'
  /** §3 gate 8 — the machine responded exactly as it should to a commanded change. */
  | 'EXPECTED_PROCESS_RESPONSE'
  /** §3 gate 1 — the reading cannot be trusted, so no physical claim is made. */
  | 'DATA_QUALITY_SUSPECT'
  | 'NOT_EVALUATED';

export type AnomalyResult = {
  signalId: string;
  verdict: AnomalyVerdict;
  /** Which gate stopped it, when a gate did. */
  blockedAtGate: AnomalyGate | null;
  /** One sentence naming what was observed and why it counts, or does not. */
  reason: string;
  /** Limit status, kept apart from the anomaly verdict per gate 9. */
  limitStatus: 'NONE' | 'ALERT' | 'DANGER' | 'TRIP' | 'UNKNOWN';
};

/* 18 — Evidence model -------------------------------------------------------------- */

export type EvidenceClass = 'REQUIRED' | 'SUPPORTING' | 'CONTRADICTORY' | 'MISSING' | 'NOT_APPLICABLE';

export const EVIDENCE_BEHAVIOUR: Record<EvidenceClass, string> = {
  REQUIRED: 'Minimum evidence for the standard rule. Missing or BAD yields INSUFFICIENT_EVIDENCE unless a validated degraded mode exists.',
  SUPPORTING: 'Strengthens the hypothesis. Used by DOC-05 for confidence.',
  CONTRADICTORY: 'Supports another explanation. Alternatives are kept; the contradiction is never hidden.',
  MISSING: 'Useful evidence is unavailable. Returned explicitly in the diagnosis.',
  NOT_APPLICABLE: 'The equipment or sensor is not fitted. Disable the rule or use the relevant variant.',
};

export type EvidenceItem = {
  evidenceClass: EvidenceClass;
  /** What was observed, e.g. "Pressure HIGH_ANOMALY". */
  statement: string;
  /** The signal or feature this rests on. */
  signalId: string | null;
  quality: QualityVerdict | null;
};

/* 20 — Diagnosis levels and states --------------------------------------------------- */

export type DiagnosisLevel = 'L1_ANOMALY' | 'L2_PATTERN' | 'L3_PROBLEM' | 'L4_LOCATION' | 'L5_FAULT' | 'L6_ROOT_CAUSE';

export const DIAGNOSIS_LEVEL_EXAMPLE: Record<DiagnosisLevel, string> = {
  L1_ANOMALY: 'Pressure HIGH_ANOMALY',
  L2_PATTERN: 'Increased process resistance',
  L3_PROBLEM: 'Process restriction',
  L4_LOCATION: 'Downstream / screen region',
  L5_FAULT: 'Screen restriction suspected',
  L6_ROOT_CAUSE: 'Screen contamination or buildup',
};

export type DiagnosisState =
  | 'NOT_EVALUATED'
  | 'NOT_DETECTED'
  | 'POSSIBLE'
  | 'SUSPECTED'
  | 'PROBABLE'
  | 'INSUFFICIENT_EVIDENCE'
  | 'FAULT_UNKNOWN';

export const DIAGNOSIS_STATE_MEANING: Record<DiagnosisState, string> = {
  NOT_EVALUATED: 'The rule does not apply in the current state or configuration.',
  NOT_DETECTED: 'Valid evidence was evaluated and the pattern is absent.',
  POSSIBLE: 'Some evidence is present but incomplete or ambiguous.',
  SUSPECTED: 'Meaningful multi-signal evidence supports the candidate.',
  PROBABLE: 'Strong consistent evidence. The numeric confidence still belongs to DOC-05.',
  INSUFFICIENT_EVIDENCE: 'Required data is missing or BAD.',
  FAULT_UNKNOWN: 'An anomaly is confirmed but no known fault fits safely.',
};

/* 21 — The diagnosis object ---------------------------------------------------------- */

/** Every field DOC-04 §21 requires on a diagnosis handed to DOC-05. */
export type DiagnosisObject = {
  diagnosisId: string;
  timestamp: string;
  machineId: string;
  /** The §7 pattern that bridged anomaly to fault, when one matched. */
  patternId: string | null;
  patternName: string | null;
  primaryDiagnosis: string;
  diagnosisState: DiagnosisState;
  /** Plain-language explanation, the three questions §21 asks. */
  what: string;
  where: string;
  why: string;
  supportingEvidence: EvidenceItem[];
  contradictingEvidence: EvidenceItem[];
  missingEvidence: EvidenceItem[];
  /** Other faults the same evidence could mean. Never suppressed. */
  alternativeDiagnoses: string[];
  rootCauseCandidates: string[];
  dataQuality: QualityVerdict;
  /** Fault ids this diagnosis points at. */
  faultCandidates: string[];
  /**
   * Symptoms rolled up under this diagnosis rather than reported separately
   * (§19). A screen restriction raises pressure, torque and current; those are
   * evidence for one fault, not three faults.
   */
  groupedSymptoms: string[];
  /** Whether DOC-05 should score this. False for data-quality findings. */
  sendToDoc05: boolean;
  ruleVersion: string;
  /** DOC-03 feature and formula versions this traces to. */
  featureVersions: string[];
  configurationVersion: string | null;
};
