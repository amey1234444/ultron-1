/**
 * Checks for the DOC-04 layer.
 *
 *   npm run check:doc04
 *
 * DOC-04 is mostly a set of refusals, so the checks assert the refusals:
 *
 *   §3 gate 1  BAD data never becomes a physical anomaly
 *   §3 gate 8  an expected context change is not a fault
 *   §17        an inconsistent instrument blocks the physical diagnosis
 *   §18        contradicting evidence is kept, not dropped
 *   §19        a causal chain is one diagnosis with symptoms
 *   §16        location is never more precise than the topology allows
 *   §20        an unexplained anomaly returns FAULT_UNKNOWN
 */

import {
  assessEvidence,
  CAUSAL_CHAINS,
  diagnose,
  diagnosisStateFor,
  DOC04_FAULTS,
  DOC04_PATTERNS,
  engineRefusalsWork,
  evaluateAnomaly,
  faultById,
  faultsByFamily,
  faultsEvaluableWith,
  faultsForState,
  groupCausalChain,
  instrumentationFirst,
  patternById,
  resolveLocation,
  runDoc04Validation,
  type EvidenceItem,
} from '../index';

let failures = 0;
function check(name: string, condition: boolean, detail?: string) {
  if (condition) console.log(`  PASS  ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? ` — got: ${detail}` : ''}`);
  }
}

console.log('\n--- §7/§11: the fault and pattern library ---');
check('ninety faults are declared', DOC04_FAULTS.length === 90, String(DOC04_FAULTS.length));
check('twelve abnormal patterns are declared', DOC04_PATTERNS.length === 12, String(DOC04_PATTERNS.length));
check('fault ids are unique', new Set(DOC04_FAULTS.map((f) => f.faultId)).size === 90);
check('all ten families are populated', new Set(DOC04_FAULTS.map((f) => f.family)).size === 10);
check('every fault declares required evidence', DOC04_FAULTS.every((f) => f.minimumRequiredEvidence.length > 0));
check('screen restriction resolves', faultById('TSE-DOWN-001')?.family === 'DOWNSTREAM');
check('the screen-restriction pattern resolves', patternById('P-002')?.name.includes('Screen') === true);
check('fourteen instrumentation faults exist', faultsByFamily('INSTRUMENTATION').length === 14, String(faultsByFamily('INSTRUMENTATION').length));

const steady = faultsForState('STEADY');
check('steady-state faults are selectable', steady.length > 30, String(steady.length));
check(
  'a warm-up-only fault is not offered in steady',
  !faultsForState('STEADY').some((f) => f.faultId === 'TSE-THERM-010'),
);
check(
  'an "ALL producing states" fault is offered in steady',
  faultsForState('STEADY').some((f) => f.faultId === 'TSE-FEED-005'),
);

const coverage = faultsEvaluableWith(() => false);
check('with no evidence nothing is evaluable', coverage.evaluable.length === 0 && coverage.unevaluable.length === 90);

console.log('\n--- §3: the anomaly gates ---');
const base = {
  signalId: 'PRESSURE',
  quality: 'GOOD' as const,
  stateApplicable: true,
  contextValid: true,
  baselineAvailable: true,
  symbolicState: 'HIGH_ANOMALY',
  persistenceSatisfied: true,
  rocAbnormal: false,
  expectedContextChange: null,
  limitStatus: 'NONE' as const,
};
check('a sustained out-of-envelope value is a high anomaly', evaluateAnomaly(base).verdict === 'HIGH_ANOMALY');
check('BAD data is a data-quality suspect, not an anomaly', evaluateAnomaly({ ...base, quality: 'BAD' }).verdict === 'DATA_QUALITY_SUSPECT');
check('and it names the gate that stopped it', evaluateAnomaly({ ...base, quality: 'BAD' }).blockedAtGate === 'DATA_QUALITY');
check('a wrong state is not evaluated', evaluateAnomaly({ ...base, stateApplicable: false }).verdict === 'NOT_EVALUATED');
check('no context is not evaluated', evaluateAnomaly({ ...base, contextValid: false }).verdict === 'NOT_EVALUATED');
check('no baseline is not evaluated', evaluateAnomaly({ ...base, baselineAvailable: false }).verdict === 'NOT_EVALUATED');
check('a non-persistent deviation is noise', evaluateAnomaly({ ...base, persistenceSatisfied: false }).verdict === 'NOT_ANOMALOUS');
check(
  'an expected context change is not an anomaly',
  evaluateAnomaly({ ...base, expectedContextChange: 'feed raised 20%' }).verdict === 'EXPECTED_PROCESS_RESPONSE',
);
check(
  'and it says a context change is not a fault',
  evaluateAnomaly({ ...base, expectedContextChange: 'feed raised 20%' }).reason.includes('not a fault'),
);
check(
  'an abnormal rate of change inside the envelope still flags',
  evaluateAnomaly({ ...base, symbolicState: 'NORMAL', rocAbnormal: true }).verdict === 'RISING_ABNORMAL',
);
check('limit status is kept separate from the anomaly verdict', evaluateAnomaly({ ...base, limitStatus: 'ALERT' }).limitStatus === 'ALERT');

