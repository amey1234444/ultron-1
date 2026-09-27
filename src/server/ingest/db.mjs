import { readdirSync, readFileSync } from 'node:fs';
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
// Server-side guards applied to every connection in the pool.
//
// `max` is 5, so five queries that never finish are the whole path: with no
// statement_timeout a single runaway query holds its connection until the
// process dies, and five of them take the application down while the database
// itself stays healthy and idle.
//
// 60s rather than the few seconds a web request should need, because this pool
// also runs ensureSchema(), which replays supabase/migrations on every start, and a one-time
// step against an empty database is legitimately slow. This is a backstop
// against a query that will never finish, not a latency budget.
//
// idle_in_transaction_session_timeout matters more than it looks: a connection
// abandoned mid-transaction holds its locks indefinitely, and the writer that
// queues behind it looks like a database outage from the outside.
//
// lock_timeout is deliberately not set here. supabase/migrations is replayed on
// every ingest start and takes ACCESS EXCLUSIVE locks; failing that fast would
// turn a slow reader into a boot loop rather than a brief wait.
const CONNECTION_GUARDS = '-c statement_timeout=60000 -c idle_in_transaction_session_timeout=60000';

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
      options: CONNECTION_GUARDS,
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
  const migrations = join(here, '..', '..', '..', 'supabase', 'migrations');
  for (const file of readdirSync(migrations).filter((name) => name.endsWith('.sql')).sort()) {
    await query(readFileSync(join(migrations, file), 'utf8'));
  }
}
