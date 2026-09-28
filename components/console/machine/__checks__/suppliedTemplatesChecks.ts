/**
 * The ten templates whose point registries were supplied with them.
 *
 * Three archives: the oilseed four (DTDC, Solvent Extractor, Collet Cooler,
 * Seed Dryer Cooler), the meal-handling four (Hammer Mill, Meal Sifter, Meal
 * Conveying & Storage, Auto Bagger & Stitcher) and the solvent two (Miscella
 * Distillation, Solvent Recovery). One file, because they
 * share the property that makes them different from every machine integrated
 * before them: their point registries were **supplied** rather than written
 * during integration.
 *
 * That changes what is worth checking. For the flaking mill, the cracking mill
 * and the conditioner the interesting question was "does each pad land on the
 * part it names", because a human placed them. Here the interesting question
 * is "has anything drifted from what the archive said" — the registry, the
 * artwork's own sensor list and the canvas connectors are three copies of the
 * same 43 points, and two of them being right is not good enough.
 */
import {
  MISCELLA_DISTILLATION_ARTWORK_HEIGHT,
  MISCELLA_DISTILLATION_ARTWORK_WIDTH,
  MISCELLA_DISTILLATION_COMPONENT_ORDER,
  MISCELLA_DISTILLATION_PART_LABELS,
  MISCELLA_DISTILLATION_POINT_REGISTRY,
} from '../../../../lib/machinePoints/miscellaDistillationPoints';
import {
  SOLVENT_RECOVERY_ARTWORK_HEIGHT,
  SOLVENT_RECOVERY_ARTWORK_WIDTH,
  SOLVENT_RECOVERY_COMPONENT_ORDER,
  SOLVENT_RECOVERY_PART_LABELS,
  SOLVENT_RECOVERY_POINT_REGISTRY,
} from '../../../../lib/machinePoints/solventRecoveryPoints';
import {
  AUTO_BAGGER_ARTWORK_HEIGHT,
  AUTO_BAGGER_ARTWORK_WIDTH,
  AUTO_BAGGER_COMPONENT_ORDER,
  AUTO_BAGGER_PART_LABELS,
  AUTO_BAGGER_POINT_REGISTRY,
} from '../../../../lib/machinePoints/autoBaggerPoints';
import {
  HAMMER_MILL_ARTWORK_HEIGHT,
  HAMMER_MILL_ARTWORK_WIDTH,
  HAMMER_MILL_COMPONENT_ORDER,
  HAMMER_MILL_PART_LABELS,
  HAMMER_MILL_POINT_REGISTRY,
} from '../../../../lib/machinePoints/hammerMillPoints';
import {
  MEAL_CONVEYING_STORAGE_ARTWORK_HEIGHT,
  MEAL_CONVEYING_STORAGE_ARTWORK_WIDTH,
  MEAL_CONVEYING_STORAGE_COMPONENT_ORDER,
  MEAL_CONVEYING_STORAGE_PART_LABELS,
  MEAL_CONVEYING_STORAGE_POINT_REGISTRY,
} from '../../../../lib/machinePoints/mealConveyingStoragePoints';
import {
  MEAL_SIFTER_ARTWORK_HEIGHT,
  MEAL_SIFTER_ARTWORK_WIDTH,
  MEAL_SIFTER_COMPONENT_ORDER,
  MEAL_SIFTER_PART_LABELS,
  MEAL_SIFTER_POINT_REGISTRY,
} from '../../../../lib/machinePoints/mealSifterPoints';
import {
  COLLET_COOLER_ARTWORK_HEIGHT,
  COLLET_COOLER_ARTWORK_WIDTH,
  COLLET_COOLER_COMPONENT_ORDER,
  COLLET_COOLER_PART_LABELS,
  COLLET_COOLER_POINT_REGISTRY,
} from '../../../../lib/machinePoints/colletCoolerPoints';
import {
  DTDC_ARTWORK_HEIGHT,
  DTDC_ARTWORK_WIDTH,
  DTDC_COMPONENT_ORDER,
  DTDC_PART_LABELS,
  DTDC_POINT_REGISTRY,
} from '../../../../lib/machinePoints/dtdcPoints';
import {
  SEED_DRYER_COOLER_ARTWORK_HEIGHT,
  SEED_DRYER_COOLER_ARTWORK_WIDTH,
  SEED_DRYER_COOLER_COMPONENT_ORDER,
  SEED_DRYER_COOLER_PART_LABELS,
  SEED_DRYER_COOLER_POINT_REGISTRY,
} from '../../../../lib/machinePoints/seedDryerCoolerPoints';
import {
  SOLVENT_EXTRACTOR_ARTWORK_HEIGHT,
  SOLVENT_EXTRACTOR_ARTWORK_WIDTH,
  SOLVENT_EXTRACTOR_COMPONENT_ORDER,
  SOLVENT_EXTRACTOR_PART_LABELS,
  SOLVENT_EXTRACTOR_POINT_REGISTRY,
} from '../../../../lib/machinePoints/solventExtractorPoints';
import {
  componentsForTemplate,
  expectedPointLabelsForTemplate,
  expectedPointsForTemplate,
  MACHINE_TEMPLATES,
  type MachineTemplate,
} from '../../../../lib/machines';
import { AUTOBAGGER_SCENE, AUTOBAGGER_SENSORS, AUTOBAGGER_PARTS } from '../artwork/autoBaggerScene';
import { MISCELLADISTILLATION_SCENE, MISCELLADISTILLATION_SENSORS, MISCELLADISTILLATION_PARTS } from '../artwork/miscellaDistillationScene';
import { SOLVENTRECOVERY_SCENE, SOLVENTRECOVERY_SENSORS, SOLVENTRECOVERY_PARTS } from '../artwork/solventRecoveryScene';
import { COLLETCOOLER_SCENE, COLLETCOOLER_SENSORS, COLLETCOOLER_PARTS } from '../artwork/colletCoolerScene';
import { HAMMERMILL_SCENE, HAMMERMILL_SENSORS, HAMMERMILL_PARTS } from '../artwork/hammerMillScene';
import { MEALCONVEYINGSTORAGE_SCENE, MEALCONVEYINGSTORAGE_SENSORS, MEALCONVEYINGSTORAGE_PARTS } from '../artwork/mealConveyingStorageScene';
import { MEALSIFTER_SCENE, MEALSIFTER_SENSORS, MEALSIFTER_PARTS } from '../artwork/mealSifterScene';
import { DTDC_SCENE, DTDC_SENSORS, DTDC_PARTS } from '../artwork/dtdcScene';
import { SEEDDRYERCOOLER_SCENE, SEEDDRYERCOOLER_SENSORS, SEEDDRYERCOOLER_PARTS } from '../artwork/seedDryerCoolerScene';
import { SOLVENTEXTRACTOR_SCENE, SOLVENTEXTRACTOR_SENSORS, SOLVENTEXTRACTOR_PARTS } from '../artwork/solventExtractorScene';
import {
  artworkSizeForTemplate,
  connectorFitForUnit,
  connectorsForTemplate,
  parameterKindForConnector,
} from '../machineConnectors';
import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { AutoBagger } from '../artwork/AutoBagger';
import { MiscellaDistillation } from '../artwork/MiscellaDistillation';
import { SolventRecovery } from '../artwork/SolventRecovery';
import { ColletCooler } from '../artwork/ColletCooler';
import { HammerMill } from '../artwork/HammerMill';
import { MealConveyingStorage } from '../artwork/MealConveyingStorage';
import { MealSifter } from '../artwork/MealSifter';
import { DTDC as DTDCArtwork } from '../artwork/DTDC';
import { SeedDryerCooler } from '../artwork/SeedDryerCooler';
import { SolventExtractor } from '../artwork/SolventExtractor';
import { hasDefaultLayout } from '../templateDefaultLayouts';

