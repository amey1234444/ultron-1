/**
 * Expander X-101 template wiring.
 *
 * A machine template is only usable when five separate registries agree about
 * it, and nothing in the type system forces four of them to be filled in — a
 * template with no connectors, no default layout or no analysis tree compiles
 * perfectly and then renders an empty canvas. These assert the agreement.
 */
import {
  EXPANDER_COMPONENT_ORDER,
  EXPANDER_POINT_REGISTRY,
  expanderPointsForComponent,
} from '../../../../lib/machinePoints/expanderPoints';
import {
  componentsForTemplate,
  expectedPointLabelsForTemplate,
  expectedPointsForTemplate,
  MACHINE_TEMPLATES,
  type MachineTemplate,
} from '../../../../lib/machines';
import {
  artworkSizeForTemplate,
  connectorFitForUnit,
  connectorsForTemplate,
  parameterKindForConnector,
} from '../machineConnectors';
import { EXPANDER_PARTS } from '../../../../lib/machinePoints/expanderPoints';
import { buildExpanderScene, type SceneNode } from '../artwork/expanderScene';
import { hasDefaultLayout } from '../templateDefaultLayouts';

let failures = 0;
function ok(name: string, condition: boolean, detail = '') {
  console.log(`${condition ? '  PASS' : '  FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!condition) failures++;
}

const TEMPLATE = 'Expander X-101' as MachineTemplate;

ok('template is registered', (MACHINE_TEMPLATES as readonly string[]).includes(TEMPLATE));
// Six. It was thirteen, which instrumented every part that could carry a
// transducer rather than the ones a fault shows up in.
ok('registry has 6 points', EXPANDER_POINT_REGISTRY.length === 6, `got ${EXPANDER_POINT_REGISTRY.length}`);
ok('point codes are unique', new Set(EXPANDER_POINT_REGISTRY.map((p) => p.code)).size === EXPANDER_POINT_REGISTRY.length);
ok(
  'every point belongs to exactly one component',
  EXPANDER_COMPONENT_ORDER.reduce((n, c) => n + expanderPointsForComponent(c).length, 0) === EXPANDER_POINT_REGISTRY.length,
);
ok(
  'every point sits inside the 1200x760 frame',
  EXPANDER_POINT_REGISTRY.every((p) => p.x >= 0 && p.x <= 1200 && p.y >= 0 && p.y <= 760),
);

const size = artworkSizeForTemplate(TEMPLATE);
ok('artwork frame is 1200x760', size.width === 1200 && size.height === 760, `got ${size.width}x${size.height}`);

const connectors = connectorsForTemplate(TEMPLATE);
ok('canvas exposes all 6 pads', connectors.length === 6, `got ${connectors.length}`);
ok('pad fractions are in bounds', connectors.every((c) => c.rx >= 0 && c.rx <= 1 && c.ry >= 0 && c.ry <= 1));
ok(
  'no pad claims an analyzer tag',
  connectors.every((c) => c.analyzerTag === undefined),
  'no model is commissioned on this machine yet',
);
ok('every pad resolves a parameter kind', connectors.every((c) => parameterKindForConnector(c) !== null));

// Parameter locking: a pad must refuse a channel reporting the wrong quantity.
const barrel = connectors.find((c) => c.code === 'EX_BARREL_TEMP_2')!;
ok('barrel thermocouple accepts degC', connectorFitForUnit(barrel, 'degC') === 'match');
ok('barrel thermocouple refuses bar', connectorFitForUnit(barrel, 'bar') === 'mismatch');
const cone = connectors.find((c) => c.code === 'EX_CONE_POSITION')!;
ok('cone position accepts a percentage', connectorFitForUnit(cone, '%') === 'match');
const pressure = connectors.find((c) => c.code === 'EX_OUTLET_PRESSURE')!;
ok('outlet transducer accepts bar', connectorFitForUnit(pressure, 'bar') === 'match');
ok('outlet transducer refuses degC', connectorFitForUnit(pressure, 'degC') === 'mismatch');

ok('template has a default card layout', hasDefaultLayout(TEMPLATE));
ok('expected point count is 6', expectedPointsForTemplate(TEMPLATE) === 6, `got ${expectedPointsForTemplate(TEMPLATE)}`);
ok(
  'expected labels come from the registry, in order',
  expectedPointLabelsForTemplate(TEMPLATE).join('|') === EXPANDER_POINT_REGISTRY.map((p) => p.label).join('|'),
);

let seq = 0;
const components = componentsForTemplate(TEMPLATE, () => `id-${seq++}`);
ok('machine tree has 4 components', components.length === 4, `got ${components.length}`);
ok('tree carries all 6 points', components.reduce((n, c) => n + c.points.length, 0) === 6);
ok('every point starts Not Configured', components.every((c) => c.points.every((p) => p.status === 'Not Configured')));

// The drawing itself. expanderScene is pure data, so it can be built and
// inspected here without a renderer.
const scene = buildExpanderScene({ idPrefix: 'check', dark: true, showLabels: true, showGrid: true,
  screwRotation: 0, feederRotation: 0, conePosition: 0 });
ok('scene builds and is non-empty', Array.isArray(scene) && scene.length > 0, `${scene.length} root nodes`);

function collectParts(nodes: readonly SceneNode[], into: Set<string>): Set<string> {
  for (const node of nodes) {
    if (node.part) into.add(node.part);
    if (node.children) collectParts(node.children, into);
  }
  return into;
}
const drawn = collectParts(scene, new Set<string>());
const undrawn = EXPANDER_PARTS.filter((part) => !drawn.has(part.id)).map((part) => part.id);
ok('every registered part is drawn', undrawn.length === 0, undrawn.length ? `missing: ${undrawn.join(', ')}` : `${drawn.size} parts`);

const everyPointsPartExists = EXPANDER_POINT_REGISTRY.every((point) =>
  EXPANDER_PARTS.some((part) => part.id === point.part));
ok('every point names a real part', everyPointsPartExists);

// A rotation of exactly one turn must land on the same geometry as none.
const turned = buildExpanderScene({ idPrefix: 'check', dark: true, showLabels: true, showGrid: true,
  screwRotation: 360, feederRotation: 360, conePosition: 0 });
ok('360 degrees is seamless', JSON.stringify(turned) === JSON.stringify(scene));

// The cone must actually move, or conePosition is decorative.
const opened = buildExpanderScene({ idPrefix: 'check', dark: true, showLabels: true, showGrid: true,
  screwRotation: 0, feederRotation: 0, conePosition: 1 });
ok('cone position changes the drawing', JSON.stringify(opened) !== JSON.stringify(scene));

console.log(failures === 0 ? '\nexpander: all checks passed' : `\nexpander: ${failures} check(s) failed`);
if (failures > 0) process.exit(1);
