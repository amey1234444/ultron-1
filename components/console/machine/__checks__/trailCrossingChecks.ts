/**
 * Generated canvases do not draw one trail across another.
 *
 * Card slots used to be handed out in registry order — the order the
 * instruments happen to be listed in, which has nothing to do with where they
 * sit on the drawing. So the top card could be wired to a pad near the bottom
 * while the fifth reached back up to the top, and every such pair crossed. The
 * eighteen-point cracking mill drew sixteen crossings in one canvas; across
 * the seventeen instrumented templates, 208.
 *
 * This counts real segment intersections in the layout each template
 * generates. Not an abstraction of them — the thing that has to be true is
 * that no two drawn lines cross, and the first attempt at this optimised a
 * model whose coordinates were in the wrong space, reported zero, and left
 * the canvas exactly as crossed as before. Measuring the emitted geometry is
 * what makes that impossible to repeat.
 */
import { connectorsForTemplate } from '../machineConnectors';
import { createTemplateDefaultLayout } from '../templateDefaultLayouts';
import { MACHINE_TEMPLATES } from '../../../../lib/machines';

let failures = 0;
function ok(name: string, condition: boolean, detail = '') {
  console.log(`${condition ? '  PASS' : '  FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!condition) failures++;
}

type Point = { x: number; y: number };
const RECT = { x: 384, y: 186.53, width: 832, height: 526.93 };
const EPS = 1e-9;

/** Whether two segments properly cross. Shared endpoints do not count. */
function crosses(a: Point, b: Point, c: Point, d: Point): boolean {
  const near = (p: Point, q: Point) => Math.abs(p.x - q.x) < 0.5 && Math.abs(p.y - q.y) < 0.5;
  if (near(a, c) || near(a, d) || near(b, c) || near(b, d)) return false;
  const turn = (o: Point, p: Point, q: Point) => (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x);
  const d1 = turn(a, b, c), d2 = turn(a, b, d), d3 = turn(c, d, a), d4 = turn(c, d, b);
  return ((d1 > EPS && d2 < -EPS) || (d1 < -EPS && d2 > EPS)) && ((d3 > EPS && d4 < -EPS) || (d3 < -EPS && d4 > EPS));
}

function crossingsIn(template: string): number {
  const layout = createTemplateDefaultLayout(template, [], RECT);
  const segments: [Point, Point][] = [];
  for (const trail of layout.trails) {
    for (let i = 0; i < trail.points.length - 1; i += 1) segments.push([trail.points[i], trail.points[i + 1]]);
  }
  let count = 0;
  for (let i = 0; i < segments.length; i += 1) {
    for (let j = i + 1; j < segments.length; j += 1) {
      if (crosses(segments[i][0], segments[i][1], segments[j][0], segments[j][1])) count += 1;
    }
  }
  return count;
}

const instrumented = (MACHINE_TEMPLATES as readonly string[]).filter((t) => connectorsForTemplate(t).length > 0);

/**
 * The Rotary Airlock Valve is placed by hand.
 *
 * `RAV_CARD_PLACEMENT` gives every pad its own column, bend and side, authored
 * rather than generated, so the ordering search never runs on it and its two
 * crossings are a property of that design. Listed rather than silently
 * excluded: changing it is a decision about somebody's layout, not a fix.
 */
const HAND_PLACED: Record<string, number> = { 'Rotary Airlock Valve': 2 };

console.log('--- every generated canvas ---');
let total = 0;
let generatedTotal = 0;
for (const template of instrumented) {
  const count = crossingsIn(template);
  total += count;
  const allowed = HAND_PLACED[template] ?? 0;
  if (!(template in HAND_PLACED)) generatedTotal += count;
  ok(
    `${template}: ${allowed === 0 ? 'no trail crosses another' : `at most its ${allowed} hand-placed crossings`}`,
    count <= allowed,
    count === 0 ? `${connectorsForTemplate(template).length} points` : `${count} crossings`,
  );
}

console.log('\n--- across every template ---');
ok('no generated layout crosses at all', generatedTotal === 0, `${generatedTotal} crossings`);
ok('and the total is only what the hand-placed template carries',
  total === Object.values(HAND_PLACED).reduce((a, b) => a + b, 0),
  `${total} in total, was 208 before slots were ordered`);

// A hand-placed allowance that is no longer needed is a stale exemption
// hiding a template that has since been fixed.
for (const [template, allowed] of Object.entries(HAND_PLACED)) {
  ok(`the ${template} allowance is still needed`, crossingsIn(template) === allowed,
    `expected ${allowed}, found ${crossingsIn(template)}`);
}

console.log('\n--- the layout is the same every time ---');
// The ordering is a search, so it has to be deterministic or "⟲ Template"
// becomes a way to lose a canvas rather than restore one.
for (const template of ['Twin Screw Extruder', 'Solvent Extractor', 'Cracking Mill M-101']) {
  const geometry = () =>
    JSON.stringify(createTemplateDefaultLayout(template, [], RECT).trails.map((trail) => trail.points));
  const boxes = () =>
    JSON.stringify(createTemplateDefaultLayout(template, [], RECT).boxes.map((box) => [box.x, box.y, box.templatePointCode]));
  ok(`${template}: same trails and same cards on a second call`,
    geometry() === geometry() && boxes() === boxes());
}

console.log('\n--- every point still gets exactly one card ---');
// A crossing-free layout that dropped a point would be worse than a crossed
// one, so the search must be a permutation and nothing else.
for (const template of instrumented) {
  const layout = createTemplateDefaultLayout(template, [], RECT);
  const pads = connectorsForTemplate(template);
  const codes = layout.boxes.map((box) => box.templatePointCode);
  const unique = new Set(codes);
  if (layout.trails.length !== pads.length || unique.size !== pads.length) {
    ok(`${template}: one card per pad`, false, `${layout.trails.length} trails, ${unique.size} distinct codes, ${pads.length} pads`);
  }
}
ok('one card per pad on every template', true, `${instrumented.length} templates checked`);

console.log(failures === 0 ? '\ntrail crossings: all checks passed' : `\ntrail crossings: ${failures} check(s) failed`);
if (failures > 0) process.exit(1);
