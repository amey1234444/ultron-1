/**
 * Checks for the DOC-02 layer.
 *
 *   npm run check:doc02
 *
 * Exit code is non-zero if anything fails.
 *
 * As with the DOC-01 checks, what is worth asserting is not that the tables
 * were typed in correctly but the rules the document states as rules, each of
 * which fails silently rather than loudly if it is broken:
 *
 *   §14  the state engine outputs UNKNOWN rather than guessing
 *   §4   an explicit control state beats an inferred one
 *   §22  a BAD mandatory signal suppresses physical diagnosis
 *   §25  a limit that clears where it enters is refused
 *   §27  an incomplete context cannot select a baseline
 *   §35  a closed configuration version is never reopened
 *
 * Nothing is re-implemented. Every assertion imports the shipped module.
 */

import {
  baselineLearningAllowed,
  baselineSelectable,
  buildContext,
  composeCanonicalTag,
  contextConfidence,
  coverageAgainst,
  DOC02_OPERATING_STATES,
  DOC02_SIGNAL_MASTER,
  emptyHysteresis,
  evaluateQuality,
  HistoricalIntegrityError,
  hysteresisProblems,
  inferOperatingState,
  instrumentationBlockers,
  isTrustworthy,
  missingMandatoryContext,
  orderingProblems,
  runDoc02Validation,
  signalsByPriority,
  stateIsUsableContext,
  supersedeVersion,
  worstQuality,
  type ConfigurationVersionRecord,
  type QualitySample,
  type StateThresholds,
} from '../index';
import { emptyMapping } from '../sourceMapping';

