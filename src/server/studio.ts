// Durable, shared "studio" workspace: the asset hierarchy shown in the left rail
// (projects -> folders -> machines, plus devices and their rack cards) and the
// per-machine canvas layouts. All authenticated users read and write the same
// rows, so an edit made by one user becomes visible to everyone else (clients
// poll the revision counters exposed by getWorkspace / getRevisions).
//
// Persistence is Supabase/PostgreSQL only (via DATABASE_URL). When no database
// is configured this module is inert — callers fall back to their local seed
// state — so local dev / CI without a DB still boot.

import type { DeviceNode } from '../../lib/devices';
import type { FolderNode, ProjectNode } from '../../lib/hierarchy';
import type { MachineNode } from '../../lib/machines';
import type { CardNode } from '../../lib/rack';
import { createSeedData } from '../../lib/seedData';
import { ensureSchema, isDbEnabled, query, withClient } from './db';

export type Layout = { trails: unknown[]; boxes: unknown[] };
type CanvasCardBox = Record<string, unknown>;

export type Workspace = {
  projects: ProjectNode[];
  folders: FolderNode[];
  machines: MachineNode[];
  devices: DeviceNode[];
  cards: CardNode[];
  layouts: Record<string, Layout>;
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

const globalRef = globalThis as unknown as { __ultronStudioSeeded?: boolean };

function makeId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function numericValue(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

// Ensure schema exists and the workspace is seeded with demo data exactly once
// for a brand-new database. Never re-seeds an already-seeded database, so data
// survives redeploys/restarts.
async function ready(): Promise<void> {
  await ensureSchema();
  if (globalRef.__ultronStudioSeeded) return;
  const meta = await query<{ seeded: boolean }>('SELECT seeded FROM studio_meta WHERE id = 1');
  if (meta.rows[0]?.seeded) {
    globalRef.__ultronStudioSeeded = true;
    return;
  }
  await seedWorkspace();
  globalRef.__ultronStudioSeeded = true;
}

async function seedWorkspace(): Promise<void> {
  const seed = createSeedData(makeId);
  await withClient(async (client) => {
    await client.query('BEGIN');
    try {
      // Guard against a concurrent seeder: re-check inside the transaction.
      const check = await client.query<{ seeded: boolean }>('SELECT seeded FROM studio_meta WHERE id = 1 FOR UPDATE');
      if (check.rows[0]?.seeded) {
        await client.query('COMMIT');
        return;
      }
      await writeHierarchyRows(client, seed);
      await client.query('UPDATE studio_meta SET seeded = true, hier_revision = hier_revision + 1, updated_at = now() WHERE id = 1');
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

// Delete every hierarchy row and re-insert from the given snapshot. Callers wrap
// this in a transaction. FK cascades keep folders/machines/cards consistent.
async function writeHierarchyRows(client: Client, data: HierarchyInput): Promise<void> {
  await q(client, 'DELETE FROM studio_cards', []);
  await q(client, 'DELETE FROM studio_devices', []);
  await q(client, 'DELETE FROM studio_machines', []);
  await q(client, 'DELETE FROM studio_folders', []);
  await q(client, 'DELETE FROM studio_projects', []);

  let order = 0;
  for (const p of data.projects) {
    await q(
      client,
      `INSERT INTO studio_projects (id, name, code, description, sort_order) VALUES ($1,$2,$3,$4,$5)`,
      [p.id, p.name ?? '', p.code ?? '', p.description ?? '', order++],
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
      `INSERT INTO studio_folders (id, project_id, parent_id, name, type, code, description, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [f.id, f.projectId, f.parentId, f.name ?? '', f.type ?? 'Custom Folder', f.code ?? '', f.description ?? '', order++],
    );
    inserted.add(f.id);
  }
  if (remaining.length > 0) throw new Error('Folder hierarchy contains an invalid parent cycle.');
  order = 0;
  for (const m of data.machines) {
    await q(
      client,
      `INSERT INTO studio_machines (id, project_id, folder_id, name, template, components, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)`,
      [m.id, m.projectId, m.folderId, m.name ?? '', m.template, JSON.stringify(m.components ?? []), order++],
    );
  }
  order = 0;
  for (const d of data.devices) {
    await q(
      client,
      `INSERT INTO studio_devices (id, name, type, model, ip, port, protocol, description, status, project_id, archived, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [d.id, d.name ?? '', d.type, d.model ?? '', d.ip ?? '', d.port ?? '', d.protocol, d.description ?? '', d.status, d.projectId, !!d.archived, order++],
    );
  }
  order = 0;
  for (const c of data.cards) {
    await q(
      client,
      `INSERT INTO studio_cards (id, device_id, slot, type, enabled, config, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)`,
      [c.id, c.deviceId, c.slot, c.type, !!c.enabled, JSON.stringify(c.config ?? {}), order++],
    );
  }
  // Layouts intentionally have no FK to machines because the snapshot writer
  // temporarily removes/re-inserts every machine. Remove only truly orphaned
  // layouts after the replacement is complete.
  await q(
    client,
    `DELETE FROM studio_machine_layouts l
     WHERE NOT EXISTS (SELECT 1 FROM studio_machines m WHERE m.id = l.machine_id)`,
    [],
  );
  await q(
    client,
    `DELETE FROM studio_machine_canvas_cards c
     WHERE NOT EXISTS (SELECT 1 FROM studio_machines m WHERE m.id = c.machine_id)`,
    [],
  );
}

// --- row mapping -----------------------------------------------------------

type ProjectRow = { id: string; name: string; code: string; description: string };
type FolderRow = { id: string; project_id: string; parent_id: string | null; name: string; type: string; code: string; description: string };
type MachineRow = { id: string; project_id: string; folder_id: string; name: string; template: string; components: unknown };
type DeviceRow = {
  id: string; name: string; type: string; model: string; ip: string; port: string; protocol: string;
  description: string; status: string; project_id: string | null; archived: boolean;
};
type CardRow = { id: string; device_id: string; slot: number; type: string; enabled: boolean; config: unknown };
type LayoutRow = { machine_id: string; trails: unknown; boxes: unknown };

export async function getWorkspace(): Promise<Workspace | null> {
  if (!isDbEnabled()) return null;
  await ready();

  const [projects, folders, machines, devices, cards, layouts, meta] = await Promise.all([
    query<ProjectRow>('SELECT * FROM studio_projects ORDER BY sort_order ASC'),
    query<FolderRow>('SELECT * FROM studio_folders ORDER BY sort_order ASC'),
    query<MachineRow>('SELECT * FROM studio_machines ORDER BY sort_order ASC'),
    query<DeviceRow>('SELECT * FROM studio_devices ORDER BY sort_order ASC'),
    query<CardRow>('SELECT * FROM studio_cards ORDER BY sort_order ASC'),
    query<LayoutRow>('SELECT * FROM studio_machine_layouts'),
    query<{ hier_revision: string; layout_revision: string }>('SELECT hier_revision, layout_revision FROM studio_meta WHERE id = 1'),
  ]);

  const layoutMap: Record<string, Layout> = {};
  for (const r of layouts.rows) {
    layoutMap[r.machine_id] = {
      trails: Array.isArray(r.trails) ? r.trails : [],
      boxes: Array.isArray(r.boxes) ? r.boxes : [],
    };
  }

  return {
    projects: projects.rows.map((r) => ({ id: r.id, name: r.name, code: r.code, description: r.description })),
    folders: folders.rows.map((r) => ({
      id: r.id, projectId: r.project_id, parentId: r.parent_id,
      name: r.name, type: r.type as FolderNode['type'], code: r.code, description: r.description,
    })),
    machines: machines.rows.map((r) => ({
      id: r.id, projectId: r.project_id, folderId: r.folder_id, name: r.name,
      template: r.template as MachineNode['template'],
      components: (Array.isArray(r.components) ? r.components : []) as MachineNode['components'],
    })),
    devices: devices.rows.map((r) => ({
      id: r.id, name: r.name, type: r.type as DeviceNode['type'], model: r.model, ip: r.ip, port: r.port,
      protocol: r.protocol as DeviceNode['protocol'], description: r.description,
      status: r.status as DeviceNode['status'], projectId: r.project_id, archived: r.archived,
    })),
    cards: cards.rows.map((r) => ({
      id: r.id, deviceId: r.device_id, slot: r.slot, type: r.type as CardNode['type'],
      enabled: r.enabled, config: (r.config ?? {}) as CardNode['config'],
    })),
    layouts: layoutMap,
    hierRevision: Number(meta.rows[0]?.hier_revision ?? 0),
    layoutRevision: Number(meta.rows[0]?.layout_revision ?? 0),
  };
}

export async function getRevisions(): Promise<{ hierRevision: number; layoutRevision: number }> {
  await ready();
  const meta = await query<{ hier_revision: string; layout_revision: string }>(
    'SELECT hier_revision, layout_revision FROM studio_meta WHERE id = 1',
  );
  return {
    hierRevision: Number(meta.rows[0]?.hier_revision ?? 0),
    layoutRevision: Number(meta.rows[0]?.layout_revision ?? 0),
  };
}

// Replace the entire hierarchy in one transaction and bump the hierarchy
// revision. Optimistic concurrency: if baseRevision is provided and no longer
// matches, the write is rejected so the client can refetch and retry.
export async function replaceHierarchy(data: HierarchyInput, baseRevision?: number): Promise<{ hierRevision: number } | { conflict: true; hierRevision: number }> {
  await ready();
  return withClient(async (client) => {
    await client.query('BEGIN');
    try {
      const cur = await client.query<{ hier_revision: string }>('SELECT hier_revision FROM studio_meta WHERE id = 1 FOR UPDATE');
      const current = Number(cur.rows[0]?.hier_revision ?? 0);
      if (baseRevision !== undefined && baseRevision !== current) {
        await client.query('ROLLBACK');
        return { conflict: true as const, hierRevision: current };
      }
      await writeHierarchyRows(client, data);
      const next = current + 1;
      await client.query('UPDATE studio_meta SET hier_revision = $1, updated_at = now() WHERE id = 1', [String(next)] as never[]);
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
export async function saveMachineLayout(machineId: string, layout: Layout): Promise<{ layoutRevision: number }> {
  await ready();
  return withClient(async (client) => {
    await client.query('BEGIN');
    try {
      const trails = Array.isArray(layout.trails) ? layout.trails : [];
      const boxes = Array.isArray(layout.boxes) ? layout.boxes : [];
      await q(
        client,
        `INSERT INTO studio_machine_layouts (machine_id, trails, boxes, updated_at)
         VALUES ($1, $2::jsonb, $3::jsonb, now())
         ON CONFLICT (machine_id) DO UPDATE SET trails = EXCLUDED.trails, boxes = EXCLUDED.boxes, updated_at = now()`,
        [machineId, JSON.stringify(trails), JSON.stringify(boxes)],
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
      const cur = await client.query<{ layout_revision: string }>('SELECT layout_revision FROM studio_meta WHERE id = 1 FOR UPDATE');
      const next = Number(cur.rows[0]?.layout_revision ?? 0) + 1;
      await client.query('UPDATE studio_meta SET layout_revision = $1, updated_at = now() WHERE id = 1', [String(next)] as never[]);
      await client.query('COMMIT');
      return { layoutRevision: next };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
  });
}
