/**
 * The health/RUL series builders.
 *
 * These are the parts of the chart that are easy to get subtly wrong and hard
 * to see afterwards: a line joined across a day with no valid data, a band
 * filled upside down, three crossing labels stacked on the same pixel. Each is
 * asserted here against the real parser output rather than a hand-made shape.
 */
import { parseComponentRul, type ComponentRul } from '../../../../../lib/knowledge/ml/rulContract';
import { RUL_FIXTURE_BY_STATUS } from '../../../../../lib/knowledge/ml/rulFixtures';
import {
  bandRing,
  buildDomain,
  buildEventMarkers,
  buildHistorySegments,
  buildMedianLine,
  buildProjectionBand,
  describeChart,
  downsampleHistory,
  placeCrossingLabels,
} from '../rulSeries';

let failures = 0;
function ok(name: string, condition: boolean, detail = '') {
  console.log(`${condition ? '  PASS' : '  FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!condition) failures++;
}

const TODAY = '2026-09-28';
function load(status: string): ComponentRul {
  const parsed = parseComponentRul(RUL_FIXTURE_BY_STATUS[status]);
  if (!parsed.ok) throw new Error(`${status}: ${parsed.errors[0]}`);
  return parsed.value;
}

const available = load('AVAILABLE');
const notDegrading = load('NOT_DEGRADING');
const domain = buildDomain(available, 'all', TODAY);

/* -- domain ---------------------------------------------------------------- */

ok('the domain covers the whole window', domain.days > 0 && domain.endMs > domain.startMs, `${domain.days.toFixed(1)} d`);
ok(
  'the domain reaches past the last p90 crossing',
  domain.endMs > Date.parse(`${available.thresholdCrossings!.p90}T00:00:00Z`),
  'includes the 5% padding',
);
// A short range must not hide data that predates it.
const shortRange = buildDomain(load('INSUFFICIENT_HISTORY'), '30d', TODAY);
const firstInsufficient = load('INSUFFICIENT_HISTORY').history[0].date;
ok(
  'a 30-day range still starts at the first observation when history is shorter',
  shortRange.startMs <= Date.parse(`${firstInsufficient}T00:00:00Z`),
);
ok(
  'NOT_DEGRADING stops at the observations rather than running into empty space',
  buildDomain(notDegrading, 'all', TODAY).endMs <
    Date.parse(`${TODAY}T00:00:00Z`) + 400 * 86_400_000,
);

/* -- history gaps ---------------------------------------------------------- */

const { segments, insufficient } = buildHistorySegments(available.history, domain);
ok('history is split into segments', segments.length > 1, `${segments.length} segments`);
ok('insufficient days are collected separately', insufficient.length === 3, `${insufficient.length} days`);
ok(
  'no segment contains an insufficient day',
  segments.every((segment) => segment.every((entry) => entry.point.sufficiency === 'OK')),
);
ok(
  'the number of segments matches the number of gaps',
  // Three insufficient days, two of them adjacent (22, 23) and one apart (41),
  // so the sufficient days fall into three runs.
  segments.length === 3,
  `${segments.length}`,
);
ok(
  'every drawn point is inside the domain',
  segments.flat().every((entry) => entry.x >= 0 && entry.x <= domain.days),
);
ok(
  'y is flipped so a high health index sits near the top',
  segments[0][0].y === 1 - available.history[0].hi,
);

/* -- projection band ------------------------------------------------------- */

const band = buildProjectionBand(available.projection, domain);
ok('the band has a point per projected day in range', band.length > 0, `${band.length} points`);
ok(
  'the optimistic bound is above the pessimistic one on screen',
  band.every((point) => point.yHigh <= point.yLow),
  'yHigh <= yLow after the flip',
);
ok('the band starts with no spread at today', Math.abs(band[0].yHigh - band[0].yLow) < 1e-9);
ok('the band widens with distance', band[band.length - 1].yLow - band[band.length - 1].yHigh > 0.01);

const ring = bandRing(band);
ok('the ring is closed and twice the band length', ring.length === band.length * 2);
ok('the ring runs out along the top and back along the bottom', ring[0].y === band[0].yHigh);
ok('an empty band produces an empty ring', bandRing([]).length === 0);

const median = buildMedianLine(available.projection, domain);
ok('the median line has a point per projected day', median.length === band.length);
ok(
  'the median sits inside the band at every point',
  median.every((point, index) => point.y >= band[index].yHigh - 1e-9 && point.y <= band[index].yLow + 1e-9),
);

/* -- projection joins the observations ------------------------------------- */

const lastObserved = segments[segments.length - 1][segments[segments.length - 1].length - 1];
ok(
  'the projection starts where the observations end',
  Math.abs(median[0].x - lastObserved.x) < 1.0001,
  `observed x ${lastObserved.x.toFixed(2)}, projection x ${median[0].x.toFixed(2)}`,
);

/* -- crossing labels ------------------------------------------------------- */

const labels = placeCrossingLabels(available.thresholdCrossings, available.summary.rulDays, domain, 8);
ok('all three crossings are placed', labels.length === 3, labels.map((l) => l.key).join(', '));
ok('each label carries its day count', labels.every((entry) => /\d+ d$/.test(entry.label)));
ok('P50 is emphasised', labels.find((entry) => entry.key === 'p50')?.emphasis === true);
ok('labels are ordered by date', labels.every((entry, i, all) => i === 0 || all[i - 1].x <= entry.x));
ok(
  'no two labels share a row within the separation distance',
  labels.every((a, i) =>
    labels.every((b, j) => i === j || a.row !== b.row || Math.abs(a.x - b.x) >= 8),
  ),
);

// Force a collision: three crossings on the same day must not stack.
const collided = placeCrossingLabels(
  { p10: '2026-11-05', p50: '2026-11-05', p90: '2026-11-05' },
  available.summary.rulDays,
  domain,
  8,
);
ok('three crossings on one day are staggered onto three rows', new Set(collided.map((l) => l.row)).size === 3);
ok('a null crossings block yields no labels', placeCrossingLabels(null, null, domain, 8).length === 0);

/* -- events ---------------------------------------------------------------- */

const markers = buildEventMarkers(available.events, domain, 'all');
ok('events inside the domain are placed', markers.length === 2, `${markers.length}`);
ok('no event is marked as a prior life when there is no replacement', markers.every((m) => !m.priorLife));

const withReplacement = [
  { date: '2026-04-01', type: 'INSPECTION' as const, label: 'Old life inspection' },
  { date: '2026-06-01', type: 'REPLACEMENT' as const, label: 'Replaced' },
  { date: '2026-08-01', type: 'INSPECTION' as const, label: 'Current life inspection' },
];
const allLives = buildEventMarkers(withReplacement, domain, 'all');
const currentLife = buildEventMarkers(withReplacement, domain, 'life');
ok('"all history" keeps events from an earlier life', allLives.some((m) => m.priorLife));
ok('"current life" drops them', currentLife.every((m) => !m.priorLife) && currentLife.length === 2);

/* -- downsampling ---------------------------------------------------------- */

const long = Array.from({ length: 4000 }, (_, i) => ({
  date: new Date(Date.parse('2024-01-01T00:00:00Z') + i * 86_400_000).toISOString().slice(0, 10),
  hi: i === 1234 ? 0.05 : 0.9,
  validSteadyHours: 20,
  sufficiency: 'OK' as const,
  healthState: 'HEALTHY' as const,
}));
const reduced = downsampleHistory(long, 500);
ok('downsampling caps the point count', reduced.length <= 500, `${reduced.length} points`);
ok('the extreme survives downsampling', reduced.some((point) => point.hi === 0.05), 'the dip is kept');
ok('downsampling preserves date order', reduced.every((p, i, all) => i === 0 || all[i - 1].date <= p.date));
ok('short history is returned untouched', downsampleHistory(long.slice(0, 10), 500).length === 10);

/* -- accessibility --------------------------------------------------------- */

ok(
  'the chart description states the index and the interval',
  /Health index 0\.72/.test(describeChart(available)) && /26 to 56 days/.test(describeChart(available)),
  describeChart(available),
);
ok(
  'a component with no projection says so instead of inventing one',
  /No remaining-life projection/.test(describeChart(notDegrading)),
);

console.log(failures === 0 ? '\nrul series: all checks passed' : `\nrul series: ${failures} check(s) failed`);
if (failures > 0) process.exit(1);
