// Thin Supabase/PostgreSQL access layer. Local development and CI builds can run
// without DATABASE_URL, but production auth and shared studio persistence fail
// closed when it is absent.
//
// Use the Supabase pooler DATABASE_URL in production. SSL is enabled
// automatically for non-local hosts.

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

  // Opaque, database-backed login sessions. Only a SHA-256 hash of the
  // browser token is stored; sessions therefore survive deploys/restarts without
  // depending on an instance-local JWT secret.
  await query(`
    CREATE TABLE IF NOT EXISTS auth_sessions (
      token_hash   TEXT PRIMARY KEY,
      user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at   TIMESTAMPTZ NOT NULL,
      revoked_at   TIMESTAMPTZ
    );
  `);
  await query(`CREATE INDEX IF NOT EXISTS auth_sessions_user ON auth_sessions (user_id, expires_at);`);

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

  // --- Studio workspace (asset hierarchy + canvas layouts) -----------------
  // The whole hierarchy shown in the left rail is durable and shared across all
  // authenticated users, so an edit by one user is visible to everyone. Deep,
  // template-shaped payloads (a machine's components/points, a card's channel
  // config, a canvas layout's trails/boxes with their coordinates) are stored as
  // JSONB alongside the normalized parent rows.
  await query(`
    CREATE TABLE IF NOT EXISTS studio_projects (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL DEFAULT '',
      code        TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      sort_order  INT  NOT NULL DEFAULT 0,
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS studio_folders (
      id          TEXT PRIMARY KEY,
      project_id  TEXT NOT NULL REFERENCES studio_projects(id) ON DELETE CASCADE,
      parent_id   TEXT REFERENCES studio_folders(id) ON DELETE CASCADE,
      name        TEXT NOT NULL DEFAULT '',
      type        TEXT NOT NULL DEFAULT 'Custom Folder',
      code        TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      sort_order  INT  NOT NULL DEFAULT 0,
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await query(`CREATE INDEX IF NOT EXISTS studio_folders_project ON studio_folders (project_id);`);
  await query(`
    CREATE TABLE IF NOT EXISTS studio_machines (
      id          TEXT PRIMARY KEY,
      project_id  TEXT NOT NULL REFERENCES studio_projects(id) ON DELETE CASCADE,
      folder_id   TEXT NOT NULL REFERENCES studio_folders(id) ON DELETE CASCADE,
      name        TEXT NOT NULL DEFAULT '',
      template    TEXT NOT NULL DEFAULT 'Custom Machine',
      components  JSONB NOT NULL DEFAULT '[]'::jsonb,
      sort_order  INT  NOT NULL DEFAULT 0,
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await query(`CREATE INDEX IF NOT EXISTS studio_machines_folder ON studio_machines (folder_id);`);
  await query(`
    CREATE TABLE IF NOT EXISTS studio_devices (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL DEFAULT '',
      type        TEXT NOT NULL DEFAULT 'Rack',
      model       TEXT NOT NULL DEFAULT '',
      ip          TEXT NOT NULL DEFAULT '',
      port        TEXT NOT NULL DEFAULT '',
      protocol    TEXT NOT NULL DEFAULT 'Modbus TCP',
      description TEXT NOT NULL DEFAULT '',
      status      TEXT NOT NULL DEFAULT 'Not Connected',
      project_id  TEXT REFERENCES studio_projects(id) ON DELETE SET NULL,
      archived    BOOLEAN NOT NULL DEFAULT false,
      sort_order  INT  NOT NULL DEFAULT 0,
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS studio_cards (
      id          TEXT PRIMARY KEY,
      device_id   TEXT NOT NULL REFERENCES studio_devices(id) ON DELETE CASCADE,
      slot        INT  NOT NULL DEFAULT 0,
      type        TEXT NOT NULL DEFAULT '',
      enabled     BOOLEAN NOT NULL DEFAULT true,
      config      JSONB NOT NULL DEFAULT '{}'::jsonb,
      sort_order  INT  NOT NULL DEFAULT 0,
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await query(`CREATE INDEX IF NOT EXISTS studio_cards_device ON studio_cards (device_id);`);

  // Canvas layout per machine: box coordinates + card mappings + trail geometry
  // in fixed 1600x900 stage units. Consumed identically by the configure/design
  // view and the non-configure/actual view so both stay in sync.
  await query(`
    CREATE TABLE IF NOT EXISTS studio_machine_layouts (
      machine_id TEXT PRIMARY KEY,
      trails     JSONB NOT NULL DEFAULT '[]'::jsonb,
      boxes      JSONB NOT NULL DEFAULT '[]'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  // Singleton bookkeeping row: monotonic revisions clients poll to detect other
  // users' changes, plus a one-time seed guard so a fresh database is populated
  // with demo data exactly once (and never re-seeded / reset on later deploys).
  await query(`
    CREATE TABLE IF NOT EXISTS studio_meta (
      id             INT PRIMARY KEY DEFAULT 1,
      hier_revision  BIGINT NOT NULL DEFAULT 0,
      layout_revision BIGINT NOT NULL DEFAULT 0,
      seeded         BOOLEAN NOT NULL DEFAULT false,
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT studio_meta_singleton CHECK (id = 1)
    );
  `);
  await query(`INSERT INTO studio_meta (id) VALUES (1) ON CONFLICT (id) DO NOTHING;`);
}
