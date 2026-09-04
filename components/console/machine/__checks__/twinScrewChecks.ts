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
import { createTemplateDefaultLayout, hasDefaultLayout } from '../templateDefaultLayouts';
import { TWIN_SCREW_CONNECTORS } from '../TwinScrewExtruder';
import { parse } from 'react-native-svg';
import { buildTwinScrewExtruderArtwork, WIDTH, HEIGHT } from '../twinScrewArtwork';
import { componentsForTemplate } from '../../../../lib/machines';
import {
  TWIN_SCREW_ARTWORK_HEIGHT,
  TWIN_SCREW_ARTWORK_WIDTH,
  TWIN_SCREW_COMPONENT_ORDER,
  TWIN_SCREW_POINT_REGISTRY,
  twinScrewPointByCode,
} from '../../../../lib/twinScrewExtruderPoints';
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
check('point codes are unique', new Set(codes).size === codes.length, `${codes.length} codes, ${new Set(codes).size} unique`);

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
console.log('\n--- Artwork and pads ---');

check(
  'the drawing renders exactly one pad per registry entry',
  TWIN_SCREW_CONNECTORS.length === TWIN_SCREW_POINT_REGISTRY.length,
  `${TWIN_SCREW_CONNECTORS.length} vs ${TWIN_SCREW_POINT_REGISTRY.length}`,
);

check(
  'the drawing draws no pad that is not in the registry',
  TWIN_SCREW_CONNECTORS.every((connector) => Boolean(twinScrewPointByCode(connector.code))),
);

// ---------------------------------------------------------------------------
console.log('\n--- Artwork ---');

const machineSvg = buildTwinScrewExtruderArtwork();

check(
  'the artwork is drawn on the frame the registry places points in',
  WIDTH === TWIN_SCREW_ARTWORK_WIDTH && HEIGHT === TWIN_SCREW_ARTWORK_HEIGHT,
  `${WIDTH}x${HEIGHT} vs ${TWIN_SCREW_ARTWORK_WIDTH}x${TWIN_SCREW_ARTWORK_HEIGHT}`,
);

check(
  'the artwork declares that frame as its viewBox',
  machineSvg.includes(`viewBox="0 0 ${TWIN_SCREW_ARTWORK_WIDTH} ${TWIN_SCREW_ARTWORK_HEIGHT}"`),
);

check(
  'the same options always produce the same drawing',
  buildTwinScrewExtruderArtwork() === machineSvg,
);

// The machine has to actually contain the machine. Each of these is a part the
// registry hangs points off; a silent loss of one would leave pads floating.
const REQUIRED_PARTS = [
  // The drive train comes from the rebuild pass, which is why these three carry
  // its names rather than the base geometry's.
  'motor-v16', 'motor-coupling-v16', 'gearbox-v16', 'gearbox-output-raised-v22',
  'main-hopper', 'barrel', 'upper-screw', 'lower-screw', 'side-feeder', 'vent', 'die',
];
check(
  'every part the registry measures is present in the drawing',
  REQUIRED_PARTS.every((id) => machineSvg.includes(`id="${id}"`)),
  REQUIRED_PARTS.filter((id) => !machineSvg.includes(`id="${id}"`)).join(', ') || undefined,
);

/**
 * Every `url(#…)` the drawing uses resolves to something the drawing defines.
 *
 * This is not a style check. A paint server or clip path that is referenced but
 * never declared is silently destructive and platform-dependent: a browser
 * drops the element that references it, react-native-svg renders it unclipped.
 * The reference drawing shipped with exactly that fault — a `#intermeshClip`
 * that was never defined — so the drawing looked different depending on which
 * renderer opened it. Nothing about that is visible in a diff.
 */
