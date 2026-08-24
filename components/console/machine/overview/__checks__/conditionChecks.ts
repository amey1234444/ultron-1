// Numeric checks for the condition and prognostic layer. This project has no test
// runner, so they run as a script:
//
//   npx esbuild components/studio/machine/overview/__checks__/conditionChecks.ts --bundle --platform=node --format=esm --external:react --outfile=checks.mjs
//   node checks.mjs
//
// Exit code is non-zero if anything fails. Two of these are the reason certain
// constants have the values they do, and are worth re-running if those change:
//
//   * "steady points almost never project" / "drifting points almost always
//     project" calibrate MIN_T_FOR_PROJECTION in lib/condition.ts against
//     HISTORY_LENGTH in ../useConditionHistory.ts. The two are coupled: at a
//     48-sample window the steady and drifting populations overlap and no
//     threshold separates them, which is why the window is 96.
//   * "most random walks are still rejected" is a robustness bound, not a target.
//     A cumulative random walk really does contain apparent trends over a finite
//     window, so this cannot reach zero — it is a stated limit of projecting from
//     a straight-line fit. It is measured so that a change making it much worse
//     shows up here rather than as confident nonsense on the page.
//
import {
  aggregateHealth,
  attributeToComponent,
  fitTrend,
  formatRul,
  inferFailureModes,
  isoZone,
  levelFor,
  pointHealth,
  projectToDanger,
  resolveThresholds,
  type PointEvidence,
} from '../../../../../lib/condition';
import { componentsForTemplate } from '../../../../../lib/machines';
import { LIVE_RANGE_FOR_LETTER, type LiveKindLetter } from '../../liveValue';
import { HISTORY_LENGTH, initialTick, SAMPLE_INTERVAL_HOURS, seedHistory } from '../useConditionHistory';

