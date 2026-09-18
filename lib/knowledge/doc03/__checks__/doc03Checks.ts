/**
 * Checks for the DOC-03 layer.
 *
 *   npm run check:doc03
 *
 * The rules worth asserting are the ones that fail silently:
 *
 *   §2   BAD input never becomes a valid-looking feature
 *   §12  a weak fallback never looks like exact-context history
 *   §14  eligibility is deterministic and lists every exclusion
 *   §28  a superseded baseline is never revived
 *   §37  a near-zero denominator returns null, not a huge number
 */

import {
  baselineConfidence,
  baselineIsUsable,
  BaselineLifecycleError,
  classifySymbolicState,
  classifyTrend,
  computeFeature,
  DOC03_FORMULAS,
  emptyBaseline,
  evaluateEligibility,
  formulasByCategory,
  formulasWithoutGuardrail,
  iqr,
  mad,
  mean,
  median,
  percentDeviation,
  percentile,
  propagateQuality,
  rateOfChangePerMinute,
  runDoc03Validation,
  selectBaseline,
  stdDev,
  transitionBaseline,
  zScore,
  type BaselineRecord,
  type EligibilityInput,
} from '../index';

let failures = 0;
function check(name: string, condition: boolean, detail?: string) {
  if (condition) console.log(`  PASS  ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? ` — got: ${detail}` : ''}`);
  }
}

console.log('\n--- §5/§6/§8: the formula library ---');
check('forty-nine formulas are declared', DOC03_FORMULAS.length === 49, String(DOC03_FORMULAS.length));
check('twenty-six are common', formulasByCategory('COMMON').length === 26, String(formulasByCategory('COMMON').length));
check('twenty-three are TSE-specific', formulasByCategory('TSE_SPECIFIC').length === 23);
check('formula ids are unique', new Set(DOC03_FORMULAS.map((f) => f.formulaId)).size === 49);
check('every formula carries a guardrail', formulasWithoutGuardrail().length === 0);
check('every formula carries a version', DOC03_FORMULAS.every((f) => f.version.length > 0));

console.log('\n--- The runnable core ---');
check('mean', mean([10, 12, 14]) === 12);
check('median of an odd window', median([72, 74, 75, 76, 110]) === 75);
check('median of an empty window is null, not zero', median([]) === null);
check('percentile interpolates', percentile([1, 2, 3, 4], 50) === 2.5, String(percentile([1, 2, 3, 4], 50)));
check('stdDev needs two samples', stdDev([5]) === null);
check('iqr is computed', iqr([1, 2, 3, 4, 5]) === 2, String(iqr([1, 2, 3, 4, 5])));
check('mad is computed', mad([1, 2, 3, 4, 100]) === 1, String(mad([1, 2, 3, 4, 100])));

// §37: never divide silently.
check('percent deviation against zero returns null', percentDeviation(10, 0) === null);
check('percent deviation against a real expected works', percentDeviation(92, 80) === 15);
check('z score with zero spread returns null rather than Infinity', zScore(5, 4, 0) === null);
check('z score with null spread returns null', zScore(5, 4, null) === null);
check('rate of change with a zero time delta returns null', rateOfChangePerMinute(1, 2, 1000, 1000) === null);
check('rate of change with a backwards delta returns null', rateOfChangePerMinute(1, 2, 2000, 1000) === null);
check('rate of change over a real minute works', rateOfChangePerMinute(95, 100, 0, 60_000) === 5);

