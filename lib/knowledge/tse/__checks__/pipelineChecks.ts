/**
 * End-to-end checks for the twin-screw pipeline.
 *
 *   npm run check:tse-pipeline
 *
 * This is the validation that channel values actually drive a diagnosis. Each
 * scenario sets the machine's instruments to particular readings and asserts
 * what the DOC-02 → DOC-03 → DOC-04 chain concludes — the same thing you would
 * do by hand in channel configuration, but deterministic and repeatable.
 *
 * Six scenarios, chosen because each proves a different part of the chain and
 * each would be a plausible real event:
 *
 *   1  healthy production            → NO_FAULT
 *   2  screen restriction            → localised, screen named
 *   3  restriction, one pressure tap → NOT localised, honest about why
 *   4  failing transmitter           → INSTRUMENTATION_SUSPECT, not a fault
 *   5  out-of-range reading          → BAD quality, diagnosis suppressed
 *   6  machine stopped               → no production anomalies at all
 */

import { analyseReadings, type TagReading } from '../pipeline';
import { evaluateQuality } from '../../doc02/dataQuality';
import { qualityConfigFor } from '../commissioning';
import { signalForTag } from '../signalBinding';
import type { TwinScrewTag } from '../../../twinScrewExtruderPoints';

let failures = 0;
function check(name: string, condition: boolean, detail?: string) {
  if (condition) console.log(`  PASS  ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? ` — got: ${detail}` : ''}`);
  }
}

const NOW = Date.parse('2026-09-18T12:00:00Z');

const UNITS: Partial<Record<TwinScrewTag, string>> = {
  'TS-S1': 'rpm', 'TS-S2': 'rpm', 'TS-E1': 'rpm', 'TS-PM1': 'kW',
  'TS-F1': 'kg/h', 'TS-F2': 'kg/h', 'TS-L1': 'percent',
  'TS-P1': 'MPa', 'TS-P2': 'MPa', 'TS-P3': 'MPa', 'TS-P4': 'MPa', 'TS-PV': 'MPa',
  'TS-TM': 'degC', 'TS-TV': 'degC', 'TS-TT0': 'degC',
  'TS-T1': 'degC', 'TS-T2': 'degC', 'TS-T3': 'degC',
  'TS-V1': 'mm/s RMS', 'TS-V2': 'mm/s RMS', 'TS-V3': 'mm/s RMS',
  'TS-TZ1': 'degC', 'TS-TZ2': 'degC', 'TS-TZ3': 'degC', 'TS-TZ4': 'degC',
  'TS-TZ5': 'degC', 'TS-TZ6': 'degC', 'TS-TZ7': 'degC',
};

/** Build a reading exactly as the channel adapter would, quality included. */
function reading(tag: TwinScrewTag, value: number | null, history?: number[]): TagReading {
  const unit = UNITS[tag] ?? '';
  const quality = evaluateQuality({
    sample: {
      signalId: tag,
      value,
      unit,
      sourceTimestampMs: NOW,
      receivedAtMs: NOW,
      history,
    },
    config: qualityConfigFor(tag),
    nowMs: NOW,
    mandatory: signalForTag(tag)?.priority === 'MANDATORY',
  });
  return { tag, label: tag, value, unit, raw: value, quality };
}

const MACHINE = {
  machineId: 'TSE-01',
  variantId: 'TSE-7Z-CR-INT-PAR-COMP',
  configurationVersion: 'CFG-DEV-1',
};

/** Steady production at the template baseline centres. */
function healthy(): TagReading[] {
  return [
    reading('TS-S1', 250), reading('TS-S2', 250), reading('TS-E1', 1450),
    reading('TS-PM1', 45), reading('TS-F1', 120), reading('TS-F2', 30),
    reading('TS-P1', 7.5), reading('TS-P2', 7.0), reading('TS-P3', 8.0), reading('TS-P4', 6.0),
    reading('TS-TM', 215), reading('TS-PV', 0.03),
    reading('TS-TZ1', 170), reading('TS-TZ2', 185), reading('TS-TZ3', 200), reading('TS-TZ4', 210),
    reading('TS-T1', 65), reading('TS-T2', 58), reading('TS-V1', 2.2),
  ];
}

const run = (readings: TagReading[]) => analyseReadings(MACHINE, readings, NOW);

// ---------------------------------------------------------------------------
console.log('\n--- 1. Healthy production ---');
const h = run(healthy());
check('the machine is in steady production', h.state.operatingState === 'ST-06', h.state.operatingState);
check('every signal is GOOD', h.quality.every((q) => q.verdict === 'GOOD'));
check('no anomaly fires', h.anomalies.every((a) => a.verdict === 'NOT_ANOMALOUS'));
check('the diagnosis is NO_FAULT', h.diagnosis.primaryDiagnosis === 'NO_FAULT', h.diagnosis.primaryDiagnosis);
check('and it is not escalated to DOC-05', h.diagnosis.sendToDoc05 === false);
check('the result is flagged as using uncalibrated limits', h.usesUncalibratedLimits === true);

