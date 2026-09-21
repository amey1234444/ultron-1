/**
 * DOC-05 §45 validation tests, as data and as executable expectations.
 *
 * Ten scenarios the document names, each one a case where a plausible
 * implementation gets it wrong. They are declared here so the checks can run
 * them against the shipped engine, and so a reader can see what the engine is
 * required to do without reading the engine.
 *
 * Two are not executable from this layer and say so: D05-T07 and D05-T08 need
 * a maintenance feedback loop that does not exist yet, and D05-T09 needs a
 * customer SOP library nobody has supplied.
 */

export type Doc05TestExpectation = {
  testId: string;
  scenario: string;
  expected: string;
  /** False when the case needs something this deployment does not have. */
  executable: boolean;
  notExecutableReason?: string;
};

export const DOC05_VALIDATION_TESTS: readonly Doc05TestExpectation[] = [
  {
    testId: 'D05-T01',
    scenario: 'Pressure above the learned P99 but below the customer Alert',
    expected: 'Anomaly high; severity NOT automatically ALERT; advisory and monitoring logic.',
    executable: true,
  },
  {
    testId: 'D05-T02',
    scenario: 'Customer Alert exceeded',
    expected: 'Severity at least ALERT, regardless of the learned anomaly score.',
    executable: true,
  },
  {
    testId: 'D05-T03',
    scenario: 'Customer Danger exceeded',
    expected: 'Severity DANGER; cannot be downgraded.',
    executable: true,
  },
  {
    testId: 'D05-T04',
    scenario: 'Danger condition with low diagnosis confidence',
    expected: 'P1 or P2 urgent verification and escalation — not low priority.',
    executable: true,
  },
  {
    testId: 'D05-T05',
    scenario: 'Minor sensor drift with high confidence',
    expected: 'Low physical severity; scheduled calibration or inspection.',
    executable: true,
  },
  {
    testId: 'D05-T06',
    scenario: 'The same Alert on a redundant versus a non-redundant machine',
    expected: 'Same severity; different priority.',
    executable: true,
  },
  {
    testId: 'D05-T07',
    scenario: 'Action completed and values normalise',
    expected: 'Action status becomes VERIFIED; a confirmed-positive label is stored.',
    executable: false,
    notExecutableReason: 'Needs the action lifecycle and maintenance feedback loop of §36–§38, which is not implemented.',
  },
  {
    testId: 'D05-T08',
    scenario: 'A predicted screen restriction, but inspection finds sensor drift',
    expected: 'A false-positive label plus the actual instrumentation fault stored.',
    executable: false,
    notExecutableReason: 'Needs engineer feedback capture from §38–§39, which is not implemented.',
  },
  {
    testId: 'D05-T09',
    scenario: 'An approved customer SOP is mapped to the fault',
    expected: 'The recommendation references the SOP; a generic BLACKGATE action does not override it.',
    executable: false,
    notExecutableReason:
      'Needs a customer SOP library. The engine already marks its own output ULTRON_RECOMMENDATION so an approved procedure can outrank it, but there is no procedure to map.',
  },
  {
    testId: 'D05-T10',
    scenario: 'Rapid rate of change toward Danger, still below the absolute limit',
    expected: 'Priority escalates; time-to-limit shown only when the trend validity gate passes.',
    executable: true,
  },
] as const;

export function executableTests(): Doc05TestExpectation[] {
  return DOC05_VALIDATION_TESTS.filter((entry) => entry.executable);
}

export function blockedTests(): Doc05TestExpectation[] {
  return DOC05_VALIDATION_TESTS.filter((entry) => !entry.executable);
}