console.log('\n--- §14: the eligibility gate ---');
const healthy: EligibilityInput = {
  dataQuality: 'GOOD',
  operatingState: 'ST-06',
  approvedStates: ['ST-06'],
  contextKnown: true,
  contextStable: true,
  activeAlertOrDanger: false,
  activeTrip: false,
  activeFaultOrStrongAnomaly: false,
  inMaintenanceOrTransition: false,
  configurationValid: true,
  sensorIssue: false,
};
check('a healthy steady window is eligible', evaluateEligibility(healthy).eligible === true);
check('BAD data is excluded', evaluateEligibility({ ...healthy, dataQuality: 'BAD' }).eligible === false);
check('a startup window is excluded from a steady baseline', evaluateEligibility({ ...healthy, operatingState: 'ST-04' }).eligible === false);
check('an active fault is excluded', evaluateEligibility({ ...healthy, activeFaultOrStrongAnomaly: true }).eligible === false);
check(
  'and it says a fault would be normalised',
  evaluateEligibility({ ...healthy, activeFaultOrStrongAnomaly: true }).exclusions[0].includes('normalised'),
);
check('a customer Alert is excluded', evaluateEligibility({ ...healthy, activeAlertOrDanger: true }).eligible === false);
check('an invalid configuration is excluded', evaluateEligibility({ ...healthy, configurationValid: false }).eligible === false);
const manyProblems = evaluateEligibility({
  ...healthy,
  dataQuality: 'BAD',
  activeTrip: true,
  sensorIssue: true,
});
check('every failing condition is listed, not just the first', manyProblems.exclusions.length === 3, String(manyProblems.exclusions.length));

console.log('\n--- §12: fallback selection and traceability ---');
const exact: BaselineRecord = {
  ...emptyBaseline('BL-1', 'PRESSURE', 'bar'),
  status: 'VALID',
  level: 'EXACT_CONTEXT',
  mean: 78,
  stdDev: 2,
  sampleCount: 500,
};
const template: BaselineRecord = {
  ...emptyBaseline('BL-2', 'PRESSURE', 'bar'),
  status: 'VALID',
  level: 'TEMPLATE_REFERENCE',
  mean: 70,
  stdDev: 5,
  sampleCount: 10,
};
const selected = selectBaseline([{ record: template, matchesContext: true }, { record: exact, matchesContext: true }]);
check('the strongest level wins regardless of order', selected.kind === 'selected' && selected.record.baselineId === 'BL-1');
check('and the level travels with it', selected.kind === 'selected' && selected.level === 'EXACT_CONTEXT');
check(
  'a mature exact-context baseline is HIGH confidence',
  selected.kind === 'selected' && selected.confidence === 'HIGH',
  selected.kind === 'selected' ? selected.confidence : selected.kind,
);
check(
  'a template reference is not HIGH confidence',
  baselineConfidence(template) === 'LOW',
  baselineConfidence(template),
);
check('no baselines selects nothing', selectBaseline([]).kind === 'none');
check(
  'an unusable baseline is not selected',
  selectBaseline([{ record: { ...exact, status: 'RETIRED' }, matchesContext: true }]).kind === 'none',
);
check('a NOT_AVAILABLE baseline is not usable', baselineIsUsable('NOT_AVAILABLE') === false);
check('a FROZEN baseline is still usable for comparison', baselineIsUsable('FROZEN') === true);

console.log('\n--- §26/§28: baseline lifecycle ---');
check('learning can become provisional', transitionBaseline({ ...exact, status: 'LEARNING' }, 'PROVISIONAL').status === 'PROVISIONAL');
let revivalRefused = false;
try {
  transitionBaseline({ ...exact, status: 'SUPERSEDED' }, 'VALID');
} catch (error) {
  revivalRefused = error instanceof BaselineLifecycleError;
}
check('a superseded baseline can never be revived', revivalRefused);
let retiredRefused = false;
try {
  transitionBaseline({ ...exact, status: 'RETIRED' }, 'LEARNING');
} catch (error) {
  retiredRefused = error instanceof BaselineLifecycleError;
}
check('a retired baseline can never be revived', retiredRefused);

console.log('\n--- §2/§38: the quality gate and propagation ---');
check('a feature is never stronger than its weakest input', propagateQuality(['GOOD', 'UNCERTAIN']) === 'UNCERTAIN');
check('one BAD input makes the feature BAD', propagateQuality(['GOOD', 'BAD', 'GOOD']) === 'BAD');
check('no inputs at all is MISSING', propagateQuality([]) === 'MISSING');

