/**
 * Conditioner E-102 template wiring.
 *
 * The five registries have to agree before a template is usable rather than
 * merely compiling, and this template's point registry was written during
 * integration rather than supplied — so "each pad sits on the part it names"
 * is a claim this file checks rather than asserts.
 */
import {
  CONDITIONER_ARTWORK_HEIGHT,
  CONDITIONER_ARTWORK_WIDTH,
  CONDITIONER_COMPONENT_ORDER,
  CONDITIONER_PART_LABELS,
  CONDITIONER_POINT_REGISTRY,
  conditionerPointsForComponent,
} from '../../../../lib/machinePoints/conditionerPoints';
import {
  componentsForTemplate,
  expectedPointLabelsForTemplate,
  expectedPointsForTemplate,
  MACHINE_TEMPLATES,
  type MachineTemplate,
} from '../../../../lib/machines';
import { buildConditionerScene, type ConditionerNode } from '../artwork/conditionerScene';
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

const TEMPLATE = 'Conditioner E-102' as MachineTemplate;
const REG = CONDITIONER_POINT_REGISTRY;
const COUNT = REG.length;

ok('template is registered', (MACHINE_TEMPLATES as readonly string[]).includes(TEMPLATE));
// Eight. It was eighteen, six of them one temperature per deck — the same
// curve sampled at finer resolution than a fault needs.
ok('registry has 8 points', COUNT === 8, `got ${COUNT}`);
ok('point codes are unique', new Set(REG.map((p) => p.code)).size === COUNT);
ok('no two points share a position', new Set(REG.map((p) => `${p.x},${p.y}`)).size === COUNT);
ok(
  'every point belongs to exactly one component',
  CONDITIONER_COMPONENT_ORDER.reduce((n, c) => n + conditionerPointsForComponent(c).length, 0) === COUNT,
);
ok('every point names a real part', REG.every((p) => CONDITIONER_PART_LABELS.some((q) => q.id === p.part)));

const size = artworkSizeForTemplate(TEMPLATE);
ok('artwork frame is the taller 1200x1000', size.width === 1200 && size.height === 1000, `got ${size.width}x${size.height}`);
ok(
  'every point sits inside that frame',
  REG.every((p) => p.x >= 0 && p.x <= CONDITIONER_ARTWORK_WIDTH && p.y >= 0 && p.y <= CONDITIONER_ARTWORK_HEIGHT),
);

const scene = buildConditionerScene({ idPrefix: 'check', dark: true, showGrid: true, showLabels: true });
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
function walk(nodes: readonly ConditionerNode[], inherited?: string) {
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
ok('canvas exposes all 8 pads', connectors.length === 8, `got ${connectors.length}`);
ok('pad fractions are in bounds', connectors.every((c) => c.rx >= 0 && c.rx <= 1 && c.ry >= 0 && c.ry <= 1));
ok('no pad claims an analyzer tag', connectors.every((c) => c.analyzerTag === undefined), 'no model is commissioned on this machine');
ok('every pad resolves a parameter kind', connectors.every((c) => parameterKindForConnector(c) !== null));

const deck = connectors.find((c) => c.code === 'CD_DECK_2_TEMP')!;
ok('deck thermocouple accepts degC', connectorFitForUnit(deck, 'degC') === 'match');
ok('deck thermocouple refuses bar', connectorFitForUnit(deck, 'bar') === 'mismatch');
const steam = connectors.find((c) => c.code === 'CD_STEAM_PRESSURE')!;
ok('header pressure accepts bar', connectorFitForUnit(steam, 'bar') === 'match');
const fan = connectors.find((c) => c.code === 'CD_FAN_VIB')!;
ok('fan vibration accepts mm/s', connectorFitForUnit(fan, 'mm/s') === 'match');
// The profile down the stack is the process, so the two deck temperatures
// that remain have to be at opposite ends of it — two readings a deck apart
// describe nothing.
const upper = REG.find((p) => p.code === 'CD_DECK_2_TEMP')!;
const lower = REG.find((p) => p.code === 'CD_DECK_5_TEMP')!;
ok('the two deck temperatures sit at opposite ends of the stack',
  lower.y - upper.y > 200, `${(lower.y - upper.y).toFixed(0)} apart`);
// A cold condensate return is a steam trap that has failed open, which is
// why it survives the cut while the valve position does not.
ok('the steam side keeps pressure and condensate return',
  ['CD_STEAM_PRESSURE', 'CD_CONDENSATE_TEMP'].every((code) => connectors.some((c) => c.code === code)));

ok('template has a default card layout', hasDefaultLayout(TEMPLATE));
ok('expected point count is 8', expectedPointsForTemplate(TEMPLATE) === 8, `got ${expectedPointsForTemplate(TEMPLATE)}`);
ok(
  'expected labels come from the registry, in order',
  expectedPointLabelsForTemplate(TEMPLATE).join('|') === REG.map((p) => p.label).join('|'),
);

let seq = 0;
const components = componentsForTemplate(TEMPLATE, () => `id-${seq++}`);
ok('machine tree has 5 components', components.length === 5, `got ${components.length}`);
ok('tree carries all 8 points', components.reduce((n, c) => n + c.points.length, 0) === 8);
ok('every point starts Not Configured', components.every((c) => c.points.every((p) => p.status === 'Not Configured')));

const turned = buildConditionerScene({ idPrefix: 'check', dark: true, showGrid: true, showLabels: true, agitatorRotation: 360, fanRotation: 360 });
ok('360 degrees is seamless', JSON.stringify(turned) === JSON.stringify(scene));
const filled = buildConditionerScene({ idPrefix: 'check', dark: true, showGrid: true, showLabels: true, deckLevels: [1, 1, 1, 1, 1, 1] });
ok('deck levels change the drawing', JSON.stringify(filled) !== JSON.stringify(scene));

console.log(failures === 0 ? '\nconditioner: all checks passed' : `\nconditioner: ${failures} check(s) failed`);
if (failures > 0) process.exit(1);
