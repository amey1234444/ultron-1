/**
 * Cracking Mill M-101 template wiring.
 *
 * The five registries have to agree before a template is usable rather than
 * merely compiling, and this template's point registry was written during
 * integration rather than supplied — so "each pad sits on the part it names"
 * is a claim this file checks rather than asserts.
 */
import {
  CRACKING_MILL_ARTWORK_HEIGHT,
  CRACKING_MILL_ARTWORK_WIDTH,
  CRACKING_MILL_COMPONENT_ORDER,
  CRACKING_MILL_PART_LABELS,
  CRACKING_MILL_POINT_REGISTRY,
  crackingMillPointsForComponent,
} from '../../../../lib/crackingMillPoints';
import {
  componentsForTemplate,
  expectedPointLabelsForTemplate,
  expectedPointsForTemplate,
  MACHINE_TEMPLATES,
  type MachineTemplate,
} from '../../../../lib/machines';
import { buildCrackingMillScene, type CrackingNode } from '../crackingMillScene';
import {
  artworkSizeForTemplate,
  connectorFitForUnit,
  connectorsForTemplate,
  parameterKindForConnector,
} from '../machineConnectors';
import { hasDefaultLayout } from '../templateDefaultLayouts';

let failures = 0;
function ok(name: string, condition: boolean, detail = '') {
  console.log(`${condition ? '  PASS' : '  FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!condition) failures++;
}

const TEMPLATE = 'Cracking Mill M-101' as MachineTemplate;
const REG = CRACKING_MILL_POINT_REGISTRY;
const COUNT = REG.length;

ok('template is registered', (MACHINE_TEMPLATES as readonly string[]).includes(TEMPLATE));
ok('registry has 18 points', COUNT === 18, `got ${COUNT}`);
ok('point codes are unique', new Set(REG.map((p) => p.code)).size === COUNT);
ok('no two points share a position', new Set(REG.map((p) => `${p.x},${p.y}`)).size === COUNT);
ok(
  'every point belongs to exactly one component',
  CRACKING_MILL_COMPONENT_ORDER.reduce((n, c) => n + crackingMillPointsForComponent(c).length, 0) === COUNT,
);
ok('every point names a real part', REG.every((p) => CRACKING_MILL_PART_LABELS.some((q) => q.id === p.part)));

const size = artworkSizeForTemplate(TEMPLATE);
ok('artwork frame is the taller 1200x1000', size.width === 1200 && size.height === 1000, `got ${size.width}x${size.height}`);
ok(
  'every point sits inside that frame',
  REG.every((p) => p.x >= 0 && p.x <= CRACKING_MILL_ARTWORK_WIDTH && p.y >= 0 && p.y <= CRACKING_MILL_ARTWORK_HEIGHT),
);

const scene = buildCrackingMillScene({ idPrefix: 'check', dark: true, showGrid: true, showLabels: true });
ok('scene builds and is non-empty', Array.isArray(scene) && scene.length > 0, `${scene.length} root nodes`);

// Bounding boxes from primitives that carry explicit coordinates. Path data is
// excluded on purpose: arc radii and flags are numbers but not positions, and
// treating them as coordinates inflates a box until a misplaced pad looks fine.
type Box = { x0: number; y0: number; x1: number; y1: number };
const boxes = new Map<string, Box>();
const nums = (s: unknown) => String(s ?? '').match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];
function extend(part: string, xs: number[], ys: number[]) {
  if (!xs.length || !ys.length) return;
  const b = boxes.get(part) ?? { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  b.x0 = Math.min(b.x0, ...xs); b.x1 = Math.max(b.x1, ...xs);
  b.y0 = Math.min(b.y0, ...ys); b.y1 = Math.max(b.y1, ...ys);
  boxes.set(part, b);
}
function walk(nodes: readonly CrackingNode[], inherited?: string) {
  for (const node of nodes) {
    const part = node.part ?? inherited;
    const a = node.attrs as Record<string, unknown>;
    const N = (k: string) => Number(a[k]);
    if (part) {
      if (node.tag === 'rect' && a.x !== undefined) extend(part, [N('x'), N('x') + N('width')], [N('y'), N('y') + N('height')]);
      else if (node.tag === 'circle' && a.cx !== undefined) extend(part, [N('cx') - N('r'), N('cx') + N('r')], [N('cy') - N('r'), N('cy') + N('r')]);
      else if (node.tag === 'line') extend(part, [N('x1'), N('x2')], [N('y1'), N('y2')]);
      else if (node.tag === 'polygon') { const p = nums(a.points); extend(part, p.filter((_, i) => i % 2 === 0), p.filter((_, i) => i % 2 === 1)); }
    }
    if (node.children) walk(node.children, part);
  }
}
walk(scene);
const misplaced = REG.filter((point) => {
  const b = boxes.get(point.part);
  if (!b) return false;
  const pad = 4;
  return point.x < b.x0 - pad || point.x > b.x1 + pad || point.y < b.y0 - pad || point.y > b.y1 + pad;
});
ok(
  'every pad lands on the part it names',
  misplaced.length === 0,
  misplaced.length ? `outside: ${misplaced.map((p) => p.code).join(', ')}` : `${boxes.size} parts measured`,
);

const connectors = connectorsForTemplate(TEMPLATE);
ok('canvas exposes all 18 pads', connectors.length === 18, `got ${connectors.length}`);
ok('pad fractions are in bounds', connectors.every((c) => c.rx >= 0 && c.rx <= 1 && c.ry >= 0 && c.ry <= 1));
ok('no pad claims an analyzer tag', connectors.every((c) => c.analyzerTag === undefined), 'no model is commissioned on this machine');
ok('every pad resolves a parameter kind', connectors.every((c) => parameterKindForConnector(c) !== null));

const brg = connectors.find((c) => c.code === 'CM_TOP_BRG_TEMP')!;
ok('bearing thermocouple accepts degC', connectorFitForUnit(brg, 'degC') === 'match');
ok('bearing thermocouple refuses bar', connectorFitForUnit(brg, 'bar') === 'mismatch');
const spd = connectors.find((c) => c.code === 'CM_TOP_FAST_SPEED')!;
ok('roll speed accepts rpm', connectorFitForUnit(spd, 'rpm') === 'match');
ok('roll speed refuses degC', connectorFitForUnit(spd, 'degC') === 'mismatch');
// A cracking mill is set by the fast/slow differential in each pair, so all
// four rolls need their own pickup; an averaged speed per stage loses it.
ok('all four rolls have an independent speed pickup',
  ['CM_TOP_FAST_SPEED', 'CM_TOP_SLOW_SPEED', 'CM_BOT_FAST_SPEED', 'CM_BOT_SLOW_SPEED']
    .every((code) => connectors.some((c) => c.code === code)));
ok('both stages have their own motor, bearings and gap',
  ['TOP', 'BOT'].every((s) => ['MOTOR_VIB', 'BRG_TEMP', 'GAP'].every((k) => connectors.some((c) => c.code === `CM_${s}_${k}`))));

ok('template has a default card layout', hasDefaultLayout(TEMPLATE));
ok('expected point count is 18', expectedPointsForTemplate(TEMPLATE) === 18, `got ${expectedPointsForTemplate(TEMPLATE)}`);
ok(
  'expected labels come from the registry, in order',
  expectedPointLabelsForTemplate(TEMPLATE).join('|') === REG.map((p) => p.label).join('|'),
);

let seq = 0;
const components = componentsForTemplate(TEMPLATE, () => `id-${seq++}`);
ok('machine tree has 5 components', components.length === 5, `got ${components.length}`);
ok('tree carries all 18 points', components.reduce((n, c) => n + c.points.length, 0) === 18);
ok('every point starts Not Configured', components.every((c) => c.points.every((p) => p.status === 'Not Configured')));

// Phase wrapping, and the gearing it has to respect.
//
// One turn of the fast roll is NOT one turn of the slow roll: they are geared
// at the default 1.25, so the slow roll is at 288 degrees when the fast roll
// completes. The pair only realigns where both are whole turns, which for 1.25
// is 1800 degrees of the fast roll against 1440 of the slow. Asserting
// seamlessness at 360 would have been asserting that the ratio is ignored.
const geared = (opts: Record<string, number>) => JSON.stringify(
  buildCrackingMillScene({ idPrefix: 'check', dark: true, showGrid: true, showLabels: true, ...opts }),
);
const unity = (opts: Record<string, number> = {}) => JSON.stringify(
  buildCrackingMillScene({ idPrefix: 'check', dark: true, showGrid: true, showLabels: true, speedRatio: 1, ...opts }),
);
ok('360 degrees is seamless when the rolls turn together',
  unity({ topFastRotation: 360, bottomFastRotation: 360, feederRotation: 360 }) === unity());
ok('a geared pair realigns only at the common multiple',
  geared({ topFastRotation: 1800, bottomFastRotation: 1800, feederRotation: 1800 }) === JSON.stringify(scene));
ok('and is NOT aligned at one turn of the fast roll',
  geared({ topFastRotation: 360, bottomFastRotation: 360, feederRotation: 360 }) !== JSON.stringify(scene),
  'the 1.25 ratio is modelled, not ignored');
const relieved = buildCrackingMillScene({ idPrefix: 'check', dark: true, showGrid: true, showLabels: true, topRelief: 1 });
ok('tramp relief changes the drawing', JSON.stringify(relieved) !== JSON.stringify(scene));

console.log(failures === 0 ? '\ncracking mill: all checks passed' : `\ncracking mill: ${failures} check(s) failed`);
if (failures > 0) process.exit(1);