let failures = 0;
function check(name: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  PASS  ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? ` — got: ${detail}` : ''}`);
  }
}

const NOW = Date.parse('2026-09-18T12:00:00Z');

// ---------------------------------------------------------------------------
console.log('\n--- §15: the sensor master ---');

check('all sixty signals are declared', DOC02_SIGNAL_MASTER.length === 60, String(DOC02_SIGNAL_MASTER.length));
check('twenty-five are mandatory', signalsByPriority('MANDATORY').length === 25, String(signalsByPriority('MANDATORY').length));
check('fourteen are recommended', signalsByPriority('RECOMMENDED').length === 14, String(signalsByPriority('RECOMMENDED').length));
check('twenty are supporting', signalsByPriority('SUPPORTING').length === 20, String(signalsByPriority('SUPPORTING').length));
check('signal ids are unique', new Set(DOC02_SIGNAL_MASTER.map((s) => s.signalId)).size === 60);
check(
  'every signal carries a canonical tag, a location and an acquisition class',
  DOC02_SIGNAL_MASTER.every((s) => s.canonicalTag && s.canonicalLocation && s.acquisitionClass),
);
check(
  'the §29 tag pattern is machine.location.parameter',
  composeCanonicalTag('TSE01', 'BARREL.Z4', 'Zone Temperature Actual') === 'TSE01.BARREL.Z4.ZONE_TEMPERATURE_ACTUAL',
  composeCanonicalTag('TSE01', 'BARREL.Z4', 'Zone Temperature Actual'),
);
check(
  'a boolean run signal is classed as a state event, not a process value',
  DOC02_SIGNAL_MASTER.find((s) => s.signalId === 'D001')?.acquisitionClass === 'STATE_EVENT',
  DOC02_SIGNAL_MASTER.find((s) => s.signalId === 'D001')?.acquisitionClass,
);
check(
  'motor current prefers the drive, not an BLACKGATE sensor',
  DOC02_SIGNAL_MASTER.find((s) => s.signalId === 'D002')?.preferredSource === 'DRIVE_OR_DEDICATED_CONTROLLER',
  DOC02_SIGNAL_MASTER.find((s) => s.signalId === 'D002')?.preferredSource,
);

const noCoverage = coverageAgainst(() => false);
check('a machine measuring nothing reports every mandatory signal missing', noCoverage.missingMandatory.length === 25);
check('and reports zero mandatory coverage', noCoverage.mandatoryCoverage === 0);
const fullCoverage = coverageAgainst(() => true);
check('a machine measuring everything reports full coverage', fullCoverage.mandatoryCoverage === 1);

// ---------------------------------------------------------------------------
console.log('\n--- §22: data quality, and the instrumentation-first rule ---');

check('the worst verdict wins over an average', worstQuality(['GOOD', 'UNCERTAIN', 'BAD']) === 'BAD');
check('an empty finding set is GOOD', worstQuality([]) === 'GOOD');

const goodSample: QualitySample = {
  signalId: 'D002',
  value: 42,
  unit: 'A',
  sourceTimestampMs: NOW,
  receivedAtMs: NOW,
};
const goodQuality = evaluateQuality({ sample: goodSample, config: {}, nowMs: NOW, mandatory: true });
check('an unconfigured signal with a fresh value reports GOOD', goodQuality.verdict === 'GOOD', goodQuality.verdict);
check('and does not suppress diagnosis', goodQuality.suppressesPhysicalDiagnosis === false);

const missingQuality = evaluateQuality({
  sample: { ...goodSample, value: null },
  config: {},
  nowMs: NOW,
  mandatory: true,
});
check('a null value reports MISSING', missingQuality.verdict === 'MISSING', missingQuality.verdict);
check(
  'a MISSING mandatory signal suppresses physical diagnosis',
  missingQuality.suppressesPhysicalDiagnosis === true,
);
check(
  'and it says zero is never substituted',
  missingQuality.findings.some((f) => f.reason.includes('never substituted')),
);

const outOfRange = evaluateQuality({
  sample: { ...goodSample, value: 900 },
  config: { rangeMin: 0, rangeMax: 100 },
  nowMs: NOW,
  mandatory: true,
});
check('a value outside the instrument range is BAD', outOfRange.verdict === 'BAD', outOfRange.verdict);
check(
  'and is called a calibration problem rather than a process value',
  outOfRange.findings.some((f) => f.ruleId === 'DQ-003' && f.reason.includes('calibration')),
);

const nearBoundary = evaluateQuality({
  sample: { ...goodSample, value: 99.9 },
  config: { rangeMin: 0, rangeMax: 100, rangeWarnFraction: 0.02 },
  nowMs: NOW,
  mandatory: true,
});
check('a value near the range boundary is UNCERTAIN, not BAD', nearBoundary.verdict === 'UNCERTAIN', nearBoundary.verdict);
check('and UNCERTAIN does not suppress diagnosis', nearBoundary.suppressesPhysicalDiagnosis === false);

const frozen = evaluateQuality({
  sample: { ...goodSample, history: [5, 5, 5, 5, 5, 5, 5, 5] },
  config: { flatlineSamples: 8 },
  nowMs: NOW,
  mandatory: true,
  contextChanging: true,
});
check('a channel frozen while the context changes is BAD', frozen.verdict === 'BAD', frozen.verdict);

const frozenQuiet = evaluateQuality({
  sample: { ...goodSample, history: [5, 5, 5, 5, 5, 5, 5, 5] },
  config: { flatlineSamples: 8 },
  nowMs: NOW,
  mandatory: true,
});
check('a flat channel in a quiet process is only UNCERTAIN', frozenQuiet.verdict === 'UNCERTAIN', frozenQuiet.verdict);

const openCircuit = evaluateQuality({
  sample: { ...goodSample, sensorDiagnostic: 'OPEN' },
  config: {},
  nowMs: NOW,
  mandatory: true,
});
check('an open-circuit diagnostic is BAD', openCircuit.verdict === 'BAD');
check(
  'the instrumentation gate returns the blockers to report instead',
  instrumentationBlockers([goodQuality, openCircuit]).length === 1,
);
check(
  'a BAD non-mandatory signal does not suppress diagnosis',
  evaluateQuality({ sample: { ...goodSample, sensorDiagnostic: 'OPEN' }, config: {}, nowMs: NOW, mandatory: false })
    .suppressesPhysicalDiagnosis === false,
);

// A check with no configuration must not invent a bound.
check(
  'an unconfigured range check reports nothing rather than guessing',
  evaluateQuality({ sample: { ...goodSample, value: 1e9 }, config: {}, nowMs: NOW, mandatory: true }).verdict === 'GOOD',
);

// ---------------------------------------------------------------------------
console.log('\n--- §4 / §14: the operating state engine ---');

check('all thirteen states are declared', DOC02_OPERATING_STATES.length === 13, String(DOC02_OPERATING_STATES.length));
check('only steady production permits baseline learning', DOC02_OPERATING_STATES.filter((s) => s.baselineLearning).length === 1);
check('and that state is ST-06', baselineLearningAllowed('ST-06') === true);
check('an unrecognised state does not permit it', baselineLearningAllowed('ST-99') === false);
check('UNKNOWN does not permit it', baselineLearningAllowed('ST-00') === false);

const thresholds: StateThresholds = {
  zeroRpm: 1,
  zeroFeed: 0.5,
  minProductionFeed: 5,
  readyBandDegC: 5,
  warmUpSlopeDegCPerMin: 0.5,
};

const noEvidence = {
  motorRunning: null,
  screwRpm: null,
  feedRate: null,
  torque: null,
  meltPressure: null,
  zoneSetpointError: null,
  zoneTemperatureSlope: null,
  heaterActive: null,
  processStable: null,
  evidenceQuality: 'GOOD' as const,
};

const noThresholds = inferOperatingState({ explicit: {}, evidence: noEvidence, thresholds: null, nowMs: NOW });
check('with no thresholds the engine returns UNKNOWN', noThresholds.operatingState === 'ST-00', noThresholds.operatingState);
check('and names the missing configuration', (noThresholds.unknownReason ?? '').includes('thresholds'));
check('and reports zero confidence', noThresholds.stateConfidence === 0);

const noSignals = inferOperatingState({ explicit: {}, evidence: noEvidence, thresholds, nowMs: NOW });
check('with no mandatory signals the engine returns UNKNOWN', noSignals.operatingState === 'ST-00');
check('and names which signals are unmapped', (noSignals.unknownReason ?? '').includes('Screw RPM'));

const running = {
  ...noEvidence,
  motorRunning: true,
  screwRpm: 250,
  feedRate: 120,
  processStable: true,
};
const steady = inferOperatingState({ explicit: {}, evidence: running, thresholds, nowMs: NOW });
check('a stable producing machine is STEADY_PRODUCTION', steady.operatingState === 'ST-06', steady.operatingState);
check('and it carries evidence', steady.stateEvidence.length > 0);
check('and a start time and duration', steady.stateStartTime !== null && steady.stateDurationMs !== null);

// §4 STATE PRIORITY RULE.
const tripped = inferOperatingState({ explicit: { tripActive: true }, evidence: running, thresholds, nowMs: NOW });
check(
  'an explicit trip beats an inferred steady production',
  tripped.operatingState === 'ST-09',
  tripped.operatingState,
);
check('and is marked as a forced transition', tripped.transitionType === 'FORCED');
check('and is authoritative at full confidence', tripped.stateConfidence === 1);

const maintenance = inferOperatingState({ explicit: { maintenanceActive: true }, evidence: running, thresholds, nowMs: NOW });
check('an explicit maintenance flag also beats inference', maintenance.operatingState === 'ST-10');

const badEvidence = inferOperatingState({
  explicit: {},
  evidence: { ...running, evidenceQuality: 'BAD' },
  thresholds,
  nowMs: NOW,
});
check('state inferred from BAD evidence returns UNKNOWN instead', badEvidence.operatingState === 'ST-00');
check('and says why', (badEvidence.unknownReason ?? '').includes('BAD'));

const uncertain = inferOperatingState({
  explicit: {},
  evidence: { ...running, evidenceQuality: 'UNCERTAIN' },
  thresholds,
  nowMs: NOW,
});
check('UNCERTAIN evidence still yields a state, at reduced confidence', uncertain.operatingState === 'ST-06' && uncertain.stateConfidence < 0.9);

const stopped = inferOperatingState({
  explicit: {},
  evidence: { ...noEvidence, motorRunning: false, screwRpm: 0, feedRate: 0 },
  thresholds,
  nowMs: NOW,
});
check('a still machine is STOPPED', stopped.operatingState === 'ST-01', stopped.operatingState);

const warming = inferOperatingState({
  explicit: {},
  evidence: { ...noEvidence, motorRunning: false, screwRpm: 0, feedRate: 0, heaterActive: true, zoneTemperatureSlope: 2 },
  thresholds,
  nowMs: NOW,
});
check('a still machine with rising zones is WARM_UP', warming.operatingState === 'ST-02', warming.operatingState);

const ready = inferOperatingState({
  explicit: {},
  evidence: { ...noEvidence, motorRunning: false, screwRpm: 0, feedRate: 0, zoneSetpointError: 1 },
  thresholds,
  nowMs: NOW,
});
check('a still machine at temperature is READY', ready.operatingState === 'ST-03', ready.operatingState);

const jump = inferOperatingState({
  explicit: {},
  evidence: running,
  thresholds,
  nowMs: NOW,
  previous: { ...stopped, operatingState: 'ST-01' },
});
check('STOPPED straight to STEADY_PRODUCTION is flagged as unexpected', jump.transitionType === 'UNEXPECTED', jump.transitionType);
check('UNKNOWN is not usable as context', stateIsUsableContext(noThresholds) === false);
check('a real state is usable as context', stateIsUsableContext(steady) === true);

// ---------------------------------------------------------------------------
console.log('\n--- §26 / §27: the context engine ---');

const fullContext = {
  machineId: 'TSE-01',
  machineVariant: 'TSE-7Z-CR-INT-PAR-COMP',
  configurationVersion: 'SC-07',
  operatingState: 'ST-06' as const,
  recipeId: 'R-4471',
  screwRpm: 250,
  mainFeedRate: 120,
};

check('a complete context has no missing dimensions', missingMandatoryContext(fullContext).length === 0);
check('and a context id', buildContext(fullContext).contextId !== null);
check('and full confidence', buildContext(fullContext).confidence === 1);
check('and can select a baseline', baselineSelectable(buildContext(fullContext)).ok === true);

const noRecipe = buildContext({ ...fullContext, recipeId: null });
check('a missing recipe leaves no context id', noRecipe.contextId === null);
check('and lowers confidence', noRecipe.confidence < 1, String(noRecipe.confidence));
check('and blocks baseline selection', baselineSelectable(noRecipe).ok === false);
check('and says which dimension is missing', (baselineSelectable(noRecipe).reason ?? '').includes('recipeId'));

const unknownState = buildContext({ ...fullContext, operatingState: 'ST-00' });
check('an UNKNOWN state cannot claim a high-confidence baseline', unknownState.confidence < 0.5, String(unknownState.confidence));
check('and is refused a baseline', baselineSelectable(unknownState).ok === false);

const startup = buildContext({ ...fullContext, operatingState: 'ST-04' });
check('a startup context is refused a production baseline', baselineSelectable(startup).ok === false);
check(
  'and says startup is not comparable with production',
  (baselineSelectable(startup).reason ?? '').includes('not comparable'),
);

const newRecipe = contextConfidence({ ...fullContext, recipeIsNew: true });
check('a new recipe reduces confidence', newRecipe.confidence < 1);
check('and explains why', newRecipe.reasons.some((r) => r.includes('new')));

const changedConfig = contextConfidence({ ...fullContext, configurationChanged: true });
check('a changed configuration reduces confidence', changedConfig.confidence < 1);
check(
  'and warns the old baseline must not be reused',
  changedConfig.reasons.some((r) => r.includes('must not be reused')),
);

// §27: RPM is carried as a number, not pre-binned — banding is DOC-03's call.
check('RPM is carried unbinned', buildContext(fullContext).screwRpm === 250);

// ---------------------------------------------------------------------------
console.log('\n--- §25: persistence and hysteresis ---');

const bare = emptyHysteresis('HY-001', 'TSE01.PROCESS.PRE_SCREEN.PRESSURE');
check('an undeclared hysteresis config is not usable', hysteresisProblems(bare, 'HIGH').length > 0);
check(
  'and it says an approving authority is required',
  hysteresisProblems(bare, 'HIGH').some((p) => p.includes('approving authority')),
);

const chattering = { ...bare, enterThreshold: 90, clearThreshold: 90, sourceAuthority: 'Plant', approvedBy: 'Eng' };
check(
  'a limit that clears where it enters is refused as chatter',
  hysteresisProblems(chattering, 'HIGH').some((p) => p.includes('chatter')),
);

const stuck = { ...bare, enterThreshold: 90, clearThreshold: 95, sourceAuthority: 'Plant', approvedBy: 'Eng' };
check(
  'a limit that can never clear is refused',
  hysteresisProblems(stuck, 'HIGH').some((p) => p.includes('never clear')),
);

const sane = { ...bare, enterThreshold: 90, clearThreshold: 87, sourceAuthority: 'Plant', approvedBy: 'Eng' };
check('a properly separated limit is accepted', hysteresisProblems(sane, 'HIGH').length === 0);

check(
  'an anomaly threshold beyond the approved alert is reported',
  orderingProblems([
    { concept: 'ANOMALY_THRESHOLD', value: 95, unit: 'bar', direction: 'HIGH' },
    { concept: 'ALERT', value: 90, unit: 'bar', direction: 'HIGH' },
  ]).length === 1,
);
check(
  'a correctly ordered set is accepted',
  orderingProblems([
    { concept: 'ANOMALY_THRESHOLD', value: 84, unit: 'bar', direction: 'HIGH' },
    { concept: 'ALERT', value: 90, unit: 'bar', direction: 'HIGH' },
    { concept: 'DANGER', value: 110, unit: 'bar', direction: 'HIGH' },
  ]).length === 0,
);

// ---------------------------------------------------------------------------
console.log('\n--- §30 / §35: mapping validation and historical integrity ---');

const mapping = emptyMapping('D002', 'TSE01.DRIVE.MOTOR.MOTOR_CURRENT');
check('a freshly entered mapping is not trustworthy', isTrustworthy(mapping) === false);
check('a site-tested mapping is', isTrustworthy({ ...mapping, validationStatus: 'SITE_TESTED' }) === true);
check('a bench-tested mapping is not', isTrustworthy({ ...mapping, validationStatus: 'BENCH_TESTED' }) === false);

const v1: ConfigurationVersionRecord = {
  versionId: 'CFG-1',
  effectiveFrom: '2026-01-01T00:00:00Z',
  effectiveTo: null,
  changeReason: 'Initial',
  approvedBy: 'Eng',
  invalidatesBaselines: false,
};
const superseded = supersedeVersion(v1, {
  versionId: 'CFG-2',
  effectiveFrom: '2026-06-01T00:00:00Z',
  changeReason: 'Screw configuration changed',
  approvedBy: 'Eng',
  invalidatesBaselines: true,
});
check('superseding closes the old version rather than deleting it', superseded.closed?.effectiveTo === '2026-06-01T00:00:00Z');
check('and the old version keeps its own start date', superseded.closed?.effectiveFrom === v1.effectiveFrom);
check('and the new one is open', superseded.opened.effectiveTo === null);

let reopenRefused = false;
try {
  supersedeVersion(superseded.closed, { ...superseded.opened, versionId: 'CFG-3' });
} catch (error) {
  reopenRefused = error instanceof HistoricalIntegrityError;
}
check('a closed version can never be reopened', reopenRefused);

let backdateRefused = false;
try {
  supersedeVersion(v1, {
    versionId: 'CFG-0',
    effectiveFrom: '2025-01-01T00:00:00Z',
    changeReason: 'Backdated',
    approvedBy: 'Eng',
    invalidatesBaselines: false,
  });
} catch (error) {
  backdateRefused = error instanceof HistoricalIntegrityError;
}
check('a version cannot start before the one it replaces', backdateRefused);

// ---------------------------------------------------------------------------
console.log('\n--- §37: the deployment checklist ---');

const validation = runDoc02Validation();
check('all fifteen checks run', validation.length === 15, String(validation.length));
check('an uncommissioned deployment does not pass', validation.some((r) => r.status === 'FAIL'));
check(
  'every failing check says what would satisfy it',
  validation.filter((r) => r.status === 'FAIL').every((r) => r.detail.length > 40),
);
check(
  'hysteresis is NOT_APPLICABLE rather than failing when nothing is configured',
  validation.find((r) => r.checkId === 'D2-11')?.status === 'NOT_APPLICABLE',
);
check(
  'the handover check does not claim DOC-03 readiness',
  validation.find((r) => r.checkId === 'D2-15')?.status === 'FAIL',
);

const commissioned = runDoc02Validation({
  machineId: 'TSE-01',
  variantId: 'TSE-7Z-CR-INT-PAR-COMP',
  configurationDeclared: true,
});
check(
  'declaring identity turns the first check green',
  commissioned.find((r) => r.checkId === 'D2-01')?.status === 'PASS',
);

// ---------------------------------------------------------------------------
if (failures > 0) {
  console.log(`\n${failures} CHECK(S) FAILED\n`);
  process.exit(1);
}
console.log('\nALL CHECKS PASSED\n');
