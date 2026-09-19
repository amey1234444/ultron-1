/**
 * DOC-06 verification, executed.
 *
 *   npm run check:doc06
 *
 * DOC-06 is a test specification, so implementing it means running its cases
 * against the shipped pipeline rather than restating them. Each case below is
 * declared in the §3 standard format and then actually executed — the same
 * readings, the same engines, the same diagnosis an operator would see.
 *
 * Two DOC-06 rules are themselves asserted:
 *
 *   §2   a suite with only fault cases is incomplete. `coverageGaps` fails the
 *        run if HEALTHY, EXPECTED_CHANGE or DATA_QUALITY is absent.
 *   §18  every fault needs positive, negative, borderline, missing-evidence and
 *        look-alike cases. The full pack is provided for TSE-DOWN-001 and
 *        `minimumPackGaps` proves it is complete.
 *
 * What is deliberately not here: DOC-05 decision tests (§23–§26) and ML dataset
 * tests (§30–§34). DOC-05 has not been supplied and no dataset exists, so those
 * cases would assert against nothing.
 */

import { analyseReadings, type TagReading } from '../../tse/pipeline';
import { evaluateQuality } from '../../doc02/dataQuality';
import { qualityConfigFor } from '../../tse/commissioning';
import { signalForTag } from '../../tse/signalBinding';
import { anomalyIdFor, DOC07_ANOMALIES, anomalyById } from '../../doc07/anomalies';
import type { TwinScrewTag } from '../../../twinScrewExtruderPoints';
import {
  coverageGaps,
  minimumPackGaps,
  UNKNOWN_FAULT_EXPECTATIONS,
  type TestCase,
} from '../testSpec';

let failures = 0;
function check(name: string, condition: boolean, detail?: string) {
  if (condition) console.log(`  PASS  ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? ` — got: ${detail}` : ''}`);
  }
}

const NOW = Date.parse('2026-09-19T09:00:00Z');

const UNITS: Partial<Record<TwinScrewTag, string>> = {
  'TS-S1': 'rpm', 'TS-S2': 'rpm', 'TS-E1': 'rpm', 'TS-PM1': 'kW',
  'TS-F1': 'kg/h', 'TS-F2': 'kg/h',
  'TS-P1': 'MPa', 'TS-P2': 'MPa', 'TS-P3': 'MPa', 'TS-P4': 'MPa', 'TS-PV': 'MPa',
  'TS-TM': 'degC', 'TS-TZ1': 'degC', 'TS-TZ2': 'degC', 'TS-TZ3': 'degC', 'TS-TZ4': 'degC',
  'TS-T1': 'degC', 'TS-T2': 'degC', 'TS-V1': 'mm/s RMS',
};

function reading(tag: TwinScrewTag, value: number | null, history?: number[]): TagReading {
  const unit = UNITS[tag] ?? '';
  const quality = evaluateQuality({
    sample: { signalId: tag, value, unit, sourceTimestampMs: NOW, receivedAtMs: NOW, history },
    config: qualityConfigFor(tag),
    nowMs: NOW,
    mandatory: signalForTag(tag)?.priority === 'MANDATORY',
  });
  return { tag, label: tag, value, unit, raw: value, quality };
}

const MACHINE = { machineId: 'TSE-01', variantId: 'TSE-7Z-CR-INT-PAR-COMP', configurationVersion: 'CFG-DEV-1' };

function healthy(): TagReading[] {
  return [
    reading('TS-S1', 250), reading('TS-S2', 250), reading('TS-E1', 1450), reading('TS-PM1', 45),
    reading('TS-F1', 120), reading('TS-F2', 30),
    reading('TS-P1', 7.5), reading('TS-P2', 7.0), reading('TS-P3', 8.0), reading('TS-P4', 6.0),
    reading('TS-TM', 215), reading('TS-PV', 0.03),
    reading('TS-TZ1', 170), reading('TS-TZ2', 185), reading('TS-TZ3', 200), reading('TS-TZ4', 210),
    reading('TS-T1', 65), reading('TS-T2', 58), reading('TS-V1', 2.2),
  ];
}

const run = (readings: TagReading[], commandedChange?: string) =>
  analyseReadings({ ...MACHINE, commandedChange: commandedChange ?? null }, readings, NOW);

