/**
 * The health/RUL parser, at the boundary it defends.
 *
 * This parser rejects rather than repairs, so the checks that matter most are
 * the ones asserting it says no. A health index is a number somebody schedules
 * maintenance against; a coerced percentile or a silently inverted interval is
 * worse than an error panel.
 */
import { isStale, parseComponentRul, type ComponentRul } from '../rulContract';
import { RUL_FIXTURE_BY_STATUS, RUL_FIXTURES } from '../rulFixtures';

let failures = 0;
function ok(name: string, condition: boolean, detail = '') {
  console.log(`${condition ? '  PASS' : '  FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!condition) failures++;
}

/** Deep clone so a mutation in one case cannot leak into the next. */
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const available = () => clone(RUL_FIXTURE_BY_STATUS.AVAILABLE) as Record<string, unknown>;

function rejects(name: string, mutate: (payload: Record<string, unknown>) => void, expect?: string) {
  const payload = available();
  mutate(payload);
  const result = parseComponentRul(payload);
  const matched = !result.ok && (expect === undefined || result.errors.join(' ').includes(expect));
  ok(name, matched, result.ok ? 'accepted it' : result.errors[0]);
}

/* -- every status parses --------------------------------------------------- */

for (const [status, payload] of Object.entries(RUL_FIXTURE_BY_STATUS)) {
  const result = parseComponentRul(payload);
  ok(`fixture parses: ${status}`, result.ok && result.value.status === status, result.ok ? '' : result.errors[0]);
}
ok(
  'every selectable fixture component parses',
  Object.values(RUL_FIXTURES).every((payload) => parseComponentRul(payload).ok),
);

/* -- the AVAILABLE payload is read correctly ------------------------------- */

const parsed = parseComponentRul(RUL_FIXTURE_BY_STATUS.AVAILABLE);
if (!parsed.ok) {
  ok('AVAILABLE fixture parses', false, parsed.errors[0]);
} else {
  const value: ComponentRul = parsed.value;
  ok('snake_case is mapped to camelCase', value.component.componentId === 'GBX-01-BRG');
  ok('health index is read', value.summary.healthIndex === 0.72);
  ok('RUL percentiles are read in order', JSON.stringify(value.summary.rulDays) === '{"p10":26,"p50":38,"p90":56}');
  ok('thresholds are read', value.thresholds.failureHi === 0.3 && value.thresholds.warningHi === 0.5);
  ok('history and projection are both present', value.history.length === 60 && value.projection.length === 60);
  ok('crossings are read', value.thresholdCrossings?.p50 === '2026-11-05');
  ok('provenance marks synthetic', value.provenance.trainedOnRealData === false);
  ok(
    'the projection starts at today with no spread',
    value.projection[0].daysFromToday === 0 && value.projection[0].hiP10 === value.projection[0].hiP90,
  );
  ok(
    'insufficient days survive parsing',
    value.history.some((point) => point.sufficiency === 'INSUFFICIENT'),
  );
}

/* -- rejections ------------------------------------------------------------ */

rejects('rejects a health index above 1', (p) => {
  (p.summary as Record<string, unknown>).health_index = 1.4;
}, 'expected 0..1');

rejects('rejects a negative health index', (p) => {
  (p.summary as Record<string, unknown>).health_index = -0.1;
}, 'expected 0..1');

rejects('rejects out-of-order RUL percentiles', (p) => {
  (p.summary as Record<string, unknown>).rul_days = { p10: 56, p50: 38, p90: 26 };
}, 'p10 <= p50 <= p90');

rejects('rejects an inverted projection band', (p) => {
  (p.projection as Record<string, unknown>[])[3].hi_p10 = 0.99;
}, 'hi_p10 <= hi_p50 <= hi_p90');

rejects('rejects an unknown status', (p) => {
  p.status = 'PROBABLY_FINE';
}, 'expected one of');

rejects('rejects an unknown health state', (p) => {
  (p.summary as Record<string, unknown>).health_state = 'SLIGHTLY_OFF';
}, 'expected one of');

rejects('rejects an unknown event type', (p) => {
  (p.events as Record<string, unknown>[])[0].type = 'REFURBISH';
}, 'expected one of');

rejects('rejects a malformed history date', (p) => {
  (p.history as Record<string, unknown>[])[0].date = '30-07-2026';
}, 'expected YYYY-MM-DD');

rejects('rejects a non-ISO installed_at', (p) => {
  (p.component as Record<string, unknown>).installed_at = '2026-03-02';
}, 'expected an ISO instant');

// The status is a promise about the payload's shape.
rejects('rejects AVAILABLE with no projection', (p) => {
  p.projection = [];
}, 'status is AVAILABLE but projection is empty');

rejects('rejects NOT_DEGRADING carrying a projection', (p) => {
  p.status = 'NOT_DEGRADING';
}, 'NOT_DEGRADING but a projection was supplied');

rejects('rejects a non-finite degradation rate', (p) => {
  (p.summary as Record<string, unknown>).degradation_rate_per_day = 'fast';
}, 'expected a finite number');

rejects('rejects a driver contribution above 1', (p) => {
  ((p.summary as Record<string, unknown>).top_drivers as Record<string, unknown>[])[0].contribution = 1.2;
}, 'expected 0..1');

rejects('rejects out-of-order RUL estimate history', (p) => {
  (p.rul_estimate_history as Record<string, unknown>[])[0].rul_p10_days = 999;
}, 'rul_p10_days <= rul_p50_days');

for (const [label, value] of [
  ['null', null],
  ['a string', 'nope'],
  ['an array', []],
  ['an empty object', {}],
] as const) {
  const result = parseComponentRul(value);
  ok(`rejects ${label} without throwing`, !result.ok && result.errors.length > 0);
}

/* -- staleness ------------------------------------------------------------- */

if (parsed.ok) {
  const computed = Date.parse(parsed.value.provenance.computedAt);
  ok('fresh data is not stale', isStale(parsed.value, computed + 3_600_000) === false);
  ok('data older than 36h is stale', isStale(parsed.value, computed + 37 * 3_600_000) === true);
}

console.log(failures === 0 ? '\nrul contract: all checks passed' : `\nrul contract: ${failures} check(s) failed`);
if (failures > 0) process.exit(1);
