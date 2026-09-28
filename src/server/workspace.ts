// Durable workspace: the asset hierarchy shown in the left rail (projects ->
// folders -> machines, plus devices and their rack cards) and the per-machine
// canvas layouts.
//
// Every row belongs to a workspace, and every function here takes the id of
// the one it is acting on. Accounts in the same workspace share their rows, so
// an edit by one becomes visible to the others (clients poll the revision
// counters exposed by getWorkspace / getRevisions); accounts in different
// workspaces cannot see each other's hierarchy at all.
//
// The id is never defaulted in this module. It arrives from the session user's
// `workspaceId` at the API boundary, and a missing one is a bug worth an
// exception rather than a silent fall back to 'default' — which, on a write,
// would mean one workspace's save landing in another's.
//
// Persistence is Supabase/PostgreSQL only (via DATABASE_URL). When no database
// is configured this module is inert — callers fall back to their local seed
// state — so local dev / CI without a DB still boot.

import type { DeviceNode } from '../../lib/devices';
import {
  archiveDuplicateConfiguredDeviceIps,
  archiveDuplicateConfiguredDeviceNames,
  findDuplicateConfiguredDeviceName,
  findDuplicateConfiguredDeviceIp,
} from '../../lib/deviceUniqueness';
import type { FolderNode, ProjectNode } from '../../lib/hierarchy';
import type { MachineNode } from '../../lib/machines';
import { normaliseVariantId } from '../../lib/machineVariants';
import { clampMachineZoom } from '../../lib/machineZoom';
import type { CardNode } from '../../lib/rack';
import { createSeedData } from '../../lib/seedData';
import { DEFAULT_WORKSPACE_ID } from '../../lib/workspaces';
import { ensureSchema, isDbEnabled, query, withClient } from './db';
import { ApiError } from './errors';

/**
 * A saved canvas.
 *
 * `machineZoom` is how large the machine is drawn. It travels with the layout
 * because the trail anchors are fractions of the machine rect: a layout read
 * back at a different size is not the layout that was saved. Clamped on the way
 * in by `clampMachineZoom`, and `null` when none was ever set — which is not
 * the same as 100%, and is what lets a template's size apply to a machine that
 * has never been sized itself.
 */
export type Layout = { trails: unknown[]; boxes: unknown[]; machineZoom?: number | null };
type CanvasCardBox = Record<string, unknown>;

export type Workspace = {
  projects: ProjectNode[];
  folders: FolderNode[];
  machines: MachineNode[];
  devices: DeviceNode[];
  cards: CardNode[];
  layouts: Record<string, Layout>;
  templates: Record<string, Layout>;
  hierRevision: number;
  layoutRevision: number;
};

export type HierarchyInput = {
  projects: ProjectNode[];
  folders: FolderNode[];
  machines: MachineNode[];
  devices: DeviceNode[];
  cards: CardNode[];
};

const globalRef = globalThis as unknown as { __ultronWorkspaceReady?: Set<string> };

// Re-exported, not redefined: the console needs the same constant and the
// shared tree cannot import from `src/`.
export { DEFAULT_WORKSPACE_ID };

function assertWorkspaceId(workspaceId: string): string {
  const id = (workspaceId ?? '').trim();
  if (!id) throw new ApiError(500, 'No workspace was resolved for this request.');
  return id;
}