/** The suite, in the DOC-06 §3 standard format. */
const CASES: TestCase[] = [
  {
    testCaseId: 'TC-TSE-HEALTHY-001',
    testClass: 'HEALTHY',
    machineVariant: 'TSE-7Z-CR-INT-PAR-COMP',
    configurationVersion: 'CFG-DEV-1',
    operatingState: 'STEADY_PRODUCTION',
    context: 'RPM250 | Feed120 | recipe unknown',
    intent: 'Normal production must not become a false fault.',
    expectedDiagnosis: 'NO_FAULT',
    acceptanceRule: 'primaryDiagnosis === NO_FAULT and no anomaly fires',
    source: 'SYNTHETIC',
    validationStatus: 'DRAFT',
    mlEligible: false,
    mlIneligibleReason: 'Synthetic values against uncalibrated baselines; not a real machine observation.',
  },
  {
    testCaseId: 'TC-TSE-EXPECTED-001',
    testClass: 'EXPECTED_CHANGE',
    machineVariant: 'TSE-7Z-CR-INT-PAR-COMP',
    configurationVersion: 'CFG-DEV-1',
    operatingState: 'STEADY_PRODUCTION',
    context: 'Feed raised 120 -> 170 kg/h by the operator',
    intent: 'A commanded feed increase that raises pressure is a context change, not a fault.',
    expectedDiagnosis: 'EXPECTED_PROCESS_RESPONSE, no fault',
    acceptanceRule: 'anomaly verdict === EXPECTED_PROCESS_RESPONSE and sendToDoc05 === false',
    source: 'ENGINEERING',
    validationStatus: 'DRAFT',
    mlEligible: false,
    mlIneligibleReason: 'Synthetic.',
  },
  {
    testCaseId: 'TC-TSE-FAULT-001',
    testClass: 'FAULT',
    minimumCase: 'POSITIVE',
    faultId: 'TSE-DOWN-001',
    machineVariant: 'TSE-7Z-CR-INT-PAR-COMP',
    configurationVersion: 'CFG-DEV-1',
    operatingState: 'STEADY_PRODUCTION',
    context: 'Pre-screen 8 -> 14 MPa, post-screen flat, feed and RPM stable',
    intent: 'A real screen restriction must be detected and localised.',
    expectedDiagnosis: 'P-002 Localized Screen Restriction',
    acceptanceRule: 'patternId === P-002 and the screen is named',
    source: 'ENGINEERING',
    validationStatus: 'DRAFT',
    mlEligible: false,
    mlIneligibleReason: 'Synthetic.',
  },
  {
    testCaseId: 'TC-TSE-FAULT-002',
    testClass: 'FAULT',
    minimumCase: 'NEGATIVE',
    faultId: 'TSE-DOWN-001',
    machineVariant: 'TSE-7Z-CR-INT-PAR-COMP',
    configurationVersion: 'CFG-DEV-1',
    operatingState: 'STEADY_PRODUCTION',
    context: 'Same pressure rise, but explained by a commanded feed increase',
    intent: 'Pressure explained by an intentional change must not be a restriction.',
    expectedDiagnosis: 'No restriction',
    acceptanceRule: 'patternId !== P-002',
    source: 'ENGINEERING',
    validationStatus: 'DRAFT',
    mlEligible: false,
    mlIneligibleReason: 'Synthetic.',
  },
  {
    testCaseId: 'TC-TSE-FAULT-003',
    testClass: 'FAULT',
    minimumCase: 'BORDERLINE',
    faultId: 'TSE-DOWN-001',
    machineVariant: 'TSE-7Z-CR-INT-PAR-COMP',
    configurationVersion: 'CFG-DEV-1',
    operatingState: 'STEADY_PRODUCTION',
    context: 'Pre-screen pressure just inside the anomaly band',
    intent: 'A value below the boundary must not fire.',
    expectedDiagnosis: 'NOT_ANOMALOUS',
    acceptanceRule: 'TS-P3 verdict === NOT_ANOMALOUS',
    source: 'ENGINEERING',
    validationStatus: 'DRAFT',
    mlEligible: false,
    mlIneligibleReason: 'Synthetic.',
  },
  {
    testCaseId: 'TC-TSE-FAULT-004',
    testClass: 'FAULT',
    minimumCase: 'MISSING_EVIDENCE',
    faultId: 'TSE-DOWN-001',
    machineVariant: 'TSE-7Z-CR-INT-PAR-COMP',
    configurationVersion: 'CFG-DEV-1',
    operatingState: 'STEADY_PRODUCTION',
    context: 'Restriction present, post-screen pressure unavailable',
    intent: 'Without the second tap the screen must not be named.',
    expectedDiagnosis: 'Restriction, location unresolved',
    acceptanceRule: 'missing evidence reported and the screen is not named',
    source: 'ENGINEERING',
    validationStatus: 'DRAFT',
    mlEligible: false,
    mlIneligibleReason: 'Synthetic.',
  },
  {
    testCaseId: 'TC-TSE-FAULT-005',
    testClass: 'FAULT',
    minimumCase: 'LOOK_ALIKE',
    faultId: 'TSE-DOWN-001',
    machineVariant: 'TSE-7Z-CR-INT-PAR-COMP',
    configurationVersion: 'CFG-DEV-1',
    operatingState: 'STEADY_PRODUCTION',
    context: 'High load with low melt temperature — high-viscosity behaviour',
    intent: 'A viscosity problem must not be diagnosed as a screen restriction.',
    expectedDiagnosis: 'P-006 High-Viscosity Behaviour',
    acceptanceRule: 'patternId !== P-002',
    source: 'ENGINEERING',
    validationStatus: 'DRAFT',
    mlEligible: false,
    mlIneligibleReason: 'Synthetic.',
  },
  {
    testCaseId: 'TC-TSE-DQ-001',
    testClass: 'DATA_QUALITY',
    machineVariant: 'TSE-7Z-CR-INT-PAR-COMP',
    configurationVersion: 'CFG-DEV-1',
    operatingState: 'STEADY_PRODUCTION',
    context: 'Pressure tag frozen at one value while the process runs',
    intent: 'A frozen tag must be an instrument finding, not a process fault.',
    expectedDiagnosis: 'Data-quality finding, no process fault',
    acceptanceRule: 'TS-P3 quality is not GOOD and no restriction is diagnosed',
    source: 'ENGINEERING',
    validationStatus: 'DRAFT',
    mlEligible: false,
    mlIneligibleReason: 'Synthetic.',
  },
];

