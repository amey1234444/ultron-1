/**
 * Checks for the Twin Screw Extruder template.
 *
 * There is no test runner in this project, so these run as a script the same
 * way `demoScenarioChecks.ts` does:
 *
 *   npm run check:twin-screw
 *
 * Exit code is non-zero if anything fails.
 *
 * Nothing is re-implemented here. Every assertion imports the shipped module
 * and exercises it, so a check that passes is a statement about the code the
 * console runs — not about a copy of it that could agree with the page while
 * both are wrong.
 */

import { connectorsForTemplate, artworkSizeForTemplate } from '../machineConnectors';
import type { SavedLayout } from '../TrailBoard';
import { rerouteBend, withResolvedConnectors } from '../trailRouting';
import {
  createTemplateDefaultLayout,
  hasDefaultLayout,
  migrateTemplateLayout,
} from '../templateDefaultLayouts';
import { TWIN_SCREW_CONNECTORS } from '../TwinScrewExtruder';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  Box3,
  MeshStandardMaterial,
  PerspectiveCamera,
  Raycaster,
  Vector3,
  type Mesh,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { componentsForTemplate } from '../../../../lib/machines';
import {
  TWIN_SCREW_ANCHORS_3D,
  TWIN_SCREW_ARTWORK_HEIGHT,
  TWIN_SCREW_ARTWORK_WIDTH,
  TWIN_SCREW_COMPONENT_ORDER,
  TWIN_SCREW_LEGACY_CODE_ALIASES,
  TWIN_SCREW_MODEL_URL,
  TWIN_SCREW_SHEET_SCALE,
  TWIN_SCREW_SHEET_X0,
  TWIN_SCREW_SHEET_Y1,
  TWIN_SCREW_POINT_REGISTRY,
  twinScrewPointByCode,
} from '../../../../lib/twinScrewExtruderPoints';
import {
  applyTwinScrewMaterialSpec,
  inheritedString,
  isEffectivelyVisible,
  setPartGroupVisibility,
  TWIN_SCREW_CUTAWAY_GROUP,
  TWIN_SCREW_CUTAWAY_PART_COUNT,
  MACHINE_FINISHES,
  resolveMachineFinishKey,
  TWIN_SCREW_ENV_INTENSITY,
  TWIN_SCREW_INSPECTION_VIEW,
  twinScrewGradedSpec,
  twinScrewMaterialSpec,
} from '../machine3d/modelSemantics';
import {
  clampProjectionFraction,
  mergeProjectedConnectorPositions,
  projectionIsOnScreen,
} from '../machine3d/types';
import {
  analyseTwinScrew,
  normaliseReading,
  resolveSignal,
  UnitError,
  deriveScrewSpeedImbalance,
  deriveScreenDifferential,
  type TagSample,
} from '../../../../lib/analysis/twinScrew';