const referenced = new Set(Array.from(machineSvg.matchAll(/url\(#([^)]+)\)/g), (m) => m[1]));
const declared = new Set(Array.from(machineSvg.matchAll(/\sid="([^"]+)"/g), (m) => m[1]));
const dangling = [...referenced].filter((id) => !declared.has(id));
check('every paint, clip and filter reference resolves', dangling.length === 0, dangling.join(', ') || undefined);

/**
 * The drawing draws no instrument of its own.
 *
 * The reference ships its sensor markers as a separate layer keyed by its own
 * sensor ids. Those ids are not the ones saved layouts and channel mappings
 * reference, so carrying the layer across would have put a second, differently
 * named set of markers on the machine next to the registry's own — visually
 * identical, and wired to nothing.
 */
check(
  'the drawing carries no instrument markers of its own',
  !machineSvg.includes('data-sensor-id') && !machineSvg.includes('configured-process-sensors'),
);

// The reference calls this a marker-only drawing: no sensor names, part names,
// zone names or leader lines are baked in, so nothing on the machine can go
// stale against a label the application is the actual source of.
check('the drawing carries no baked-in text', !machineSvg.includes('<text'));

check(
  'the sheet and its grid are off unless asked for',
  !machineSvg.includes('url(#grid)') && buildTwinScrewExtruderArtwork({ showBackground: true }).includes('url(#grid)'),
);

/**
 * With the sheet off, the drawing is actually transparent.
 *
 * The reference draws its motor and gearbox twice and hides the first pair
 * behind an opaque patch across the left third of the frame. Vendoring removes
 * the hidden pair instead, which is the only reason the machine can sit on the
 * console's own grid rather than on a white card. A re-vendoring that brought
 * the patch back would look almost right and be wrong in exactly one way, so
 * the absence of any opaque fill is asserted rather than assumed.
 */
check(
  'nothing paints an opaque ground when the sheet is off',
  !/<rect[^>]*fill="#[0-9a-fA-F]{6}"[^>]*width="6[0-9][0-9]"/.test(machineSvg) && !machineSvg.includes('rebuild-background-patches'),
);

check(
  'the whole drawing parses into renderable nodes',
  (() => {
    const ast = parse(machineSvg);
    return Boolean(ast) && Array.isArray(ast?.children) && ast.children.length > 0;
  })(),
);

/**
 * Nothing is lost between the drawing and what the console mounts.
 *
 * The template does not transcribe the machineSvg into JSX, it parses it — so the
 * question worth asking is whether the parse is lossy. Counting the elements on
 * both sides answers it for every element type at once.
 */
const parsedCount = (() => {
  let n = 0;
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    n += 1;
    const kids = (node as { props?: { children?: unknown[] } }).props?.children;
    if (Array.isArray(kids)) kids.forEach(walk);
  };
  parse(machineSvg)?.children.forEach(walk);
  return n;
})();
const sourceCount = (machineSvg.match(/<(?!\/|\?|!)/g) ?? []).length - 1; // less the <svg> root
check(
  'the parse keeps every element the drawing declares',
  parsedCount === sourceCount,
  `${parsedCount} parsed vs ${sourceCount} in source`,
);

// ---------------------------------------------------------------------------
console.log('\n--- Pads sit on the machine ---');

/**
 * A pad that has drifted off the machine is still a valid connection point and
 * still passes every check above it — it just measures thin air. These bound it
 * to the drawn extent of the machine rather than to the sheet.
 */
const MACHINE = { x: 16, y: 119, width: 1618 - 16, height: 726 - 119 };
const strays = TWIN_SCREW_POINT_REGISTRY.filter(
  (point) =>
    point.x < MACHINE.x ||
    point.x > MACHINE.x + MACHINE.width ||
    point.y < MACHINE.y ||
    point.y > MACHINE.y + MACHINE.height,
);
check('no pad sits off the machine', strays.length === 0, strays.map((p) => p.code).join(', ') || undefined);

// The eight barrel zones are one row of instruments along one heater band. If
// one drifts off that line the drawing stops reading as a zone profile.
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

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