console.log('\n--- §18: the evidence model ---');
const evidence: EvidenceItem[] = [
  { evidenceClass: 'REQUIRED', statement: 'Pressure HIGH', signalId: 'P', quality: 'GOOD' },
  { evidenceClass: 'SUPPORTING', statement: 'Torque HIGH', signalId: 'T', quality: 'GOOD' },
  { evidenceClass: 'CONTRADICTORY', statement: 'Melt temperature LOW', signalId: 'TM', quality: 'GOOD' },
  { evidenceClass: 'MISSING', statement: 'Post-screen pressure unavailable', signalId: null, quality: null },
];
const assessed = assessEvidence(evidence);
check('required and supporting evidence is collected', assessed.supporting.length === 2);
check('contradicting evidence is kept, not dropped', assessed.contradicting.length === 1);
check('missing evidence is reported explicitly', assessed.missing.length === 1);
check('required evidence is satisfied when present and GOOD', assessed.requiredSatisfied === true);
check(
  'BAD required evidence is not satisfied',
  assessEvidence([{ evidenceClass: 'REQUIRED', statement: 'P', signalId: 'P', quality: 'BAD' }]).requiredSatisfied === false,
);
check('a contradiction prevents PROBABLE', diagnosisStateFor(assessed, 3) === 'SUSPECTED', diagnosisStateFor(assessed, 3));
check(
  'strong consistent evidence reaches PROBABLE',
  diagnosisStateFor({ ...assessed, contradicting: [] }, 3) === 'PROBABLE',
);

console.log('\n--- §16/§17/§19: location, instrument-first, causal chains ---');
check(
  'one-sided pressure cannot localise to the screen',
  resolveLocation('Screen pack', { hasUpstreamPressure: true, hasDownstreamPressure: false }).precisionLimited === true,
);
check(
  'two-sided pressure can',
  resolveLocation('Screen pack', { hasUpstreamPressure: true, hasDownstreamPressure: true }).precisionLimited === false,
);
check(
  'an inconsistency is surfaced',
  instrumentationFirst([
    { observation: 'Pressure spiked and returned with torque unchanged', holds: true, interpretation: 'Sensor or port suspect.' },
    { observation: 'Other', holds: false, interpretation: 'n/a' },
  ]).length === 1,
);
check('causal chains are declared', CAUSAL_CHAINS.length >= 2);
const grouped = groupCausalChain(['TSE-DOWN-001']);
check('a screen restriction groups its symptoms', (grouped.grouped['TSE-DOWN-001'] ?? []).length === 4);
check('independent faults stay independent', groupCausalChain(['TSE-FEED-002', 'TSE-MECH-006']).primaries.length === 2);

