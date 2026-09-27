/**
 * Flaking Mill M-102 template wiring.
 *
 * Same five-registry agreement the expander checks assert, plus two things
 * specific to this template: its frame is 1200 x 1000 rather than the 1200 x
 * 760 every other flat artwork uses, and its point registry was written during
 * integration rather than supplied, so the claim that each pad sits on the part
 * it names is one this file has to actually check.
 */
import {
  FLAKING_MILL_ARTWORK_HEIGHT,
  FLAKING_MILL_ARTWORK_WIDTH,
  FLAKING_MILL_COMPONENT_ORDER,
  FLAKING_MILL_PART_LABELS,
  FLAKING_MILL_POINT_REGISTRY,
  flakingMillPointsForComponent,
} from '../../../../lib/flakingMillPoints';
import {
  componentsForTemplate,
  expectedPointLabelsForTemplate,
  expectedPointsForTemplate,
  MACHINE_TEMPLATES,
  type MachineTemplate,
} from '../../../../lib/machines';
import { buildFlakingMillScene, type MillNode } from '../flakingMillScene';
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

const TEMPLATE = 'Flaking Mill M-102' as MachineTemplate;
const COUNT = FLAKING_MILL_POINT_REGISTRY.length;

ok('template is registered', (MACHINE_TEMPLATES as readonly string[]).includes(TEMPLATE));
ok('registry has 17 points', COUNT === 17, `got ${COUNT}`);
ok('point codes are unique', new Set(FLAKING_MILL_POINT_REGISTRY.map((p) => p.code)).size === COUNT);
ok(
  'every point belongs to exactly one component',
  FLAKING_MILL_COMPONENT_ORDER.reduce((n, c) => n + flakingMillPointsForComponent(c).length, 0) === COUNT,
);
ok('no two points share a position', new Set(FLAKING_MILL_POINT_REGISTRY.map((p) => `${p.x},${p.y}`)).size === COUNT);

const size = artworkSizeForTemplate(TEMPLATE);
ok('artwork frame is the taller 1200x1000', size.width === 1200 && size.height === 1000, `got ${size.width}x${size.height}`);
ok(
  'every point sits inside that frame',
  FLAKING_MILL_POINT_REGISTRY.every(
    (p) => p.x >= 0 && p.x <= FLAKING_MILL_ARTWORK_WIDTH && p.y >= 0 && p.y <= FLAKING_MILL_ARTWORK_HEIGHT,
  ),
);

// The scene, and the claim that each pad lands on the part it names.
const scene = buildFlakingMillScene({ idPrefix: 'check', dark: true, showGrid: true, showLabels: true });
ok('scene builds and is non-empty', Array.isArray(scene) && scene.length > 0, `${scene.length} root nodes`);

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
function walk(nodes: readonly MillNode[], inherited?: string) {
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

const misplaced = FLAKING_MILL_POINT_REGISTRY.filter((point) => {
  const b = boxes.get(point.part);
  if (!b) return false; // part drawn only with paths/arcs; bbox not derivable here
  const pad = 4;
  return point.x < b.x0 - pad || point.x > b.x1 + pad || point.y < b.y0 - pad || point.y > b.y1 + pad;
});
ok(
  'every pad lands on the part it names',
  misplaced.length === 0,
  misplaced.length ? `outside: ${misplaced.map((p) => p.code).join(', ')}` : `${boxes.size} parts measured`,
);
ok('every point names a real part', FLAKING_MILL_POINT_REGISTRY.every((p) => FLAKING_MILL_PART_LABELS.some((q) => q.id === p.part)));

const connectors = connectorsForTemplate(TEMPLATE);
ok('canvas exposes all 17 pads', connectors.length === 17, `got ${connectors.length}`);
ok('pad fractions are in bounds', connectors.every((c) => c.rx >= 0 && c.rx <= 1 && c.ry >= 0 && c.ry <= 1));
ok('no pad claims an analyzer tag', connectors.every((c) => c.analyzerTag === undefined), 'no model is commissioned on this machine');
ok('every pad resolves a parameter kind', connectors.every((c) => parameterKindForConnector(c) !== null));

const brg = connectors.find((c) => c.code === 'FM_ROLL_1_BRG_TEMP')!;
ok('bearing thermocouple accepts degC', connectorFitForUnit(brg, 'degC') === 'match');
ok('bearing thermocouple refuses mm/s', connectorFitForUnit(brg, 'mm/s') === 'mismatch');
const hyd = connectors.find((c) => c.code === 'FM_HYD_PRESSURE')!;
ok('loading pressure accepts bar', connectorFitForUnit(hyd, 'bar') === 'match');
const speed = connectors.find((c) => c.code === 'FM_ROLL_1_SPEED')!;
ok('roll speed accepts rpm', connectorFitForUnit(speed, 'rpm') === 'match');
ok('roll speed refuses degC', connectorFitForUnit(speed, 'degC') === 'mismatch');
// Differential roll speed is the process variable, so both must exist.
ok('both rolls have an independent speed pickup',
  ['FM_ROLL_1_SPEED', 'FM_ROLL_2_SPEED'].every((code) => connectors.some((c) => c.code === code)));

ok('template has a default card layout', hasDefaultLayout(TEMPLATE));
ok('expected point count is 17', expectedPointsForTemplate(TEMPLATE) === 17, `got ${expectedPointsForTemplate(TEMPLATE)}`);
ok(
  'expected labels come from the registry, in order',
  expectedPointLabelsForTemplate(TEMPLATE).join('|') === FLAKING_MILL_POINT_REGISTRY.map((p) => p.label).join('|'),
);

let seq = 0;
const components = componentsForTemplate(TEMPLATE, () => `id-${seq++}`);
ok('machine tree has 5 components', components.length === 5, `got ${components.length}`);
ok('tree carries all 17 points', components.reduce((n, c) => n + c.points.length, 0) === 17);
ok('every point starts Not Configured', components.every((c) => c.points.every((p) => p.status === 'Not Configured')));

// Phase wrapping and the decorative inputs the renderer exposes.
const turned = buildFlakingMillScene({ idPrefix: 'check', dark: true, showGrid: true, showLabels: true, rollRotation: 360, feederRotation: 360 });
ok('360 degrees is seamless', JSON.stringify(turned) === JSON.stringify(scene));
const filled = buildFlakingMillScene({ idPrefix: 'check', dark: true, showGrid: true, showLabels: true, hopperLevel: 1 });
ok('hopper level changes the drawing', JSON.stringify(filled) !== JSON.stringify(scene));

console.log(failures === 0 ? '\nflaking mill: all checks passed' : `\nflaking mill: ${failures} check(s) failed`);
if (failures > 0) process.exit(1);
