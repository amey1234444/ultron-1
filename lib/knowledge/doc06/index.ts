/**
 * ULTRON DOC-06 — verification and ML dataset architecture.
 *
 * DOC-06 is a test specification, so it is implemented in two halves. The
 * specification itself is `testSpec.ts`; the cases that actually execute
 * against the shipped pipeline are `__checks__/doc06Checks.ts`, run by
 * `npm run check:doc06`. A test matrix nobody executes is a document rather
 * than a verification, so the second half is where the value is.
 *
 * Two parts of DOC-06 are deliberately not implemented, because implementing
 * them would mean asserting against nothing:
 *
 *   §23–§26  the DOC-05 decision-engine tests. DOC-05 has not been supplied,
 *            so there is no severity, confidence, impact or priority to test.
 *   §30–§34  the ML dataset tests. No dataset exists, and every case currently
 *            declared is synthetic and marked ML-ineligible for that reason.
 *
 * Both are named here rather than quietly omitted, so the gap is legible.
 */

export * from './testSpec';

export const DOC06_DOCUMENT_REF = 'ULTRON-TSE-DOC-06';

/** Parts of DOC-06 that cannot be implemented yet, and why. */
export const DOC06_UNIMPLEMENTED: readonly { section: string; reason: string }[] = [
  {
    section: '§23–§26 Decision engine tests',
    reason: 'DOC-05 has not been supplied, so there is no severity, confidence, impact or priority logic to verify.',
  },
  {
    section: '§30–§34 ML dataset and label taxonomy',
    reason:
      'No training dataset exists. Every declared case is synthetic and marked ML-ineligible, which is the correct state before a machine has produced confirmed history.',
  },
] as const;
