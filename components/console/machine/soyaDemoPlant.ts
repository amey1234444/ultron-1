/**
 * The oilseed plant the demo account opens with, built into the app.
 *
 * Every machine here used to be something somebody created by hand, in the
 * console, against the database. That is seventeen machines in three variants
 * each — fifty-one — and then a gateway, racks, cards and a mapped pad per
 * instrument for every one of them. It took an afternoon, and an afternoon is
 * not a thing you want between a fresh deployment and a plant visit. Worse,
 * it made the demo an artefact of one database: restore from a backup, point
 * at a different instance, or lose a row to the save bug this was found
 * alongside, and the plant is gone.
 *
 * So it is declared here instead, and merged over whatever the workspace
 * actually holds. Two rules decide what wins, and they are the ones asked
 * for:
 *
 *   - anything the database has, the database keeps. A built-in machine
 *     steps aside for a stored machine of the same template and variant, and
 *     a built-in gateway steps aside for a stored device with its id, its
 *     name or its address. The operator's own work is never shadowed.
 *   - anything the database lacks, this supplies.
 *
 * The result is display-only. None of it is ever written back — see
 * `SOYA_DEMO_ROW_IDS`, which the workspace store strips from every payload —
 * so the plant cannot corrupt a hierarchy, cannot collide with a real row,
 * and cannot be half-saved. It is recomputed identically on every load.
 *
 * The consequence, stated plainly because it is a real limitation: editing a
 * built-in machine does not persist. To make one yours, create a machine of
 * that template and variant; the built-in stands down and yours is stored.
 */
import type { FolderNode, ProjectNode } from '../../../lib/hierarchy';
import type { MachineNode, MachineTemplate } from '../../../lib/machines';
import { componentsForTemplate } from '../../../lib/machines';
import type { DeviceNode } from '../../../lib/devices';
import type { CardNode } from '../../../lib/rack';
import { profileFromName } from '../../../lib/machineSimulationProfile';
import { normalizeDeviceNameForUniqueness } from '../../../lib/deviceUniqueness';
import { planMachineWiring } from './generateMachineWiring';
import type { SavedLayout } from './TrailBoard';

/** Every id below starts with this, which is what makes them strippable. */
export const BUILT_IN_PREFIX = 'builtin-soya-';

export type PlantSnapshot = {
  projects: ProjectNode[];
  folders: FolderNode[];
  machines: MachineNode[];
  devices: DeviceNode[];
  cards: CardNode[];
};

/**
 * The three demo variants, in the order they are drawn.
 *
 * `profileFromName` reads these back off a machine's name, which is how a
 * stored machine is matched to the built-in it replaces — by what it *is*
 * rather than by what it is called, so "Hammer MIll Predictive" with a typo
 * in it still stands in for the built-in predictive hammer mill.
 */
const VARIANTS = ['Healthy', 'Faulty', 'Predictive'] as const;
export type DemoVariant = (typeof VARIANTS)[number];

/**
 * The plant, by department.
 *
 * The three departments and the machines in the last two are the ones the
 * demo workspace was built with. Preparation carries the rest of the
 * instrumented templates: the airlock valve and the two extruders are
 * preparation-side equipment and have nowhere better to sit, and leaving them
 * out would mean templates with no machine to demonstrate them on.
 *
 * Only instrumented templates appear. A template with no pads has nothing to
 * wire and would show an empty canvas.
 */
export const DEMO_DEPARTMENTS: { name: string; templates: MachineTemplate[] }[] = [
  {
    name: 'Preparation-DEPT',
    templates: [
      'Seed Dryer Cooler',
      'Cracking Mill M-101',
      'Conditioner E-102',
      'Flaking Mill M-102',
      'Expander X-101',
      'Collet Cooler',
      'Rotary Airlock Valve',
      'Single Screw Extruder',
      'Twin Screw Extruder',
    ],
  },
  {
    name: 'Solvent Extraction',
    templates: ['DTDC', 'Solvent Extractor', 'Miscella Distillation', 'Solvent Recovery'],
  },
  {
    name: 'packing',
    templates: ['Hammer Mill', 'Meal Sifter', 'Meal Conveying & Storage', 'Auto Bagger & Stitcher'],
  },
];

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

const PROJECT_ID = `${BUILT_IN_PREFIX}project`;
const departmentId = (name: string) => `${BUILT_IN_PREFIX}dept-${slug(name)}`;
const machineFolderId = (template: string) => `${BUILT_IN_PREFIX}folder-${slug(template)}`;
const machineId = (template: string, variant: DemoVariant) =>
  `${BUILT_IN_PREFIX}machine-${slug(template)}-${slug(variant)}`;

