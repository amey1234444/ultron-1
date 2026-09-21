/**
 * BLACKGATE DOC-05 — the decision engine.
 *
 * DOC-04 says what is wrong. DOC-05 says how serious it is, how sure we are,
 * what it affects, how urgently to respond, and what to do — five answers that
 * §3 insists must never be collapsed into one another.
 *
 * The three rules this layer exists to hold:
 *
 *   §5   hard limits always win. A learned anomaly never redefines plant
 *        severity, and a trip is DANGER whatever the analytics conclude.
 *   §16  low confidence with high severity stays high severity. Weak evidence
 *        changes the action to urgent verification; it never downgrades the
 *        condition. `decide` computes severity before it consults confidence,
 *        so the wrong behaviour is not expressible.
 *   §23  priority is a class, never a deadline. Response times come from
 *        customer and OEM policy and are not hard-coded anywhere here.
 */

export * from './types';
export * from './engine';
export * from './validation';

export const DOC05_DOCUMENT_REF = 'BLACKGATE-TSE-DOC-05';

/** DOC-05 §44, the modules this layer produces. */
export const DOC05_MODULES: readonly { module: string; responsibility: string }[] = [
  { module: 'Severity Engine', responsibility: 'Authority hierarchy, limit status, fault severity floor, progression.' },
  { module: 'Confidence Engine', responsibility: 'Evidence scoring; separate fault, location and root-cause confidence.' },
  { module: 'Impact Engine', responsibility: 'Equipment, process, production, quality, energy and safety; current versus potential.' },
  { module: 'Priority Engine', responsibility: 'Severity, confidence, impact, trend, criticality and redundancy into P1..P4.' },
  { module: 'Recommendation Engine', responsibility: 'Action level and the confirm / inspect / correct / verify / escalate sequence.' },
  { module: 'Decision Object', responsibility: 'The §40 output with its §41 explainability.' },
] as const;
