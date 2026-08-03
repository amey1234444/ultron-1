// Persistence for the dashboard's Plant Overview layout. Super admins save one
// shared configuration; every other user reads it. Stored in Postgres when
// DATABASE_URL is set, otherwise held in memory for the process so local dev
// and CI still behave (matching the fallback used by the rest of the studio).

import {
  DEFAULT_PLANT_OVERVIEW,
  normalizePlantOverview,
  type PlantOverviewConfig,
} from '../../lib/plantOverview';
import { isDbEnabled, query } from './db';

const globalRef = globalThis as unknown as {
  __ultronPlantOverview?: PlantOverviewConfig;
  __ultronPlantOverviewTable?: Promise<void>;
};

async function ensureTable(): Promise<void> {
  if (!globalRef.__ultronPlantOverviewTable) {
    globalRef.__ultronPlantOverviewTable = query(`
      CREATE TABLE IF NOT EXISTS studio_plant_overview (
        id         INTEGER PRIMARY KEY DEFAULT 1,
        config     JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_by TEXT NOT NULL DEFAULT ''
      );
    `).then(() => undefined).catch((err) => {
      globalRef.__ultronPlantOverviewTable = undefined;
      throw err;
    });
  }
  return globalRef.__ultronPlantOverviewTable;
}

export async function getPlantOverview(): Promise<PlantOverviewConfig> {
  if (!isDbEnabled()) return globalRef.__ultronPlantOverview ?? DEFAULT_PLANT_OVERVIEW;
  await ensureTable();
  const result = await query<{ config: unknown }>('SELECT config FROM studio_plant_overview WHERE id = 1');
  const row = result.rows[0];
  return row ? normalizePlantOverview(row.config) : DEFAULT_PLANT_OVERVIEW;
}

export async function savePlantOverview(config: PlantOverviewConfig, userId: string): Promise<PlantOverviewConfig> {
  const normalized = normalizePlantOverview(config);
  if (!isDbEnabled()) {
    globalRef.__ultronPlantOverview = normalized;
    return normalized;
  }
  await ensureTable();
  await query(
    `INSERT INTO studio_plant_overview (id, config, updated_at, updated_by)
     VALUES (1, $1::jsonb, now(), $2)
     ON CONFLICT (id) DO UPDATE SET config = EXCLUDED.config, updated_at = now(), updated_by = EXCLUDED.updated_by`,
    [JSON.stringify(normalized), userId],
  );
  return normalized;
}
