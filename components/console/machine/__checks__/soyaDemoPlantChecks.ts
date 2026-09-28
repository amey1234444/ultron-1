/**
 * The oilseed plant the demo account opens with, without a database.
 *
 * Seventeen instrumented templates in three variants each, with a gateway,
 * racks, a card per instrument and a mapped, crossing-free canvas for every
 * one of them. Built by hand that was an afternoon of clicking and, worse, an
 * artefact of one particular database — restore a backup or point at another
 * instance and the demo is gone the day before a plant visit.
 *
 * Three things have to hold, and the third is the one with teeth:
 *
 *   1. the plant is complete and sound — every machine wired, every pad
 *      mapped, no trail crossing another, and identical on every load;
 *   2. the workspace wins wherever it has an opinion, and the plant fills
 *      only what is missing;
 *   3. none of it is ever written. The store strips these ids from every
 *      payload, so no handler in the console can put a built-in row into
 *      somebody's plant — where it would collide with the built-in on the
 *      next load and, since the save replaces the whole tree at once, take
 *      every later edit down with it.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { overlaySoyaDemoPlant, soyaDemoPlant, soyaDemoRowIds, DEMO_DEPARTMENTS, type PlantSnapshot } from '../soyaDemoPlant';
import { connectorsForTemplate } from '../machineConnectors';
import { reconcileHierarchy } from '../../../../lib/hierarchyIntegrity';
import { findDuplicateConfiguredDeviceIp, findDuplicateConfiguredDeviceName } from '../../../../lib/deviceUniqueness';
import { profileFromName } from '../../../../lib/machineSimulationProfile';
import { MACHINE_TEMPLATES } from '../../../../lib/machines';
import type { MachineNode } from '../../../../lib/machines';
import type { DeviceNode } from '../../../../lib/devices';

let failures = 0;
function ok(name: string, condition: boolean, detail = '') {
  console.log(`${condition ? '  PASS' : '  FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!condition) failures++;
}

type Point = { x: number; y: number };
const EPS = 1e-9;
function crosses(a: Point, b: Point, c: Point, d: Point): boolean {
  const near = (p: Point, q: Point) => Math.abs(p.x - q.x) < 0.5 && Math.abs(p.y - q.y) < 0.5;
  if (near(a, c) || near(a, d) || near(b, c) || near(b, d)) return false;
  const turn = (o: Point, p: Point, q: Point) => (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x);
  const d1 = turn(a, b, c), d2 = turn(a, b, d), d3 = turn(c, d, a), d4 = turn(c, d, b);
  return ((d1 > EPS && d2 < -EPS) || (d1 < -EPS && d2 > EPS)) && ((d3 > EPS && d4 < -EPS) || (d3 < -EPS && d4 > EPS));
}

const plant = soyaDemoPlant();
const instrumented = (MACHINE_TEMPLATES as readonly string[]).filter((t) => connectorsForTemplate(t).length > 0);
const empty: PlantSnapshot = { projects: [], folders: [], machines: [], devices: [], cards: [] };

console.log('--- the plant is the whole plant ---');
ok('every instrumented template is represented',
  instrumented.every((t) => plant.machines.some((m) => m.template === t)),
  `${instrumented.length} templates`);
ok('and nothing without instruments is',
  plant.machines.every((m) => connectorsForTemplate(m.template).length > 0),
  'a template with no pads would open an empty canvas');
ok('three variants of each', plant.machines.length === instrumented.length * 3,
  `${plant.machines.length} machines`);
for (const variant of ['healthy', 'faulty', 'prediction'] as const) {
  ok(`every machine has a ${variant} variant`,
    instrumented.every((t) => plant.machines.some((m) => m.template === t && profileFromName(m.name) === variant)),
    'read back the way the simulator reads it, not by the name it was given');
}
ok('every department names templates that exist',
  DEMO_DEPARTMENTS.every((d) => d.templates.every((t) => (MACHINE_TEMPLATES as readonly string[]).includes(t))));
ok('and no template is in two departments',
  new Set(DEMO_DEPARTMENTS.flatMap((d) => d.templates)).size === DEMO_DEPARTMENTS.flatMap((d) => d.templates).length);

console.log('\n--- it is storable, which is what makes it mergeable ---');
// Not because it is stored — it never is — but because it is merged into a
// tree that is, and an unsound built-in row would make the whole workspace
// unsavable exactly as a bad stored one would.
const sound = reconcileHierarchy(plant);
ok('nothing in it needs repairing', sound.repairs.length === 0,
  sound.repairs.slice(0, 3).map((r) => `${r.kind} ${r.label}: ${r.reason}`).join('; '));
ok('no two devices share a name', findDuplicateConfiguredDeviceName(plant.devices) === null,
  findDuplicateConfiguredDeviceName(plant.devices)?.name ?? '');
ok('no two devices share an address', findDuplicateConfiguredDeviceIp(plant.devices) === null,
  findDuplicateConfiguredDeviceIp(plant.devices)?.ip ?? '');

console.log('\n--- every machine arrives wired ---');
const unwired = plant.machines.filter((m) => !plant.devices.some((d) => d.description === `Generated for ${m.name}`));
ok('each has its own gateway and racks', unwired.length === 0, unwired.map((m) => m.name).join(', '));
ok('each has a canvas', plant.machines.every((m) => plant.layouts[m.id]), `${Object.keys(plant.layouts).length} layouts`);
const boxes = plant.machines.flatMap((m) => plant.layouts[m.id]?.boxes ?? []);
ok('every card on every canvas is mapped to a channel',
  boxes.length > 0 && boxes.every((b) => b.channelId),
  `${boxes.filter((b) => b.channelId).length}/${boxes.length} mapped`);
ok('a card exists for every pad',
  plant.machines.every((m) => (plant.layouts[m.id]?.boxes.length ?? 0) === connectorsForTemplate(m.template).length),
  'a pad with no card is a connecting point that leads nowhere');
const channelIds = boxes.map((b) => b.channelId);
ok('and no channel is mapped twice', new Set(channelIds).size === channelIds.length,
  `${channelIds.length} mappings`);

console.log('\n--- not one trail crosses another ---');
let crossings = 0;
const worst: string[] = [];
for (const machine of plant.machines) {
  const segments: [Point, Point][] = [];
  for (const trail of plant.layouts[machine.id]?.trails ?? []) {
    for (let i = 0; i < trail.points.length - 1; i += 1) segments.push([trail.points[i], trail.points[i + 1]]);
  }
  let count = 0;
  for (let i = 0; i < segments.length; i += 1) {
    for (let j = i + 1; j < segments.length; j += 1) {
      if (crosses(segments[i][0], segments[i][1], segments[j][0], segments[j][1])) count += 1;
    }
  }
  if (count > 0) worst.push(`${machine.name}: ${count}`);
  crossings += count;
}
ok('across all fifty-one canvases', crossings === 0, worst.slice(0, 5).join(', ') || `${plant.machines.length} canvases clean`);

console.log('\n--- the same plant every time ---');
// Two calls must be indistinguishable, or a reload would look like somebody
// had edited the plant, and the ids the store strips would stop matching.
const again = soyaDemoPlant();
ok('the same object is handed back', again === plant, 'memoised, so callers cannot diverge');
ok('ids are derived, not random',
  plant.machines.every((m) => m.id.startsWith('builtin-soya-')),
  plant.machines[0]?.id);
ok('component ids are counted, not random',
  plant.machines.every((m) => m.components.every((c) => c.id.startsWith(m.id))));

console.log('\n--- the workspace always wins ---');
const aTemplate = 'Hammer Mill';
const storedMachine = {
  id: 'user-made', projectId: 'p1', folderId: 'f1',
  // A name typed by hand: different spacing, a capital in the wrong place.
  name: 'Hammer  MIll  Healthy', template: aTemplate, components: [],
} as MachineNode;
const withStored = overlaySoyaDemoPlant({ ...empty, projects: [{ id: 'p1', name: 'Soya Demo', code: '', description: '' }], folders: [{ id: 'f1', projectId: 'p1', parentId: null, name: 'packing', type: 'Area', code: '', description: '' }], machines: [storedMachine] });
const hammers = withStored.machines.filter((m) => m.template === aTemplate);
ok('a stored machine suppresses the built-in of its template and variant',
  hammers.length === 3 && hammers.filter((m) => profileFromName(m.name) === 'healthy').length === 1,
  hammers.map((m) => m.name).join(' | '));
ok('and the other two variants still arrive', hammers.filter((m) => m.id.startsWith('builtin-')).length === 2);
ok('the stored machine itself is untouched',
  withStored.machines.some((m) => m.id === 'user-made' && m.name === storedMachine.name));
ok('a department the operator already made is not shown twice',
  withStored.folders.filter((f) => f.name.toLowerCase() === 'packing').length === 1,
  withStored.folders.map((f) => f.name).join(' | '));
ok('and the built-ins are re-homed onto theirs',
  withStored.machines.filter((m) => m.id.startsWith('builtin-')).every((m) => withStored.folders.some((f) => f.id === m.folderId)));
ok('a project the operator already made is not duplicated either',
  withStored.projects.length === 1 && withStored.projects[0].id === 'p1');

console.log('\n--- a gateway from the database removes the hardcoded one ---');
const builtInGateway = plant.devices.find((d) => d.type === 'Gateway');
const ownerId = Object.keys(plant.hardwareByMachine).find((id) => plant.hardwareByMachine[id].deviceIds.includes(builtInGateway?.id ?? ''));
if (!builtInGateway || !ownerId) throw new Error('the plant has no gateway to test with');
const owned = plant.hardwareByMachine[ownerId];

for (const [how, stored] of [
  ['by id', { ...builtInGateway, name: 'Renamed Gateway', ip: '172.31.9.9' }],
  ['by name', { ...builtInGateway, id: 'stored-gw', ip: '172.31.9.9' }],
  ['by address', { ...builtInGateway, id: 'stored-gw', name: 'Renamed Gateway' }],
] as [string, DeviceNode][]) {
  const merged = overlaySoyaDemoPlant({ ...empty, devices: [stored] });
  const mergedIds = new Set(merged.devices.map((d) => d.id));
  // By identity, not by id: in the by-id case the stored device legitimately
  // occupies that id, and what must not be there is the built-in object.
  ok(`matched ${how}: the built-in gateway is gone`,
    !merged.devices.includes(builtInGateway)
    && merged.devices.filter((d) => d.id === builtInGateway.id).length <= 1);
  // Checked separately because dropping only the device that clashed used to
  // leave that machine's racks behind, under no gateway at all.
  const rackIds = owned.deviceIds.filter((id) => id !== builtInGateway.id);
  ok(`  and its racks go with it`,
    rackIds.length > 0 && rackIds.every((id) => !mergedIds.has(id)),
    `${rackIds.filter((id) => mergedIds.has(id)).length} of ${rackIds.length} left behind`);
  const mergedCards = new Set(merged.cards.map((c) => c.id));
  ok(`  and so do its cards`, owned.cardIds.every((id) => !mergedCards.has(id)));
  ok(`  every other machine still has its hardware`,
    merged.devices.length === plant.devices.length - owned.deviceIds.length + 1,
    `${merged.devices.length} devices`);
  ok(`  and nothing collides`,
    findDuplicateConfiguredDeviceName(merged.devices) === null && findDuplicateConfiguredDeviceIp(merged.devices) === null,
    findDuplicateConfiguredDeviceName(merged.devices)?.name ?? findDuplicateConfiguredDeviceIp(merged.devices)?.ip ?? '');
  ok(`  and no card is left without its device`,
    merged.cards.every((c) => mergedIds.has(c.deviceId)));
}
ok('hardware only arrives with the machine it belongs to',
  overlaySoyaDemoPlant({ ...empty, machines: plant.machines }).devices.length === 0,
  'every built-in machine already stored means no built-in gateway is needed');

console.log('\n--- an empty workspace gets the whole plant ---');
const fresh = overlaySoyaDemoPlant(empty);
ok('all fifty-one machines', fresh.machines.length === plant.machines.length, `${fresh.machines.length}`);
ok('all their hardware', fresh.devices.length === plant.devices.length, `${fresh.devices.length} devices`);
ok('and the merged tree is still sound', reconcileHierarchy(fresh).repairs.length === 0,
  reconcileHierarchy(fresh).repairs.slice(0, 2).map((r) => r.reason).join('; '));

console.log('\n--- none of it is ever written ---');
const ids = soyaDemoRowIds();
ok('every row the plant occupies is listed',
  [...plant.projects, ...plant.folders, ...plant.machines, ...plant.devices, ...plant.cards].every((r) => ids.has(r.id)),
  `${ids.size} ids`);
const store = readFileSync(join(process.cwd(), 'hooks/useWorkspaceStore.ts'), 'utf8');
ok('the store strips them from the payload',
  store.includes('body: JSON.stringify({ data: withoutBuiltIns(latest.current)'),
  'the single guarantee — no handler can write one, however it behaves');
ok('and strips them from every table',
  ['projects', 'folders', 'machines', 'devices', 'cards'].every((t) => store.includes(`${t}: snapshot.${t}.filter((row) => !builtIn.has(row.id))`)));

const page = readFileSync(join(process.cwd(), 'app/index.tsx'), 'utf8');
ok('the console merges the plant at the one place the workspace enters it',
  page.includes('isSoyaDemo ? overlaySoyaDemoPlant(stored) : stored')
  && page.includes('const { projects, folders, machines, devices: storedDevices, cards } = workspaceView;'));
ok('only in the demo workspace',
  page.includes('const isSoyaDemo = isSoyaDemoWorkspace(currentUser?.workspaceId);'),
  'another account\'s plant is its own');
ok('and a built-in machine opens on its bound canvas',
  page.includes('getLayout(machineId) ?? (isSoyaDemo ? soyaDemoPlant().layouts[machineId] ?? null : null)'),
  'without this the canvas falls back to the bare template, with nothing mapped');

console.log(failures === 0 ? '\nsoya demo plant: all checks passed' : `\nsoya demo plant: ${failures} check(s) failed`);
if (failures > 0) process.exit(1);
