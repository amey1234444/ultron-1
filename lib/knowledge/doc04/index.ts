/**
 * BLACKGATE DOC-04 — anomaly, pattern and fault diagnosis, as code.
 *
 * DOC-04 §22 names the modules this layer produces. They are:
 *
 *   Anomaly Engine            engine.ts   §3, §3.1
 *   No-Fault Context Library  engine.ts   §6 (gate 8)
 *   Pattern Engine            faults.ts   §7
 *   Fault Library             faults.ts   §11, 90 faults
 *   Evidence Engine           engine.ts   §18
 *   Location Engine           engine.ts   §16
 *   Causal / Multi-Fault      engine.ts   §19
 *   Diagnosis Object          engine.ts   §21
 *
 * DOC-04 is complete, in its own words, "when BLACKGATE can explain why a
 * parameter is considered anomalous, can distinguish an expected operating
 * response from a real abnormal pattern, can compare competing fault
 * explanations, and can return a structured WHAT/WHERE/WHY diagnosis without
 * overstating the root cause."
 *
 * Every one of those four is a refusal as much as a capability, and each is
 * implemented as one: EXPECTED_PROCESS_RESPONSE, INSTRUMENTATION_SUSPECT,
 * alternatives kept rather than discarded, and FAULT_UNKNOWN.
 *
 * The boundary: severity, confidence, impact, priority and recommended action
 * are DOC-05's. Nothing here computes them.
 */

export * from './types';
export * from './faults';
export * from './engine';
export * from './validation';

export const DOC04_DOCUMENT_REF = 'BLACKGATE-TSE-DOC-04 v1.0';

/** DOC-04 §23, the ML label set this layer emits. */
export const ML_LABEL_FIELDS: readonly { field: string; example: string }[] = [
  { field: 'Anomaly', example: 'A-PRES-H' },
  { field: 'Pattern', example: 'P-002 LOCALIZED_SCREEN_RESTRICTION' },
  { field: 'Fault ID', example: 'TSE-DOWN-001' },
  { field: 'Fault Label', example: 'SCREEN_RESTRICTION' },
  { field: 'Location', example: 'DOWNSTREAM.SCREEN' },
  { field: 'Root Cause', example: 'SCREEN_CONTAMINATION' },
  { field: 'Confirmation', example: 'YES / NO / UNKNOWN' },
  { field: 'Case Type', example: 'REAL / SYNTHETIC / GOLDEN_TEST' },
] as const;

/** DOC-04 §25, what DOC-05 receives. */
export const DOC05_HANDOVER: readonly string[] = [
  'Anomaly states per signal, with the gate that decided each',
  'The abnormal pattern, where one matched',
  'Fault candidates, with alternatives kept rather than discarded',
  'A WHAT / WHERE / WHY package a maintainer can read',
  'Required, supporting, contradicting and missing evidence',
  'Whether the finding is a machine condition or an instrumentation problem',
] as const;