// ---------------------------------------------------------------------------
console.log('\n--- §2: the suite itself must be complete ---');
const gaps = coverageGaps(CASES);
check('the suite covers every mandatory test class', gaps.length === 0, gaps.join(', '));
check('it is not fault-only', CASES.some((c) => c.testClass === 'HEALTHY') && CASES.some((c) => c.testClass === 'DATA_QUALITY'));

console.log('\n--- §18: the minimum pack for TSE-DOWN-001 ---');
const packGaps = minimumPackGaps(CASES, 'TSE-DOWN-001');
check('positive, negative, borderline, missing-evidence and look-alike are all present', packGaps.length === 0, packGaps.join(', '));

// ---------------------------------------------------------------------------
console.log('\n--- Executing the cases against the shipped pipeline ---');

// TC-TSE-HEALTHY-001
const healthyRun = run(healthy());
check('TC-TSE-HEALTHY-001 · normal production is not a fault', healthyRun.diagnosis.primaryDiagnosis === 'NO_FAULT', healthyRun.diagnosis.primaryDiagnosis);
check('TC-TSE-HEALTHY-001 · nothing is escalated', healthyRun.diagnosis.sendToDoc05 === false);

// TC-TSE-EXPECTED-001 — pressure and load up, but the operator raised feed.
const feedRaised = healthy().map((r) =>
  r.tag === 'TS-F1' ? reading('TS-F1', 170) : r.tag === 'TS-P3' ? reading('TS-P3', 13.0) : r.tag === 'TS-PM1' ? reading('TS-PM1', 60) : r,
);
const expectedRun = run(feedRaised, 'main feed raised from 120 to 170 kg/h');
check(
  'TC-TSE-EXPECTED-001 · the response is recognised as expected',
  expectedRun.anomalies.some((a) => a.verdict === 'EXPECTED_PROCESS_RESPONSE'),
);
check('TC-TSE-EXPECTED-001 · and no fault is raised', expectedRun.diagnosis.sendToDoc05 === false, expectedRun.diagnosis.primaryDiagnosis);

// TC-TSE-FAULT-001 — genuine restriction.
const restriction = healthy().map((r) =>
  r.tag === 'TS-P3' ? reading('TS-P3', 14.0) : r.tag === 'TS-P4' ? reading('TS-P4', 5.5) : r,
);
const faultRun = run(restriction);
check('TC-TSE-FAULT-001 · the restriction is detected', faultRun.diagnosis.patternId === 'P-002', String(faultRun.diagnosis.patternId));
check('TC-TSE-FAULT-001 · and the screen is named', faultRun.diagnosis.primaryDiagnosis.toLowerCase().includes('screen'));

// TC-TSE-FAULT-002 — the same readings, explained.
const explained = run(restriction, 'main feed raised from 120 to 170 kg/h');
check('TC-TSE-FAULT-002 · an explained rise is not a restriction', explained.diagnosis.patternId !== 'P-002', String(explained.diagnosis.patternId));

// TC-TSE-FAULT-003 — just inside the band. Baseline 8.0, sd 1.2, anomaly at 3 robust units.
const borderline = healthy().map((r) => (r.tag === 'TS-P3' ? reading('TS-P3', 10.2) : r));
const borderlineRun = run(borderline);
check(
  'TC-TSE-FAULT-003 · a value inside the boundary does not fire',
  borderlineRun.anomalies.find((a) => a.signalId === 'TS-P3')?.verdict === 'NOT_ANOMALOUS',
  borderlineRun.anomalies.find((a) => a.signalId === 'TS-P3')?.verdict,
);