// `machineIcons` is deliberately not imported. It pulls in @expo/vector-icons
// and through it react-native, neither of which this esbuild/node harness can
// bundle — the other template checks leave it alone for the same reason. The
// icon wiring is covered by the compiler instead: MACHINE_TEMPLATE_ICON is an
// exhaustive Record<MachineTemplate, ...>, so a template with no icon does not
// typecheck, and the drawn-icon map is typed against the same union.

let failures = 0;
function ok(name: string, condition: boolean, detail = '') {
  console.log(`${condition ? '  PASS' : '  FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!condition) failures++;
}

type SceneNode = { tag: string; attrs: Record<string, string>; children?: SceneNode[]; text?: string };
type Sensor = { id: string; x: number; y: number; kind: string; label: string };
type Point = { code: string; label: string; kind: string; x: number; y: number; utility: boolean; component: string };

const MACHINES = [
  {
    template: 'DTDC' as MachineTemplate,
    points: DTDC_POINT_REGISTRY as readonly Point[],
    sensors: DTDC_SENSORS as readonly Sensor[],
    scene: DTDC_SCENE as readonly SceneNode[],
    parts: DTDC_PARTS as readonly { id: string }[],
    partLabels: DTDC_PART_LABELS,
    order: DTDC_COMPONENT_ORDER,
    width: DTDC_ARTWORK_WIDTH,
    height: DTDC_ARTWORK_HEIGHT,
    expected: 10,
    utilities: 1,
  },
  {
    template: 'Solvent Extractor' as MachineTemplate,
    points: SOLVENT_EXTRACTOR_POINT_REGISTRY as readonly Point[],
    sensors: SOLVENTEXTRACTOR_SENSORS as readonly Sensor[],
    scene: SOLVENTEXTRACTOR_SCENE as readonly SceneNode[],
    parts: SOLVENTEXTRACTOR_PARTS as readonly { id: string }[],
    partLabels: SOLVENT_EXTRACTOR_PART_LABELS,
    order: SOLVENT_EXTRACTOR_COMPONENT_ORDER,
    width: SOLVENT_EXTRACTOR_ARTWORK_WIDTH,
    height: SOLVENT_EXTRACTOR_ARTWORK_HEIGHT,
    // Eight, matching the eight dots the reference drawing marks. It was
    // twenty: the drawing labels the hopper level "(each stage)" and the two
    // pump measurements "(each pump)", and those had been expanded to five
    // hoppers and five pumps.
    expected: 8,
    utilities: 0,
  },
  {
    template: 'Collet Cooler' as MachineTemplate,
    points: COLLET_COOLER_POINT_REGISTRY as readonly Point[],
    sensors: COLLETCOOLER_SENSORS as readonly Sensor[],
    scene: COLLETCOOLER_SCENE as readonly SceneNode[],
    parts: COLLETCOOLER_PARTS as readonly { id: string }[],
    partLabels: COLLET_COOLER_PART_LABELS,
    order: COLLET_COOLER_COMPONENT_ORDER,
    width: COLLET_COOLER_ARTWORK_WIDTH,
    height: COLLET_COOLER_ARTWORK_HEIGHT,
    expected: 5,
    utilities: 0,
  },
  {
    template: 'Seed Dryer Cooler' as MachineTemplate,
    points: SEED_DRYER_COOLER_POINT_REGISTRY as readonly Point[],
    sensors: SEEDDRYERCOOLER_SENSORS as readonly Sensor[],
    scene: SEEDDRYERCOOLER_SCENE as readonly SceneNode[],
    parts: SEEDDRYERCOOLER_PARTS as readonly { id: string }[],
    partLabels: SEED_DRYER_COOLER_PART_LABELS,
    order: SEED_DRYER_COOLER_COMPONENT_ORDER,
    width: SEED_DRYER_COOLER_ARTWORK_WIDTH,
    height: SEED_DRYER_COOLER_ARTWORK_HEIGHT,
    expected: 8,
    utilities: 2,
  },
  {
    template: 'Hammer Mill' as MachineTemplate,
    points: HAMMER_MILL_POINT_REGISTRY as readonly Point[],
    sensors: HAMMERMILL_SENSORS as readonly Sensor[],
    scene: HAMMERMILL_SCENE as readonly SceneNode[],
    parts: HAMMERMILL_PARTS as readonly { id: string }[],
    partLabels: HAMMER_MILL_PART_LABELS,
    order: HAMMER_MILL_COMPONENT_ORDER,
    width: HAMMER_MILL_ARTWORK_WIDTH,
    height: HAMMER_MILL_ARTWORK_HEIGHT,
    expected: 3,
    utilities: 0,
  },
  {
    template: 'Meal Sifter' as MachineTemplate,
    points: MEAL_SIFTER_POINT_REGISTRY as readonly Point[],
    sensors: MEALSIFTER_SENSORS as readonly Sensor[],
    scene: MEALSIFTER_SCENE as readonly SceneNode[],
    parts: MEALSIFTER_PARTS as readonly { id: string }[],
    partLabels: MEAL_SIFTER_PART_LABELS,
    order: MEAL_SIFTER_COMPONENT_ORDER,
    width: MEAL_SIFTER_ARTWORK_WIDTH,
    height: MEAL_SIFTER_ARTWORK_HEIGHT,
    expected: 3,
    utilities: 0,
  },
  {
    template: 'Meal Conveying & Storage' as MachineTemplate,
    points: MEAL_CONVEYING_STORAGE_POINT_REGISTRY as readonly Point[],
    sensors: MEALCONVEYINGSTORAGE_SENSORS as readonly Sensor[],
    scene: MEALCONVEYINGSTORAGE_SCENE as readonly SceneNode[],
    parts: MEALCONVEYINGSTORAGE_PARTS as readonly { id: string }[],
    partLabels: MEAL_CONVEYING_STORAGE_PART_LABELS,
    order: MEAL_CONVEYING_STORAGE_COMPONENT_ORDER,
    width: MEAL_CONVEYING_STORAGE_ARTWORK_WIDTH,
    height: MEAL_CONVEYING_STORAGE_ARTWORK_HEIGHT,
    expected: 4,
    utilities: 0,
  },
  {
    template: 'Auto Bagger & Stitcher' as MachineTemplate,
    points: AUTO_BAGGER_POINT_REGISTRY as readonly Point[],
    sensors: AUTOBAGGER_SENSORS as readonly Sensor[],
    scene: AUTOBAGGER_SCENE as readonly SceneNode[],
    parts: AUTOBAGGER_PARTS as readonly { id: string }[],
    partLabels: AUTO_BAGGER_PART_LABELS,
    order: AUTO_BAGGER_COMPONENT_ORDER,
    width: AUTO_BAGGER_ARTWORK_WIDTH,
    height: AUTO_BAGGER_ARTWORK_HEIGHT,
    expected: 4,
    utilities: 1,
  },
  {
    template: 'Miscella Distillation' as MachineTemplate,
    points: MISCELLA_DISTILLATION_POINT_REGISTRY as readonly Point[],
    sensors: MISCELLADISTILLATION_SENSORS as readonly Sensor[],
    scene: MISCELLADISTILLATION_SCENE as readonly SceneNode[],
    parts: MISCELLADISTILLATION_PARTS as readonly { id: string }[],
    partLabels: MISCELLA_DISTILLATION_PART_LABELS,
    order: MISCELLA_DISTILLATION_COMPONENT_ORDER,
    width: MISCELLA_DISTILLATION_ARTWORK_WIDTH,
    height: MISCELLA_DISTILLATION_ARTWORK_HEIGHT,
    expected: 13,
    utilities: 2,
  },
  {
    template: 'Solvent Recovery' as MachineTemplate,
    points: SOLVENT_RECOVERY_POINT_REGISTRY as readonly Point[],
    sensors: SOLVENTRECOVERY_SENSORS as readonly Sensor[],
    scene: SOLVENTRECOVERY_SCENE as readonly SceneNode[],
    parts: SOLVENTRECOVERY_PARTS as readonly { id: string }[],
    partLabels: SOLVENT_RECOVERY_PART_LABELS,
    order: SOLVENT_RECOVERY_COMPONENT_ORDER,
    width: SOLVENT_RECOVERY_ARTWORK_WIDTH,
    height: SOLVENT_RECOVERY_ARTWORK_HEIGHT,
    expected: 14,
    utilities: 4,
  },
];

function walk(nodes: readonly SceneNode[], visit: (node: SceneNode) => void) {
  for (const node of nodes) {
    visit(node);
    if (node.children) walk(node.children, visit);
  }
}

/**
 * The tags the artwork components know how to draw.
 *
 * Kept in step with the `PRIMITIVES` map in each component by hand, which is
 * why the assertion below exists: the two drifting apart is silent at runtime.
 */
const RENDERABLE_TAGS = new Set([
  'g', 'rect', 'path', 'line', 'circle', 'text', 'defs', 'linearGradient', 'stop', 'pattern',
]);

let totalPoints = 0;

for (const m of MACHINES) {
  console.log(`\n--- ${m.template} ---`);
  const count = m.points.length;
  totalPoints += count;

  ok('template is registered', (MACHINE_TEMPLATES as readonly string[]).includes(m.template));
  ok(`registry has ${m.expected} points`, count === m.expected, `got ${count}`);
  ok('point codes are unique', new Set(m.points.map((p) => p.code)).size === count);
  ok('no two points share a position', new Set(m.points.map((p) => `${p.x},${p.y}`)).size === count);

  // The registry is derived from the archive's connections.json and the scene
  // carries the archive's own copy. If these ever disagree, the canvas is
  // snapping to somewhere the machine was not drawn.
  const byId = new Map(m.sensors.map((s) => [s.id, s]));
  ok('every registry point exists in the artwork', m.points.every((p) => byId.has(p.code)),
    m.points.filter((p) => !byId.has(p.code)).map((p) => p.code).join(', ') || 'all present');
  ok('artwork declares no extra points', m.sensors.length === count, `artwork ${m.sensors.length}, registry ${count}`);
  const drifted = m.points.filter((p) => {
    const s = byId.get(p.code);
    return !s || s.x !== p.x || s.y !== p.y;
  });
  ok('coordinates match the artwork exactly', drifted.length === 0,
    drifted.length ? `drifted: ${drifted.map((p) => p.code).join(', ')}` : `${count} checked`);
  ok('labels match the artwork exactly', m.points.every((p) => byId.get(p.code)?.label === p.label));

  const size = artworkSizeForTemplate(m.template);
  ok('artwork frame matches the registry', size.width === m.width && size.height === m.height,
    `${size.width}x${size.height}`);
  ok('every point sits inside that frame',
    m.points.every((p) => p.x >= 0 && p.x <= m.width && p.y >= 0 && p.y <= m.height));

  ok(`${m.utilities} utility point(s), the rest process`,
    m.points.filter((p) => p.utility).length === m.utilities,
    `got ${m.points.filter((p) => p.utility).length}`);
  ok('utility flag agrees with the artwork',
    m.points.every((p) => (byId.get(p.code)?.kind === 'utility') === p.utility));

  ok('every point belongs to exactly one component',
    m.order.reduce((n, c) => n + m.points.filter((p) => p.component === c).length, 0) === count);
  ok('every component has at least one point',
    m.order.every((c) => m.points.some((p) => p.component === c)));
  ok('part labels cover the artwork parts',
    m.parts.every((q) => m.partLabels.some((r) => r.id === q.id)),
    `${m.partLabels.length} labels, ${m.parts.length} in artwork`);

  ok('scene is non-empty', m.scene.length > 0, `${m.scene.length} root nodes`);

  // The renderer looks each tag up in a map and returns null when it misses,
  // so an unmapped tag does not throw — it silently deletes that part of the
  // machine. A re-export that introduces `polygon` or `ellipse` would draw a
  // drawing with a hole in it and nothing would say so.
  const tags = new Set<string>();
  walk(m.scene, (node) => tags.add(node.tag));
  const unmapped = [...tags].filter((t) => !RENDERABLE_TAGS.has(t));
  ok('every tag in the scene can be rendered', unmapped.length === 0,
    unmapped.length ? `unmapped, geometry would vanish: ${unmapped.join(', ')}` : [...tags].sort().join(', '));
  const ids = new Set<string>();
  let textNodes = 0;
  walk(m.scene, (node) => {
    if (node.attrs?.id) ids.add(node.attrs.id);
    if (node.tag === 'text' && node.text) textNodes++;
  });
  // The console draws its own background and grid and owns pad rendering, so
  // all three have to be switchable or the workspace gets a double.
  for (const group of ['background', 'engineering-grid', 'sensor-points']) {
    ok(`scene exposes '${group}' so the console can switch it off`, ids.has(group));
  }
  // The archive states the drawings carry no sensor names or callout lines.
  // If one ever appears the canvas would show it twice — once in the artwork
  // and once on the card.
  ok('artwork carries no sensor labels', !m.points.some((p) => {
    let found = false;
    walk(m.scene, (node) => { if (node.tag === 'text' && node.text === p.label) found = true; });
    return found;
  }), `${textNodes} text node(s) in the drawing`);

  const connectors = connectorsForTemplate(m.template);
  ok(`canvas exposes all ${m.expected} pads`, connectors.length === count, `got ${connectors.length}`);
  ok('pad fractions are in bounds', connectors.every((c) => c.rx >= 0 && c.rx <= 1 && c.ry >= 0 && c.ry <= 1));
  ok('no pad claims an analyzer tag', connectors.every((c) => c.analyzerTag === undefined),
    'no model is commissioned on these machines');

  ok('template has a default card layout', hasDefaultLayout(m.template));
  ok(`expected point count is ${m.expected}`, expectedPointsForTemplate(m.template) === count);
  // Set equality, not sequence. The registry keeps the archive's own index
  // order; the machine tree emits points grouped by component. Both orders
  // are deliberate and they only coincide by luck, so what has to hold is
  // that every registry point reaches the tree exactly once and nothing else
  // does.
  const treeLabels = expectedPointLabelsForTemplate(m.template).slice().sort();
  const regLabels = m.points.map((p) => p.label).slice().sort();
  ok('the machine tree carries exactly the registry labels',
    treeLabels.join('|') === regLabels.join('|'),
    treeLabels.length === regLabels.length ? 'same set' : `tree ${treeLabels.length}, registry ${regLabels.length}`);
  ok('no label is duplicated', new Set(regLabels).size === regLabels.length);

  let seq = 0;
  const components = componentsForTemplate(m.template, () => `id-${seq++}`);
  ok(`machine tree has ${m.order.length} components`, components.length === m.order.length, `got ${components.length}`);
  ok('tree carries every point', components.reduce((n, c) => n + c.points.length, 0) === count);
  ok('every point starts Not Configured', components.every((c) => c.points.every((p) => p.status === 'Not Configured')));
}

console.log('\n--- across all ten ---');
ok('72 logical connection groups in total', totalPoints === 72,
  `got ${totalPoints} (31 oilseed + 14 meal + 27 solvent)`);

// Unit matching, one assertion per kind these machines introduced.
const dtdc = connectorsForTemplate('DTDC');
const sparge = dtdc.find((c) => c.code === 'M08-UT-03')!;
ok('sparge steam flow accepts kg/h', connectorFitForUnit(sparge, 'kg/h') === 'match');
ok('sparge steam flow refuses degC', connectorFitForUnit(sparge, 'degC') === 'mismatch');
const gearbox = dtdc.find((c) => c.code === 'M08-MS-09')!;
ok('gearbox vibration accepts mm/s', connectorFitForUnit(gearbox, 'mm/s') === 'match');

const seed = connectorsForTemplate('Seed Dryer Cooler');
const co = seed.find((c) => c.code === 'SD-EXH-CO')!;
ok('CO detector accepts ppm', connectorFitForUnit(co, 'ppm') === 'match');
ok('CO detector refuses degC', connectorFitForUnit(co, 'degC') === 'mismatch');
const trap = seed.find((c) => c.code === 'SD-TRAP')!;
ok('steam trap monitor claims no unit fit', parameterKindForConnector(trap) === null,
  'a trap monitor reports no engineering unit');
ok('steam trap monitor therefore blocks nothing', connectorFitForUnit(trap, 'degC') === 'unknown');

const extractor = connectorsForTemplate('Solvent Extractor');
const takeup = extractor.find((c) => c.code === 'EX-TAKEUP-01')!;
ok('chain take-up accepts mm', connectorFitForUnit(takeup, 'mm') === 'match');
ok('chain take-up refuses %', connectorFitForUnit(takeup, '%') === 'mismatch',
  'travel is a distance, not a level');
const leak = extractor.find((c) => c.code === 'EX-PMP-01-LEAK')!;
ok('a seal leak claims no unit fit', parameterKindForConnector(leak) === null);
// One pad per measurement, as the drawing marks it. How many stages and
// pumps a particular extractor has is not something this registry knows, and
// guessing five put twenty instruments on a machine drawn with eight.
ok('the repeated measurements are represented once each',
  ['EX-HOP-01-HL', 'EX-PMP-01-VIB', 'EX-PMP-01-LEAK'].every((code) => extractor.some((c) => c.code === code)));
ok('and their labels say they repeat',
  ['EX-HOP-01-HL', 'EX-PMP-01-VIB', 'EX-PMP-01-LEAK']
    .map((code) => extractor.find((c) => c.code === code)!.label)
    .every((label) => label.includes('each')),
  'so nobody reads one pad as one instrument on the whole machine');
ok('no per-stage or per-pump duplicates were left behind',
  !SOLVENT_EXTRACTOR_POINT_REGISTRY.some((p) => /-0[2-9]-/.test(p.code)),
  SOLVENT_EXTRACTOR_POINT_REGISTRY.filter((p) => /-0[2-9]-/.test(p.code)).map((p) => p.code).join(', '));

// The extractor is the one wide machine; squeezing it onto 1200x1000 would
// distort every proportion in it.
ok('the extractor keeps its own 1200x850 frame',
  artworkSizeForTemplate('Solvent Extractor').height === 850);
ok('the other three share 1200x1000',
  ['DTDC', 'Collet Cooler', 'Seed Dryer Cooler']
    .every((t) => artworkSizeForTemplate(t).width === 1200 && artworkSizeForTemplate(t).height === 1000));
// The solvent pair are process trains drawn end to end, so they are wider
// and shallower than everything else. Nothing may assume a shared frame.
ok('the solvent pair keep their own 2048x1100 frame',
  ['Miscella Distillation', 'Solvent Recovery']
    .every((t) => artworkSizeForTemplate(t).width === 2048 && artworkSizeForTemplate(t).height === 1100));
ok('three distinct artwork frames are in use across the supplied templates',
  new Set(MACHINES.map((m) => `${m.width}x${m.height}`)).size === 3,
  [...new Set(MACHINES.map((m) => `${m.width}x${m.height}`))].join(', '));

// A pad carrying three measurements stays one logical point.
const drive = SOLVENT_EXTRACTOR_POINT_REGISTRY.find((p) => p.code === 'EX-DRV-01')!;
ok('the extractor drive is one point carrying three measurements',
  drive.measurements.length === 3, drive.measurements.join(' + '));

// Existing templates must be untouched by all of this.
ok('the conditioner still exposes 18 pads', connectorsForTemplate('Conditioner E-102').length === 18);
ok('the twin screw still has a default layout', hasDefaultLayout('Twin Screw Extruder'));

// --------------------------------------------------------------------------
// Rendering
// --------------------------------------------------------------------------
//
// Everything above checks the data. This checks that the data becomes a
// drawing: the renderer resolves each tag through a lookup and returns null on
// a miss, so a component can produce a perfectly valid, perfectly empty SVG
// and every assertion above would still pass.
console.log('\n--- templates are workspace-independent ---');

// A machine template is a definition in code — its artwork, its point
// registry, its connectors and its default card layout. None of that is
// stored per workspace, so every template is offered in every workspace and
// behaves identically in each.
//
// What *is* per workspace is `studio_machine_templates`, and that is a
// different thing: a workspace's own saved card layout for a template. Those
// have to stay separate, or one workspace rearranging the cards on a Hammer
// Mill canvas would rearrange them for everybody.
//
// These assertions are the mechanical form of that: every function the picker
// and canvas use to resolve a template takes the template name and nothing
// else. A workspace argument appearing in any of them is the regression.
ok('the picker offers every template, with no workspace filter',
  MACHINE_TEMPLATES.length === new Set(MACHINE_TEMPLATES).size && MACHINE_TEMPLATES.length > 0,
  `${MACHINE_TEMPLATES.length} templates, all distinct`);

for (const m of MACHINES) {
  const byName = connectorsForTemplate(m.template);
  ok(`${m.template}: connectors resolve from the name alone`,
    connectorsForTemplate.length === 1 && byName.length === m.expected);
  ok(`${m.template}: the same call twice gives the same pads`,
    JSON.stringify(connectorsForTemplate(m.template)) === JSON.stringify(byName),
    'no hidden per-caller state');
}
ok('artwork sizing takes only a template name', artworkSizeForTemplate.length === 1);
ok('default layouts take only a template name', hasDefaultLayout.length === 1);
ok('the machine tree builder takes a template and an id factory, not a workspace',
  componentsForTemplate.length === 2);

console.log('\n--- rendering ---');

const CANVAS_PROPS = { showBackground: false, showGrid: false, showSensors: false };
const ARTWORK = [
  ['DTDC', DTDCArtwork],
  ['Solvent Extractor', SolventExtractor],
  ['Collet Cooler', ColletCooler],
  ['Seed Dryer Cooler', SeedDryerCooler],
  ['Hammer Mill', HammerMill],
  ['Meal Sifter', MealSifter],
  ['Meal Conveying & Storage', MealConveyingStorage],
  ['Auto Bagger & Stitcher', AutoBagger],
  ['Miscella Distillation', MiscellaDistillation],
  ['Solvent Recovery', SolventRecovery],
] as const;

for (const [name, Component] of ARTWORK) {
  const html = renderToStaticMarkup(createElement(Component, CANVAS_PROPS));
  const count = (tag: string) => (html.match(new RegExp(`<${tag}[ >]`, 'g')) ?? []).length;
  const shapes = count('path') + count('rect') + count('circle');
  ok(`${name} renders one svg with real geometry`,
    count('svg') === 1 && shapes > 50,
    `svg=${count('svg')} path=${count('path')} rect=${count('rect')} circle=${count('circle')}`);
}

// Two of the same machine on one screen. Gradient and pattern ids are global
// to the document, so without per-instance namespacing the second machine
// paints with the first's fills.
const pair = renderToStaticMarkup(
  createElement(Fragment, null,
    createElement(DTDCArtwork, { ...CANVAS_PROPS, key: 'a' }),
    createElement(DTDCArtwork, { ...CANVAS_PROPS, key: 'b' })),
);
const ids = [...pair.matchAll(/ id="([^"]+)"/g)].map((match) => match[1]);
const collisions = ids.filter((id, index) => ids.indexOf(id) !== index);
ok('two instances of one machine use distinct ids', collisions.length === 0,
  `${ids.length} ids, ${collisions.length} collisions`);
ok('and every url(#...) reference is namespaced with them',
  [...pair.matchAll(/url\(#([^)]+)\)/g)].every((match) => ids.includes(match[1])));

// The workspace relies on this to avoid drawing every pad twice.
const padsOn = renderToStaticMarkup(createElement(ColletCooler, { showSensors: true }));
const padsOff = renderToStaticMarkup(createElement(ColletCooler, { showSensors: false }));
ok('showSensors={false} removes the pad layer', padsOff.length < padsOn.length,
  `${padsOn.length} bytes with pads, ${padsOff.length} without`);
const gridOff = renderToStaticMarkup(createElement(ColletCooler, { showGrid: false }));
ok('showGrid={false} removes the grid', gridOff.length < padsOn.length);

console.log(failures === 0 ? '\nsupplied templates: all checks passed' : `\nsupplied templates: ${failures} check(s) failed`);
if (failures > 0) process.exit(1);
