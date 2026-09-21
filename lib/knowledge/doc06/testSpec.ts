/**
 * BLACKGATE DOC-06 — the verification specification.
 *
 * DOC-06 is unlike the documents before it. DOC-01 to DOC-04 describe what the
 * system should know and conclude; DOC-06 describes how you prove it does. So
 * "implementing DOC-06" means two things, and only the second is worth much:
 *
 *   1. The specification as data — the four mandatory test classes, the §3 case
 *      format, and the §18 minimum pack every fault needs. That is this file.
 *
 *   2. Test cases that actually run against the shipped pipeline. That is
 *      `__checks__/doc06Checks.ts`, and it is where the value is. A test matrix
 *      nobody executes is a document, not a verification.
 *
 * The rule DOC-06 puts in capitals is the one worth carrying into code:
 *
 *   "A test set that contains only faults is incomplete. False-positive
 *    prevention must be tested with the same seriousness as fault detection."
 *
 * `coverageGaps` enforces exactly that — a suite with no HEALTHY or no
 * DATA_QUALITY case is reported as incomplete however many fault cases it has.
 */

/** DOC-06 §2, the four classes a complete suite must contain. */
export type TestClass =
  | 'HEALTHY'
  | 'EXPECTED_CHANGE'
  | 'FAULT'
  | 'DATA_QUALITY'
  | 'DECISION'
  | 'ML';

export const TEST_CLASS_PURPOSE: Record<TestClass, string> = {
  HEALTHY: 'Prove normal operation does not become a false fault.',
  EXPECTED_CHANGE: 'Prove context changes are recognised — an intentional feed increase, a startup, a recipe change.',
  FAULT: 'Prove real abnormal patterns are detected.',
  DATA_QUALITY: 'Prove bad instrumentation does not become a false process diagnosis.',
  DECISION: 'Prove severity, confidence, impact and priority behave — DOC-05.',
  ML: 'Prove labels and datasets are produced correctly.',
};

/**
 * The classes a suite cannot be complete without (§2's MANDATORY RULE).
 *
 * DECISION and ML are excluded deliberately: DECISION belongs to DOC-05, which
 * has not been supplied, and ML tests need a dataset that does not exist yet.
 * Requiring them would make every suite fail for a reason the suite cannot fix.
 */
export const MANDATORY_TEST_CLASSES: readonly TestClass[] = [
  'HEALTHY',
  'EXPECTED_CHANGE',
  'FAULT',
  'DATA_QUALITY',
] as const;

/** DOC-06 §18, the minimum pack every DOC-04 fault needs. */
export type MinimumCase = 'POSITIVE' | 'NEGATIVE' | 'BORDERLINE' | 'MISSING_EVIDENCE' | 'LOOK_ALIKE' | 'MULTI_FAULT';

export const MINIMUM_CASE_PURPOSE: Record<MinimumCase, string> = {
  POSITIVE: 'Prove detection.',
  NEGATIVE: 'Prove no false detection — the load is explained by an intentional change.',
  BORDERLINE: 'Check the threshold and persistence boundaries.',
  MISSING_EVIDENCE: 'Check degraded behaviour when a signal is unavailable.',
  LOOK_ALIKE: 'Test differential diagnosis against a fault that presents the same way.',
  MULTI_FAULT: 'Check coexistence and causal grouping, where relevant.',
};

/** Required for every fault. MULTI_FAULT is "where relevant", so not required. */
export const REQUIRED_MINIMUM_CASES: readonly MinimumCase[] = [
  'POSITIVE',
  'NEGATIVE',
  'BORDERLINE',
  'MISSING_EVIDENCE',
  'LOOK_ALIKE',
] as const;

export type ValidationStatus = 'DRAFT' | 'REVIEWED' | 'APPROVED';

/** One test case in the DOC-06 §3 standard format. */
export type TestCase = {
  testCaseId: string;
  testClass: TestClass;
  /** Which §18 case this is, for a fault test. */
  minimumCase?: MinimumCase;
  machineVariant: string;
  configurationVersion: string;
  operatingState: string;
  /** Recipe and load context, as the document writes it. */
  context: string;
  /** What the case is proving, in a sentence. */
  intent: string;
  /** The expected DOC-04 outcome — pattern, fault, or the absence of one. */
  expectedDiagnosis: string;
  acceptanceRule: string;
  source: 'ENGINEERING' | 'OEM' | 'PLANT_HISTORY' | 'SYNTHETIC' | 'SIMULATION';
  validationStatus: ValidationStatus;
  /** DOC-06 §32 — whether this case may train a model, and why not if not. */
  mlEligible: boolean;
  mlIneligibleReason?: string;
  /** The fault this case exercises, where it exercises one. */
  faultId?: string;
};

/**
 * Classes a suite is missing (§2's MANDATORY RULE, enforced).
 *
 * The check exists because the failure it catches is invisible: a suite of
 * twenty fault tests all passing looks like thorough verification, and says
 * nothing whatever about whether the system cries wolf on a healthy machine.
 */
export function coverageGaps(cases: readonly TestCase[]): TestClass[] {
  const present = new Set(cases.map((entry) => entry.testClass));
  return MANDATORY_TEST_CLASSES.filter((testClass) => !present.has(testClass));
}

/** §18 cases a given fault is still missing from a suite. */
export function minimumPackGaps(cases: readonly TestCase[], faultId: string): MinimumCase[] {
  const present = new Set(
    cases.filter((entry) => entry.faultId === faultId && entry.minimumCase).map((entry) => entry.minimumCase as MinimumCase),
  );
  return REQUIRED_MINIMUM_CASES.filter((minimumCase) => !present.has(minimumCase));
}

/**
 * DOC-06 §22 — what an unexplained abnormality must produce.
 *
 * Kept as data because it is the row most easily lost in implementation: the
 * pressure to classify every anomaly into *something* is exactly what produces
 * confident wrong diagnoses, and the document is explicit that the correct
 * output is FAULT_UNKNOWN.
 */
export const UNKNOWN_FAULT_EXPECTATIONS: readonly { condition: string; expected: string }[] = [
  { condition: 'Strong anomalies but no library pattern fits', expected: 'ANOMALY_CONFIRMED + FAULT_UNKNOWN' },
  { condition: 'Some evidence but mandatory evidence unavailable', expected: 'INSUFFICIENT_EVIDENCE' },
  { condition: 'Pattern weak and below criteria', expected: 'NOT_DETECTED / monitor' },
  {
    condition: 'Unknown event later confirmed by an engineer',
    expected: 'Create a candidate new fault or rule, and relabel the historical event',
  },
] as const;

/** DOC-06 §1.1, the pipeline a full verification run exercises. */
export const VERIFICATION_PIPELINE: readonly string[] = [
  'Signal and data-quality validation',
  'Operating state and context selection',
  'Formula and feature computation',
  'Baseline selection and eligibility',
  'Anomaly detection',
  'Pattern recognition',
  'Fault diagnosis with evidence',
  'Decision — severity, confidence, impact, action',
  'Maintenance feedback and label confirmation',
] as const;