// TC-TSE-FAULT-004 — no second tap.
const oneTap = run(restriction.filter((r) => r.tag !== 'TS-P4'));
check('TC-TSE-FAULT-004 · the screen is not named without the second tap', !oneTap.diagnosis.where.toLowerCase().includes('screen pack'), oneTap.diagnosis.where);
check('TC-TSE-FAULT-004 · and the missing evidence is reported', oneTap.diagnosis.missingEvidence.length > 0);

// TC-TSE-FAULT-005 — look-alike: high load, cold melt.
const viscous = healthy().map((r) =>
  r.tag === 'TS-PM1' ? reading('TS-PM1', 70) : r.tag === 'TS-TM' ? reading('TS-TM', 180) : r,
);
const viscousRun = run(viscous);
check('TC-TSE-FAULT-005 · viscosity is not diagnosed as a screen restriction', viscousRun.diagnosis.patternId !== 'P-002', String(viscousRun.diagnosis.patternId));

// TC-TSE-DQ-001 — frozen pressure tag.
const frozenHistory = [8.0, 8.0, 8.0, 8.0, 8.0, 8.0, 8.0, 8.0];
const frozen = healthy().map((r) => (r.tag === 'TS-P3' ? reading('TS-P3', 8.0, frozenHistory) : r));
const frozenRun = run(frozen);
const p3Quality = frozenRun.quality.find((q) => q.signalId === 'TS-P3');
check('TC-TSE-DQ-001 · a frozen tag is not GOOD', p3Quality?.verdict !== 'GOOD', p3Quality?.verdict);
check('TC-TSE-DQ-001 · and the flatline check is what caught it', p3Quality?.findings.some((f) => f.ruleId === 'DQ-004') === true);
check('TC-TSE-DQ-001 · no restriction is diagnosed from it', frozenRun.diagnosis.patternId !== 'P-002');

// ---------------------------------------------------------------------------
console.log('\n--- §22: unknown faults stay unknown ---');
check('the unknown-fault expectations are declared', UNKNOWN_FAULT_EXPECTATIONS.length === 4);
check(
  'a confirmed anomaly with no matching pattern returns FAULT_UNKNOWN',
  // Vibration far above baseline: a real anomaly that no declared pattern reads.
  run(healthy().map((r) => (r.tag === 'TS-V1' ? reading('TS-V1', 12) : r))).diagnosis.diagnosisState === 'FAULT_UNKNOWN',
  run(healthy().map((r) => (r.tag === 'TS-V1' ? reading('TS-V1', 12) : r))).diagnosis.diagnosisState,
);

// ---------------------------------------------------------------------------
console.log('\n--- DOC-07: anomalies carry a library identity ---');
check('forty anomalies are declared', DOC07_ANOMALIES.length === 40, String(DOC07_ANOMALIES.length));
check('anomaly ids are unique', new Set(DOC07_ANOMALIES.map((a) => a.anomalyId)).size === 40);
check('every anomaly declares a data-quality gate', DOC07_ANOMALIES.every((a) => a.dataQualityGate.length > 0));
check('every anomaly declares a context gate', DOC07_ANOMALIES.every((a) => a.contextGate.length > 0));
check('no anomaly boundary is a fixed number', DOC07_ANOMALIES.every((a) => !/^\d+(\.\d+)?$/.test(a.primaryBoundary.trim())));
check('a high pressure anomaly resolves to A-PRES-H', anomalyIdFor('TS-P3', 'HIGH_ANOMALY') === 'A-PRES-H');
check('a low pressure anomaly resolves to A-PRES-L', anomalyIdFor('TS-P3', 'LOW_ANOMALY') === 'A-PRES-L');
check('a vibration anomaly resolves to its own family', anomalyIdFor('TS-V1', 'HIGH_ANOMALY') === 'A-VIB-H', String(anomalyIdFor('TS-V1', 'HIGH_ANOMALY')));
check('an unmatched verdict is not forced onto a label', anomalyIdFor('TS-P3', 'NOT_ANOMALOUS') === undefined);
check('an unknown signal is not labelled', anomalyIdFor('TS-XX9', 'HIGH_ANOMALY') === undefined);
check('A-PRES-H carries its formula references', (anomalyById('A-PRES-H')?.formulaFeature ?? '').includes('F-COM'));

if (failures > 0) {
  console.log(`\n${failures} CHECK(S) FAILED\n`);
  process.exit(1);
}
console.log('\nALL CHECKS PASSED\n');
