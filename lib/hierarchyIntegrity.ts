/**
 * Making a hierarchy snapshot something the database can actually store.
 *
 * The workspace is persisted by deleting every row this workspace owns and
 * re-inserting the whole tree in one transaction. That is simple and it is
 * atomic, and it has a failure mode that is far worse than it looks: the
 * schema enforces real foreign keys, so *one* row that points at something
 * absent aborts the transaction, and the save fails. The offending row is
 * still in the client's memory, so it is in the next payload too, and the one
 * after that. From that moment the workspace cannot be saved at all, while
 * the console keeps showing every edit as though it had worked. Machines
 * created in a folder are there until the page is reloaded, and then they
 * never were.
 *
 * A tree can reach that state in ordinary use. Moving a machine between
 * projects used to leave its `projectId` on the project it came from, and
 * deleting *that* project removed the folder the machine now lived in while
 * leaving the machine behind, pointing at a folder that no longer existed.
 * Both halves were reasonable on their own.
 *
 * So the snapshot is reconciled before it is written. Every rule below is one
 * the database already enforces — this does not invent a policy, it applies
 * the schema's own constraints in a place where the answer can be "drop this
 * one row" instead of "lose everything". What gets changed is reported rather
 * than swallowed, because an operator whose machine disappeared is owed the
 * reason.
 *
 * The constraints being mirrored, from `src/server/db.ts`:
 *
 *   studio_folders.project_id   NOT NULL REFERENCES studio_projects(id)
 *   studio_folders.parent_id             REFERENCES studio_folders(id)
 *   studio_machines.project_id  NOT NULL REFERENCES studio_projects(id)
 *   studio_machines.folder_id   NOT NULL REFERENCES studio_folders(id)
 *   studio_devices.project_id            REFERENCES studio_projects(id)
 *   studio_cards.device_id      NOT NULL REFERENCES studio_devices(id)
 *   ...and a PRIMARY KEY on every id, plus UNIQUE (device_id, slot) on cards.
 */
import type { FolderNode, ProjectNode } from './hierarchy';
import type { MachineNode } from './machines';
import type { DeviceNode } from './devices';
import type { CardNode } from './rack';

export type HierarchySnapshot = {
  projects: ProjectNode[];
  folders: FolderNode[];
  machines: MachineNode[];
  devices: DeviceNode[];
  cards: CardNode[];
};

export type HierarchyRepair = {
  kind: 'project' | 'folder' | 'machine' | 'device' | 'card';
  id: string;
  label: string;
  /** `dropped` loses the row. Everything else keeps it and changes one field. */
  action: 'dropped' | 'reparented' | 'reassigned' | 'detached';
  reason: string;
};

/** First occurrence wins, matching what a PK would do to the second INSERT. */
function dedupeById<T extends { id: string }>(
  rows: readonly T[],
  kind: HierarchyRepair['kind'],
  label: (row: T) => string,
  repairs: HierarchyRepair[],
): T[] {
  const seen = new Set<string>();
  const kept: T[] = [];
  for (const row of rows) {
    const id = typeof row?.id === 'string' ? row.id.trim() : '';
    if (!id) {
      repairs.push({ kind, id: '', label: label(row), action: 'dropped', reason: 'it has no id' });
      continue;
    }
    if (seen.has(id)) {
      repairs.push({ kind, id, label: label(row), action: 'dropped', reason: `another ${kind} already has the id ${id}` });
      continue;
    }
    seen.add(id);
    kept.push(row);
  }
  return kept;
}

/**
 * Return a snapshot the schema will accept, and a list of what that cost.
 *
 * Pure, and safe to run on any input — including one that is already sound,
 * where it reports nothing and changes nothing.
 */