/**
 * Build the plant. Deterministic: same ids, names and addresses every call.
 *
 * Memoised because it is not free — fifty-one machines, each with a gateway,
 * racks, a card per instrument and a bound canvas — and because every caller
 * wants the same answer.
 */
export type BuiltPlant = PlantSnapshot & {
  layouts: Record<string, SavedLayout>;
  /**
   * Which rows belong to which machine.
   *
   * Taken from the wiring generator, which knows because it made them,
   * rather than recovered afterwards by matching on a device's description
   * — a string written for a person to read, which would quietly stop
   * identifying anything the day somebody reworded it.
   */
  hardwareByMachine: Record<string, { deviceIds: string[]; cardIds: string[] }>;
};

let cached: BuiltPlant | null = null;

export function soyaDemoPlant(): BuiltPlant {
  if (cached) return cached;

  const project: ProjectNode = {
    id: PROJECT_ID,
    name: 'Soya Demo',
    code: 'SOYA',
    description: 'Oilseed extraction plant — built in, and replaced by anything you create yourself.',
  };

  const folders: FolderNode[] = [];
  const machines: MachineNode[] = [];

  for (const department of DEMO_DEPARTMENTS) {
    const deptId = departmentId(department.name);
    folders.push({
      id: deptId,
      projectId: PROJECT_ID,
      parentId: null,
      name: department.name,
      type: 'Area',
      code: '',
      description: '',
    });

    for (const template of department.templates) {
      // A folder per machine holding its three variants, which is how the
      // demo workspace was laid out by hand and reads far better on the rail
      // than fifty-one machines in three flat lists.
      const folderId = machineFolderId(template);
      folders.push({
        id: folderId,
        projectId: PROJECT_ID,
        parentId: deptId,
        name: template,
        type: 'Machine Group',
        code: '',
        description: '',
      });

      for (const variant of VARIANTS) {
        const id = machineId(template, variant);
        // Component ids are counted rather than random: the whole plant has
        // to come out byte-identical on every load, or a reload would look
        // like somebody had edited it.
        let nth = 0;
        machines.push({
          id,
          projectId: PROJECT_ID,
          folderId,
          name: `${template} ${variant}`,
          template,
          components: componentsForTemplate(template, () => `${id}-c${nth++}`),
        });
      }
    }
  }

  // The hardware and the wiring come from the same generator the "Generate
  // From Machines" button uses, so a built-in machine's canvas is mapped and
  // crossing-free for exactly the reasons a generated one is — not because
  // this file re-states any of it.
  const wiring = planMachineWiring(
    machines.map((machine) => ({
      id: machine.id,
      name: machine.name,
      template: machine.template,
      projectId: PROJECT_ID,
    })),
    null,
  );

  const hardwareByMachine: BuiltPlant['hardwareByMachine'] = {};
  for (const planned of wiring.machines) {
    hardwareByMachine[planned.machineId] = {
      deviceIds: [planned.gateway.id, ...planned.racks.map((rack) => rack.id)],
      cardIds: planned.cards.map((card) => card.id),
    };
  }

  cached = {
    projects: [project],
    folders,
    machines,
    devices: wiring.devices,
    cards: wiring.cards,
    layouts: wiring.layouts,
    hardwareByMachine,
  };
  return cached;
}

/**
 * Every id the plant occupies.
 *
 * The workspace store strips these from what it sends, which is the single
 * guarantee that none of this reaches the database however a handler behaves.
 * A set rather than a prefix test, because the generated gateway and rack ids
 * are derived from the machine by the wiring generator and do not carry one.
 */
let cachedIds: Set<string> | null = null;
export function soyaDemoRowIds(): Set<string> {
  if (cachedIds) return cachedIds;
  const plant = soyaDemoPlant();
  cachedIds = new Set<string>([
    ...plant.projects.map((row) => row.id),
    ...plant.folders.map((row) => row.id),
    ...plant.machines.map((row) => row.id),
    ...plant.devices.map((row) => row.id),
    ...plant.cards.map((row) => row.id),
  ]);
  return cachedIds;
}

/** What a stored machine is, for matching: its template and its variant. */
function identityOf(machine: { template: string; name: string }): string {
  return `${machine.template}|${profileFromName(machine.name)}`;
}

/**
 * Merge the plant into what the workspace holds, without touching it.
 *
 * Nothing stored is removed, renamed or reordered. The built-ins that survive
 * are appended, so a stored tree renders exactly as it did before.
 */