console.log('\n--- §21: the diagnosis object ---');
const topology = { hasUpstreamPressure: true, hasDownstreamPressure: true };
const commonInput = {
  diagnosisId: 'DG-1',
  timestamp: '2026-09-18T12:00:00Z',
  machineId: 'TSE-01',
  configurationVersion: 'CFG-1',
  patternId: 'P-001',
  patternName: 'Increased Process Resistance',
  dataQuality: 'GOOD' as const,
  alternativeDiagnoses: ['Low melt temperature', 'High-viscosity material'],
  rootCauseCandidates: ['Screen contamination'],
  featureVersions: ['F-COM-010 v1.0'],
  topology,
};

const instrumentBlocked = diagnose({
  ...commonInput,
  anomalies: [evaluateAnomaly(base)],
  faultCandidates: ['TSE-DOWN-001'],
  evidence,
  inconsistencies: [{ observation: 'Pressure spiked with torque unchanged', holds: true, interpretation: 'Sensor suspect.' }],
});
check('an inconsistency blocks the physical diagnosis', instrumentBlocked.primaryDiagnosis === 'INSTRUMENTATION_SUSPECT');
check('and it is not scored by DOC-05 as a machine condition', instrumentBlocked.sendToDoc05 === false);
check('and it points at instrumentation faults', instrumentBlocked.faultCandidates.every((id) => id.startsWith('TSE-INST')));

const unexplained = diagnose({
  ...commonInput,
  anomalies: [evaluateAnomaly(base)],
  faultCandidates: [],
  evidence,
  inconsistencies: [],
});
check('an anomaly with no fitting fault returns FAULT_UNKNOWN', unexplained.diagnosisState === 'FAULT_UNKNOWN');
check('and does not invent a location', unexplained.where.includes('Not attributed'));
check('and is still passed to DOC-05', unexplained.sendToDoc05 === true);

const restriction = diagnose({
  ...commonInput,
  anomalies: [evaluateAnomaly(base)],
  faultCandidates: ['TSE-DOWN-001'],
  evidence,
  inconsistencies: [],
});
check('a supported restriction names the fault', restriction.primaryDiagnosis.includes('Screen'));
check('and groups its symptoms rather than listing four faults', restriction.groupedSymptoms.length === 4);
check('and keeps its alternatives', restriction.alternativeDiagnoses.length === 2);
check('and keeps the contradicting evidence visible', restriction.contradictingEvidence.length === 1);
check('and reports the missing evidence', restriction.missingEvidence.length === 1);
check('and carries WHAT / WHERE / WHY', restriction.what.length > 0 && restriction.where.length > 0 && restriction.why.length > 0);

const noAnomaly = diagnose({
  ...commonInput,
  anomalies: [evaluateAnomaly({ ...base, symbolicState: 'NORMAL' })],
  faultCandidates: [],
  evidence,
  inconsistencies: [],
});
check('no anomaly yields NO_FAULT', noAnomaly.primaryDiagnosis === 'NO_FAULT');
check('and is not sent to DOC-05', noAnomaly.sendToDoc05 === false);

const missingRequired = diagnose({
  ...commonInput,
  anomalies: [evaluateAnomaly(base)],
  faultCandidates: ['TSE-DOWN-001'],
  evidence: [{ evidenceClass: 'REQUIRED', statement: 'Pressure', signalId: 'P', quality: 'MISSING' }],
  inconsistencies: [],
});
check('missing required evidence yields INSUFFICIENT_EVIDENCE', missingRequired.diagnosisState === 'INSUFFICIENT_EVIDENCE');

console.log('\n--- §24: the pre-DOC-05 checklist ---');
const validation = runDoc04Validation();
check('all eleven checks run', validation.length === 11, String(validation.length));
check(
  'the engine-behaviour checks pass',
  validation.filter((r) => r.checkId !== 'D4-01').every((r) => r.status === 'PASS'),
  validation.filter((r) => r.status !== 'PASS').map((r) => r.checkId).join(','),
);
check('the unconfigured anomaly bounds are reported', validation.find((r) => r.checkId === 'D4-01')?.status === 'FAIL');
check('every engine refusal fires', engineRefusalsWork().every((r) => r.ok));

if (failures > 0) {
  console.log(`\n${failures} CHECK(S) FAILED\n`);
  process.exit(1);
}
console.log('\nALL CHECKS PASSED\n');
