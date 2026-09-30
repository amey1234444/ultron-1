/**
 * Component health and remaining useful life.
 *
 * The estimate is a trend to an approved limit, not a learned wear model, and
 * the reason that distinction is load-bearing is in `healthIndex.ts`. What is
 * checked here is that the arithmetic is right, that it refuses to answer
 * where it should, and that what it emits survives the contract parser —
 * which rejects rather than repairs, so a field in the wrong case is a blank
 * chart rather than a warning.
 */
import {
  buildComponentRul,
  serializeComponentRul,
  MIN_HISTORY_DAYS,
  MIN_STEADY_HOURS,
  PROJECTION_DAYS,
} from '../estimate';
import { dailyHealth, fitTrend, healthOfSample, isoDay, daysToTarget } from '../healthIndex';
import { rulComponentsForTemplate } from '../components';
import { parseComponentRul } from '../../knowledge/ml/rulContract';
import { TWIN_SCREW_POINT_REGISTRY } from '../../machinePoints/twinScrewExtruderPoints';

let failures = 0;
function ok(name: string, condition: boolean, detail = '') {
  console.log(`${condition ? '  PASS' : '  FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!condition) failures++;
}

const DAY = 86_400_000;
const NOW = Date.parse('2026-09-30T06:00:00Z');
const COMPONENT = { componentId: 'Gearbox', componentType: 'Gearbox', displayName: 'Gearbox', installedAt: '2025-01-05T00:00:00Z' };

const days = (count: number, from: number, slope: number, hours = 16) =>
  Array.from({ length: count }, (_, i) => ({
    date: isoDay(NOW - (count - 1 - i) * DAY),
    hi: Math.max(0, Math.min(1, from + slope * i)),
    validSteadyHours: hours,
  }));

console.log('--- one sample, placed between its baseline and its limit ---');
const sample = (value: number) => ({ t: NOW, value, baseline: 1.5, danger: 7.1, alert: 2.8, usable: true });
ok('at the baseline, health is 1', healthOfSample(sample(1.5)) === 1);
ok('at the limit, health is 0', healthOfSample(sample(7.1)) === 0);
ok('halfway is a half', Math.abs((healthOfSample(sample(4.3)) ?? -1) - 0.5) < 1e-9);
ok('past the limit does not go negative', healthOfSample(sample(20)) === 0);
ok('below the baseline does not exceed 1', healthOfSample(sample(0)) === 1);
// Direction is read from the limits, not configured: an indicator that falls
// as the component wears has its danger below its baseline.
ok('a falling indicator is read the same way',
  healthOfSample({ t: NOW, value: 60, baseline: 100, danger: 20, alert: null, usable: true }) === 0.5);
ok('a limit equal to the baseline is no scale at all',
  healthOfSample({ t: NOW, value: 5, baseline: 5, danger: 5, alert: null, usable: true }) === null);

console.log('\n--- a day is the median of its samples, and the worst indicator ---');
const health = dailyHealth({
  vibration: [1.5, 1.5, 6.0, 1.5].map((v, i) => ({ t: NOW + i * 3_600_000, value: v, baseline: 1.5, danger: 7.1, alert: 2.8, usable: true })),
  temperature: [50, 50, 50, 50].map((v, i) => ({ t: NOW + i * 3_600_000, value: v, baseline: 45, danger: 90, alert: 75, usable: true })),
});
ok('one spike does not set the day', health.length === 1 && Math.abs(health[0].hi - 0.8889) < 0.001,
  `${health[0]?.hi.toFixed(4)} — the median of the vibration, not its maximum`);
ok('hours of evidence are counted', health[0].validSteadyHours === 4);
const rejected = dailyHealth({
  vibration: [{ t: NOW, value: 7.0, baseline: 1.5, danger: 7.1, alert: null, usable: false }],
});
ok('a sample the controller flagged is not evidence', rejected.length === 0);

console.log('\n--- the trend ignores an outlying day ---');
const clean = fitTrend(days(40, 0.9, -0.005));
ok('a clean line recovers its slope', Math.abs((clean?.slopePerDay ?? 0) + 0.005) < 1e-9, `${clean?.slopePerDay}`);
const spiked = days(40, 0.9, -0.005).map((day, i) => (i === 20 ? { ...day, hi: 0.02 } : day));
const robust = fitTrend(spiked);
ok('and so does one with a bad day in the middle',
  Math.abs((robust?.slopePerDay ?? 0) + 0.005) < 1e-6,
  'Theil-Sen: the median of the pairwise slopes, so one day cannot set the date');
ok('days to a target invert the slope', daysToTarget(0.5, -0.01, 0) === 50);
ok('a flat component has no date', daysToTarget(0.5, 0, 0) === null);
ok('an improving one has none either', daysToTarget(0.5, +0.01, 0) === null);

console.log('\n--- what it refuses to answer, and why ---');
const build = (over: Partial<Parameters<typeof buildComponentRul>[0]>) =>
  buildComponentRul(
    { component: COMPONENT, warningHi: 0.4, failureHi: 0, history: days(40, 0.9, -0.005), drivers: [], events: [], thresholdConfigured: true, ...over },
    NOW,
  );

ok('no danger threshold configured', build({ thresholdConfigured: false, failureHi: null }).status === 'THRESHOLD_NOT_CONFIGURED');
ok(`fewer than ${MIN_HISTORY_DAYS} usable days`, build({ history: days(4, 0.9, -0.01) }).status === 'INSUFFICIENT_HISTORY');
ok(`days with under ${MIN_STEADY_HOURS} steady hours do not count`,
  build({ history: days(40, 0.9, -0.005, 1) }).status === 'INSUFFICIENT_HISTORY',
  'forty days of two minutes each is not forty days of evidence');
ok('a stable component', build({ history: days(40, 0.9, 0) }).status === 'NOT_DEGRADING');
ok('an improving one', build({ history: days(40, 0.5, +0.004) }).status === 'NOT_DEGRADING');
ok('and none of those carries a number',
  [build({ thresholdConfigured: false, failureHi: null }), build({ history: days(4, 0.9, -0.01) }), build({ history: days(40, 0.9, 0) })]
    .every((result) => result.summary.rulDays === null && result.projection.length === 0));
ok('a component nothing is known about is not reported as healthy',
  build({ history: [] }).summary.healthIndex === 0 && build({ history: [] }).summary.healthState === 'UNKNOWN',
  'a default of 1 would put perfect health on a maintenance chart');
ok('every refusal says why in words', [
  build({ thresholdConfigured: false, failureHi: null }), build({ history: days(4, 0.9, -0.01) }), build({ history: days(40, 0.9, 0) }),
].every((result) => typeof result.detail === 'string' && result.detail.length > 20));

console.log('\n--- a degrading component ---');
const degrading = build({ history: days(45, 0.92, -0.006) });
ok('is AVAILABLE', degrading.status === 'AVAILABLE');
const rul = degrading.summary.rulDays!;
ok('reports a remaining life', rul !== null, `p10 ${rul?.p10.toFixed(0)}d / p50 ${rul?.p50.toFixed(0)}d / p90 ${rul?.p90.toFixed(0)}d`);
// HI 0.656 falling at 0.006/day reaches zero in about 109 days. Asserted
// against the arithmetic rather than a recorded number, so a change to the
// estimator has to be a change to the maths.
const expected = degrading.summary.healthIndex / 0.006;
ok('and it is the arithmetic, not a constant', Math.abs(rul.p50 - expected) < 1, `${rul.p50.toFixed(1)} vs ${expected.toFixed(1)}`);
ok('the shortest life is the pessimistic bound', rul.p10 <= rul.p50 && rul.p50 <= rul.p90);
ok('operating hours are life, not calendar',
  degrading.summary.rulOperatingHours!.p50 < rul.p50 * 24 && degrading.summary.rulOperatingHours!.p50 > rul.p50,
  `${degrading.summary.rulOperatingHours!.p50.toFixed(0)}h over ${rul.p50.toFixed(0)} days at 16h a day`);
ok('the projection runs the full window', degrading.projection.length === PROJECTION_DAYS + 1);
ok('the pessimistic band is the low one, every day',
  degrading.projection.every((point) => point.hiP10 <= point.hiP50 && point.hiP50 <= point.hiP90),
  'the opposite ordering to the RUL percentiles, and inverting either inverts the band');
ok('health never leaves 0..1', degrading.projection.every((p) => p.hiP10 >= 0 && p.hiP90 <= 1));
ok('it names the day it reaches the limit', typeof degrading.thresholdCrossings?.p50 === 'string', `${degrading.thresholdCrossings?.p50}`);
ok('failure becomes likelier further out',
  degrading.summary.failureProbability!.d7 <= degrading.summary.failureProbability!.d30
  && degrading.summary.failureProbability!.d30 <= degrading.summary.failureProbability!.d60);
ok('a component already at the limit is CRITICAL with nothing left',
  build({ history: days(45, 0.24, -0.006) }).summary.healthState === 'CRITICAL');

console.log('\n--- it never claims to be trained ---');
ok('provenance names the method', degrading.provenance.method === 'trend-to-threshold');
ok('and says it is not trained on real data', degrading.provenance.trainedOnRealData === false,
  'the panel marks every number from it accordingly');
ok('and how many days it used', degrading.provenance.dataQualityDaysUsed === 45);

console.log('\n--- the wire format survives the parser ---');
// The parser reads snake_case and rejects rather than repairs. Emitting
// camelCase produced a chart that silently showed nothing, which is exactly
// what it is designed to prevent and exactly how it was found.
for (const [label, result] of [
  ['AVAILABLE', degrading],
  ['NOT_DEGRADING', build({ history: days(40, 0.9, 0) })],
  ['INSUFFICIENT_HISTORY', build({ history: days(4, 0.9, -0.01) })],
  ['THRESHOLD_NOT_CONFIGURED', build({ thresholdConfigured: false, failureHi: null })],
  ['with drivers and events', build({
    drivers: [{ indicator: 'r1.S01.CH1', label: 'Gearbox vibration', contribution: 0.62 }],
    events: [{ date: '2025-01-05', type: 'INSTALL', label: 'Installed' }],
  })],
] as const) {
  const parsed = parseComponentRul(JSON.parse(JSON.stringify(serializeComponentRul(result))));
  ok(`  ${label}`, parsed.ok, parsed.ok ? '' : parsed.errors.join('; '));
}

console.log('\n--- the picker and the server agree ---');
const offered = rulComponentsForTemplate('Twin Screw Extruder');
ok('the twin screw offers its components', offered.length > 0, offered.map((c) => c.componentId).join(', '));
const known = new Set(TWIN_SCREW_POINT_REGISTRY.map((point) => point.component));
ok('every one has instrument points behind it',
  offered.every((option) => known.has(option.componentId as never)),
  'a component in the picker that resolves to no points 404s when selected');
ok('a template with no breakdown offers nothing',
  rulComponentsForTemplate('Hammer Mill').length === 0 && rulComponentsForTemplate('Motor').length === 0,
  'an empty list hides the panel rather than showing an empty selector');

console.log(failures === 0 ? '\nRUL: all checks passed' : `\nRUL: ${failures} check(s) failed`);
if (failures > 0) process.exit(1);
