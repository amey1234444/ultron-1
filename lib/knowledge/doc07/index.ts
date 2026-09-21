/**
 * BLACKGATE DOC-07 — the complete anomaly and fault knowledge library.
 *
 * DOC-07 is the reference companion to DOC-04. Where DOC-04 defines the engine
 * — the gates, the evidence model, the diagnosis object — DOC-07 supplies the
 * catalogue those engines reason over: forty named anomalies with their
 * detection rules, and the ninety faults expanded with what to check next.
 *
 * The forty anomalies are the part this codebase did not already have. DOC-04
 * produces a verdict; DOC-07 gives that verdict a stable identity such as
 * `A-PRES-H`, which is what DOC-07 §9 and DOC-06 §32 key their ML labels on.
 * The fault library itself is already implemented from DOC-04 §11 and is not
 * duplicated here — the ninety ids are identical and a second copy would be a
 * second thing to keep in step.
 *
 * DOC-07 §2's argument governs the whole library: an anomaly boundary is a
 * contextual envelope or a model residual, never a fixed number. Every
 * `primaryBoundary` in the library says so, and a check asserts that none of
 * them is a bare numeric.
 */

export * from './anomalies';

export const DOC07_DOCUMENT_REF = 'BLACKGATE-TSE-DOC-07';

/** DOC-07 §6, the instrumentation-first rule, restated where the library lives. */
export const INSTRUMENTATION_FIRST_RULE =
  'When evidence is internally inconsistent, the measurement chain is the suspect before the machine. A physical diagnosis is withheld until the sensor, port, wiring, scaling and timestamp have been cleared.';

/** DOC-07 §7, the multi-fault and causal-chain rule. */
export const CAUSAL_CHAIN_RULE =
  'A causal chain is one diagnosis with its symptoms grouped beneath it, not several faults. Genuinely independent faults stay independent, and an instrumentation fault is never absorbed into a physical chain.';
