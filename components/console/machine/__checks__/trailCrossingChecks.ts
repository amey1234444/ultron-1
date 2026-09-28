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
import { MAX_MACHINE_ZOOM, MIN_MACHINE_ZOOM, MACHINE_ZOOM_STEP } from '../../../../lib/machineZoom';

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
 * Two segments lying along one line with a shared stretch.
 *
 * Not a crossing geometrically — the turn tests below are all zero — but on
 * screen it is one trail hidden underneath another, which is the same
 * complaint. Counted separately so a fix for one cannot quietly introduce
 * the other.
 */
function overlaps(a: Point, b: Point, c: Point, d: Point): boolean {
  const turnOf = (o: Point, p: Point, q: Point) => (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x);
  if (Math.abs(turnOf(a, b, c)) > 1e-6 || Math.abs(turnOf(a, b, d)) > 1e-6) return false;
  const dx = b.x - a.x, dy = b.y - a.y;
  const length2 = dx * dx + dy * dy;
  if (length2 < 1e-9) return false;
  const along = (p: Point) => ((p.x - a.x) * dx + (p.y - a.y) * dy) / length2;
  const [lo, hi] = [along(c), along(d)].sort((m, n) => m - n);
  return Math.min(1, hi) - Math.max(0, lo) > 1e-3;
}

function faultsIn(template: string, rect: typeof RECT): { crossings: number; overlaps: number } {
  const layout = createTemplateDefaultLayout(template, [], rect);
  const segments: { ends: [Point, Point]; trail: string }[] = [];
  for (const trail of layout.trails) {
    for (let i = 0; i < trail.points.length - 1; i += 1) {
      segments.push({ ends: [trail.points[i], trail.points[i + 1]], trail: trail.id });
    }
  }
  let crossings = 0;
  let overlapping = 0;
  for (let i = 0; i < segments.length; i += 1) {
    for (let j = i + 1; j < segments.length; j += 1) {
      // A trail's own turn shares an endpoint with itself; that is the turn,
      // not a crossing.
      if (segments[i].trail === segments[j].trail) continue;
      const [a, b] = segments[i].ends;
      const [c, d] = segments[j].ends;
      if (crosses(a, b, c, d)) crossings += 1;
      else if (overlaps(a, b, c, d)) overlapping += 1;
    }
  }
  return { crossings, overlaps: overlapping };
}

/**
 * Every size a machine can be drawn at.
 *
 * The canvas centres the machine and scales it by the saved zoom, which a
 * super admin can set anywhere from 50% to 200%. This used to be checked at
 * 100% only, and 100% was the one size at which it passed: the card order was
 * worked out once, against the default rect, and reused at every other. At
 * 200% that left 43 crossings, and nobody would have known.
 */
const CENTRE_X = RECT.x + RECT.width / 2;
const CENTRE_Y = RECT.y + RECT.height / 2;
function rectAtZoom(zoom: number) {
  return {
    x: CENTRE_X - (RECT.width * zoom) / 2,
    y: CENTRE_Y - (RECT.height * zoom) / 2,
    width: RECT.width * zoom,
    height: RECT.height * zoom,
  };
}
const ZOOMS: number[] = [];
for (let zoom = MIN_MACHINE_ZOOM; zoom <= MAX_MACHINE_ZOOM + 1e-9; zoom = Math.round((zoom + MACHINE_ZOOM_STEP / 2) * 100) / 100) {
  ZOOMS.push(zoom);
}

console.log('--- every template, at every size it can be drawn ---');
let worstTemplate = '';
let total = 0;
let totalOverlaps = 0;
for (const template of instrumented) {
  let crossings = 0;
  let overlapping = 0;
  let worstZoom = 0;
  for (const zoom of ZOOMS) {
    const found = faultsIn(template, rectAtZoom(zoom));
    if (found.crossings > 0 && worstZoom === 0) worstZoom = zoom;
    crossings += found.crossings;
    overlapping += found.overlaps;
  }
  total += crossings;
  totalOverlaps += overlapping;
  if (crossings > 0 && !worstTemplate) worstTemplate = `${template} from zoom ${worstZoom}`;
  ok(`${template}: no trail crosses another, at any zoom`, crossings === 0,
    crossings === 0
      ? `${connectorsForTemplate(template).length} points x ${ZOOMS.length} sizes`
      : `${crossings} crossings, first at zoom ${worstZoom}`);
}

console.log('\n--- across every template and every size ---');
ok('not one trail crosses another', total === 0,
  `${ZOOMS.length} sizes x ${instrumented.length} templates${worstTemplate ? ` — worst: ${worstTemplate}` : ''}`);
ok('and none hides underneath another', totalOverlaps === 0, `${totalOverlaps} overlapping runs`);

// The canvas is not only zoomed — the rect moves and reshapes with the
// window. A placement that only holds for one aspect ratio is a placement
// that breaks when somebody resizes the browser.
console.log('\n--- and at sizes that come from the window, not the zoom ---');
let offSize = 0;
for (const rect of [
  { x: 300, y: 150, width: 1000, height: 600 },
  { x: 500, y: 250, width: 600, height: 400 },
  { x: 200, y: 100, width: 1200, height: 700 },
  { x: 384, y: 186.53, width: 832, height: 200 },
  { x: 384, y: 100, width: 300, height: 700 },
]) {
  for (const template of instrumented) offSize += faultsIn(template, rect).crossings;
}
ok('no crossing at any of them', offSize === 0, `${offSize} crossings over 5 shapes`);

/**
 * A column holds only so many cards.
 *
 * Reported rather than asserted away. A column 790 units tall cannot stack
 * many 104-unit cards without them overlapping each other, and trails then
 * run across the cards above their own. That is a density problem, not a
 * routing one — no ordering fixes it, and the fix is a second column or a
 * smaller card. Counted off the generated layout rather than the registry,
 * because the registry does not say which column a pad ends up in.
 */
console.log('\n--- how full the columns get ---');
const CARD_HEIGHT = 104;
let crowded = 0;
for (const template of instrumented) {
  const layout = createTemplateDefaultLayout(template, [], RECT);
  const perColumn = new Map<number, number[]>();
  for (const trail of layout.trails) {
    const end = trail.points[trail.points.length - 1];
    const column = Math.round(end.x);
    perColumn.set(column, [...(perColumn.get(column) ?? []), end.y]);
  }
  for (const [, heights] of perColumn) {
    if (heights.length < 2) continue;
    const sorted = [...heights].sort((a, b) => a - b);
    const gap = Math.min(...sorted.slice(1).map((y, i) => y - sorted[i]));
    if (gap < CARD_HEIGHT) {
      crowded += 1;
      console.log(`        ${template}: ${heights.length} cards in one column, ${gap.toFixed(0)} apart — they overlap`);
      break;
    }
  }
}
ok('crowding is reported, and is separate from crossing', true,
  `${crowded} of ${instrumented.length} templates stack more cards than a column fits`);

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