let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`);
}

// --- 1. Does the simulation produce a usable spread? -------------------------

const LETTERS: LiveKindLetter[] = ['V', 'V', 'V', 'T', 'T', 'S', 'P', 'P', 'C', 'V', 'T', 'C'];
const rows = LETTERS.map((letter, i) => {
  const key = `ultron.condition.v1.machine-abc.box-${i}`;
  const band = LIVE_RANGE_FOR_LETTER[letter];
  const samples = seedHistory(key, letter, initialTick(key, letter)).samples;
  const value = samples[samples.length - 1];
  // Uncommissioned channels: no alarm limits on the card, so limits are inferred.
  const thresholds = resolveThresholds({}, band);
  const level = levelFor(value, thresholds);
  const prognosis = projectToDanger(samples, thresholds, SAMPLE_INTERVAL_HOURS);
  return { key, letter, band, samples, value, thresholds, level, health: pointHealth(value, thresholds, band), prognosis };
});

console.log('\n--- simulated points (inferred limits) ---');
for (const r of rows) {
  console.log(
    `${r.letter}  val=${r.value.toFixed(r.band.decimals).padStart(7)}  ` +
      `lim=${r.thresholds.alert.toFixed(1)}/${r.thresholds.danger.toFixed(1)}  ` +
      `${r.level.padEnd(8)} health=${r.health.toFixed(0).padStart(3)}  ` +
      `r2=${r.prognosis.r2.toFixed(2)}  slope/d=${r.prognosis.slopePerDay.toFixed(3)}  ` +
      `rul=${formatRul(r.prognosis.daysToDanger).padStart(5)} (${r.prognosis.confidence})`,
  );
}

const projectable = rows.filter((r) => r.prognosis.daysToDanger !== null);
const levels = { normal: 0, alert: 0, danger: 0 } as Record<string, number>;
rows.forEach((r) => levels[r.level]++);

console.log(`\nlevels: ${JSON.stringify(levels)}   projectable: ${projectable.length}/${rows.length}`);

check('health stays in 0..100', rows.every((r) => r.health >= 0 && r.health <= 100));
check('some points are projectable', projectable.length > 0, `${projectable.length}/${rows.length}`);
check('not every point is projectable', projectable.length < rows.length, `${projectable.length}/${rows.length}`);
check('some points read normal', levels.normal > 0, JSON.stringify(levels));
check('not every point is over danger', levels.danger < rows.length, JSON.stringify(levels));
check(
  'projected days are plausible (0..365)',
  projectable.every((r) => r.prognosis.daysToDanger! >= 0 && r.prognosis.daysToDanger! <= 365),
  projectable.map((r) => Math.round(r.prognosis.daysToDanger!)).join(','),
);
check('a degrading point rises across the window', rows.some((r) => r.samples[r.samples.length - 1] > r.samples[0] * 1.1));
check('a steady point does not', rows.some((r) => Math.abs(r.samples[r.samples.length - 1] / r.samples[0] - 1) < 0.1));

// --- 2. Does the trend gate separate steady from drifting? ------------------

// These are the two populations the simulation actually produces: identical
// bounded noise, differing only in whether the point is degrading. A steady
// point that projects is an invented forecast; a drifting point that does not
// project is a missed warning. Both matter, so both are measured.
function arSeries(n: number, driftFraction: number) {
  const band = LIVE_RANGE_FOR_LETTER.V;
  const span = band.max - band.min;
  const phi = 0.72;
  const amp = band.step * 0.35;
  let noise = 0;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    noise = phi * noise + (1 - phi) * (Math.random() * 2 - 1) * amp * 3;
    out.push(Math.max(band.min, Math.min(band.max, band.min + span * 0.25 + span * driftFraction * i + noise)));
  }
  return out;
}

const TRIALS = 600;
const vBand = LIVE_RANGE_FOR_LETTER.V;
const vThresholds = resolveThresholds({}, vBand);

let steadyProjected = 0;
for (let i = 0; i < TRIALS; i++) {
  if (projectToDanger(arSeries(HISTORY_LENGTH, 0), vThresholds, SAMPLE_INTERVAL_HOURS).daysToDanger !== null) steadyProjected++;
}
let driftProjected = 0;
for (let i = 0; i < TRIALS; i++) {
  const driftFraction = 0.0006 + Math.random() * 0.0018;
  if (projectToDanger(arSeries(HISTORY_LENGTH, driftFraction), vThresholds, SAMPLE_INTERVAL_HOURS).daysToDanger !== null) driftProjected++;
}
console.log(`
steady points projected: ${steadyProjected}/${TRIALS} (${((steadyProjected / TRIALS) * 100).toFixed(1)}%)  ` +
  `drifting projected: ${driftProjected}/${TRIALS} (${((driftProjected / TRIALS) * 100).toFixed(1)}%)`);
check('steady points almost never project', steadyProjected <= TRIALS * 0.02, `${steadyProjected}/${TRIALS}`);
check('drifting points almost always project', driftProjected >= TRIALS * 0.9, `${driftProjected}/${TRIALS}`);

// Robustness against a signal the model does not produce but a historian can:
// a cumulative random walk. A walk's excursions genuinely look like trends over
// a finite window, so this cannot be driven to zero — it is a stated limit of
// linear extrapolation, not a bug to tune away. Measured here so a change that
// makes it materially worse is visible.
let walkProjected = 0;
const WALKS = 400;
for (let w = 0; w < WALKS; w++) {
  let v = (vBand.min + vBand.max) / 2;
  const samples: number[] = [];
  for (let i = 0; i < HISTORY_LENGTH; i++) {
    v = Math.max(vBand.min, Math.min(vBand.max, v + (Math.random() - 0.5) * 2 * vBand.step));
    samples.push(v);
  }
  if (projectToDanger(samples, vThresholds, SAMPLE_INTERVAL_HOURS).daysToDanger !== null) walkProjected++;
}
console.log(`random walks projected: ${walkProjected}/${WALKS} (${((walkProjected / WALKS) * 100).toFixed(1)}%)`);
check('most random walks are still rejected', walkProjected <= WALKS * 0.25, `${walkProjected}/${WALKS}`);

// A clean ramp must NOT be rejected, or the gate rejects everything.
const ramp = Array.from({ length: HISTORY_LENGTH }, (_, i) => 1.5 + i * 0.05);
const rampFit = fitTrend(ramp, SAMPLE_INTERVAL_HOURS);
const rampProg = projectToDanger(ramp, { alert: 3, danger: 4 }, SAMPLE_INTERVAL_HOURS);
check('a clean ramp fits with r2 ~1', !!rampFit && rampFit.r2 > 0.99, `r2=${rampFit?.r2.toFixed(3)}`);
check('a clean ramp is projectable', rampProg.daysToDanger !== null, `rul=${formatRul(rampProg.daysToDanger)}`);
check('a clean ramp reports high confidence', rampProg.confidence === 'high', rampProg.confidence);

// A falling signal is good news, not a forecast.
const falling = Array.from({ length: HISTORY_LENGTH }, (_, i) => 4 - i * 0.03);
check('a falling signal yields no projection', projectToDanger(falling, { alert: 3, danger: 4.5 }, 1).daysToDanger === null);

// Already past danger: zero, not a negative or null.
const over = Array.from({ length: HISTORY_LENGTH }, (_, i) => 4 + i * 0.02);
check('a point past danger reports now', projectToDanger(over, { alert: 2, danger: 4 }, 1).daysToDanger === 0);

// --- 3. Edge cases in the scoring -------------------------------------------

check('aggregateHealth of nothing is null', aggregateHealth([]) === null);
check('aggregateHealth is worst-dominant', (aggregateHealth([100, 100, 100, 20]) ?? 0) < 50, String(aggregateHealth([100, 100, 100, 20])));
check('pointHealth at band floor is 100', pointHealth(1.2, { alert: 4, danger: 5 }, LIVE_RANGE_FOR_LETTER.V) === 100);
check('pointHealth far past danger bottoms out', pointHealth(99, { alert: 4, danger: 5 }, LIVE_RANGE_FOR_LETTER.V) === 0);
check('pointHealth at the alert limit is 70', Math.round(pointHealth(4, { alert: 4, danger: 5 }, LIVE_RANGE_FOR_LETTER.V)) === 70);

// Inverted config must not invert the bands.
const inverted = resolveThresholds({ alarmWarning: 5, alarmCritical: 2 }, LIVE_RANGE_FOR_LETTER.V);
check('inverted limits are clamped, not inverted', inverted.danger >= inverted.alert, JSON.stringify(inverted));

// Degenerate band (min === max) must not divide by zero.
const flatBand = { min: 5, max: 5, decimals: 1 };
const flatT = resolveThresholds({}, flatBand);
check('degenerate band produces finite numbers', Number.isFinite(flatT.alert) && Number.isFinite(pointHealth(5, flatT, flatBand)));

check('short buffers are not fitted', fitTrend([1, 2], 1) === null);
check('a perfectly flat signal is not projectable', projectToDanger([2, 2, 2, 2, 2, 2], { alert: 3, danger: 4 }, 1).daysToDanger === null);

// --- 4. ISO zones ------------------------------------------------------------

check('ISO group2-rigid boundaries', isoZone(1.0) === 'A' && isoZone(2.0) === 'B' && isoZone(3.0) === 'C' && isoZone(5.0) === 'D',
  [1.0, 2.0, 3.0, 5.0].map((v) => `${v}:${isoZone(v)}`).join(' '));
check('ISO group1-flexible is more permissive than group2-rigid', isoZone(3.0) === 'C' && isoZone(3.0, 'group1-flexible') === 'A', `g2r=${isoZone(3.0)} g1f=${isoZone(3.0, 'group1-flexible')}`);

// --- 5. Failure-mode rules --------------------------------------------------

const ev = (over: Partial<PointEvidence> & { id: string }): PointEvidence => ({
  code: over.id, label: over.id, kind: 'Vibration', level: 'alert', value: 1, unit: 'mm/s', decimals: 2, rising: true, ...over,
});

const bearing = inferFailureModes([ev({ id: 'V1' }), ev({ id: 'T1', kind: 'Temperature' })]);
check('vibration + temperature reads as bearing wear', bearing[0]?.id === 'bearing-wear', bearing.map((d) => d.id).join(','));
check('bearing wear does not also report unbalance', bearing.length === 1, bearing.map((d) => d.id).join(','));

const misalign = inferFailureModes([ev({ id: 'V1' }), ev({ id: 'V2' })]);
check('two vibration planes read as misalignment', misalign[0]?.id === 'misalignment', misalign.map((d) => d.id).join(','));

const unbal = inferFailureModes([ev({ id: 'V1' })]);
check('one vibration point reads as unbalance', unbal[0]?.id === 'unbalance', unbal.map((d) => d.id).join(','));

const lube = inferFailureModes([ev({ id: 'T1', kind: 'Temperature' })]);
check('temperature alone reads as lubrication', lube[0]?.id === 'lubrication', lube.map((d) => d.id).join(','));

check('nothing elevated yields no diagnosis', inferFailureModes([ev({ id: 'V1', level: 'normal' })]).length === 0);

const mixed = inferFailureModes([ev({ id: 'V1' }), ev({ id: 'T1', kind: 'Temperature' }), ev({ id: 'C1', kind: 'Current' })]);
check('an unrelated elevated kind still gets reported', mixed.some((d) => d.id === 'overload'), mixed.map((d) => d.id).join(','));

// --- 6. Component attribution against the real templates --------------------

let idn = 0;
const ravComponents = componentsForTemplate('Rotary Airlock Valve', () => `id-${idn++}`);
console.log(`\nRAV components: ${ravComponents.map((c) => `${c.label}(${c.points.length}p)`).join(', ')}`);

const motorId = ravComponents.find((c) => c.label === 'Motor')?.id;
const rotorId = ravComponents.find((c) => c.label === 'Rotor')?.id;

// These are the labels ravDefaultLayout.ts actually ships.
check('point-label match finds the Motor', attributeToComponent('RAV-01 DE Vibration H', ravComponents) === motorId);
check('component-label match finds the Rotor', attributeToComponent('RAV-01 Rotor Bearing Temp', ravComponents) === rotorId);
check('an unmatched label returns null', attributeToComponent('Process Card CH2', ravComponents) === null);
check('an explicit component id wins', attributeToComponent('RAV-01 DE Vibration H', ravComponents, rotorId) === rotorId);
check('a bogus explicit id falls through to matching', attributeToComponent('RAV-01 DE Vibration H', ravComponents, 'nope') === motorId);

const pumpComponents = componentsForTemplate('Centrifugal Pump', () => `p-${idn++}`);
const pumpMotor = pumpComponents.find((c) => c.label === 'Motor')?.id;
check('longest point-label match wins over a shorter one', attributeToComponent('P-104 Winding Temperature', pumpComponents) === pumpMotor);

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