// ---------------------------------------------------------------------------
console.log('\n--- 2. Screen restriction: inlet pressure rises, outlet does not ---');
const restricted = healthy().map((r) =>
  r.tag === 'TS-P3' ? reading('TS-P3', 14.0) : r.tag === 'TS-P4' ? reading('TS-P4', 5.5) : r,
);
const s2 = run(restricted);
check('pre-screen pressure is a high anomaly', s2.anomalies.find((a) => a.signalId === 'TS-P3')?.verdict === 'HIGH_ANOMALY');
check('the localised screen pattern matches', s2.diagnosis.patternId === 'P-002', String(s2.diagnosis.patternId));
check('the diagnosis names the screen', s2.diagnosis.primaryDiagnosis.toLowerCase().includes('screen'), s2.diagnosis.primaryDiagnosis);
check('it is escalated to DOC-05', s2.diagnosis.sendToDoc05 === true);
check('alternatives stay open', s2.diagnosis.alternativeDiagnoses.length >= 2);
check('a root-cause candidate is offered', s2.diagnosis.rootCauseCandidates.length >= 1);
check('WHY cites the evidence', s2.diagnosis.why.includes('TS-P3'));

// ---------------------------------------------------------------------------
console.log('\n--- 3. Same restriction, but post-screen pressure not reporting ---');
const oneTap = restricted.filter((r) => r.tag !== 'TS-P4');
const s3 = run(oneTap);
check('the screen can no longer be named', !s3.diagnosis.where.toLowerCase().includes('screen pack'), s3.diagnosis.where);
check(
  'and the diagnosis says why it cannot localise',
  s3.diagnosis.where.toLowerCase().includes('not resolved') || s3.diagnosis.missingEvidence.length > 0,
);

// ---------------------------------------------------------------------------
console.log('\n--- 4. Failing pressure transmitter: pressure high, nothing else agrees ---');
const failingTx = healthy().map((r) =>
  r.tag === 'TS-P3' ? reading('TS-P3', 28) : r.tag === 'TS-F1' ? reading('TS-F1', 0) : r.tag === 'TS-PM1' ? reading('TS-PM1', 2) : r,
);
const s4 = run(failingTx);
check('the instrument is suspected, not the process', s4.diagnosis.primaryDiagnosis === 'INSTRUMENTATION_SUSPECT', s4.diagnosis.primaryDiagnosis);
check('and it is not scored as a machine condition', s4.diagnosis.sendToDoc05 === false);
check('it points at instrumentation faults', s4.diagnosis.faultCandidates.every((id) => id.startsWith('TSE-INST')));

// ---------------------------------------------------------------------------
console.log('\n--- 5. Out-of-range reading: 900 degC on a 400 degC transmitter ---');
const outOfRange = healthy().map((r) => (r.tag === 'TS-TZ4' ? reading('TS-TZ4', 900) : r));
const s5 = run(outOfRange);
const z4 = s5.quality.find((q) => q.signalId === 'TS-TZ4');
check('the zone reading is BAD', z4?.verdict === 'BAD', z4?.verdict);
check('and it is called a calibration problem', z4?.findings.some((f) => f.ruleId === 'DQ-003') === true);
check(
  'it is a data-quality suspect rather than a thermal anomaly',
  s5.anomalies.find((a) => a.signalId === 'TS-TZ4')?.verdict === 'DATA_QUALITY_SUSPECT',
  s5.anomalies.find((a) => a.signalId === 'TS-TZ4')?.verdict,
);
check('a mandatory BAD signal suppresses physical diagnosis', z4?.suppressesPhysicalDiagnosis === true);

// ---------------------------------------------------------------------------
console.log('\n--- 6. Machine stopped: zero speed, zero feed ---');
const stopped = healthy().map((r) =>
  r.tag === 'TS-S1' ? reading('TS-S1', 0) : r.tag === 'TS-S2' ? reading('TS-S2', 0) : r.tag === 'TS-F1' ? reading('TS-F1', 0) : r,
);
const s6 = run(stopped);
check('the machine reads as stopped', s6.state.operatingState === 'ST-01', s6.state.operatingState);
check(
  'no production anomaly is declared in a non-production state',
  s6.anomalies.every((a) => a.verdict !== 'HIGH_ANOMALY' && a.verdict !== 'LOW_ANOMALY'),
);
check('and the anomalies say the state does not support the comparison', s6.anomalies.some((a) => a.blockedAtGate === 'OPERATING_STATE'));

// ---------------------------------------------------------------------------
console.log('\n--- Signal gap reported to the operator ---');
check('the unbound mandatory signals are listed', h.unboundMandatory.length > 0, String(h.unboundMandatory.length));
check('and the zone setpoints are among them', h.unboundMandatory.some((s) => s.includes('Setpoint')));

if (failures > 0) {
  console.log(`\n${failures} CHECK(S) FAILED\n`);
  process.exit(1);
}
console.log('\nALL CHECKS PASSED\n');
