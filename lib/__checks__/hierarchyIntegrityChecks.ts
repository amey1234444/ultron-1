/**
 * A workspace that cannot be saved is a workspace that loses everything.
 *
 * The hierarchy is persisted by deleting this workspace's rows and inserting
 * the whole tree again, inside one transaction. Every foreign key in that
 * schema is therefore a way for one bad row to abort the entire save — and
 * because the bad row lives in the client's memory, it is in the next payload
 * too. The workspace stops saving permanently while the console goes on
 * showing every edit as applied. That is what "I created three machines and
 * after a reload they were gone" actually was.
 *
 * So the pass below has to mirror the schema exactly. Each check names the
 * constraint it stands for; if a column's nullability or a foreign key ever
 * changes in `src/server/db.ts` without this changing too, the two drift and
 * the failure comes back in the same silent shape.
 */
import { reconcileHierarchy, describeRepairs, type HierarchySnapshot } from '../hierarchyIntegrity';
import type { FolderNode, ProjectNode } from '../hierarchy';
import type { MachineNode } from '../machines';
import type { DeviceNode } from '../devices';
import type { CardNode } from '../rack';

let failures = 0;
function ok(name: string, condition: boolean, detail = '') {
  console.log(`${condition ? '  PASS' : '  FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!condition) failures++;
}

const project = (id: string): ProjectNode => ({ id, name: id, code: '', description: '' });
const folder = (id: string, projectId: string, parentId: string | null = null): FolderNode =>
  ({ id, projectId, parentId, name: id, type: 'Area', code: '', description: '' });
const machine = (id: string, projectId: string, folderId: string): MachineNode =>
  ({ id, projectId, folderId, name: id, template: 'Centrifugal Pump', components: [] });
const device = (id: string, projectId: string | null): DeviceNode => ({
  id, name: id, type: 'Gateway', model: '', ip: '', port: '', protocol: 'Modbus TCP',
  description: '', status: 'Online', projectId, gatewayId: null, realGatewayId: null,
  realRackId: null, archived: false, simulated: false,
});
const card = (id: string, deviceId: string, slot: number): CardNode =>
  ({ id, deviceId, slot, type: 'Vibration Card', enabled: true, config: {} as CardNode['config'] });

const empty: HierarchySnapshot = { projects: [], folders: [], machines: [], devices: [], cards: [] };
const snapshot = (over: Partial<HierarchySnapshot>): HierarchySnapshot => ({ ...empty, ...over });

console.log('--- a sound tree is left alone ---');
const sound = snapshot({
  projects: [project('p1')],
  folders: [folder('f1', 'p1'), folder('f2', 'p1', 'f1')],
  machines: [machine('m1', 'p1', 'f2')],
  devices: [device('d1', 'p1')],
  cards: [card('c1', 'd1', 1)],
});
const soundOut = reconcileHierarchy(sound);
ok('nothing is reported', soundOut.repairs.length === 0,
  soundOut.repairs.map((r) => r.reason).join('; '));
ok('and nothing is lost',
  soundOut.data.projects.length === 1 && soundOut.data.folders.length === 2
  && soundOut.data.machines.length === 1 && soundOut.data.devices.length === 1
  && soundOut.data.cards.length === 1);
ok('describeRepairs says nothing when there is nothing to say',
  describeRepairs(soundOut.repairs) === null);

console.log('\n--- studio_machines.folder_id NOT NULL REFERENCES studio_folders(id) ---');
// The exact shape the bug produced: a machine left behind by a delete,
// pointing at a folder that is no longer in the payload.
const orphan = reconcileHierarchy(snapshot({
  projects: [project('p1')],
  folders: [folder('f1', 'p1')],
  machines: [machine('keep', 'p1', 'f1'), machine('orphan', 'p1', 'gone')],
}));
ok('a machine whose folder is absent is dropped',
  orphan.data.machines.length === 1 && orphan.data.machines[0].id === 'keep');
ok('and the drop is reported, not silent',
  orphan.repairs.some((r) => r.kind === 'machine' && r.id === 'orphan' && r.action === 'dropped'));
ok('the rest of the tree still saves', orphan.data.projects.length === 1,
  'one unstorable row must not cost the whole workspace');

console.log('\n--- studio_machines.project_id: the folder is the authority ---');
// A machine moved across projects used to keep the project id it came from.
// Nothing showed the disagreement until the old project was deleted.
const drifted = reconcileHierarchy(snapshot({
  projects: [project('p1'), project('p2')],
  folders: [folder('f2', 'p2')],
  machines: [machine('m1', 'p1', 'f2')],
}));
ok('a machine in another project\'s folder is reassigned, not dropped',
  drifted.data.machines.length === 1 && drifted.data.machines[0].projectId === 'p2',
  drifted.data.machines[0]?.projectId);
ok('and the repair is reported',
  drifted.repairs.some((r) => r.kind === 'machine' && r.action === 'reassigned'));

console.log('\n--- studio_folders.project_id NOT NULL REFERENCES studio_projects(id) ---');
const lostProject = reconcileHierarchy(snapshot({
  projects: [project('p1')],
  folders: [folder('f1', 'p1'), folder('stray', 'gone')],
  machines: [machine('m1', 'gone', 'stray')],
}));
ok('a folder whose project is absent is dropped',
  lostProject.data.folders.length === 1 && lostProject.data.folders[0].id === 'f1');
ok('and its machines go with it, rather than dangling',
  lostProject.data.machines.length === 0);

console.log('\n--- studio_folders.parent_id REFERENCES studio_folders(id), nullable ---');
const lostParent = reconcileHierarchy(snapshot({
  projects: [project('p1')],
  folders: [folder('f1', 'p1', 'vanished')],
  machines: [machine('m1', 'p1', 'f1')],
}));
ok('a folder whose parent is absent is kept, at the project root',
  lostParent.data.folders.length === 1 && lostParent.data.folders[0].parentId === null,
  'nullable, so cutting the link costs nothing and dropping it would cost the subtree');
ok('so its machines survive too', lostParent.data.machines.length === 1);
ok('and the reparent is reported',
  lostParent.repairs.some((r) => r.action === 'reparented'));

const crossProject = reconcileHierarchy(snapshot({
  projects: [project('p1'), project('p2')],
  folders: [folder('f1', 'p1'), folder('f2', 'p2', 'f1')],
}));
ok('a folder parented into another project is cut back to its own root',
  crossProject.data.folders.find((f) => f.id === 'f2')?.parentId === null,
  'the tree draws project then folders, so such a folder renders nowhere at all');

// The writer treats a cycle as fatal. It must never see one.
const cyclic = reconcileHierarchy(snapshot({
  projects: [project('p1')],
  folders: [folder('a', 'p1', 'b'), folder('b', 'p1', 'a')],
}));
ok('a parent loop is broken rather than thrown on',
  cyclic.data.folders.some((f) => f.parentId === null),
  cyclic.data.folders.map((f) => `${f.id}->${f.parentId}`).join(' '));
ok('and every folder survives it', cyclic.data.folders.length === 2);
const selfCycle = reconcileHierarchy(snapshot({
  projects: [project('p1')], folders: [folder('a', 'p1', 'a')],
}));
ok('including a folder that is its own parent',
  selfCycle.data.folders[0]?.parentId === null);

console.log('\n--- studio_devices.project_id REFERENCES studio_projects(id), nullable ---');
const detached = reconcileHierarchy(snapshot({
  projects: [project('p1')],
  devices: [device('d1', 'gone'), device('d2', 'p1'), device('d3', null)],
  cards: [card('c1', 'd1', 1)],
}));
ok('a device whose project is absent is detached, not dropped',
  detached.data.devices.length === 3 && detached.data.devices[0].projectId === null,
  'the column is nullable and the devices table is not the project tree');
ok('so its cards are kept as well', detached.data.cards.length === 1);
ok('a device with no project at all is left as it is',
  !detached.repairs.some((r) => r.id === 'd3'));

console.log('\n--- studio_cards.device_id NOT NULL REFERENCES studio_devices(id) ---');
const lostDevice = reconcileHierarchy(snapshot({
  projects: [project('p1')],
  devices: [device('d1', 'p1')],
  cards: [card('c1', 'd1', 1), card('c2', 'gone', 1)],
}));
ok('a card whose device is absent is dropped',
  lostDevice.data.cards.length === 1 && lostDevice.data.cards[0].id === 'c1');

console.log('\n--- primary keys, and UNIQUE (device_id, slot) on cards ---');
const dupes = reconcileHierarchy(snapshot({
  projects: [project('p1'), project('p1')],
  folders: [folder('f1', 'p1'), folder('f1', 'p1')],
  machines: [machine('m1', 'p1', 'f1'), machine('m1', 'p1', 'f1')],
  devices: [device('d1', 'p1'), device('d1', 'p1')],
  cards: [card('c1', 'd1', 1), card('c1', 'd1', 2)],
}));
ok('a repeated id is kept once per table',
  dupes.data.projects.length === 1 && dupes.data.folders.length === 1
  && dupes.data.machines.length === 1 && dupes.data.devices.length === 1
  && dupes.data.cards.length === 1,
  'every id is a primary key across the whole table');
const sameSlot = reconcileHierarchy(snapshot({
  projects: [project('p1')], devices: [device('d1', 'p1')],
  cards: [card('c1', 'd1', 3), card('c2', 'd1', 3)],
}));
ok('two cards in one slot become one', sameSlot.data.cards.length === 1,
  'UNIQUE (device_id, slot)');
const blank = reconcileHierarchy(snapshot({
  projects: [project('p1'), { ...project(''), name: 'nameless' }],
}));
ok('a row with no id is dropped', blank.data.projects.length === 1);

console.log('\n--- what the operator is told ---');
const described = describeRepairs(orphan.repairs);
ok('a drop is described in a readable sentence',
  typeof described === 'string' && described.includes('removed'), described ?? 'null');
ok('and it names the thing that went',
  typeof described === 'string' && described.includes('orphan'), described ?? 'null');
const many = reconcileHierarchy(snapshot({
  projects: [project('p1')], folders: [folder('f1', 'p1')],
  machines: Array.from({ length: 9 }, (_, i) => machine(`m${i}`, 'p1', 'gone')),
}));
const manyText = describeRepairs(many.repairs) ?? '';
ok('a long list is summarised rather than dumped',
  manyText.includes('and 5 more') || manyText.includes('…and 5 more'), manyText);

console.log('\n--- the result is always storable ---');
// Whatever went in, what comes out must satisfy every constraint. Property
// rather than example: the point is that no input reaches the writer unsound.
const hostile = snapshot({
  projects: [project('p1'), project('p1'), { ...project(''), name: 'x' }],
  folders: [folder('f1', 'nope'), folder('f2', 'p1', 'f3'), folder('f3', 'p1', 'f2'), folder('f4', 'p1')],
  machines: [machine('m1', 'zz', 'f1'), machine('m2', 'p1', 'f4'), machine('m3', 'p1', 'nope'), machine('m2', 'p1', 'f4')],
  devices: [device('d1', 'zz'), device('d2', 'p1')],
  cards: [card('c1', 'nope', 0), card('c2', 'd2', 0), card('c3', 'd2', 0)],
});
const out = reconcileHierarchy(hostile).data;
const pids = new Set(out.projects.map((p) => p.id));
const fids = new Set(out.folders.map((f) => f.id));
const dids = new Set(out.devices.map((d) => d.id));
ok('every folder has a project that exists', out.folders.every((f) => pids.has(f.projectId)));
ok('every folder parent exists', out.folders.every((f) => f.parentId === null || fids.has(f.parentId)));
ok('every machine has a folder and a project that exist',
  out.machines.every((m) => fids.has(m.folderId) && pids.has(m.projectId)));
ok('every machine agrees with its folder about the project',
  out.machines.every((m) => m.projectId === out.folders.find((f) => f.id === m.folderId)?.projectId));
ok('every device project is null or real',
  out.devices.every((d) => d.projectId === null || pids.has(d.projectId)));
ok('every card has a device that exists', out.cards.every((c) => dids.has(c.deviceId)));
const ids = [...out.projects, ...out.folders, ...out.machines, ...out.devices, ...out.cards].map((r) => r.id);
ok('no id is blank or repeated within its table',
  ids.every(Boolean) && new Set(out.machines.map((m) => m.id)).size === out.machines.length
  && new Set(out.cards.map((c) => c.id)).size === out.cards.length);
ok('no two cards share a slot',
  new Set(out.cards.map((c) => `${c.deviceId}|${c.slot}`)).size === out.cards.length);
// Running it again must be a no-op, or the pass is not a fixed point and a
// save could repair something it had already repaired.
ok('reconciling the result again changes nothing',
  reconcileHierarchy(out).repairs.length === 0,
  reconcileHierarchy(out).repairs.map((r) => r.reason).join('; '));

console.log(failures === 0 ? '\nhierarchy integrity: all checks passed' : `\nhierarchy integrity: ${failures} check(s) failed`);
if (failures > 0) process.exit(1);