let failures = 0;
function check(name: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  PASS  ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? ` — got: ${detail}` : ''}`);
  }
}

// ---------------------------------------------------------------------------
console.log('\n--- Registry ---');

const codes = TWIN_SCREW_POINT_REGISTRY.map((point) => point.code);
check('the production registry exposes exactly 36 points', codes.length === 36, String(codes.length));
check('point codes are unique', new Set(codes).size === codes.length, `${codes.length} codes, ${new Set(codes).size} unique`);

const anchorCodes = Object.keys(TWIN_SCREW_ANCHORS_3D);
check('there is exactly one model-space anchor per point', anchorCodes.length === 36, String(anchorCodes.length));
check(
  'registry and model-space anchor identities are one-to-one',
  codes.length === anchorCodes.length &&
    codes.every((code) => Object.hasOwn(TWIN_SCREW_ANCHORS_3D, code)) &&
    anchorCodes.every((code) => codes.includes(code)),
);
check(
  'every model-space anchor is a finite 3-vector',
  Object.values(TWIN_SCREW_ANCHORS_3D).every(
    (anchor) => anchor.length === 3 && anchor.every((value) => Number.isFinite(value)),
  ),
);

const tags = TWIN_SCREW_POINT_REGISTRY.map((point) => point.analyzerTag);
check('analyzer tags are unique', new Set(tags).size === tags.length, `${tags.length} tags, ${new Set(tags).size} unique`);

check(
  'every point sits inside the artwork viewBox',
  TWIN_SCREW_POINT_REGISTRY.every(
    (point) => point.x >= 0 && point.x <= TWIN_SCREW_ARTWORK_WIDTH && point.y >= 0 && point.y <= TWIN_SCREW_ARTWORK_HEIGHT,
  ),
);

check(
  'every point carries an analyzer tag',
  TWIN_SCREW_POINT_REGISTRY.every((point) => Boolean(point.analyzerTag)),
);

check(
  'every point that is not modelled explains why',
  TWIN_SCREW_POINT_REGISTRY.every((point) => point.modelStatus === 'modelled' || Boolean(point.analyzerNote)),
);

check(
  'no point has an empty analyzer note',
  TWIN_SCREW_POINT_REGISTRY.every((point) => point.analyzerNote === undefined || point.analyzerNote.trim().length > 0),
);

check(
  'every point declares a side',
  TWIN_SCREW_POINT_REGISTRY.every((point) => point.side === 'left' || point.side === 'right'),
);

check(
  'every point belongs to a declared component',
  TWIN_SCREW_POINT_REGISTRY.every((point) => TWIN_SCREW_COMPONENT_ORDER.includes(point.component)),
);

check(
  'lookup by code resolves every point',
  TWIN_SCREW_POINT_REGISTRY.every((point) => twinScrewPointByCode(point.code)?.code === point.code),
);

// Two pads closer than the pad diameter would be one visual blob.
let closest = Number.POSITIVE_INFINITY;
let closestPair = '';
for (let i = 0; i < TWIN_SCREW_POINT_REGISTRY.length; i += 1) {
  for (let j = i + 1; j < TWIN_SCREW_POINT_REGISTRY.length; j += 1) {
    const a = TWIN_SCREW_POINT_REGISTRY[i];
    const b = TWIN_SCREW_POINT_REGISTRY[j];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (d < closest) {
      closest = d;
      closestPair = `${a.code} / ${b.code}`;
    }
  }
}
check('no two pads overlap (>= 18 units apart)', closest >= 18, `closest ${closest.toFixed(1)} between ${closestPair}`);

// ---------------------------------------------------------------------------
console.log('\n--- Registry connector export ---');

check(
  'the connector export contains exactly one pad per registry entry',
  TWIN_SCREW_CONNECTORS.length === TWIN_SCREW_POINT_REGISTRY.length,
  `${TWIN_SCREW_CONNECTORS.length} vs ${TWIN_SCREW_POINT_REGISTRY.length}`,
);

check(
  'the connector export contains no pad outside the registry',
  TWIN_SCREW_CONNECTORS.every((connector) => Boolean(twinScrewPointByCode(connector.code))),
);

// ---------------------------------------------------------------------------
console.log('\n--- 3D asset ---');

/**
 * The production workspace mounts this GLB through
 * `MachineWorkspace -> MachineStage3D -> MachineScene3DCanvas.web`. Its
 * initial view is a fitted near-elevation perspective and remains orbitable.
 * The Blender sources are retained for provenance; this check treats the
 * shipped GLB and explicit TypeScript anchors as the production contract.
 */
const ASSET = join(process.cwd(), 'public', ...TWIN_SCREW_MODEL_URL.split('/').filter(Boolean));
check('the machine asset is present', existsSync(ASSET), ASSET);

/**
 * The asset requires no glTF extension that needs a decoder.
 *
 * It was Draco-compressed once, and never rendered: Draco decodes through a
 * WebAssembly worker, no other model in this app uses it, and the production
 * CSP is `script-src 'self'`, which does not permit WebAssembly. The loader
 * never resolved and a suspended loader says nothing. Anything that puts a
 * required extension back has to answer the CSP question first.
 *
 * `KHR_mesh_quantization` answers it. It is a storage format, not a codec:
 * three.js reads int16 positions and int8 normals through the same
 * `BufferAttribute` path it uses for floats, with no worker, no WebAssembly and
 * no second script to load. That is what makes it usable here where Draco and
 * meshopt are not, and it is what takes the asset from 6.0 MB to 3.6 MB with no
 * change to a single triangle.
 *
 * The allowance is a fixed list rather than a relaxed assertion, so adding a
 * genuinely undecodable extension still fails here.
 */
const DECODER_FREE_EXTENSIONS = new Set(['KHR_mesh_quantization']);

/**
 * What the shipped asset is allowed to cost.
 *
 * `meshes` counts glTF primitives, which is what three.js actually draws and
 * therefore the number that decides draw calls. `triangles` is a ceiling; the
 * check that reads it says why it is not an equality.
 */
const TWIN_SCREW_ASSET_BUDGET = { meshes: 280, triangles: 300_000 } as const;
const assetJson = (() => {
  const buf = readFileSync(ASSET);
  const len = buf.readUInt32LE(12);
  return JSON.parse(buf.subarray(20, 20 + len).toString('utf8')) as {
    extensionsRequired?: string[];
    nodes?: {
      name?: string;
      mesh?: number;
      extras?: { partId?: string; partGroup?: string; spin?: string };
    }[];
    materials?: { name?: string; pbrMetallicRoughness?: { roughnessFactor?: number } }[];
  };
})();
const undecodable = (assetJson.extensionsRequired ?? []).filter(
  (name) => !DECODER_FREE_EXTENSIONS.has(name),
);
check(
  'the asset needs no glTF extension the browser must decode',
  undecodable.length === 0,
  undecodable.join(', ') || undefined,
);

// The pivots are what a screw speed will drive. They are produced by the
// export step rather than saved in the master, so an export run the wrong
// way silently ships an asset that can never be animated.
const PIVOTS = ['PIVOT_SCREW1', 'PIVOT_SCREW2', 'PIVOT_DRIVE'];
const pivotNames = new Set((assetJson.nodes ?? []).map((n) => n.name));
check(
  'the asset carries its animation pivots',
  PIVOTS.every((name) => pivotNames.has(name)),
  PIVOTS.filter((name) => !pivotNames.has(name)).join(', ') || undefined,
);

const authoredFrontNodes = (assetJson.nodes ?? []).filter(
  (node) => node.extras?.partGroup === TWIN_SCREW_CUTAWAY_GROUP,
);
check(
  'the GLB declares all 11 removable front barrel objects',
  authoredFrontNodes.length === TWIN_SCREW_CUTAWAY_PART_COUNT,
  String(authoredFrontNodes.length),
);
check(
  'every removable front object has a stable selectable part id',
  authoredFrontNodes.every((node) => Boolean(node.extras?.partId)),
);

const assetMaterialNames = (assetJson.materials ?? [])
  .map((material) => material.name)
  .filter((name): name is string => Boolean(name));
check(
  'every material used by the GLB has an authored runtime PBR specification',
  assetMaterialNames.every((name) => Boolean(twinScrewMaterialSpec(name))),
  assetMaterialNames.filter((name) => !twinScrewMaterialSpec(name)).join(', ') || undefined,
);
check(
  'materials whose exported roughness was lost are covered by runtime normalization',
  ['MAT_stainless', 'MAT_stainless_b', 'MAT_screw_steel', 'MAT_barrel_steel', 'MAT_cast_gray', 'MAT_cast_light'].every(
    (name) => twinScrewMaterialSpec(name)?.roughness !== undefined,
  ),
);

/**
 * The historical sheet map remains a compatibility contract for stored 2D
 * template anchors. Production marker positions come from the model-space
 * registry and the live camera projection audited below.
 */
check(
  'the sheet mapping is declared',
  Number.isFinite(TWIN_SCREW_SHEET_SCALE) && TWIN_SCREW_SHEET_SCALE > 0 &&
    Number.isFinite(TWIN_SCREW_SHEET_X0) && Number.isFinite(TWIN_SCREW_SHEET_Y1),
  `scale ${TWIN_SCREW_SHEET_SCALE}, x0 ${TWIN_SCREW_SHEET_X0}, y1 ${TWIN_SCREW_SHEET_Y1}`,
);

/** Keep the compatibility map internally proportional to its old sheet. */
const frustumW = TWIN_SCREW_ARTWORK_WIDTH / TWIN_SCREW_SHEET_SCALE;
const frustumH = TWIN_SCREW_ARTWORK_HEIGHT / TWIN_SCREW_SHEET_SCALE;
check(
  'the compatibility map preserves the sheet aspect ratio',
  Math.abs(frustumW / frustumH - TWIN_SCREW_ARTWORK_WIDTH / TWIN_SCREW_ARTWORK_HEIGHT) < 1e-9,
  `${frustumW.toFixed(4)} x ${frustumH.toFixed(4)}`,
);

/** Every historical sheet point maps back inside the broad model extent. */
const outsideAsset = TWIN_SCREW_POINT_REGISTRY.filter((point) => {
  const wx = point.x / TWIN_SCREW_SHEET_SCALE + TWIN_SCREW_SHEET_X0;
  const wy = TWIN_SCREW_SHEET_Y1 - point.y / TWIN_SCREW_SHEET_SCALE;
  return wx < -0.05 || wx > 3.3 || wy < -0.05 || wy > 1.4;
});
check(
  'every historical connector maps inside the broad asset extent',
  outsideAsset.length === 0,
  outsideAsset.map((p) => p.code).join(', ') || undefined,
);

// ---------------------------------------------------------------------------
console.log('\n--- Historical connector map ---');

/**
 * These bounds protect legacy saved-layout migration. Physical attachment of
 * production markers is checked from the loaded GLB near the end.
 */
// Historical reference-elevation extent:
// x 49.5..1598.1, y 76.0..722.5. Rounded outward by a pad radius.
const MACHINE = { x: 40, y: 66, width: 1608 - 40, height: 733 - 66 };
const strays = TWIN_SCREW_POINT_REGISTRY.filter(
  (point) =>
    point.x < MACHINE.x ||
    point.x > MACHINE.x + MACHINE.width ||
    point.y < MACHINE.y ||
    point.y > MACHINE.y + MACHINE.height,
);
check('no historical connector sits off its reference machine', strays.length === 0, strays.map((p) => p.code).join(', ') || undefined);

// The barrel zones are one row of instruments along one heater band. If one
// drifts off that line the machine stops reading as a zone profile.
const zonePads = TWIN_SCREW_POINT_REGISTRY.filter((point) => /^tz-\d+$/.test(point.code));
check('all nine barrel zones are declared', zonePads.length === 9, String(zonePads.length));
check(
  'the barrel zones share one line along the heater band',
  new Set(zonePads.map((point) => point.y)).size === 1,
  [...new Set(zonePads.map((p) => p.y))].join(', '),
);
check(
  'the barrel zones run upstream to downstream in registry order',
  zonePads.every((point, index) => index === 0 || point.x > zonePads[index - 1].x),
);

// ---------------------------------------------------------------------------
console.log('\n--- 3D projection and material contracts ---');

check('projection fractions clamp below the stage', clampProjectionFraction(-0.25) === 0);
check('projection fractions clamp above the stage', clampProjectionFraction(1.25) === 1);
check('non-finite projection fractions never escape', clampProjectionFraction(Number.NaN) === 0.5);
check('a finite point in front of the camera is on-screen', projectionIsOnScreen({ x: 0, y: 0, z: 0 }, -1));
check('a point behind the camera is rejected', !projectionIsOnScreen({ x: 0, y: 0, z: 0 }, 1));
check('an off-frustum point is rejected', !projectionIsOnScreen({ x: 1.01, y: 0, z: 0 }, -1));
check('a non-finite point is rejected', !projectionIsOnScreen({ x: Number.NaN, y: 0, z: 0 }, -1));

const firstProjection = mergeProjectedConnectorPositions(null, [
  { code: 'tz-01', rx: 1.4, ry: -0.2, distance: 2, onScreen: true, occluded: false },
]);
check(
  'published connector positions are clamped to the stage',
  firstProjection['tz-01']?.rx === 1 && firstProjection['tz-01']?.ry === 0,
);
const retainedProjection = mergeProjectedConnectorPositions(firstProjection, [
  { code: 'tz-01', rx: 0.2, ry: 0.8, distance: 2, onScreen: false, occluded: false },
]);
check(
  'off-screen connectors retain their last real 3D position',
  retainedProjection['tz-01']?.rx === 1 && retainedProjection['tz-01']?.ry === 0,
);
check('off-screen retained connectors are not snap targets', retainedProjection['tz-01']?.visible === false);
check(
  'a connector never falls back to static artwork before its first valid projection',
  !Object.hasOwn(
    mergeProjectedConnectorPositions(null, [
      { code: 'tz-02', rx: 0.5, ry: 0.5, distance: 2, onScreen: false, occluded: false },
    ]),
    'tz-02',
  ),
);

const recoveredMaterial = new MeshStandardMaterial({ roughness: 1, metalness: 0 });
recoveredMaterial.name = 'MAT_screw_steel';
const materialApplied = applyTwinScrewMaterialSpec(recoveredMaterial, true);
check('the runtime normalizer recognizes the screw material', materialApplied);
// Asserted against the palette rather than against copied literals: these used
// to restate 0.26/1.0 and so had to be edited by hand whenever the finish was
// retuned, which is exactly the kind of drift the normalizer exists to prevent.
const darkScrewSpec = twinScrewGradedSpec('MAT_screw_steel', true)!;
check(
  'the screw roughness is restored from the authored palette',
  recoveredMaterial.roughness === darkScrewSpec.roughness,
);
check(
  'the screw metalness is restored from the authored palette',
  recoveredMaterial.metalness === darkScrewSpec.metalness,
);
check(
  'dark-stage reflection intensity is applied',
  recoveredMaterial.envMapIntensity === TWIN_SCREW_ENV_INTENSITY.dark,
);
// The grade is a theme layer over one authored palette, so the same material
// must come back lighter on the dark stage than on the light one.
const lightScrewSpec = twinScrewGradedSpec('MAT_screw_steel', false)!;
check(
  'the screw is graded lighter for the dark stage than the light one',
  darkScrewSpec.color === MACHINE_FINISHES.brightMetal.color &&
    lightScrewSpec.color === MACHINE_FINISHES.brightMetal.lightColor,
);
check(
  'an ungraded material keeps one value across both themes',
  twinScrewGradedSpec('MAT_cast_gray', true)?.color === twinScrewGradedSpec('MAT_cast_gray', false)?.color,
);

// The console is a near-black dashboard. A large surface at paper-white is the
// single thing that made the machine read as a pasted-on CAD model, so no
// finish may exceed the palette's one deliberate highlight step.
const tooBright = Object.entries(MACHINE_FINISHES).filter(([, finish]) => {
  const channel = (hex: string) => parseInt(hex.slice(1, 3), 16);
  return channel(finish.color) > channel(MACHINE_FINISHES.trim.color);
});
check(
  'no finish is brighter than the reserved highlight step',
  tooBright.length === 0,
  tooBright.map(([name]) => name).join(', ') || undefined,
);

// Part group decides the tone step for the shared body materials. If this
// collapses, the motor, gearbox, barrel and hopper all render the same grey --
// which is exactly the flattening this classification exists to prevent.
const bodyGroups = ['motor', 'gearbox', 'barrel', 'main_feed', 'frame'] as const;
const bodyFinishes = bodyGroups.map((group) =>
  resolveMachineFinishKey(group, undefined, 'MAT_cast_gray'),
);
check(
  'shared body material resolves to a distinct finish per part group',
  new Set(bodyFinishes).size === bodyGroups.length,
  bodyFinishes.join(', '),
);
check(
  'barrel zone covers alternate between two graphite steps',
  resolveMachineFinishKey('barrel_top', 'BARREL_TZ_01_top', 'MAT_cast_gray') !==
    resolveMachineFinishKey('barrel_top', 'BARREL_TZ_02_top', 'MAT_cast_gray'),
);
check(
  'the screws stay lighter than the barrel they sit inside',
  MACHINE_FINISHES.brightMetal.color > MACHINE_FINISHES.bodyDark.color,
);
recoveredMaterial.dispose();

// ---------------------------------------------------------------------------
console.log('\n--- Connectors and snap targets ---');

const connectors = connectorsForTemplate('Twin Screw Extruder');
check('a connector exists for every registry point', connectors.length === TWIN_SCREW_POINT_REGISTRY.length, `${connectors.length}`);
check('connector codes are unique', new Set(connectors.map((c) => c.code)).size === connectors.length);
check(
  'every connector resolves to a registry point',
  connectors.every((connector) => Boolean(twinScrewPointByCode(connector.code))),
);
check(
  'every connector anchor is a fraction inside the machine rect',
  connectors.every((connector) => connector.rx >= 0 && connector.rx <= 1 && connector.ry >= 0 && connector.ry <= 1),
);

const artwork = artworkSizeForTemplate('Twin Screw Extruder');
check(
  'connector fractions are computed against the twin-screw viewBox, not the single-screw one',
  artwork.width === TWIN_SCREW_ARTWORK_WIDTH && artwork.height === TWIN_SCREW_ARTWORK_HEIGHT,
  `${artwork.width}x${artwork.height}`,
);
check(
  'a connector fraction round-trips back to its artwork coordinate',
  connectors.every((connector) => {
    const point = twinScrewPointByCode(connector.code);
    if (!point) return false;
    return Math.abs(connector.rx * artwork.width - point.x) < 0.001 && Math.abs(connector.ry * artwork.height - point.y) < 0.001;
  }),
);
check(
  'the single-screw artwork frame is untouched',
  artworkSizeForTemplate('Single Screw Extruder').width === 1200 && artworkSizeForTemplate('Single Screw Extruder').height === 760,
);

// ---------------------------------------------------------------------------
console.log('\n--- Default layout ---');

check('the template declares a default layout', hasDefaultLayout('Twin Screw Extruder'));
const layout = createTemplateDefaultLayout('Twin Screw Extruder', [], null);
check('the layout creates one trail per point', layout.trails.length === TWIN_SCREW_POINT_REGISTRY.length, `${layout.trails.length}`);
check('the layout creates one card per point', layout.boxes.length === TWIN_SCREW_POINT_REGISTRY.length, `${layout.boxes.length}`);
check(
  'every card references a current point code',
  layout.boxes.every((box) => Boolean(twinScrewPointByCode(box.templatePointCode))),
);
check(
  'every trail anchor is a fraction inside the machine rect',
  layout.trails.every((trail) => {
    const anchor = trail.startMachineAnchor;
    return !anchor || (anchor.rx >= 0 && anchor.rx <= 1 && anchor.ry >= 0 && anchor.ry <= 1);
  }),
);
const regenerated = createTemplateDefaultLayout('Twin Screw Extruder', [], null);
check(
  'the layout is deterministic in the positions it produces',
  JSON.stringify(regenerated.trails.map((t) => t.startMachineAnchor)) === JSON.stringify(layout.trails.map((t) => t.startMachineAnchor)),
);
check('every generated twin-screw trail opts into dynamic bend routing', layout.trails.every((trail) => trail.autoRoute === true));
check(
  'dynamic bend routing is not added to other machine templates',
  createTemplateDefaultLayout('Rotary Airlock Valve', [], null).trails.every((trail) => trail.autoRoute === undefined) &&
    createTemplateDefaultLayout('Single Screw Extruder', [], null).trails.every((trail) => trail.autoRoute === undefined),
);

const legacyByCurrentCode = new Map(
  Object.entries(TWIN_SCREW_LEGACY_CODE_ALIASES).map(([legacy, current]) => [current, legacy]),
);
const legacyLayout: SavedLayout = {
  boxes: layout.boxes
    .filter((box) => box.templatePointCode !== 'tz-09')
    .map((box) => ({
      ...box,
      templatePointCode: box.templatePointCode ? legacyByCurrentCode.get(box.templatePointCode) ?? box.templatePointCode : undefined,
    })),
  trails: layout.trails
    .filter((trail) => trail.startMachinePointCode !== 'tz-09')
    .map((trail) => ({
      ...trail,
      autoRoute: undefined,
      startMachinePointCode: trail.startMachinePointCode
        ? legacyByCurrentCode.get(trail.startMachinePointCode) ?? trail.startMachinePointCode
        : undefined,
    })),
  machineZoom: 1.2,
};
const migratedLayout = migrateTemplateLayout(
  'Twin Screw Extruder',
  legacyLayout,
  { x: 0, y: 0, width: 1600, height: 900 },
);
check('a complete historical 35-point layout restores TZ09', migratedLayout.boxes.length === 36 && migratedLayout.trails.length === 36);
check(
  'historical layout identities migrate to current registry codes',
  migratedLayout.boxes.every((box) => Boolean(twinScrewPointByCode(box.templatePointCode))) &&
    migratedLayout.trails.every((trail) => Boolean(twinScrewPointByCode(trail.startMachinePointCode))),
);
check('layout migration preserves the saved machine zoom', migratedLayout.machineZoom === legacyLayout.machineZoom);
check('migrated template trails recover dynamic bend routing', migratedLayout.trails.every((trail) => trail.autoRoute === true));

const explicitlyManual: SavedLayout = {
  ...legacyLayout,
  trails: legacyLayout.trails.map((trail, index) =>
    index === 0 ? { ...trail, autoRoute: false } : trail,
  ),
};
const migratedManual = migrateTemplateLayout(
  'Twin Screw Extruder',
  explicitlyManual,
  { x: 0, y: 0, width: 1600, height: 900 },
);
check('migration preserves an explicitly manual bend', migratedManual.trails[0].autoRoute === false);

const customPartial: SavedLayout = {
  boxes: legacyLayout.boxes.slice(0, 4),
  trails: legacyLayout.trails.slice(0, 4),
};
const migratedPartial = migrateTemplateLayout(
  'Twin Screw Extruder',
  customPartial,
  { x: 0, y: 0, width: 1600, height: 900 },
);
check('migration never pads a partial operator layout', migratedPartial.boxes.length === 4 && migratedPartial.trails.length === 4);

const routed = rerouteBend(
  {
    id: 'route-check',
    points: [{ x: 10, y: 10 }, { x: 20, y: 20 }, { x: 200, y: 80 }],
    startMachineAnchor: { rx: 0.1, ry: 0.1 },
    endBoxId: 'box-check',
    autoRoute: true,
  },
  [{ x: 20, y: 30 }, { x: 20, y: 20 }, { x: 200, y: 80 }],
);
check('an auto-routed bend follows a moved endpoint', routed[1].x === 70 && routed[1].y === 80);

const dynamicConnector = { ...connectors[0], rx: 0.25, ry: 0.4, projectionVisible: true };
const dynamicallyResolved = withResolvedConnectors(
  [
    {
      id: 'dynamic-check',
      points: [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 1200, y: 400 }],
      startMachineAnchor: { rx: 0, ry: 0 },
      startMachinePointCode: dynamicConnector.code,
      endBoxId: 'box-check',
      autoRoute: true,
    },
  ],
  [{ id: 'box-check', x: 1200, y: 400, label: 'check', templatePointCode: dynamicConnector.code }],
  [dynamicConnector],
  { x: 100, y: 50, width: 800, height: 400 },
)[0];
check(
  'a live 3D projection moves the attached trail endpoint',
  dynamicallyResolved.points[0].x === 300 && dynamicallyResolved.points[0].y === 210,
);
check(
  'a live 3D projection reroutes the derived bend with the endpoint',
  dynamicallyResolved.points[1].x === 490 && dynamicallyResolved.points[1].y === 400,
);

// ---------------------------------------------------------------------------
console.log('\n--- Machine component tree ---');

let seq = 0;
const components = componentsForTemplate('Twin Screw Extruder', () => `c-${seq++}`);
const treePoints = components.flatMap((component) => component.points.map((point) => point.label));
check('the tree carries a point for every registry entry', treePoints.length >= TWIN_SCREW_POINT_REGISTRY.length, `${treePoints.length}`);
check(
  'every registry point appears exactly once in the tree',
  TWIN_SCREW_POINT_REGISTRY.every((point) => treePoints.filter((label) => label === point.label).length === 1),
);
check(
  'Screw A and Screw B are separate components',
  components.some((c) => c.label === 'Screw A') && components.some((c) => c.label === 'Screw B'),
);
check(
  'the two screw speeds do not share a component',
  components.find((c) => c.label === 'Screw A')?.points.some((p) => p.label === 'Screw A Speed') === true &&
    components.find((c) => c.label === 'Screw B')?.points.some((p) => p.label === 'Screw B Speed') === true,
);

// ---------------------------------------------------------------------------
console.log('\n--- Signal map semantics ---');

const feedThroat = resolveSignal('Feed Throat Temperature');
check(
  'feed throat temperature is never read as barrel zone 1',
  feedThroat.kind === 'unmodelled',
  feedThroat.kind === 'mapped' ? feedThroat.tag : feedThroat.kind,
);

const zone1 = resolveSignal('Barrel Temperature Zone 1');
check('a genuine zone 1 label does resolve to TS-TZ1', zone1.kind === 'mapped' && zone1.tag === 'TS-TZ1');

const barrelMetal = resolveSignal('Barrel Zone 3 Metal Temperature');
check(
  'a barrel metal temperature is never promoted to melt temperature',
  barrelMetal.kind === 'unmodelled',
  barrelMetal.kind === 'mapped' ? barrelMetal.tag : barrelMetal.kind,
);

const motorRpm = resolveSignal('Motor Speed');
const screwARpm = resolveSignal('Screw A Speed');
check('motor speed resolves to the motor shaft', motorRpm.kind === 'mapped' && motorRpm.tag === 'TS-E1');
check('screw A speed resolves to its own shaft', screwARpm.kind === 'mapped' && screwARpm.tag === 'TS-S1');
check(
  'motor speed is never silently treated as screw speed',
  motorRpm.kind === 'mapped' && screwARpm.kind === 'mapped' && motorRpm.tag !== screwARpm.tag,
);

const sideFeedRpm = resolveSignal('Side Feeder Speed');
check(
  'side feeder speed is not captured as a screw speed',
  sideFeedRpm.kind === 'mapped' && sideFeedRpm.tag === 'TS-N2',
  sideFeedRpm.kind === 'mapped' ? sideFeedRpm.tag : sideFeedRpm.kind,
);

const bareSpeed = resolveSignal('Speed');
check(
  'an unqualified speed is refused rather than assigned to a shaft',
  bareSpeed.kind === 'unmodelled',
  bareSpeed.kind === 'mapped' ? bareSpeed.tag : bareSpeed.kind,
);

const bareGearboxVib = resolveSignal('Gearbox Vibration');
check(
  'an unqualified gearbox vibration is refused rather than assigned to a housing',
  bareGearboxVib.kind === 'unmodelled',
  bareGearboxVib.kind === 'mapped' ? bareGearboxVib.tag : bareGearboxVib.kind,
);

const gbIn = resolveSignal('Gearbox Input Vibration');
const gbOut1 = resolveSignal('Gearbox Output-1 Vibration');
check(
  'gearbox input and output vibration stay separate measurements',
  gbIn.kind === 'mapped' && gbOut1.kind === 'mapped' && gbIn.tag !== gbOut1.tag,
);

const torque = resolveSignal('Screw Torque');
check('torque is not synthesised from motor power', torque.kind === 'unmodelled');

check(
  'a registry-snapped point resolves by code, not by its editable label',
  (() => {
    const result = resolveSignal('renamed by the user', 'tz-05');
    return result.kind === 'mapped' && result.tag === 'TS-TZ5';
  })(),
);

// ---------------------------------------------------------------------------
console.log('\n--- Unit and vibration-domain protection ---');

check(
  'a velocity vibration reading stays in the velocity domain',
  normaliseReading('TS-V1', 4.2, 'mm/s').domain === 'velocity',
);
check(
  'an acceleration vibration reading is flagged as acceleration, not converted to mm/s',
  normaliseReading('TS-V1', 1.5, 'g').domain === 'acceleration',
);
check(
  'in/s converts into the velocity domain',
  Math.abs((normaliseReading('TS-V1', 1, 'in/s').value ?? 0) - 25.4) < 1e-9,
);
check(
  'an unusable vibration unit throws rather than being assumed',
  (() => {
    try {
      normaliseReading('TS-V1', 1, 'degC');
      return false;
    } catch (error) {
      return error instanceof UnitError;
    }
  })(),
);
check(
  'amps are refused on the power tag rather than read as kilowatts',
  (() => {
    try {
      normaliseReading('TS-PM1', 12, 'A');
      return false;
    } catch (error) {
      return error instanceof UnitError;
    }
  })(),
);
check(
  'temperature converts from Kelvin',
  Math.abs((normaliseReading('TS-TZ1', 373.15, 'K').value ?? 0) - 100) < 1e-9,
);
check('pressure converts from bar', Math.abs((normaliseReading('TS-P1', 10, 'bar').value ?? 0) - 1) < 1e-9);

// ---------------------------------------------------------------------------
console.log('\n--- Derived values keep their provenance ---');

const imbalance = deriveScrewSpeedImbalance(100, 90);
check('screw imbalance is computed', imbalance.value !== null && Math.abs(imbalance.value - 10.526) < 0.01, String(imbalance.value));
check('screw imbalance names its inputs', imbalance.derivedFrom.join(',') === 'TS-S1,TS-S2');
const noImbalance = deriveScrewSpeedImbalance(100, null);
check('an incomputable derived value says why', noImbalance.value === null && Boolean(noImbalance.unavailableReason));
check('an incomputable derived value claims no inputs', noImbalance.derivedFrom.length === 0);

const differential = deriveScreenDifferential(9, 7);
check('screen differential is computed', differential.value === 2);
check('screen differential names its inputs', differential.derivedFrom.join(',') === 'TS-P3,TS-P4');

// ---------------------------------------------------------------------------
console.log('\n--- Analysis scenarios ---');

const healthy: TagSample[] = [
  { tag: 'TS-V1', label: 'Motor Drive-End Vibration', value: 2.1, unit: 'mm/s', history: [2.0, 2.1, 2.05, 2.11, 2.09, 2.12, 2.08, 2.1], reporting: true },
  { tag: 'TS-TZ1', label: 'Barrel Temperature Zone 1', value: 180, unit: 'degC', history: [179, 180, 181, 180, 179, 180, 181, 180], reporting: true },
];
const healthyResult = analyseTwinScrew(healthy);
check('a healthy set raises no integrity finding', healthyResult.findings.length === 0, `${healthyResult.findings.length}`);
check(
  'a healthy set still reports its pending rules rather than implying health',
  healthyResult.pending.some((rule) => rule.status === 'CONFIGURATION_REQUIRED'),
);
check(
  'no pending rule is ever reported as PASS',
  healthyResult.pending.every((rule) => rule.status !== 'PASS'),
);
check(
  'every configuration-required rule names what it needs',
  healthyResult.pending.filter((r) => r.status === 'CONFIGURATION_REQUIRED').every((r) => Boolean(r.requires)),
);

const frozen = analyseTwinScrew([
  { tag: 'TS-TZ2', label: 'Barrel Temperature Zone 2', value: 190, unit: 'degC', history: [190, 190, 190, 190, 190, 190, 190, 190], reporting: true },
]);
check('a frozen channel is detected', frozen.findings.some((f) => f.ruleId === 'ts-integrity-freeze'));

const dropped = analyseTwinScrew([
  { tag: 'TS-P1', label: 'Intermediate Melt Pressure 1', value: null, unit: 'MPa', reporting: false },
]);
check('a dropped-out channel is detected', dropped.findings.some((f) => f.ruleId === 'ts-integrity-dropout'));
check('a dropped-out channel is not also reported as frozen', !dropped.findings.some((f) => f.ruleId === 'ts-integrity-freeze'));

const badUnit = analyseTwinScrew([
  { tag: 'TS-P2', label: 'Intermediate Melt Pressure 2', value: 5, unit: 'degC', reporting: true },
]);
check('an invalid unit is detected', badUnit.findings.some((f) => f.ruleId === 'ts-integrity-unit'));

const accel = analyseTwinScrew([
  { tag: 'TS-V4', label: 'Gearbox Output-1 Vibration', value: 1.2, unit: 'g', reporting: true },
]);
check('an acceleration-domain channel is reported as such', accel.findings.some((f) => f.ruleId === 'ts-integrity-vibration-domain'));
check('an acceleration-domain channel is not given a velocity verdict', accel.findings.every((f) => f.status !== 'ALARM'));
check('the acceleration domain is recorded for the channel', accel.vibrationDomains['TS-V4'] === 'acceleration');

const empty = analyseTwinScrew([]);
check('with nothing mapped, every rule reports insufficient evidence', empty.pending.every((r) => r.status === 'INSUFFICIENT_EVIDENCE'));
check('with nothing mapped, no finding is invented', empty.findings.length === 0);

async function checkRuntimeAsset() {
  console.log('\n--- Loaded GLB semantics and default visibility ---');

  // GLTFLoader's progress object is a browser global. No network is involved,
  // but Node still needs the constructor to exist while parsing the local GLB.
  if (typeof globalThis.ProgressEvent === 'undefined') {
    Object.defineProperty(globalThis, 'ProgressEvent', {
      configurable: true,
      value: class ProgressEvent {},
    });
  }

  const bytes = readFileSync(ASSET);
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const gltf = await new GLTFLoader().parseAsync(arrayBuffer, '');
  const root = gltf.scene;
  root.updateWorldMatrix(true, true);

  const meshes: Mesh[] = [];
  let triangles = 0;
  root.traverse((object) => {
    const mesh = object as Mesh;
    if (!mesh.isMesh) return;
    meshes.push(mesh);
    triangles += (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3;
  });
  check(
    'the production GLB loads every render mesh in the machine',
    meshes.length === TWIN_SCREW_ASSET_BUDGET.meshes,
    String(meshes.length),
  );
  // A ceiling, not an equality: the point of this number is the frame, not the
  // asset. The two screws were 460 832 of an old 603 744 -- three quarters of
  // the machine spent on a helix eighty pixels across -- and both the download
  // and every vertex shader invocation were paying for it. Re-tessellated they
  // are a third of that. What must never happen again is a detail pass quietly
  // buying its way back over the budget, so the assertion is a limit with the
  // current figure printed beside it.
  check(
    `the production GLB stays inside its ${TWIN_SCREW_ASSET_BUDGET.triangles}-triangle frame budget`,
    triangles <= TWIN_SCREW_ASSET_BUDGET.triangles,
    String(triangles),
  );
  // And a floor, because the cheapest way to pass a triangle budget is to lose
  // the machine. A silently truncated export is exactly the failure this pairs
  // with: it would sail through the ceiling above and render a partial model.
  check(
    'the production GLB still carries the whole machine, not a truncated export',
    triangles >= TWIN_SCREW_ASSET_BUDGET.triangles * 0.7,
    String(triangles),
  );

  const hiddenCount = setPartGroupVisibility(root, TWIN_SCREW_CUTAWAY_GROUP, false);
  check(
    'cutaway mode hides all authored front groups through inherited metadata',
    hiddenCount === TWIN_SCREW_CUTAWAY_PART_COUNT,
    String(hiddenCount),
  );
  const hiddenOwner = root.getObjectByName('BARREL_TZ_01_front');
  const hiddenPrimitive = hiddenOwner?.getObjectByProperty('isMesh', true);
  check(
    'a primitive under a hidden cutaway owner is effectively hidden',
    Boolean(hiddenPrimitive && !isEffectivelyVisible(hiddenPrimitive)),
  );

  const groupedOwner = root.getObjectByName('GEARBOX_input');
  const groupedPrimitive = groupedOwner?.getObjectByProperty('isMesh', true);
  check(
    'part selection resolves metadata inherited from a multi-primitive owner',
    inheritedString(groupedPrimitive, 'partId') === 'GEARBOX_input',
  );

  const screwParts = { screw_1: 0, screw_2: 0 };
  root.traverse((object) => {
    const group = object.userData?.partGroup;
    if (group === 'screw_1') {
      screwParts.screw_1 += 1;
      if (!isEffectivelyVisible(object)) screwParts.screw_1 = Number.NEGATIVE_INFINITY;
    } else if (group === 'screw_2') {
      screwParts.screw_2 += 1;
      if (!isEffectivelyVisible(object)) screwParts.screw_2 = Number.NEGATIVE_INFINITY;
    }
  });
  check('cutaway leaves both complete screw groups visible', screwParts.screw_1 === 12 && screwParts.screw_2 === 12);

  const semanticSurfaces: Readonly<Record<string, string>> = {
    'motor-nde-vib': 'MOTOR_body',
    // Screw A is the upper shaft, Screw B the lower, and the asset now agrees:
    // this pair used to be inverted because the shipped GLB predated the
    // correction to `lib_params.SCREW_1_AXIS` and carried S1 geometry on
    // screw 2's axis. Re-exported, S1/S2 sit on their own pivots.
    'screw-1-rpm': 'PIVOT_SCREW1',
    'screw-2-rpm': 'PIVOT_SCREW2',
    'side-feed-current': 'SIDE_FEEDER_HOUSING',
    'p-int-01': 'SENSOR_P_INT_01',
    'p-int-02': 'SENSOR_P_INT_02',
    'tz-09': 'BARREL_TZ_08_top',
    'p-screw-in': 'SCREEN_PACK_INLET',
    'p-screw-out': 'SENSOR_P_SCR_OUT',
  };
  const surfaceDrift = Object.entries(semanticSurfaces).filter(([code, partId]) => {
    const part = root.getObjectByName(partId);
    const anchor = TWIN_SCREW_ANCHORS_3D[code];
    if (!part || !anchor) return true;
    return new Box3().setFromObject(part).distanceToPoint(new Vector3(...anchor)) > 0.003;
  });
  check(
    'corrected anchors remain on their semantically appropriate hardware',
    surfaceDrift.length === 0,
    surfaceDrift.map(([code, part]) => `${code}:${part}`).join(', ') || undefined,
  );

  const modelBox = new Box3().setFromObject(root);
  const anchorOutsideModel = Object.entries(TWIN_SCREW_ANCHORS_3D).filter(([, anchor]) =>
    modelBox.distanceToPoint(new Vector3(...anchor)) > 1e-6,
  );
  check(
    'all 36 anchors stay within the loaded machine extent',
    anchorOutsideModel.length === 0,
    anchorOutsideModel.map(([code]) => code).join(', ') || undefined,
  );

  const centre = modelBox.getCenter(new Vector3());
  const extent = modelBox.getSize(new Vector3());
  const aspect = 1600 / 900;
  const vFov = (TWIN_SCREW_INSPECTION_VIEW.fov * Math.PI) / 180;
  const fitHeight = extent.y / 2 / Math.tan(vFov / 2);
  const fitWidth = extent.x / 2 / Math.tan(vFov / 2) / aspect;
  const distance =
    Math.max(fitHeight, fitWidth, 0.2) * TWIN_SCREW_INSPECTION_VIEW.fillMargin + extent.z / 2;
  const camera = new PerspectiveCamera(
    TWIN_SCREW_INSPECTION_VIEW.fov,
    aspect,
    Math.max(distance / 200, 0.01),
    distance * 8 + extent.length(),
  );
  camera.position
    .copy(centre)
    .addScaledVector(new Vector3(...TWIN_SCREW_INSPECTION_VIEW.direction).normalize(), distance);
  camera.lookAt(centre);
  camera.updateMatrixWorld(true);

  const ray = new Raycaster();
  const visibleCodes: string[] = [];
  const detachedCodes: string[] = [];
  const invalidProjectionCodes: string[] = [];
  for (const [code, anchor] of Object.entries(TWIN_SCREW_ANCHORS_3D)) {
    const world = new Vector3(...anchor).applyMatrix4(root.matrixWorld);
    const ndc = world.clone().project(camera);
    const view = world.clone().applyMatrix4(camera.matrixWorldInverse);
    const onScreen = projectionIsOnScreen(ndc, view.z);
    const rx = clampProjectionFraction((ndc.x + 1) / 2);
    const ry = clampProjectionFraction((1 - ndc.y) / 2);
    if (!Number.isFinite(rx) || !Number.isFinite(ry) || rx < 0 || rx > 1 || ry < 0 || ry > 1) {
      invalidProjectionCodes.push(code);
    }
    if (!onScreen) continue;

    const direction = world.clone().sub(camera.position);
    const anchorDistance = direction.length();
    ray.set(camera.position, direction.normalize());
    ray.far = Math.max(
      anchorDistance - TWIN_SCREW_INSPECTION_VIEW.occlusionClearance,
      0.01,
    );
    const occluded = ray.intersectObjects(meshes, false).some((hit) => isEffectivelyVisible(hit.object));
    if (!occluded) visibleCodes.push(code);

    // The rendered dot needs a small stand-off so it does not z-fight with the
    // metal. Reusing the production occlusion clearance makes that allowance
    // explicit: the first visible triangle must still be within 12 mm along
    // the inspection ray, in front of or immediately behind the anchor.
    ray.far = Number.POSITIVE_INFINITY;
    const surfaceHit = ray
      .intersectObjects(meshes, false)
      .find((hit) => isEffectivelyVisible(hit.object));
    const surfaceGap = surfaceHit ? Math.abs(surfaceHit.distance - anchorDistance) : Number.POSITIVE_INFINITY;
    if (surfaceGap > TWIN_SCREW_INSPECTION_VIEW.occlusionClearance) {
      detachedCodes.push(`${code}:${Number.isFinite(surfaceGap) ? surfaceGap.toFixed(4) : 'no-surface'}`);
    }
  }
  check(
    'default cutaway keeps all 36 points on-screen and unoccluded',
    visibleCodes.length === 36,
    codes.filter((code) => !visibleCodes.includes(code)).join(', ') || undefined,
  );
  check(
    'all 36 marker anchors are physically attached to a visible machine surface',
    detachedCodes.length === 0,
    detachedCodes.join(', ') || undefined,
  );
  check(
    'default projected coordinates are finite and clamped',
    invalidProjectionCodes.length === 0,
    invalidProjectionCodes.join(', ') || undefined,
  );
}

checkRuntimeAsset()
  .catch((error: unknown) => {
    failures += 1;
    console.log(`  FAIL  production GLB runtime audit — ${error instanceof Error ? error.message : String(error)}`);
  })
  .finally(() => {
    console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
    process.exitCode = failures === 0 ? 0 : 1;
  });