const bands = { deviationBand: 2, anomalyBand: 3, flatBand: 0.1 };
const badFeature = computeFeature(
  {
    featureId: 'TSE01.PROCESS.PRE_SCREEN.PRESSURE',
    timestamp: '2026-09-18T12:00:00Z',
    machineId: 'TSE-01',
    configurationVersion: 'CFG-1',
    state: 'ST-06',
    stateConfidence: 0.9,
    contextId: 'CTX-1',
    value: 86.4,
    unit: 'bar',
    inputQualities: ['BAD'],
    baseline: exact,
    baselineConfidence: 'HIGH',
    formulaIds: ['F-COM-010'],
    lineage: ['PLC-01:DB1.DBD10'],
  },
  bands,
);
check('a BAD input yields no deviation', badFeature.absoluteDeviation === null);
check('and no z score', badFeature.zScore === null);
check('and reports INSUFFICIENT_DATA', badFeature.symbolicState === 'INSUFFICIENT_DATA');
check('and still carries its lineage', badFeature.lineage.length === 1);

const goodFeature = computeFeature(
  {
    featureId: 'TSE01.PROCESS.PRE_SCREEN.PRESSURE',
    timestamp: '2026-09-18T12:00:00Z',
    machineId: 'TSE-01',
    configurationVersion: 'CFG-1',
    state: 'ST-06',
    stateConfidence: 0.9,
    contextId: 'CTX-1',
    value: 86.4,
    unit: 'bar',
    inputQualities: ['GOOD'],
    baseline: exact,
    baselineConfidence: 'HIGH',
    formulaIds: ['F-COM-010'],
    lineage: ['PLC-01:DB1.DBD10'],
  },
  bands,
);
check('a good input yields a deviation', goodFeature.absoluteDeviation !== null);
check(
  'a value four sigma above expected is a high anomaly',
  goodFeature.symbolicState === 'HIGH_ANOMALY',
  goodFeature.symbolicState,
);
check('and records which baseline level it used', goodFeature.baselineLevel === 'EXACT_CONTEXT');

const noContext = computeFeature(
  {
    featureId: 'X',
    timestamp: '2026-09-18T12:00:00Z',
    machineId: 'TSE-01',
    configurationVersion: null,
    state: null,
    stateConfidence: null,
    contextId: null,
    value: 10,
    unit: 'bar',
    inputQualities: ['GOOD'],
    baseline: exact,
    baselineConfidence: 'HIGH',
    formulaIds: [],
    lineage: [],
  },
  bands,
);
check('a feature with no context reports INSUFFICIENT_CONTEXT', noContext.symbolicState === 'INSUFFICIENT_CONTEXT');

check('a trend with no slope is UNKNOWN, not FLAT', classifyTrend(null, 0.1) === 'UNKNOWN');
check('a small slope is FLAT', classifyTrend(0.05, 0.1) === 'FLAT');
check('a real slope is RISING', classifyTrend(1.6, 0.1) === 'RISING');
check(
  'a symbolic state with no baseline is NOT_APPLICABLE',
  classifySymbolicState({
    zScore: null,
    robustScore: null,
    quality: 'GOOD',
    hasBaseline: false,
    hasContext: true,
    deviationBand: 2,
    anomalyBand: 3,
  }) === 'NOT_APPLICABLE',
);

console.log('\n--- §47: the deployment checklist ---');
const validation = runDoc03Validation();
check('all eight checks run', validation.length === 8, String(validation.length));
check('the formula library passes', validation.find((r) => r.checkId === 'D3-01')?.status === 'PASS');
check('an uncommissioned deployment does not claim DOC-04 readiness', validation.find((r) => r.checkId === 'D3-08')?.status === 'FAIL');
check(
  'every failing check explains itself',
  validation.filter((r) => r.status === 'FAIL').every((r) => r.detail.length > 40),
);

if (failures > 0) {
  console.log(`\n${failures} CHECK(S) FAILED\n`);
  process.exit(1);
}
console.log('\nALL CHECKS PASSED\n');