function makeId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function numericValue(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * Make sure the schema exists and this workspace has a row.
 *
 * Only the default workspace is ever seeded with demo content, and only once
 * on a brand-new database. Every other workspace is created **empty** and
 * marked seeded immediately, so nothing is ever written into it that its owner
 * did not put there — which is the whole point of having a separate one.
 */
async function ready(workspaceId: string): Promise<void> {
  await ensureSchema();
  const memo = (globalRef.__ultronWorkspaceReady ??= new Set<string>());
  if (memo.has(workspaceId)) return;

  const existing = await query<{ seeded: boolean }>(
    'SELECT seeded FROM studio_workspaces WHERE id = $1',
    [workspaceId],
  );
  if (existing.rows[0]?.seeded) {
    memo.add(workspaceId);
    return;
  }
  if (existing.rowCount === 0) {
    // A workspace named by an account that has never signed in yet. Created
    // empty, and marked seeded so the demo hierarchy is never poured into it.
    await query(
      `INSERT INTO studio_workspaces (id, name, seeded) VALUES ($1, $2, $3)
       ON CONFLICT (id) DO NOTHING`,
      [workspaceId, workspaceId, workspaceId !== DEFAULT_WORKSPACE_ID],
    );
    if (workspaceId !== DEFAULT_WORKSPACE_ID) {
      memo.add(workspaceId);
      return;
    }
  }
  await seedWorkspace(workspaceId);
  memo.add(workspaceId);
}

async function seedWorkspace(workspaceId: string): Promise<void> {
  const seed = createSeedData(makeId);
  await withClient(async (client) => {
    await client.query('BEGIN');
    try {
      // Guard against a concurrent seeder: re-check inside the transaction.
      const check = await q<{ seeded: boolean }>(
        client, 'SELECT seeded FROM studio_workspaces WHERE id = $1 FOR UPDATE', [workspaceId]);
      if (check.rows[0]?.seeded) {
        await client.query('COMMIT');
        return;
      }
      await writeHierarchyRows(client, workspaceId, seed);
      await q(client,
        `UPDATE studio_workspaces SET seeded = true, hier_revision = hier_revision + 1, updated_at = now()
         WHERE id = $1`, [workspaceId]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
  });
}

type Client = {
  query<T extends Record<string, unknown> = Record<string, unknown>>(text: string, params?: never[]): Promise<{ rows: T[]; rowCount: number | null }>;
};

async function q<T extends Record<string, unknown> = Record<string, unknown>>(
  client: Client,
  text: string,
  params: unknown[],
): Promise<{ rows: T[]; rowCount: number | null }> {
  return client.query<T>(text, params as never[]);
}

function assertUniqueConfiguredIps(data: HierarchyInput): void {
  const duplicate = findDuplicateConfiguredDeviceIp(data.devices);
  if (duplicate) {
    throw new ApiError(409, 'IP is already configured.');
  }
}

function assertUniqueConfiguredDeviceNames(data: HierarchyInput): void {
  const duplicate = findDuplicateConfiguredDeviceName(data.devices);
  if (duplicate) {
    throw new ApiError(409, `${duplicate.type} name is already configured.`);
  }
}

function normalizeHierarchyForPersistence(data: HierarchyInput): HierarchyInput {
  const byName = archiveDuplicateConfiguredDeviceNames(data.devices);
  const byIp = archiveDuplicateConfiguredDeviceIps(byName.devices);
  const archivedIds = new Set([...byName.archivedIds, ...byIp.archivedIds]);
  if (!byName.changed && !byIp.changed) return data;
  return {
    ...data,
    devices: byIp.devices,
    cards: archivedIds.size > 0 ? data.cards.filter((card) => !archivedIds.has(card.deviceId)) : data.cards,
  };
}

// Delete every hierarchy row and re-insert from the given snapshot. Callers wrap
// this in a transaction. FK cascades keep folders/machines/cards consistent.
async function writeHierarchyRows(client: Client, workspaceId: string, data: HierarchyInput): Promise<void> {
  // Every delete is scoped. Unscoped, a single workspace pressing Save would
  // empty the hierarchy of every other one — this function replaces the whole
  // tree rather than diffing it.
  await q(client, 'DELETE FROM studio_cards WHERE workspace_id = $1', [workspaceId]);
  await q(client, 'DELETE FROM studio_devices WHERE workspace_id = $1', [workspaceId]);
  await q(client, 'DELETE FROM studio_machines WHERE workspace_id = $1', [workspaceId]);
  await q(client, 'DELETE FROM studio_folders WHERE workspace_id = $1', [workspaceId]);
  await q(client, 'DELETE FROM studio_projects WHERE workspace_id = $1', [workspaceId]);

  let order = 0;
  for (const p of data.projects) {
    await q(
      client,
      `INSERT INTO studio_projects (id, workspace_id, name, code, description, sort_order) VALUES ($1,$2,$3,$4,$5,$6)`,
      [p.id, workspaceId, p.name ?? '', p.code ?? '', p.description ?? '', order++],
    );
  }
  // Insert parents before children so the self-referencing FK is satisfied.
  const remaining = [...data.folders];
  const inserted = new Set<string>();
  order = 0;
  let guard = remaining.length * remaining.length + 1;
  while (remaining.length > 0 && guard-- > 0) {
    const f = remaining.shift()!;
    if (f.parentId && !inserted.has(f.parentId) && remaining.some((r) => r.id === f.parentId)) {
      remaining.push(f);
      continue;
    }
    await q(
      client,
      `INSERT INTO studio_folders (id, workspace_id, project_id, parent_id, name, type, code, description, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [f.id, workspaceId, f.projectId, f.parentId, f.name ?? '', f.type ?? 'Custom Folder', f.code ?? '', f.description ?? '', order++],
    );
    inserted.add(f.id);
  }
  if (remaining.length > 0) throw new Error('Folder hierarchy contains an invalid parent cycle.');
  order = 0;
  for (const m of data.machines) {
    await q(
      client,
      `INSERT INTO studio_machines (id, workspace_id, project_id, folder_id, name, template, components, variant_id, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)`,
      // The variant is normalised against the template on the way in, so an id
      // that does not belong to this template — or no longer exists at all — is
      // stored as NULL rather than as a variant the machine is not.
      [m.id, workspaceId, m.projectId, m.folderId, m.name ?? '', m.template, JSON.stringify(m.components ?? []), normaliseVariantId(m.template, m.variantId), order++],
    );
  }
  order = 0;
  for (const d of data.devices) {
    await q(
      client,
      `INSERT INTO studio_devices (id, workspace_id, name, type, model, ip, port, protocol, description, status, project_id, gateway_id, real_gateway_id, real_rack_id, archived, simulated, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
      [
        d.id,
        workspaceId,
        d.name ?? '',
        d.type,
        d.model ?? '',
        d.ip ?? '',
        d.port ?? '',
        d.protocol,
        d.description ?? '',
        d.status,
        d.projectId,
        null,
        d.realGatewayId ?? null,
        d.type === 'Rack' ? (d.realRackId ?? null) : null,
        !!d.archived,
        !!d.simulated,
        order++,
      ],
    );
  }
  for (const d of data.devices) {
    if (d.type !== 'Rack' || !d.gatewayId) continue;
    await q(
      client,
      `UPDATE studio_devices SET gateway_id = $1 WHERE id = $2 AND workspace_id = $4
         AND EXISTS (SELECT 1 FROM studio_devices WHERE id = $1 AND type = $3 AND workspace_id = $4)`,
      [d.gatewayId, d.id, 'Gateway', workspaceId],
    );
  }
  order = 0;
  const cardBySlot = new Map<string, CardNode>();
  for (const c of data.cards) {
    cardBySlot.set(`${c.deviceId}|${c.slot}`, c);
  }
  for (const c of cardBySlot.values()) {
    await q(
      client,
      `INSERT INTO studio_cards (id, workspace_id, device_id, slot, type, enabled, config, simulation, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9)`,
      [
        c.id,
        workspaceId,
        c.deviceId,
        c.slot,
        c.type,
        !!c.enabled,
        JSON.stringify(c.config ?? {}),
        c.simulation ? JSON.stringify(c.simulation) : null,
        order++,
      ],
    );
  }
  // Layouts intentionally have no FK to machines because the snapshot writer
  // temporarily removes/re-inserts every machine. Remove only truly orphaned
  // layouts after the replacement is complete.
  await q(
    client,
    `DELETE FROM studio_machine_layouts l
     WHERE l.workspace_id = $1
       AND NOT EXISTS (SELECT 1 FROM studio_machines m WHERE m.id = l.machine_id)`,
    [workspaceId],
  );
  await q(
    client,
    // No workspace column here: canvas cards are only ever reached through a
    // machine id, which is generated and unique across workspaces, so the
    // machine's own existence is already the scope.
    `DELETE FROM studio_machine_canvas_cards c
     WHERE NOT EXISTS (SELECT 1 FROM studio_machines m WHERE m.id = c.machine_id)`,
    [],
  );
}

// --- row mapping -----------------------------------------------------------

type ProjectRow = { id: string; name: string; code: string; description: string };
type FolderRow = { id: string; project_id: string; parent_id: string | null; name: string; type: string; code: string; description: string };
type MachineRow = { id: string; project_id: string; folder_id: string; name: string; template: string; components: unknown; variant_id: string | null };
type DeviceRow = {
  id: string; name: string; type: string; model: string; ip: string; port: string; protocol: string;
  description: string; status: string; project_id: string | null; gateway_id: string | null; real_gateway_id: string | null; real_rack_id: string | null; archived: boolean;
  simulated: boolean | null;
};
type CardRow = { id: string; device_id: string; slot: number; type: string; enabled: boolean; config: unknown; simulation: unknown };
type LayoutRow = { machine_id: string; trails: unknown; boxes: unknown; machine_zoom: number | null };
type TemplateLayoutRow = { machine_template: string; trails: unknown; boxes: unknown; machine_zoom: number | null };

export async function getWorkspace(workspaceId: string): Promise<Workspace | null> {
  if (!isDbEnabled()) return null;
  const ws = assertWorkspaceId(workspaceId);
  await ready(ws);

  const [projects, folders, machines, devices, cards, layouts, templates, meta] = await Promise.all([
    query<ProjectRow>('SELECT * FROM studio_projects WHERE workspace_id = $1 ORDER BY sort_order ASC', [ws]),
    query<FolderRow>('SELECT * FROM studio_folders WHERE workspace_id = $1 ORDER BY sort_order ASC', [ws]),
    query<MachineRow>('SELECT * FROM studio_machines WHERE workspace_id = $1 ORDER BY sort_order ASC', [ws]),
    query<DeviceRow>('SELECT * FROM studio_devices WHERE workspace_id = $1 ORDER BY sort_order ASC', [ws]),
    query<CardRow>('SELECT * FROM studio_cards WHERE workspace_id = $1 ORDER BY sort_order ASC', [ws]),
    query<LayoutRow>('SELECT * FROM studio_machine_layouts WHERE workspace_id = $1', [ws]),
    query<TemplateLayoutRow>('SELECT * FROM studio_machine_templates WHERE workspace_id = $1', [ws]),
    query<{ hier_revision: string; layout_revision: string }>(
      'SELECT hier_revision, layout_revision FROM studio_workspaces WHERE id = $1', [ws]),
  ]);

  const layoutMap: Record<string, Layout> = {};
  for (const r of layouts.rows) {
    layoutMap[r.machine_id] = {
      trails: Array.isArray(r.trails) ? r.trails : [],
      boxes: Array.isArray(r.boxes) ? r.boxes : [],
      machineZoom: clampMachineZoom(r.machine_zoom),
    };
  }
  const templateMap: Record<string, Layout> = {};
  for (const r of templates.rows) {
    templateMap[r.machine_template] = {
      trails: Array.isArray(r.trails) ? r.trails : [],
      boxes: Array.isArray(r.boxes) ? r.boxes : [],
      machineZoom: clampMachineZoom(r.machine_zoom),
    };
  }

  return {
    projects: projects.rows.map((r: ProjectRow) => ({ id: r.id, name: r.name, code: r.code, description: r.description })),
    folders: folders.rows.map((r: FolderRow) => ({
      id: r.id, projectId: r.project_id, parentId: r.parent_id,
      name: r.name, type: r.type as FolderNode['type'], code: r.code, description: r.description,
    })),
    machines: machines.rows.map((r: MachineRow) => ({
      id: r.id, projectId: r.project_id, folderId: r.folder_id, name: r.name,
      template: r.template as MachineNode['template'],
      components: (Array.isArray(r.components) ? r.components : []) as MachineNode['components'],
      variantId: normaliseVariantId(r.template as MachineNode['template'], r.variant_id),
    })),
    devices: devices.rows.map((r: DeviceRow) => ({
      id: r.id, name: r.name, type: r.type as DeviceNode['type'], model: r.model, ip: r.ip, port: r.port,
      protocol: r.protocol as DeviceNode['protocol'], description: r.description,
      status: r.status as DeviceNode['status'], projectId: r.project_id, gatewayId: r.gateway_id,
      realGatewayId: r.real_gateway_id, realRackId: r.real_rack_id, archived: r.archived,
      simulated: r.simulated === true,
    })),
    cards: cards.rows.map((r: CardRow) => ({
      id: r.id, deviceId: r.device_id, slot: r.slot, type: r.type as CardNode['type'],
      enabled: r.enabled, config: (r.config ?? {}) as CardNode['config'],
      ...(Array.isArray(r.simulation) ? { simulation: r.simulation as CardNode['simulation'] } : {}),
    })),
    layouts: layoutMap,
    templates: templateMap,
    hierRevision: Number(meta.rows[0]?.hier_revision ?? 0),
    layoutRevision: Number(meta.rows[0]?.layout_revision ?? 0),
  };
}

/**
 * Which workspace a machine belongs to, or null if there is no such machine.
 *
 * Machine ids are generated and unique across workspaces, so this is
 * unambiguous. Background work that needs a whole workspace — the analysis
 * runner needs its devices, cards and layouts, not just the machine — resolves
 * the id with this and then loads that workspace normally, rather than reading
 * unscoped rows.
 */
export async function workspaceIdForMachine(machineId: string): Promise<string | null> {
  if (!isDbEnabled()) return null;
  await ensureSchema();
  const res = await query<{ workspace_id: string }>(
    'SELECT workspace_id FROM studio_machines WHERE id = $1', [machineId]);
  return res.rows[0]?.workspace_id ?? null;
}

/**
 * Every workspace that currently exists.
 *
 * For background passes that must cover all of them — the ML feeder ticks for
 * every twin screw anywhere, not for one account's.
 */
export async function listWorkspaceIds(): Promise<string[]> {
  if (!isDbEnabled()) return [];
  await ensureSchema();
  const res = await query<{ id: string }>('SELECT id FROM studio_workspaces ORDER BY id ASC');
  return res.rows.map((r) => r.id);
}

/**
 * Look a machine up without knowing its workspace.
 *
 * For background work — the analysis runner, the ML feeder — which acts on a
 * machine id or a template rather than on behalf of a signed-in account, so
 * there is no session to take a workspace from. Deliberately unscoped, and
 * separate from `getWorkspace` so that being unscoped is a decision at the
 * call site rather than an omission inside one.
 *
 * Machine ids are generated and unique across workspaces, so a lookup by id
 * is unambiguous even though it is unfiltered.
 */
export async function findMachineAnywhere(machineId: string): Promise<MachineNode | null> {
  if (!isDbEnabled()) return null;
  await ensureSchema();
  const res = await query<MachineRow>('SELECT * FROM studio_machines WHERE id = $1', [machineId]);
  const r = res.rows[0];
  if (!r) return null;
  return {
    id: r.id, projectId: r.project_id, folderId: r.folder_id, name: r.name,
    template: r.template as MachineNode['template'],
    components: (Array.isArray(r.components) ? r.components : []) as MachineNode['components'],
    variantId: normaliseVariantId(r.template as MachineNode['template'], r.variant_id),
  };
}

/** Every machine on a template, in any workspace. See `findMachineAnywhere`. */
export async function machinesByTemplateAnywhere(template: string): Promise<MachineNode[]> {
  if (!isDbEnabled()) return [];
  await ensureSchema();
  const res = await query<MachineRow>(
    'SELECT * FROM studio_machines WHERE template = $1 ORDER BY sort_order ASC', [template]);
  return res.rows.map((r) => ({
    id: r.id, projectId: r.project_id, folderId: r.folder_id, name: r.name,
    template: r.template as MachineNode['template'],
    components: (Array.isArray(r.components) ? r.components : []) as MachineNode['components'],
    variantId: normaliseVariantId(r.template as MachineNode['template'], r.variant_id),
  }));
}

export async function getRevisions(workspaceId: string): Promise<{ hierRevision: number; layoutRevision: number }> {
  const ws = assertWorkspaceId(workspaceId);
  await ready(ws);
  const meta = await query<{ hier_revision: string; layout_revision: string }>(
    'SELECT hier_revision, layout_revision FROM studio_workspaces WHERE id = $1', [ws],
  );
  return {
    hierRevision: Number(meta.rows[0]?.hier_revision ?? 0),
    layoutRevision: Number(meta.rows[0]?.layout_revision ?? 0),
  };
}

// Replace the entire hierarchy in one transaction and bump the hierarchy
// revision. Optimistic concurrency: if baseRevision is provided and no longer
// matches, the write is rejected so the client can refetch and retry.
export async function replaceHierarchy(workspaceId: string, data: HierarchyInput, baseRevision?: number): Promise<{ hierRevision: number } | { conflict: true; hierRevision: number }> {
  const ws = assertWorkspaceId(workspaceId);
  const normalized = normalizeHierarchyForPersistence(data);
  assertUniqueConfiguredIps(normalized);
  assertUniqueConfiguredDeviceNames(normalized);
  await ready(ws);
  return withClient(async (client) => {
    await client.query('BEGIN');
    try {
      const cur = await q<{ hier_revision: string }>(
        client, 'SELECT hier_revision FROM studio_workspaces WHERE id = $1 FOR UPDATE', [ws]);
      const current = Number(cur.rows[0]?.hier_revision ?? 0);
      if (baseRevision !== undefined && baseRevision !== current) {
        await client.query('ROLLBACK');
        return { conflict: true as const, hierRevision: current };
      }
      await writeHierarchyRows(client, ws, normalized);
      const next = current + 1;
      await q(client, 'UPDATE studio_workspaces SET hier_revision = $1, updated_at = now() WHERE id = $2', [String(next), ws]);
      await client.query('COMMIT');
      return { hierRevision: next };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
  });
}

// Upsert a single machine's canvas layout and bump the layout revision. Keeping
// layouts on their own endpoint/revision means a "Save Config" never clobbers a
// concurrent hierarchy edit, and vice versa.
export async function saveMachineLayout(workspaceId: string, machineId: string, layout: Layout): Promise<{ layoutRevision: number }> {
  const ws = assertWorkspaceId(workspaceId);
  await ready(ws);
  return withClient(async (client) => {
    await client.query('BEGIN');
    try {
      const trails = Array.isArray(layout.trails) ? layout.trails : [];
      const boxes = Array.isArray(layout.boxes) ? layout.boxes : [];
      const machineZoom = clampMachineZoom(layout.machineZoom);
      await q(
        client,
        `INSERT INTO studio_machine_layouts (machine_id, workspace_id, trails, boxes, machine_zoom, updated_at)
         VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, now())
         ON CONFLICT (machine_id) DO UPDATE SET trails = EXCLUDED.trails, boxes = EXCLUDED.boxes,
           machine_zoom = EXCLUDED.machine_zoom, updated_at = now()
         WHERE studio_machine_layouts.workspace_id = EXCLUDED.workspace_id`,
        [machineId, ws, JSON.stringify(trails), JSON.stringify(boxes), machineZoom],
      );
      await q(client, 'DELETE FROM studio_machine_canvas_cards WHERE machine_id = $1', [machineId]);
      let sortOrder = 0;
      for (const box of boxes) {
        const b = box && typeof box === 'object' && !Array.isArray(box) ? (box as CanvasCardBox) : null;
        const id = typeof b?.id === 'string' ? b.id.trim() : '';
        if (!b || !id) continue;
        await q(
          client,
          `INSERT INTO studio_machine_canvas_cards
             (machine_id, id, center_x, center_y, label, channel_id, data, sort_order, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, now())
           ON CONFLICT (machine_id, id) DO UPDATE SET
             center_x = EXCLUDED.center_x,
             center_y = EXCLUDED.center_y,
             label = EXCLUDED.label,
             channel_id = EXCLUDED.channel_id,
             data = EXCLUDED.data,
             sort_order = EXCLUDED.sort_order,
             updated_at = now()`,
          [
            machineId,
            id,
            numericValue(b.centerX, numericValue(b.x, 0)),
            numericValue(b.centerY, numericValue(b.y, 0)),
            typeof b.label === 'string' ? b.label : '',
            typeof b.channelId === 'string' && b.channelId.trim() ? b.channelId : null,
            JSON.stringify(b),
            sortOrder++,
          ],
        );
      }
      const cur = await q<{ layout_revision: string }>(
        client, 'SELECT layout_revision FROM studio_workspaces WHERE id = $1 FOR UPDATE', [ws]);
      const next = Number(cur.rows[0]?.layout_revision ?? 0) + 1;
      await q(client, 'UPDATE studio_workspaces SET layout_revision = $1, updated_at = now() WHERE id = $2', [String(next), ws]);
      await client.query('COMMIT');
      return { layoutRevision: next };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
  });
}

export async function saveMachineTemplate(workspaceId: string, machineTemplate: string, layout: Layout): Promise<{ layoutRevision: number }> {
  const ws = assertWorkspaceId(workspaceId);
  await ready(ws);
  return withClient(async (client) => {
    await client.query('BEGIN');
    try {
      const template = machineTemplate.trim();
      if (!template) throw new ApiError(400, 'Invalid machine template.');
      const trails = Array.isArray(layout.trails) ? layout.trails : [];
      const boxes = Array.isArray(layout.boxes) ? layout.boxes : [];
      const machineZoom = clampMachineZoom(layout.machineZoom);
      await q(
        client,
        `INSERT INTO studio_machine_templates (machine_template, workspace_id, trails, boxes, machine_zoom, updated_at)
         VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, now())
         ON CONFLICT (workspace_id, machine_template) DO UPDATE SET trails = EXCLUDED.trails, boxes = EXCLUDED.boxes,
           machine_zoom = EXCLUDED.machine_zoom, updated_at = now()`,
        [template, ws, JSON.stringify(trails), JSON.stringify(boxes), machineZoom],
      );
      const cur = await q<{ layout_revision: string }>(
        client, 'SELECT layout_revision FROM studio_workspaces WHERE id = $1 FOR UPDATE', [ws]);
      const next = Number(cur.rows[0]?.layout_revision ?? 0) + 1;
      await q(client, 'UPDATE studio_workspaces SET layout_revision = $1, updated_at = now() WHERE id = $2', [String(next), ws]);
      await client.query('COMMIT');
      return { layoutRevision: next };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
  });
}
