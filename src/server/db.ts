// Thin Postgres access layer. The whole app degrades gracefully to an in-memory
// store when DATABASE_URL is not configured (local `npm run dev` without a DB,
// CI builds, etc.), so `isDbEnabled()` is the single switch every store checks.
//
// For durable, tamper-resistant persistence in production set DATABASE_URL to a
// managed Postgres (a free Neon / Vercel Postgres instance works well). SSL is
// enabled automatically for non-local hosts.

type QueryResultRow = Record<string, unknown>;
type QueryResult<T extends QueryResultRow = QueryResultRow> = { rows: T[]; rowCount: number | null };
type PoolClient = {
  query<T extends QueryResultRow = QueryResultRow>(text: string, params?: never[]): Promise<QueryResult<T>>;
  release(): void;
};
type PgPool = {
  query<T extends QueryResultRow = QueryResultRow>(text: string, params?: never[]): Promise<QueryResult<T>>;
  connect(): Promise<PoolClient>;
};

const globalRef = globalThis as unknown as {
  __ultronPgPool?: PgPool;
  __ultronPgReady?: Promise<void>;
};

export function isDbEnabled(): boolean {
  return !!process.env.DATABASE_URL;
}

function needsSsl(url: string): boolean {
  if (/sslmode=disable/.test(url)) return false;
  if (/localhost|127\.0\.0\.1/.test(url)) return false;
  return true;
}

function loadPgPool(): new (config: { connectionString: string; max: number; ssl?: { rejectUnauthorized: boolean } }) => PgPool {
  try {
    // Keep local/no-DB builds from failing when the optional Postgres package is
    // absent. If DATABASE_URL is configured, this still requires the `pg`
    // dependency and fails loudly with a useful message.
    const nodeRequire = eval('require') as NodeRequire;
    return (nodeRequire('pg') as { Pool: new (config: { connectionString: string; max: number; ssl?: { rejectUnauthorized: boolean } }) => PgPool }).Pool;
  } catch {
    throw new Error('DATABASE_URL is set, but the pg package is not installed. Run npm install before starting the server.');
  }
}

export function pool(): PgPool {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set.');
  }
  if (!globalRef.__ultronPgPool) {
    const connectionString = process.env.DATABASE_URL;
    const Pool = loadPgPool();
    globalRef.__ultronPgPool = new Pool({
      connectionString,
      max: 5,
      ssl: needsSsl(connectionString) ? { rejectUnauthorized: false } : undefined,
    });
  }
  return globalRef.__ultronPgPool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<QueryResult<T>> {
  return pool().query<T>(text, params as never[]);
}

export async function withClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

// Create tables on first use. Idempotent — safe to call on every cold start.
export async function ensureSchema(): Promise<void> {
  if (!globalRef.__ultronPgReady) {
    globalRef.__ultronPgReady = migrate().catch((err) => {
      // Reset so a later request can retry after a transient failure.
      globalRef.__ultronPgReady = undefined;
      throw err;
    });
  }
  return globalRef.__ultronPgReady;
}

async function migrate(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      username      TEXT NOT NULL UNIQUE,
      username_lc   TEXT NOT NULL UNIQUE,
      name          TEXT NOT NULL DEFAULT '',
      email         TEXT NOT NULL DEFAULT '',
      role          TEXT NOT NULL DEFAULT 'user',
      status        TEXT NOT NULL DEFAULT 'pending',
      permissions   JSONB NOT NULL DEFAULT '[]'::jsonb,
      password_hash TEXT NOT NULL,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_login_at TIMESTAMPTZ,
      last_seen_at  TIMESTAMPTZ
    );
  `);

  // App-wide settings (single row) — currently holds super-admin-tunable rate
  // limits stored as JSON.
  await query(`
    CREATE TABLE IF NOT EXISTS app_settings (
      id         INT PRIMARY KEY DEFAULT 1,
      data       JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT app_settings_singleton CHECK (id = 1)
    );
  `);

  // Rolling window of request events used to enforce rate limits across
  // serverless instances (in-memory counters don't survive per-request isolation).
  await query(`
    CREATE TABLE IF NOT EXISTS rate_events (
      id       BIGSERIAL PRIMARY KEY,
      bucket   TEXT NOT NULL,
      key      TEXT NOT NULL,
      ts       TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await query(`CREATE INDEX IF NOT EXISTS rate_events_lookup ON rate_events (bucket, key, ts);`);
  // Primary lookup path is by key + time window (see rateLimit.ts).
  await query(`CREATE INDEX IF NOT EXISTS rate_events_key_ts ON rate_events (key, ts);`);
}