export function reconcileHierarchy(data: HierarchySnapshot): {
  data: HierarchySnapshot;
  repairs: HierarchyRepair[];
} {
  const repairs: HierarchyRepair[] = [];

  const projects = dedupeById(data.projects ?? [], 'project', (p) => p.name ?? '', repairs);
  const projectIds = new Set(projects.map((p) => p.id));

  // --- folders -------------------------------------------------------------
  // A folder whose project is gone cannot be stored and has nowhere to be
  // drawn, so it goes, and so does everything below it.
  const foldersWithProject = dedupeById(data.folders ?? [], 'folder', (f) => f.name ?? '', repairs)
    .filter((folder) => {
      if (projectIds.has(folder.projectId)) return true;
      repairs.push({
        kind: 'folder', id: folder.id, label: folder.name ?? '', action: 'dropped',
        reason: `its project (${folder.projectId || 'none'}) is not in the workspace`,
      });
      return false;
    });

  const folderIds = new Set(foldersWithProject.map((f) => f.id));
  const folderById = new Map(foldersWithProject.map((f) => [f.id, f]));

  // A parent that is absent, in a different project, or part of a cycle would
  // either break the insert or render the subtree nowhere. Cutting the link
  // puts the folder back at its project root, where it is visible and its
  // machines come back with it — strictly better than dropping it.
  const folders = foldersWithProject.map((folder) => {
    const cut = (reason: string): FolderNode => {
      repairs.push({ kind: 'folder', id: folder.id, label: folder.name ?? '', action: 'reparented', reason });
      return { ...folder, parentId: null };
    };
    if (!folder.parentId) return folder;
    const parent = folderById.get(folder.parentId);
    if (!parent) return cut(`its parent folder (${folder.parentId}) is not in the workspace`);
    if (parent.projectId !== folder.projectId) {
      return cut('its parent folder belongs to a different project');
    }
    // Walk up. A cycle never terminates at a root, so a bounded walk that
    // does not reach one has found one.
    const seen = new Set<string>([folder.id]);
    let cursor: FolderNode | undefined = parent;
    while (cursor) {
      if (seen.has(cursor.id)) return cut('its parent chain forms a loop');
      seen.add(cursor.id);
      cursor = cursor.parentId ? folderById.get(cursor.parentId) : undefined;
    }
    return folder;
  });

  // --- machines ------------------------------------------------------------
  const machines: MachineNode[] = [];
  for (const machine of dedupeById(data.machines ?? [], 'machine', (m) => m.name ?? '', repairs)) {
    const folder = folderById.get(machine.folderId);
    if (!folder || !folderIds.has(machine.folderId)) {
      repairs.push({
        kind: 'machine', id: machine.id, label: machine.name ?? '', action: 'dropped',
        reason: `its folder (${machine.folderId || 'none'}) is not in the workspace`,
      });
      continue;
    }
    // The folder is the authority on which project a machine is in: it is what
    // the tree draws the machine under. A machine moved between projects kept
    // the old id here, and that disagreement is what orphaned it later.
    if (machine.projectId !== folder.projectId) {
      repairs.push({
        kind: 'machine', id: machine.id, label: machine.name ?? '', action: 'reassigned',
        reason: `it sits in a folder belonging to ${folder.projectId}, not ${machine.projectId || 'none'}`,
      });
      machines.push({ ...machine, projectId: folder.projectId });
      continue;
    }
    machines.push(machine);
  }

  // --- devices -------------------------------------------------------------
  // Nullable, so a missing project detaches the device rather than losing it.
  // Devices are not drawn in the project tree, so a detached one is still
  // reachable from the devices table.
  const devices = dedupeById(data.devices ?? [], 'device', (d) => d.name ?? '', repairs).map((device) => {
    if (device.projectId == null || projectIds.has(device.projectId)) return device;
    repairs.push({
      kind: 'device', id: device.id, label: device.name ?? '', action: 'detached',
      reason: `its project (${device.projectId}) is not in the workspace`,
    });
    return { ...device, projectId: null };
  });
  const deviceIds = new Set(devices.map((d) => d.id));

  // --- cards ---------------------------------------------------------------
  // A card is hardware installed in a rack. Without the rack there is no slot
  // for it to occupy, and the schema says as much.
  const cards: CardNode[] = [];
  const bySlot = new Set<string>();
  for (const card of dedupeById(data.cards ?? [], 'card', (c) => `slot ${c.slot}`, repairs)) {
    if (!deviceIds.has(card.deviceId)) {
      repairs.push({
        kind: 'card', id: card.id, label: `slot ${card.slot}`, action: 'dropped',
        reason: `its device (${card.deviceId || 'none'}) is not in the workspace`,
      });
      continue;
    }
    const slotKey = `${card.deviceId}|${card.slot}`;
    if (bySlot.has(slotKey)) {
      repairs.push({
        kind: 'card', id: card.id, label: `slot ${card.slot}`, action: 'dropped',
        reason: 'another card already occupies that slot',
      });
      continue;
    }
    bySlot.add(slotKey);
    cards.push(card);
  }

  return { data: { projects, folders, machines, devices, cards }, repairs };
}

/** One sentence an operator can read, or null when nothing was changed. */
export function describeRepairs(repairs: readonly HierarchyRepair[]): string | null {
  if (repairs.length === 0) return null;
  const dropped = repairs.filter((r) => r.action === 'dropped');
  const parts = repairs.slice(0, 4).map((r) => `${r.kind} "${r.label || r.id}" ${r.action} because ${r.reason}`);
  const rest = repairs.length - parts.length;
  return [
    dropped.length > 0
      ? `${dropped.length} item${dropped.length === 1 ? '' : 's'} could not be saved and ${dropped.length === 1 ? 'was' : 'were'} removed.`
      : 'Some items were repaired so the workspace could be saved.',
    ...parts,
    rest > 0 ? `…and ${rest} more.` : '',
  ].filter(Boolean).join(' ');
}
