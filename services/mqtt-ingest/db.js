import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import pg from 'pg';

const { Pool } = pg;

function needsSsl(url) {
  if (/sslmode=disable/.test(url)) return false;
  if (/localhost|127\.0\.0\.1/.test(url)) return false;
  return true;
}

// pg >= 8.16 treats sslmode=require as verify-full, which rejects Supabase's
// self-signed chain; strip ssl params and control SSL via the pool option.
function stripSslParams(url) {
  try {
    const u = new URL(url);
    for (const p of ['sslmode', 'ssl', 'sslcert', 'sslkey', 'sslrootcert']) u.searchParams.delete(p);
    return u.toString();
  } catch {
    return url;
  }
}

let pool;

export function db() {
  if (!pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    pool = new Pool({
      connectionString: stripSslParams(url),
      max: 5,
      connectionTimeoutMillis: 8000,
      ssl: needsSsl(url) ? { rejectUnauthorized: false } : undefined,
    });
  }
  return pool;
}

export async function query(text, params) {
  return db().query(text, params);
}

// Applies the idempotent MQTT schema so the ingest service can run against a
// fresh database without waiting for the Next.js app to cold-start.
export async function ensureSchema() {
  const here = dirname(fileURLToPath(import.meta.url));
  const sql = readFileSync(join(here, '..', '..', 'supabase', 'migrations', '20260716000000_mqtt_telemetry.sql'), 'utf8');
  await query(sql);
}