export function overlaySoyaDemoPlant(stored: PlantSnapshot): PlantSnapshot {
  const plant = soyaDemoPlant();

  // --- which built-in machines are already covered -------------------------
  // By template and variant, not by name or id: the stored ones were typed by
  // hand, so their names carry plurals and capitals the built-ins do not.
  const covered = new Set(stored.machines.map(identityOf));
  const machines = plant.machines.filter((machine) => !covered.has(identityOf(machine)));
  const keptMachineIds = new Set(machines.map((machine) => machine.id));

  // --- devices the workspace already has -----------------------------------
  // "If a gateway is present from the database, remove the hardcoded one" —
  // matched three ways, because a stored gateway for the same machine may
  // have been generated (same id), renamed, or re-addressed.
  const storedIds = new Set(stored.devices.map((device) => device.id));
  const storedNames = new Set(
    stored.devices.filter((device) => !device.archived).map((device) => normalizeDeviceNameForUniqueness(device.name)),
  );
  const storedIps = new Set(
    stored.devices
      .filter((device) => !device.archived && typeof device.ip === 'string' && device.ip.trim())
      .map((device) => device.ip.trim()),
  );

  // Hardware belongs to a machine, so it comes in only with that machine, and
  // it comes in whole or not at all. Dropping just the device that clashed
  // used to leave that machine's racks behind with no gateway above them —
  // visible in the devices table, attached to nothing, and duplicating racks
  // the stored gateway already has.
  const supersededBy = (device: DeviceNode): boolean =>
    storedIds.has(device.id)
    || storedNames.has(normalizeDeviceNameForUniqueness(device.name))
    || (typeof device.ip === 'string' && device.ip.trim() !== '' && storedIps.has(device.ip.trim()));

  const deviceById = new Map(plant.devices.map((device) => [device.id, device]));
  const droppedDeviceIds = new Set<string>();
  const droppedCardIds = new Set<string>();
  for (const machine of plant.machines) {
    const owned = plant.hardwareByMachine[machine.id];
    if (!owned) continue;
    const machineIsStored = !keptMachineIds.has(machine.id);
    const anyClash = owned.deviceIds.some((id) => {
      const device = deviceById.get(id);
      return device ? supersededBy(device) : false;
    });
    if (!machineIsStored && !anyClash) continue;
    for (const id of owned.deviceIds) droppedDeviceIds.add(id);
    for (const id of owned.cardIds) droppedCardIds.add(id);
  }

  const devices = plant.devices.filter((device) => !droppedDeviceIds.has(device.id) && !supersededBy(device));
  const keptDeviceIds = new Set(devices.map((device) => device.id));
  const storedCardIds = new Set(stored.cards.map((card) => card.id));
  const cards = plant.cards.filter(
    (card) => keptDeviceIds.has(card.deviceId) && !droppedCardIds.has(card.id) && !storedCardIds.has(card.id),
  );

  // --- folders -------------------------------------------------------------
  // A department the operator already made keeps its own folder; the built-in
  // one is dropped and the machines below it are re-homed onto theirs, so the
  // rail never shows "packing" twice.
  const storedProject = stored.projects.find(
    (candidate) => normalizeDeviceNameForUniqueness(candidate.name) === 'soya demo',
  );
  const projectId = storedProject?.id ?? PROJECT_ID;
  const storedFolderByName = new Map(
    stored.folders
      .filter((folder) => folder.projectId === projectId)
      .map((folder) => [normalizeDeviceNameForUniqueness(folder.name), folder.id]),
  );

  const folderIdMap = new Map<string, string>();
  const folders: FolderNode[] = [];
  for (const folder of plant.folders) {
    const existing = storedFolderByName.get(normalizeDeviceNameForUniqueness(folder.name));
    if (existing) {
      folderIdMap.set(folder.id, existing);
      continue;
    }
    folderIdMap.set(folder.id, folder.id);
    folders.push({
      ...folder,
      projectId,
      parentId: folder.parentId ? folderIdMap.get(folder.parentId) ?? folder.parentId : null,
    });
  }

  // Only the folders that still hold a built-in machine are worth showing; an
  // empty one is a machine group whose three variants the operator already
  // made themselves.
  const usedFolderIds = new Set(machines.map((machine) => folderIdMap.get(machine.folderId) ?? machine.folderId));
  const keptFolders = folders.filter(
    (folder) => usedFolderIds.has(folder.id) || folders.some((child) => child.parentId === folder.id && usedFolderIds.has(child.id)),
  );

  return {
    projects: storedProject ? stored.projects : [...stored.projects, ...plant.projects],
    folders: [...stored.folders, ...keptFolders],
    machines: [
      ...stored.machines,
      ...machines.map((machine) => ({
        ...machine,
        projectId,
        folderId: folderIdMap.get(machine.folderId) ?? machine.folderId,
      })),
    ],
    devices: [...stored.devices, ...devices],
    cards: [...stored.cards, ...cards],
  };
}
