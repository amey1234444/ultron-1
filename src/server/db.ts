// Thin Supabase/PostgreSQL access layer. Local development and CI builds can run
// without DATABASE_URL, but production auth and shared workspace persistence fail
// closed when it is absent.
//
// Use the Supabase pooler DATABASE_URL in production. SSL is enabled
// automatically for non-local hosts.

import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';

import { ApiError, logServerError } from './errors';

const globalRef = globalThis as unknown as {
  __ultronPgPool?: Pool;
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

// pg >= 8.16 treats `sslmode=require` in the connection string as verify-full,
// which rejects Supabase's self-signed certificate chain even when an explicit
// `ssl` option is passed. Strip ssl params from the URL and control SSL solely
// through the `ssl` pool option.
// Server-side guards applied to every connection in the pool.
//
// `max` is 5, so five queries that never finish are the whole path: with no
// statement_timeout a single runaway query holds its connection until the
// process dies, and five of them take the application down while the database
// itself stays healthy and idle.
//
// 60s rather than the few seconds a web request should need, because this pool
// also runs migrate() on the first request after a cold start, and a one-time
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

function stripSslParams(url: string): string {
  try {
    const u = new URL(url);
    u.searchParams.delete('sslmode');
    u.searchParams.delete('ssl');
    u.searchParams.delete('sslcert');
    u.searchParams.delete('sslkey');
    u.searchParams.delete('sslrootcert');
    return u.toString();
  } catch {
    return url;
  }
}

export function pool(): Pool {
  if (!process.env.DATABASE_URL) {
    throw new ApiError(503, 'DATABASE_URL is not set.');
  }
  if (!globalRef.__ultronPgPool) {
    const connectionString = process.env.DATABASE_URL;
    globalRef.__ultronPgPool = new Pool({
      connectionString: stripSslParams(connectionString),
      max: 5,
      connectionTimeoutMillis: 8000,
      options: CONNECTION_GUARDS,
      ssl: needsSsl(connectionString) ? { rejectUnauthorized: false } : undefined,
    });
  }
  return globalRef.__ultronPgPool;
}

// Map low-level pg/socket failures to a 503 with an actionable (but
// credential-free) message instead of an opaque 500.
function classifyDbError(err: unknown): ApiError | null {
  const e = err as { code?: string; message?: string } | null;
  if (!e || typeof e !== 'object') return null;
  const code = e.code ?? '';
  if (code === 'ENETUNREACH' || code === 'ECONNREFUSED' || code === 'ETIMEDOUT' || code === 'EHOSTUNREACH') {
    return new ApiError(
      503,
      `Database unreachable (${code}). If using Supabase from a serverless host, use the pooler connection string (aws-0-<region>.pooler.supabase.com:6543).`,
    );
  }
  if (code === 'ENOTFOUND') {
    return new ApiError(503, 'Database host not found (ENOTFOUND). Check the DATABASE_URL hostname.');
  }
  if (code === '28P01' || /password authentication failed|SASL/i.test(e.message ?? '')) {
    return new ApiError(503, 'Database authentication failed. Check the DATABASE_URL username/password.');
  }
  if (
    code === 'SELF_SIGNED_CERT_IN_CHAIN' ||
    code === 'DEPTH_ZERO_SELF_SIGNED_CERT' ||
    code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ||
    /certificate/i.test(e.message ?? '')
  ) {
    return new ApiError(503, 'Database TLS certificate rejected. Remove sslmode from DATABASE_URL or use a trusted certificate.');
  }
  if (/timeout exceeded when trying to connect/i.test(e.message ?? '')) {
    return new ApiError(503, 'Database connection timed out. Check that the database is up and reachable.');
  }
  return null;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<QueryResult<T>> {
  try {
    return await pool().query<T>(text, params);
  } catch (err) {
    logServerError('db query failed', err);
    throw classifyDbError(err) ?? err;
  }
}

export async function withClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  let client: PoolClient;
  try {
    client = await pool().connect();
  } catch (err) {
    logServerError('db connect failed', err);
    throw classifyDbError(err) ?? err;
  }
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

// Create tables on first use. Idempotent — safe to call on every cold start.
export async function ensureSchema(): Promise<void> {
  if (!globalRef.__ultronPgReady) {
    globalRef.__ultronPgReady = withMigrationLock(migrate).catch((err) => {
      // Reset so a later request can retry after a transient failure.
      globalRef.__ultronPgReady = undefined;
      throw err;
    });
  }
  return globalRef.__ultronPgReady;
}

// Create the case-insensitive unique index guarding email addresses. If a
// database predates this constraint and already holds duplicate emails (e.g.
// created while the vulnerability was live), the index build fails; we log and
// continue rather than wedging every cold start, since the application-level
// check still blocks new duplicates. Operators can dedupe and re-run migrate().
async function ensureEmailUniqueIndex(): Promise<void> {
  try {
    await query(`CREATE UNIQUE INDEX IF NOT EXISTS users_email_lc_unique ON users (email_lc) WHERE email_lc <> '';`);
  } catch (err) {
    logServerError('db users_email_lc_unique index (pre-existing duplicate emails?)', err);
  }
}

// --- Migration bookkeeping -------------------------------------------------
// Everything in migrate() is written to be idempotent, but idempotent is not the
// same as free. Three kinds of statement cost the same every time they run, long
// after they have taken effect: ALTER COLUMN ... TYPE takes an ACCESS EXCLUSIVE
// lock, which stops every reader and writer of a telemetry table until it
// finishes; the email_lc backfill writes every users row; the studio_cards dedupe
// self-joins the table. Paying that on every cold start is a real hazard on a
// serverless host, where cold starts are frequent and concurrent.
//
// Two guards fix it. A ledger (schema_migrations) makes a one-time step run once
// per database instead of once per cold start, and a session advisory lock makes
// two instances booting in the same second queue up rather than race each other
// through CREATE INDEX / ALTER TABLE -- concurrent `IF NOT EXISTS` DDL is not in
// fact safe, it can fail on a duplicate pg_class row.
//
// The ledger is the runtime's own, deliberately: the Supabase CLI keeps its
// history in supabase_migrations.schema_migrations, and a step applied through
// the CLI is not recorded here. So every guarded step is still written so that
// re-running it is a no-op, and a database that took the change through the CLI
// just records a no-op once.

// Arbitrary but fixed -- every process that runs migrate() must pick the same key.
const MIGRATION_LOCK_KEY = 8274001;

async function withMigrationLock<T>(fn: () => Promise<T>): Promise<T> {
  return withClient(async (client) => {
    // Session-level rather than transaction-level: the lock has to outlive the
    // individual statements, which migrate() sends through the pool.
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
    try {
      return await fn();
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]);
    }
  });
}

// Run `statements` at most once per database, in one transaction, recording
// `version` so later cold starts skip them. A step that fails leaves no ledger
// row and no half-applied change, so the next boot retries it from the top.
// Callers run under withMigrationLock.
async function once(version: string, statements: string[]): Promise<void> {
  const seen = await query('SELECT 1 FROM schema_migrations WHERE version = $1', [version]);
  if (seen.rowCount) return;
  await withClient(async (client) => {
    await client.query('BEGIN');
    try {
      for (const sql of statements) await client.query(sql);
      await client.query(
        `INSERT INTO schema_migrations (version, applied_by) VALUES ($1, 'runtime') ON CONFLICT (version) DO NOTHING;`,
        [version],
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
  });
}

async function migrate(): Promise<void> {
  // The ledger itself, before anything that consults it.
  await query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      applied_by TEXT NOT NULL DEFAULT 'runtime'
    );
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      username      TEXT NOT NULL UNIQUE,
      username_lc   TEXT NOT NULL UNIQUE,
      name          TEXT NOT NULL DEFAULT '',
      email         TEXT NOT NULL DEFAULT '',
      email_lc      TEXT NOT NULL DEFAULT '',
      role          TEXT NOT NULL DEFAULT 'user',
      status        TEXT NOT NULL DEFAULT 'pending',
      permissions   JSONB NOT NULL DEFAULT '[]'::jsonb,
      password_hash TEXT NOT NULL,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_login_at TIMESTAMPTZ,
      last_seen_at  TIMESTAMPTZ
    );
  `);

  // Enforce one account per email address at the database level (defence in
  // depth behind the application check). The lowercased column makes uniqueness
  // case-insensitive; the partial index skips blank emails so historical rows
  // without an address don't collide with each other.
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_lc TEXT NOT NULL DEFAULT '';`);
  // Writes every row whose key is missing, so it is a one-time backfill, not a
  // per-boot reconciliation: every writer since has set email_lc itself, and
  // users_email_lc_agrees below is what keeps it that way.
  await once('20260724000000_user_email_lc_backfill', [
    `UPDATE users SET email_lc = lower(btrim(email)) WHERE email_lc IS DISTINCT FROM lower(btrim(email));`,
  ]);
  await ensureEmailUniqueIndex();

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

  // Password-reset tokens. Only the SHA-256 hash of the token is stored, exactly
  // like auth_sessions: a database leak must not yield working reset links.
  // `consumed_at` enforces single use, and the row is kept after consumption so
  // a replayed link can be told apart from an unknown one.
  await query(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      token_hash   TEXT PRIMARY KEY,
      user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at   TIMESTAMPTZ NOT NULL,
      consumed_at  TIMESTAMPTZ
    );
  `);
  await query(
    `CREATE INDEX IF NOT EXISTS password_reset_tokens_user ON password_reset_tokens (user_id, consumed_at);`,
  );

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
  // Primary lookup path is by key + time window (see rateLimit.ts).
  await query(`CREATE INDEX IF NOT EXISTS rate_events_key_ts ON rate_events (key, ts);`);

  // Security alarms shown to super admins (repeated duplicate-email signups,
  // rate-limit / signup-limit breaches). See server/securityAlerts.ts.
  await query(`
    CREATE TABLE IF NOT EXISTS security_alerts (
      id              BIGSERIAL PRIMARY KEY,
      kind            TEXT NOT NULL,
      email           TEXT NOT NULL DEFAULT '',
      ip              TEXT NOT NULL DEFAULT '',
      device          TEXT NOT NULL DEFAULT '',
      bucket          TEXT NOT NULL DEFAULT '',
      detail          TEXT NOT NULL DEFAULT '',
      acknowledged_at TIMESTAMPTZ,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await query(`CREATE INDEX IF NOT EXISTS security_alerts_recent ON security_alerts (created_at DESC);`);
  await query(`CREATE INDEX IF NOT EXISTS security_alerts_dedup ON security_alerts (kind, email, ip, bucket, created_at);`);

  // Email reputation gate (Abstract Email Reputation API). Accepted signups
  // carry their reputation verdict + full API response on the users row so the
  // super admin can review it. See server/emailReputation.ts.
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS reputation_status TEXT NOT NULL DEFAULT 'unknown';`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS reputation_score DOUBLE PRECISION;`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS reputation_checked_at TIMESTAMPTZ;`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS reputation_data JSONB;`);

  // Emails whose reputation was judged not-acceptable. Checked BEFORE calling the
  // paid API on future signups (a hit short-circuits and rejects without a call).
  // `overridden_at` records a manual super-admin override that re-enables signup.
  // NOTE: superseded by the unified `email_reputation` table below (kept only so
  // historical rows can be migrated forward); new writes go to email_reputation.
  await query(`
    CREATE TABLE IF NOT EXISTS rejected_email_reputation (
      id            BIGSERIAL PRIMARY KEY,
      email         TEXT NOT NULL DEFAULT '',
      email_lc      TEXT NOT NULL UNIQUE,
      reasons       JSONB NOT NULL DEFAULT '[]'::jsonb,
      detail        TEXT NOT NULL DEFAULT '',
      response      JSONB,
      overridden_at TIMESTAMPTZ,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await query(`CREATE INDEX IF NOT EXISTS rejected_email_reputation_recent ON rejected_email_reputation (created_at DESC);`);

  // Unified reputation store: ONE row per email holding the latest verdict and
  // the FULL Abstract API response for acceptable, not_acceptable, unknown and
  // overridden emails alike. `allowed` = signup permitted (everything except an
  // active rejection). See server/emailReputation.ts.
  await query(`
    CREATE TABLE IF NOT EXISTS email_reputation (
      id            BIGSERIAL PRIMARY KEY,
      email         TEXT NOT NULL DEFAULT '',
      email_lc      TEXT NOT NULL UNIQUE,
      status        TEXT NOT NULL DEFAULT 'unknown',
      allowed       BOOLEAN NOT NULL DEFAULT true,
      score         DOUBLE PRECISION,
      reasons       JSONB NOT NULL DEFAULT '[]'::jsonb,
      detail        TEXT NOT NULL DEFAULT '',
      response      JSONB,
      checked_at    TIMESTAMPTZ,
      overridden_at TIMESTAMPTZ,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await query(`CREATE INDEX IF NOT EXISTS email_reputation_recent ON email_reputation (updated_at DESC);`);
  await query(`CREATE INDEX IF NOT EXISTS email_reputation_status ON email_reputation (status);`);
  // One-time forward migration of any legacy rejected rows into the unified
  // table. Nothing writes rejected_email_reputation any more, so after this has
  // run there is never anything new to carry across -- it was scanning a frozen
  // table on every cold start to insert nothing.
  await once('20260726000000_reputation_forward_migration', [
    `INSERT INTO email_reputation (email, email_lc, status, allowed, reasons, detail, response, checked_at, overridden_at, created_at, updated_at)
     SELECT email, email_lc,
            CASE WHEN overridden_at IS NOT NULL THEN 'overridden' ELSE 'not_acceptable' END,
            overridden_at IS NOT NULL,
            reasons, detail, response, created_at, overridden_at, created_at, created_at
     FROM rejected_email_reputation
     ON CONFLICT (email_lc) DO NOTHING;`,
  ]);

  // Durable, rate-limited work queue for Abstract API calls. Signups (and manual
  // re-checks) enqueue here; a single-flight worker drains it at <= 1 req/sec so
  // requests are never lost and the free-tier limit is respected. See
  // server/reputationQueue.ts.
  await query(`
    CREATE TABLE IF NOT EXISTS reputation_queue (
      id            BIGSERIAL PRIMARY KEY,
      email         TEXT NOT NULL,
      email_lc      TEXT NOT NULL,
      state         TEXT NOT NULL DEFAULT 'pending',
      attempts      INT NOT NULL DEFAULT 0,
      last_error    TEXT NOT NULL DEFAULT '',
      requested_by  TEXT NOT NULL DEFAULT '',
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      processed_at  TIMESTAMPTZ
    );
  `);
  await query(`CREATE INDEX IF NOT EXISTS reputation_queue_pending ON reputation_queue (state, created_at);`);
  // At most one active (pending/processing) job per email, so bursts of signups
  // for the same address collapse to a single API call.
  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS reputation_queue_active_email
      ON reputation_queue (email_lc) WHERE state IN ('pending', 'processing');
  `);

  // --- Workspace (asset hierarchy + canvas layouts) -----------------
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
      gateway_id  TEXT REFERENCES studio_devices(id) ON DELETE SET NULL,
      real_gateway_id TEXT,
      -- TEXT, not INT: a rack id is an opaque identifier the gateway chooses, and
      -- comparing it numerically would make '07' and '7' the same rack.
      real_rack_id TEXT,
      archived    BOOLEAN NOT NULL DEFAULT false,
      sort_order  INT  NOT NULL DEFAULT 0,
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await query(`ALTER TABLE studio_devices ADD COLUMN IF NOT EXISTS gateway_id TEXT REFERENCES studio_devices(id) ON DELETE SET NULL;`);
  await query(`ALTER TABLE studio_devices ADD COLUMN IF NOT EXISTS real_gateway_id TEXT;`);
  await query(`ALTER TABLE studio_devices ADD COLUMN IF NOT EXISTS real_rack_id INT;`);
  // real_rack_id's INT -> TEXT conversion is applied by the guarded block in the
  // MQTT v2 section below, alongside the rack_id columns it belongs with.
  // Simulation Mode: virtual gateways/racks fed by the in-app simulator.
  await query(`ALTER TABLE studio_devices ADD COLUMN IF NOT EXISTS simulated BOOLEAN NOT NULL DEFAULT false;`);
  await query(`CREATE INDEX IF NOT EXISTS studio_devices_live_gateway ON studio_devices (type, archived, real_gateway_id);`);
  await query(`CREATE INDEX IF NOT EXISTS studio_devices_live_ip ON studio_devices (type, archived, ip);`);
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
  // Per-channel simulated signal definition; null for a card in a real rack.
  await query(`ALTER TABLE studio_cards ADD COLUMN IF NOT EXISTS simulation JSONB;`);
  // Clears the duplicates that existed before one-card-per-slot was enforced, so
  // that the unique index below can be built. Once the index exists no duplicate
  // can be written again, which is what makes this a one-time step rather than a
  // self-join DELETE on every cold start.
  await once('20260727170000_studio_card_slot_dedupe', [
    `DELETE FROM studio_cards stale
     USING studio_cards keep
     WHERE stale.device_id = keep.device_id
       AND stale.slot = keep.slot
       AND (
         stale.sort_order < keep.sort_order
         OR (stale.sort_order = keep.sort_order AND stale.updated_at < keep.updated_at)
         OR (stale.sort_order = keep.sort_order AND stale.updated_at = keep.updated_at AND stale.id < keep.id)
       );`,
  ]);
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS studio_cards_device_slot_unique ON studio_cards (device_id, slot);`);

  // Canvas layout per machine: box coordinates + card mappings + trail geometry
  // in fixed 1600x900 stage units. Consumed identically by the configure/design
  // view and the non-configure/actual view so both stay in sync.
  await query(`
    CREATE TABLE IF NOT EXISTS studio_machine_layouts (
      machine_id   TEXT PRIMARY KEY,
      trails       JSONB NOT NULL DEFAULT '[]'::jsonb,
      boxes        JSONB NOT NULL DEFAULT '[]'::jsonb,
      machine_zoom DOUBLE PRECISION,
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS studio_machine_templates (
      machine_template TEXT PRIMARY KEY,
      trails           JSONB NOT NULL DEFAULT '[]'::jsonb,
      boxes            JSONB NOT NULL DEFAULT '[]'::jsonb,
      machine_zoom     DOUBLE PRECISION,
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  // How large the machine is drawn, saved with the canvas it was drawn against.
  // Nullable on purpose: NULL is "no size was ever saved", which is a different
  // answer from 100% and is what lets a machine fall back to its template's
  // size. Added rather than baked into the CREATE so existing databases pick it
  // up on the next boot, the same way every other late column here does.
  await query(`ALTER TABLE studio_machine_layouts ADD COLUMN IF NOT EXISTS machine_zoom DOUBLE PRECISION;`);
  await query(`ALTER TABLE studio_machine_templates ADD COLUMN IF NOT EXISTS machine_zoom DOUBLE PRECISION;`);
  await query(`
    CREATE TABLE IF NOT EXISTS studio_machine_canvas_cards (
      id          TEXT NOT NULL,
      machine_id  TEXT NOT NULL,
      center_x    DOUBLE PRECISION NOT NULL DEFAULT 0,
      center_y    DOUBLE PRECISION NOT NULL DEFAULT 0,
      label       TEXT NOT NULL DEFAULT '',
      channel_id  TEXT,
      data        JSONB NOT NULL DEFAULT '{}'::jsonb,
      sort_order  INT NOT NULL DEFAULT 0,
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (machine_id, id)
    );
  `);
  await query(`CREATE INDEX IF NOT EXISTS studio_machine_canvas_cards_machine ON studio_machine_canvas_cards (machine_id, sort_order);`);

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

  // --- MQTT ingestion (gateways / racks / telemetry) ------------------------
  // Written by the long-running MQTT ingest service (services/mqtt-ingest);
  // read here by the /api/live endpoints. Created in both places so either
  // process can cold-start first. Mirrors
  // supabase/migrations/20260716000000_mqtt_telemetry.sql.
  await query(`
    CREATE TABLE IF NOT EXISTS gateways (
      id              BIGSERIAL PRIMARY KEY,
      gateway_id      TEXT NOT NULL UNIQUE,
      current_ip      TEXT NOT NULL DEFAULT '',
      gateway_boot_id TEXT NOT NULL DEFAULT '',
      mqtt_client_id  TEXT NOT NULL DEFAULT '',
      status          TEXT NOT NULL DEFAULT 'UNKNOWN',
      last_seen_at    TIMESTAMPTZ,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS gateway_ip_history (
      id            BIGSERIAL PRIMARY KEY,
      gateway_id    TEXT NOT NULL,
      ip_address    TEXT NOT NULL,
      first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      approved      BOOLEAN NOT NULL DEFAULT false,
      UNIQUE (gateway_id, ip_address)
    );
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS racks (
      id            BIGSERIAL PRIMARY KEY,
      gateway_id    TEXT NOT NULL,
      rack_id       TEXT NOT NULL,
      site_id       TEXT,
      plant_id      TEXT,
      friendly_name TEXT NOT NULL DEFAULT '',
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (gateway_id, rack_id)
    );
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS mqtt_messages (
      message_id     TEXT PRIMARY KEY,
      topic          TEXT NOT NULL,
      schema         TEXT NOT NULL,
      schema_version TEXT NOT NULL,
      gateway_id     TEXT NOT NULL,
      gateway_ip     TEXT NOT NULL,
      rack_id        TEXT,
      received_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      payload_hash   TEXT NOT NULL DEFAULT '',
      source_event   JSONB
    );
  `);
  await query(`ALTER TABLE mqtt_messages ADD COLUMN IF NOT EXISTS source_event JSONB;`);
  await query(`CREATE INDEX IF NOT EXISTS mqtt_messages_gateway ON mqtt_messages (gateway_id, received_at);`);
  await query(`
    CREATE TABLE IF NOT EXISTS rack_inventory_slots (
      gateway_id        TEXT NOT NULL,
      rack_id           TEXT NOT NULL,
      slot_number       INT NOT NULL,
      presence          TEXT NOT NULL DEFAULT 'EMPTY',
      online_state      TEXT NOT NULL DEFAULT 'UNKNOWN',
      card_type         TEXT,
      snapshot_revision BIGINT NOT NULL DEFAULT 0,
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (gateway_id, rack_id, slot_number)
    );
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS measurement_latest (
      gateway_id          TEXT NOT NULL,
      rack_id             TEXT NOT NULL,
      slot_id             INT NOT NULL,
      channel_id          INT NOT NULL,
      measurement_type    TEXT NOT NULL,
      value               DOUBLE PRECISION NOT NULL,
      unit                TEXT NOT NULL DEFAULT '',
      quality             TEXT NOT NULL DEFAULT 'GOOD',
      source_sequence     BIGINT NOT NULL DEFAULT 0,
      source_timestamp_us BIGINT NOT NULL DEFAULT 0,
      card_type           TEXT,
      sensor              TEXT,
      freshness           TEXT NOT NULL DEFAULT 'FRESH',
      channel_status      TEXT,
      alert_threshold     DOUBLE PRECISION,
      danger_threshold    DOUBLE PRECISION,
      alert_state         TEXT NOT NULL DEFAULT 'INACTIVE',
      danger_state        TEXT NOT NULL DEFAULT 'INACTIVE',
      updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (gateway_id, rack_id, slot_id, channel_id, measurement_type)
    );
  `);
  await query(`CREATE INDEX IF NOT EXISTS measurement_latest_live_rack ON measurement_latest (gateway_id, rack_id, updated_at DESC);`);
  await query(`CREATE INDEX IF NOT EXISTS measurement_latest_live_channel ON measurement_latest (gateway_id, rack_id, slot_id, channel_id, updated_at DESC);`);
  await query(`
    CREATE TABLE IF NOT EXISTS measurement_history (
      id                  BIGSERIAL PRIMARY KEY,
      gateway_id          TEXT NOT NULL,
      rack_id             TEXT NOT NULL,
      slot_id             INT NOT NULL,
      channel_id          INT NOT NULL,
      measurement_type    TEXT NOT NULL,
      value               DOUBLE PRECISION NOT NULL,
      unit                TEXT NOT NULL DEFAULT '',
      quality             TEXT NOT NULL DEFAULT 'GOOD',
      source_sequence     BIGINT NOT NULL DEFAULT 0,
      source_timestamp_us BIGINT NOT NULL DEFAULT 0,
      card_type           TEXT,
      sensor              TEXT,
      freshness           TEXT NOT NULL DEFAULT 'FRESH',
      channel_status      TEXT,
      alert_threshold     DOUBLE PRECISION,
      danger_threshold    DOUBLE PRECISION,
      alert_state         TEXT NOT NULL DEFAULT 'INACTIVE',
      danger_state        TEXT NOT NULL DEFAULT 'INACTIVE',
      received_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (gateway_id, rack_id, slot_id, channel_id, measurement_type, source_sequence, source_timestamp_us)
    );
  `);
  // Per-channel detail a real controller reports next to the value (the CC v3
  // frame carries sensor, card type, thresholds and alarm state); older
  // deployments created these tables before the columns existed.
  for (const table of ['measurement_latest', 'measurement_history']) {
    await query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS card_type TEXT;`);
    await query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS sensor TEXT;`);
    await query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS freshness TEXT NOT NULL DEFAULT 'FRESH';`);
    await query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS channel_status TEXT;`);
    await query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS alert_threshold DOUBLE PRECISION;`);
    await query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS danger_threshold DOUBLE PRECISION;`);
    await query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS alert_state TEXT NOT NULL DEFAULT 'INACTIVE';`);
    await query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS danger_state TEXT NOT NULL DEFAULT 'INACTIVE';`);
  }
  await query(`
    CREATE INDEX IF NOT EXISTS measurement_history_point
      ON measurement_history (gateway_id, rack_id, slot_id, channel_id, source_timestamp_us);
  `);
  // Removed design: history is kept in measurement_history itself.
  await once('20260830000000_drop_measurement_history_chunks', [
    `DROP TABLE IF EXISTS measurement_history_chunks;`,
  ]);
  await query(`
    CREATE TABLE IF NOT EXISTS gateway_events (
      id          BIGSERIAL PRIMARY KEY,
      message_id  TEXT NOT NULL,
      gateway_id  TEXT NOT NULL,
      rack_id     TEXT,
      event_kind  TEXT NOT NULL,
      payload     JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await query(`CREATE INDEX IF NOT EXISTS gateway_events_rack ON gateway_events (gateway_id, rack_id, created_at);`);
  await query(`
    CREATE TABLE IF NOT EXISTS mqtt_quarantine (
      id          BIGSERIAL PRIMARY KEY,
      topic       TEXT NOT NULL,
      reason      TEXT NOT NULL,
      gateway_id  TEXT,
      gateway_ip  TEXT,
      rack_id     TEXT,
      raw_payload JSONB,
      received_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await query(`CREATE INDEX IF NOT EXISTS mqtt_quarantine_live_conflict ON mqtt_quarantine (reason, received_at DESC, gateway_id, gateway_ip);`);

  // --- ULTRON MQTT v2 current state ---------------------------------------
  // Live identity moved to exact string rack ids. The conversion is one-way and
  // one-time, but the bare ALTER COLUMN ... TYPE it used to be re-ran on every
  // cold start and took an ACCESS EXCLUSIVE lock on measurement_history each
  // time, which stops ingest and every /api/live read for the duration. Reading
  // pg_attribute first turns the steady state into a catalog lookup.
  await query(`
    DO $$
    DECLARE r RECORD;
    BEGIN
      FOR r IN SELECT * FROM (VALUES
        ('racks', 'rack_id'),
        ('mqtt_messages', 'rack_id'),
        ('rack_inventory_slots', 'rack_id'),
        ('measurement_latest', 'rack_id'),
        ('measurement_history', 'rack_id'),
        ('gateway_events', 'rack_id'),
        ('mqtt_quarantine', 'rack_id'),
        ('studio_devices', 'real_rack_id')
      ) AS v(tbl, col) LOOP
        IF to_regclass(r.tbl) IS NOT NULL AND EXISTS (
          SELECT 1 FROM pg_attribute a
          WHERE a.attrelid = to_regclass(r.tbl) AND a.attname = r.col
            AND a.attnum > 0 AND NOT a.attisdropped AND a.atttypid <> 'text'::regtype
        ) THEN
          EXECUTE format('ALTER TABLE %I ALTER COLUMN %I TYPE TEXT USING %I::TEXT', r.tbl, r.col, r.col);
        END IF;
      END LOOP;
    END $$;
  `);
  // A rack-scoped event is optional on a gateway-wide event, so rack_id is
  // nullable. Same guard, same reason.
  await query(`
    DO $$
    BEGIN
      IF to_regclass('gateway_events') IS NOT NULL AND EXISTS (
        SELECT 1 FROM pg_attribute
        WHERE attrelid = 'gateway_events'::regclass AND attname = 'rack_id' AND attnotnull
      ) THEN
        ALTER TABLE gateway_events ALTER COLUMN rack_id DROP NOT NULL;
      END IF;
    END $$;
  `);

  await query(`ALTER TABLE gateways ADD COLUMN IF NOT EXISTS mqtt_state TEXT NOT NULL DEFAULT 'UNKNOWN';`);
  await query(`ALTER TABLE gateways ADD COLUMN IF NOT EXISTS last_gateway_sequence BIGINT NOT NULL DEFAULT -1;`);
  await query(`ALTER TABLE gateways ADD COLUMN IF NOT EXISTS last_source_created_at TIMESTAMPTZ;`);
  await query(`ALTER TABLE gateways ADD COLUMN IF NOT EXISTS last_source_created_at_us NUMERIC;`);
  await query(`ALTER TABLE gateways ADD COLUMN IF NOT EXISTS status_payload JSONB NOT NULL DEFAULT '{}'::jsonb;`);
  await query(`ALTER TABLE gateways ADD COLUMN IF NOT EXISTS topology_payload JSONB NOT NULL DEFAULT '{}'::jsonb;`);
  await query(`ALTER TABLE gateways ADD COLUMN IF NOT EXISTS known_racks INT NOT NULL DEFAULT 0;`);
  await query(`ALTER TABLE gateways ADD COLUMN IF NOT EXISTS connected_racks INT NOT NULL DEFAULT 0;`);
  await query(`ALTER TABLE gateways ADD COLUMN IF NOT EXISTS stale_racks INT NOT NULL DEFAULT 0;`);
  await query(`ALTER TABLE gateways ADD COLUMN IF NOT EXISTS disconnected_racks INT NOT NULL DEFAULT 0;`);
  await query(`ALTER TABLE gateways ADD COLUMN IF NOT EXISTS blocked_racks INT NOT NULL DEFAULT 0;`);
  await query(`ALTER TABLE gateways ADD COLUMN IF NOT EXISTS unidentified_connections INT NOT NULL DEFAULT 0;`);
  await query(`ALTER TABLE gateways ADD COLUMN IF NOT EXISTS active_tcp_connections INT NOT NULL DEFAULT 0;`);

  await query(`ALTER TABLE racks ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'unknown';`);
  await query(`ALTER TABLE racks ADD COLUMN IF NOT EXISTS data_current BOOLEAN NOT NULL DEFAULT false;`);
  await query(`ALTER TABLE racks ADD COLUMN IF NOT EXISTS current_ip TEXT;`);
  await query(`ALTER TABLE racks ADD COLUMN IF NOT EXISTS last_known_ip TEXT;`);
  await query(`ALTER TABLE racks ADD COLUMN IF NOT EXISTS connection_reason TEXT;`);
  await query(`ALTER TABLE racks ADD COLUMN IF NOT EXISTS connection_payload JSONB NOT NULL DEFAULT '{}'::jsonb;`);
  await query(`ALTER TABLE racks ADD COLUMN IF NOT EXISTS telemetry_payload JSONB NOT NULL DEFAULT '{}'::jsonb;`);
  await query(`ALTER TABLE racks ADD COLUMN IF NOT EXISTS health_payload JSONB NOT NULL DEFAULT '{}'::jsonb;`);
  await query(`ALTER TABLE racks ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;`);
  await query(`ALTER TABLE racks ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMPTZ;`);
  await query(`ALTER TABLE racks ADD COLUMN IF NOT EXISTS last_gateway_sequence BIGINT NOT NULL DEFAULT -1;`);
  await query(`ALTER TABLE racks ADD COLUMN IF NOT EXISTS last_gateway_boot_id TEXT NOT NULL DEFAULT '';`);
  await query(`ALTER TABLE racks ADD COLUMN IF NOT EXISTS last_source_created_at TIMESTAMPTZ;`);
  await query(`ALTER TABLE racks ADD COLUMN IF NOT EXISTS last_source_created_at_us NUMERIC;`);
  await query(`ALTER TABLE racks ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;`);

  await query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'rack_inventory_slots' AND column_name = 'slot_id'
      ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'rack_inventory_slots' AND column_name = 'slot_number'
      ) THEN
        ALTER TABLE rack_inventory_slots RENAME COLUMN slot_id TO slot_number;
      END IF;
    END $$;
  `);
  await query(`ALTER TABLE rack_inventory_slots ADD COLUMN IF NOT EXISTS card_type_code INT;`);
  await query(`ALTER TABLE rack_inventory_slots ADD COLUMN IF NOT EXISTS sensor_code INT;`);
  await query(`ALTER TABLE rack_inventory_slots ADD COLUMN IF NOT EXISTS sensor TEXT;`);
  await query(`ALTER TABLE rack_inventory_slots ADD COLUMN IF NOT EXISTS unit_code INT;`);
  await query(`ALTER TABLE rack_inventory_slots ADD COLUMN IF NOT EXISTS unit TEXT;`);
  await query(`ALTER TABLE rack_inventory_slots ADD COLUMN IF NOT EXISTS decimal_places INT;`);
  await query(`ALTER TABLE rack_inventory_slots ADD COLUMN IF NOT EXISTS slot_payload JSONB NOT NULL DEFAULT '{}'::jsonb;`);

  await query(`
    CREATE TABLE IF NOT EXISTS rack_slot_latest (
      gateway_id              TEXT NOT NULL,
      rack_id                 TEXT NOT NULL,
      slot_number             INT NOT NULL,
      data_status             TEXT,
      channel_status_code     INT,
      channel_status          TEXT,
      card_type_code          INT,
      card_type               TEXT,
      sensor_code             INT,
      sensor                  TEXT,
      unit_code               INT,
      unit                    TEXT,
      decimal_places          INT,
      value_raw               TEXT,
      value_formatted         TEXT,
      value_with_unit         TEXT,
      measurement_valid       BOOLEAN NOT NULL DEFAULT false,
      value_display           TEXT,
      alert_value_raw         TEXT,
      alert_value_formatted   TEXT,
      alert_with_unit         TEXT,
      danger_value_raw        TEXT,
      danger_value_formatted  TEXT,
      danger_with_unit        TEXT,
      alert_status_code       INT,
      alert_status            TEXT,
      danger_status_code      INT,
      danger_status           TEXT,
      source_timestamp_us     NUMERIC,
      gateway_sequence        BIGINT NOT NULL DEFAULT -1,
      gateway_boot_id         TEXT NOT NULL DEFAULT '',
      payload                 JSONB NOT NULL DEFAULT '{}'::jsonb,
      live                    BOOLEAN NOT NULL DEFAULT false,
      updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (gateway_id, rack_id, slot_number)
    );
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS mqtt_ingest_metrics (
      metric_name TEXT PRIMARY KEY,
      metric_value BIGINT NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  // --- In-app analysis layer ---------------------------------------------
  // Integrated port of the Rotary Airlock analysis concepts. This intentionally
  // lives in the same Next/Postgres app, not in the Python/FastAPI service from
  // the source zip, so deployments remain a single application.
  await query(`
    CREATE TABLE IF NOT EXISTS analysis_snapshots (
      id                BIGSERIAL PRIMARY KEY,
      machine_id        TEXT NOT NULL,
      machine_template  TEXT NOT NULL,
      model_key         TEXT NOT NULL,
      model_version     TEXT NOT NULL,
      generated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      readiness_score   INT NOT NULL DEFAULT 0,
      operating_state   TEXT NOT NULL DEFAULT 'unknown',
      anomaly_state     TEXT NOT NULL DEFAULT 'none',
      anomaly_severity  TEXT NOT NULL DEFAULT 'none',
      condition_title   TEXT NOT NULL DEFAULT '',
      maintenance_priority TEXT NOT NULL DEFAULT 'none',
      payload           JSONB NOT NULL DEFAULT '{}'::jsonb
    );
  `);
  await query(`CREATE INDEX IF NOT EXISTS analysis_snapshots_machine_recent ON analysis_snapshots (machine_id, generated_at DESC);`);
  await query(`
    CREATE TABLE IF NOT EXISTS analysis_signal_quality (
      id            BIGSERIAL PRIMARY KEY,
      snapshot_id   BIGINT NOT NULL REFERENCES analysis_snapshots(id) ON DELETE CASCADE,
      machine_id    TEXT NOT NULL,
      signal_code   TEXT NOT NULL,
      status        TEXT NOT NULL,
      checks        JSONB NOT NULL DEFAULT '[]'::jsonb,
      limitations   JSONB NOT NULL DEFAULT '[]'::jsonb,
      latest_value  DOUBLE PRECISION,
      unit          TEXT NOT NULL DEFAULT ''
    );
  `);
  await query(`CREATE INDEX IF NOT EXISTS analysis_signal_quality_snapshot ON analysis_signal_quality (snapshot_id);`);
  await query(`
    CREATE TABLE IF NOT EXISTS analysis_baselines (
      machine_id    TEXT NOT NULL,
      signal_code   TEXT NOT NULL,
      model_key     TEXT NOT NULL,
      maturity      TEXT NOT NULL DEFAULT 'unavailable',
      sample_count  INT NOT NULL DEFAULT 0,
      median        DOUBLE PRECISION,
      mad           DOUBLE PRECISION,
      payload       JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (machine_id, signal_code, model_key)
    );
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS analysis_anomaly_episodes (
      id             BIGSERIAL PRIMARY KEY,
      machine_id     TEXT NOT NULL,
      started_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_seen_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      resolved_at    TIMESTAMPTZ,
      state          TEXT NOT NULL,
      severity       TEXT NOT NULL,
      score          DOUBLE PRECISION NOT NULL DEFAULT 0,
      contributors   JSONB NOT NULL DEFAULT '[]'::jsonb,
      payload        JSONB NOT NULL DEFAULT '{}'::jsonb
    );
  `);
  await query(`CREATE INDEX IF NOT EXISTS analysis_anomaly_episodes_machine_recent ON analysis_anomaly_episodes (machine_id, last_seen_at DESC);`);
  await query(`
    CREATE TABLE IF NOT EXISTS analysis_maintenance_cases (
      id             BIGSERIAL PRIMARY KEY,
      machine_id     TEXT NOT NULL,
      snapshot_id    BIGINT REFERENCES analysis_snapshots(id) ON DELETE SET NULL,
      title          TEXT NOT NULL,
      priority       TEXT NOT NULL,
      status         TEXT NOT NULL DEFAULT 'open',
      recommended_actions JSONB NOT NULL DEFAULT '[]'::jsonb,
      verification_steps  JSONB NOT NULL DEFAULT '[]'::jsonb,
      similar_case_signals JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
      closed_at      TIMESTAMPTZ
    );
  `);
  await query(`CREATE INDEX IF NOT EXISTS analysis_maintenance_cases_machine ON analysis_maintenance_cases (machine_id, status, updated_at DESC);`);

  // Overview analysis computed in the browser from the mapped live signals and
  // posted back for durable history. These rows drive the health/vibration/RPM
  // trends and the activity feed on the machine Overview tab.
  await query(`
    CREATE TABLE IF NOT EXISTS analysis_overview_snapshots (
      id                    BIGSERIAL PRIMARY KEY,
      machine_id            TEXT NOT NULL,
      machine_template      TEXT NOT NULL DEFAULT '',
      generated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
      readiness_percent     INT NOT NULL DEFAULT 0,
      readiness_label       TEXT NOT NULL DEFAULT '',
      condition_score       INT NOT NULL DEFAULT 0,
      condition_label       TEXT NOT NULL DEFAULT '',
      operating_state       TEXT NOT NULL DEFAULT 'unknown',
      state_confidence      INT NOT NULL DEFAULT 0,
      mapped_count          INT NOT NULL DEFAULT 0,
      expected_points       INT NOT NULL DEFAULT 0,
      live_count            INT NOT NULL DEFAULT 0,
      vibration_spread      DOUBLE PRECISION,
      rpm_deviation_percent DOUBLE PRECISION,
      temperature_delta     DOUBLE PRECISION,
      pressure_differential DOUBLE PRECISION,
      priority_finding      TEXT NOT NULL DEFAULT '',
      source                TEXT NOT NULL DEFAULT 'frontend',
      payload               JSONB NOT NULL DEFAULT '{}'::jsonb
    );
  `);
  await query(
    `CREATE INDEX IF NOT EXISTS analysis_overview_snapshots_machine_recent
       ON analysis_overview_snapshots (machine_id, generated_at DESC);`,
  );

  // --- SAP S/4HANA integration ------------------------------------------
  // Credentials are encrypted by the application before they reach this
  // table. Only redacted connection metadata is ever returned to browsers.
  await query(`
    CREATE TABLE IF NOT EXISTS sap_connections (
      id                    TEXT PRIMARY KEY,
      name                  TEXT NOT NULL,
      edition               TEXT NOT NULL DEFAULT 'cloud_public',
      base_url              TEXT NOT NULL,
      auth_type             TEXT NOT NULL,
      token_url             TEXT NOT NULL DEFAULT '',
      encrypted_credentials TEXT NOT NULL,
      default_plant         TEXT NOT NULL DEFAULT '',
      service_paths         JSONB NOT NULL DEFAULT '{}'::jsonb,
      enabled               BOOLEAN NOT NULL DEFAULT true,
      last_tested_at        TIMESTAMPTZ,
      last_test_status      TEXT NOT NULL DEFAULT 'untested',
      last_test_detail      TEXT NOT NULL DEFAULT '',
      created_by            TEXT NOT NULL DEFAULT '',
      updated_by            TEXT NOT NULL DEFAULT '',
      created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await query(`CREATE INDEX IF NOT EXISTS sap_connections_enabled ON sap_connections (enabled, updated_at DESC);`);

  await query(`
    CREATE TABLE IF NOT EXISTS sap_project_bindings (
      project_id      TEXT PRIMARY KEY REFERENCES studio_projects(id) ON DELETE CASCADE,
      connection_id   TEXT NOT NULL REFERENCES sap_connections(id) ON DELETE CASCADE,
      sap_plant       TEXT NOT NULL DEFAULT '',
      planning_plant  TEXT NOT NULL DEFAULT '',
      updated_by      TEXT NOT NULL DEFAULT '',
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await query(`CREATE INDEX IF NOT EXISTS sap_project_bindings_connection ON sap_project_bindings (connection_id);`);

  await query(`
    CREATE TABLE IF NOT EXISTS sap_asset_mappings (
      id                    BIGSERIAL PRIMARY KEY,
      connection_id         TEXT NOT NULL REFERENCES sap_connections(id) ON DELETE CASCADE,
      ultron_machine_id     TEXT NOT NULL REFERENCES studio_machines(id) ON DELETE CASCADE,
      sap_equipment         TEXT NOT NULL,
      functional_location   TEXT NOT NULL DEFAULT '',
      plant                 TEXT NOT NULL DEFAULT '',
      work_center           TEXT NOT NULL DEFAULT '',
      measuring_points      JSONB NOT NULL DEFAULT '{}'::jsonb,
      status                TEXT NOT NULL DEFAULT 'validated',
      last_validated_at     TIMESTAMPTZ,
      updated_by            TEXT NOT NULL DEFAULT '',
      updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (connection_id, ultron_machine_id)
    );
  `);
  await query(`CREATE INDEX IF NOT EXISTS sap_asset_mappings_equipment ON sap_asset_mappings (connection_id, sap_equipment);`);

  await query(`
    CREATE TABLE IF NOT EXISTS sap_material_mappings (
      id                    BIGSERIAL PRIMARY KEY,
      connection_id         TEXT NOT NULL REFERENCES sap_connections(id) ON DELETE CASCADE,
      ultron_machine_id     TEXT NOT NULL REFERENCES studio_machines(id) ON DELETE CASCADE,
      component_key         TEXT NOT NULL,
      sap_material          TEXT NOT NULL,
      plant                 TEXT NOT NULL DEFAULT '',
      storage_location      TEXT NOT NULL DEFAULT '',
      required_quantity     DOUBLE PRECISION,
      unit                  TEXT NOT NULL DEFAULT '',
      approved_substitutes  JSONB NOT NULL DEFAULT '[]'::jsonb,
      updated_by            TEXT NOT NULL DEFAULT '',
      updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (connection_id, ultron_machine_id, component_key)
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS sap_case_links (
      id                    BIGSERIAL PRIMARY KEY,
      connection_id         TEXT NOT NULL REFERENCES sap_connections(id) ON DELETE CASCADE,
      maintenance_case_id   BIGINT NOT NULL REFERENCES analysis_maintenance_cases(id) ON DELETE CASCADE,
      notification_number   TEXT NOT NULL DEFAULT '',
      maintenance_order     TEXT NOT NULL DEFAULT '',
      status                TEXT NOT NULL DEFAULT 'pending',
      idempotency_key       TEXT NOT NULL UNIQUE,
      last_synced_at        TIMESTAMPTZ,
      created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (connection_id, maintenance_case_id)
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS sap_object_cache (
      connection_id    TEXT NOT NULL REFERENCES sap_connections(id) ON DELETE CASCADE,
      object_type      TEXT NOT NULL,
      object_key       TEXT NOT NULL,
      payload          JSONB NOT NULL DEFAULT '{}'::jsonb,
      etag             TEXT NOT NULL DEFAULT '',
      source_changed_at TIMESTAMPTZ,
      synced_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (connection_id, object_type, object_key)
    );
  `);
  await query(`CREATE INDEX IF NOT EXISTS sap_object_cache_recent ON sap_object_cache (connection_id, object_type, synced_at DESC);`);

  await query(`
    CREATE TABLE IF NOT EXISTS sap_outbox (
      id                BIGSERIAL PRIMARY KEY,
      connection_id     TEXT NOT NULL REFERENCES sap_connections(id) ON DELETE CASCADE,
      operation         TEXT NOT NULL,
      object_type       TEXT NOT NULL,
      object_key        TEXT NOT NULL DEFAULT '',
      payload           JSONB NOT NULL DEFAULT '{}'::jsonb,
      idempotency_key   TEXT NOT NULL UNIQUE,
      state             TEXT NOT NULL DEFAULT 'pending',
      attempts          INT NOT NULL DEFAULT 0,
      next_attempt_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_error        TEXT NOT NULL DEFAULT '',
      correlation_id    TEXT NOT NULL,
      created_by        TEXT NOT NULL DEFAULT '',
      created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
      processed_at      TIMESTAMPTZ
    );
  `);
  // The drain claims rows with `state IN ('pending','retry') AND next_attempt_at
  // <= now()`, so only those rows are worth indexing. A completed row is in the
  // table forever and would otherwise keep paying for an index no query reads.
  await query(`
    CREATE INDEX IF NOT EXISTS sap_outbox_runnable ON sap_outbox (next_attempt_at, created_at)
      WHERE state IN ('pending', 'retry');
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS sap_sync_runs (
      id                BIGSERIAL PRIMARY KEY,
      connection_id     TEXT NOT NULL REFERENCES sap_connections(id) ON DELETE CASCADE,
      scope             TEXT NOT NULL DEFAULT 'all',
      state             TEXT NOT NULL DEFAULT 'running',
      objects_read      INT NOT NULL DEFAULT 0,
      objects_written   INT NOT NULL DEFAULT 0,
      error_count       INT NOT NULL DEFAULT 0,
      detail            JSONB NOT NULL DEFAULT '{}'::jsonb,
      requested_by      TEXT NOT NULL DEFAULT '',
      started_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
      finished_at       TIMESTAMPTZ
    );
  `);
  await query(`CREATE INDEX IF NOT EXISTS sap_sync_runs_recent ON sap_sync_runs (connection_id, started_at DESC);`);

  await query(`
    CREATE TABLE IF NOT EXISTS sap_audit_log (
      id                BIGSERIAL PRIMARY KEY,
      connection_id     TEXT REFERENCES sap_connections(id) ON DELETE SET NULL,
      user_id           TEXT NOT NULL DEFAULT '',
      action            TEXT NOT NULL,
      object_type       TEXT NOT NULL DEFAULT '',
      object_key        TEXT NOT NULL DEFAULT '',
      direction         TEXT NOT NULL DEFAULT 'internal',
      status            TEXT NOT NULL,
      http_status       INT,
      duration_ms       INT,
      correlation_id    TEXT NOT NULL DEFAULT '',
      detail            JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await query(`CREATE INDEX IF NOT EXISTS sap_audit_log_recent ON sap_audit_log (created_at DESC);`);
  await query(`CREATE INDEX IF NOT EXISTS sap_audit_log_connection ON sap_audit_log (connection_id, created_at DESC);`);

  await hardenSchema();
}

// --- Integrity and index hygiene -------------------------------------------
// Split out of migrate() because it is about the shape of what is already there,
// not about adding the next feature's table: keys the schema was missing, indexes
// it was paying for twice, and the rules the application has always enforced in
// TypeScript and never told the database about.
async function hardenSchema(): Promise<void> {
  // Three indexes duplicated a key that already indexes the same columns in the
  // same order: racks_live_gateway_rack repeated UNIQUE (gateway_id, rack_id),
  // and the two *_live / *_rack indexes repeated their own primary keys. A
  // duplicate index is never read -- the planner picks one of them -- but every
  // INSERT and UPDATE maintains it, and on rack_slot_latest that is every
  // telemetry frame.
  // rate_events_lookup is the fourth: it leads on `bucket`, which every writer
  // sets to '', so the only thing it can be scanned for is (key, ts) -- exactly
  // what rate_events_key_ts already covers.
  await once('20260926000000_drop_duplicate_indexes', [
    `DROP INDEX IF EXISTS racks_live_gateway_rack;`,
    `DROP INDEX IF EXISTS rack_inventory_slots_live;`,
    `DROP INDEX IF EXISTS rack_slot_latest_rack;`,
    `DROP INDEX IF EXISTS rate_events_lookup;`,
  ]);

  // studio_cards_device (device_id) is the fifth of the same kind, missed by the
  // pass above because it is a prefix rather than an exact duplicate:
  // studio_cards_device_slot_unique (device_id, slot) already serves every query
  // the shorter index does, since a btree on (a, b) answers WHERE a = ... too.
  // It is never read and is maintained on every write, and studio_cards is
  // rewritten wholesale by each Save Config, so that write cost is on the hot
  // path. The CREATE that used to sit beside the table definition is gone, so a
  // fresh database no longer builds it at all.
  await once('20260927000000_drop_prefix_redundant_studio_cards_index', [
    `DROP INDEX IF EXISTS studio_cards_device;`,
  ]);

  // A foreign key with no index on the referencing side makes the parent's
  // DELETE scan the whole child table to find the rows to cascade. Saving the
  // hierarchy deletes every project, folder, machine and device and re-inserts
  // them, so these sit on the hot path of an ordinary Save Config, not just of
  // an occasional cleanup.
  await query(`CREATE INDEX IF NOT EXISTS studio_folders_parent ON studio_folders (parent_id);`);
  await query(`CREATE INDEX IF NOT EXISTS studio_machines_project ON studio_machines (project_id);`);
  await query(`CREATE INDEX IF NOT EXISTS studio_devices_project ON studio_devices (project_id);`);
  await query(`CREATE INDEX IF NOT EXISTS studio_devices_gateway ON studio_devices (gateway_id);`);
  await query(`CREATE INDEX IF NOT EXISTS analysis_maintenance_cases_snapshot ON analysis_maintenance_cases (snapshot_id);`);
  await query(`CREATE INDEX IF NOT EXISTS sap_asset_mappings_machine ON sap_asset_mappings (ultron_machine_id);`);
  await query(`CREATE INDEX IF NOT EXISTS sap_material_mappings_machine ON sap_material_mappings (ultron_machine_id);`);
  await query(`CREATE INDEX IF NOT EXISTS sap_case_links_case ON sap_case_links (maintenance_case_id);`);
  // Serves both the connection's foreign key and the outbox listing, which reads
  // WHERE connection_id = $1 ORDER BY created_at DESC LIMIT 20.
  await query(`CREATE INDEX IF NOT EXISTS sap_outbox_connection ON sap_outbox (connection_id, created_at DESC);`);

  // Every rule below is one the application already enforces -- isRole(),
  // isUserStatus(), clampMachineZoom(), the retry ladder in the SAP outbox --
  // which is exactly why it belongs here as well. A TypeScript guard protects
  // the requests that go through the code holding it; a CHECK protects the table
  // from every other path, including a psql session, an edit in the Supabase
  // dashboard, a future endpoint, and a bug in the guard itself.
  //
  // Declared as data rather than as fifty hand-written ALTER statements, so the
  // set of rules reads as one list and adding a rule is adding a row.
  //
  // NOT VALID on purpose. Postgres enforces the constraint on every insert and
  // update from here on WITHOUT scanning the rows already stored, so applying
  // this cannot fail on legacy data and cannot take a long lock on
  // measurement_history. scripts/validate-schema-constraints.sql reports which
  // ones the existing rows already satisfy and promotes those to fully validated.
  //
  // Telemetry vocabularies (presence, quality, freshness, channel_status,
  // alert_state, card_type, sensor, unit) are deliberately left unconstrained:
  // those strings come from gateway firmware, so pinning them here would mean a
  // firmware release that adds a sensor type takes ingest down. They are the case
  // for lookup tables instead -- see docs/database-schema.md.
  await query(`
    DO $$
    DECLARE r RECORD;
    BEGIN
      FOR r IN SELECT * FROM (VALUES
        -- Accounts: closed vocabularies, already validated at the API boundary.
        ('users', 'users_role_domain', $q$role IN ('user','admin','super_admin')$q$),
        ('users', 'users_status_domain', $q$status IN ('pending','active','disabled')$q$),
        ('users', 'users_reputation_status_domain', $q$reputation_status IN ('acceptable','not_acceptable','unknown','overridden')$q$),
        -- The lowercased columns are derived, not independent facts. Without
        -- this a row can carry an email_lc that does not belong to its email,
        -- and the same address could then sign up twice under the unique index.
        ('users', 'users_email_lc_derived', $q$email_lc = lower(btrim(email))$q$),
        ('users', 'users_username_lc_derived', $q$username_lc = lower(username)$q$),
        ('users', 'users_permissions_is_array', $q$jsonb_typeof(permissions) = 'array'$q$),
        -- A session or reset token that expires before it exists is unusable.
        ('auth_sessions', 'auth_sessions_expires_after_created', $q$expires_at > created_at$q$),
        ('password_reset_tokens', 'password_reset_expires_after_created', $q$expires_at > created_at$q$),
        ('app_settings', 'app_settings_data_is_object', $q$jsonb_typeof(data) = 'object'$q$),
        -- Only the key column is asserted. bucket is written as '' by the only
        -- writer (the bucket name is encoded in the key prefix instead), so a
        -- non-blank check on it would reject every rate-limit record.
        ('rate_events', 'rate_events_key_not_blank', $q$key <> ''$q$),
        -- Email reputation: one row per address, keyed by the lowercased form.
        ('email_reputation', 'email_reputation_status_domain', $q$status IN ('acceptable','not_acceptable','unknown','overridden')$q$),
        ('email_reputation', 'email_reputation_key_is_lower', $q$email_lc = lower(email_lc)$q$),
        ('email_reputation', 'email_reputation_reasons_is_array', $q$jsonb_typeof(reasons) = 'array'$q$),
        ('reputation_queue', 'reputation_queue_state_domain', $q$state IN ('pending','processing','done','error')$q$),
        ('reputation_queue', 'reputation_queue_attempts_non_negative', $q$attempts >= 0$q$),
        ('reputation_queue', 'reputation_queue_key_is_lower', $q$email_lc = lower(email_lc)$q$),
        -- Workspace: sort_order is an array index the server assigns from zero.
        ('studio_projects', 'studio_projects_sort_order_non_negative', $q$sort_order >= 0$q$),
        ('studio_folders', 'studio_folders_sort_order_non_negative', $q$sort_order >= 0$q$),
        ('studio_machines', 'studio_machines_sort_order_non_negative', $q$sort_order >= 0$q$),
        ('studio_devices', 'studio_devices_sort_order_non_negative', $q$sort_order >= 0$q$),
        ('studio_cards', 'studio_cards_sort_order_non_negative', $q$sort_order >= 0$q$),
        -- A folder that is its own parent makes the left rail recurse forever.
        -- This catches the one-step case; the trigger below catches longer ones.
        ('studio_folders', 'studio_folders_not_own_parent', $q$parent_id IS NULL OR parent_id <> id$q$),
        ('studio_cards', 'studio_cards_slot_non_negative', $q$slot >= 0$q$),
        ('studio_machines', 'studio_machines_components_is_array', $q$jsonb_typeof(components) = 'array'$q$),
        -- The zoom range the control offers, which clampMachineZoom() enforces on
        -- the way in. NULL stays legal and still means never sized.
        ('studio_machine_layouts', 'studio_machine_layouts_zoom_range', $q$machine_zoom IS NULL OR (machine_zoom >= 0.5 AND machine_zoom <= 2)$q$),
        ('studio_machine_templates', 'studio_machine_templates_zoom_range', $q$machine_zoom IS NULL OR (machine_zoom >= 0.5 AND machine_zoom <= 2)$q$),
        ('studio_machine_layouts', 'studio_machine_layouts_json_shape', $q$jsonb_typeof(trails) = 'array' AND jsonb_typeof(boxes) = 'array'$q$),
        ('studio_machine_templates', 'studio_machine_templates_json_shape', $q$jsonb_typeof(trails) = 'array' AND jsonb_typeof(boxes) = 'array'$q$),
        -- Live identity. A blank gateway id satisfies UNIQUE once and then
        -- collides with every other gateway that failed to identify itself.
        ('gateways', 'gateways_id_not_blank', $q$gateway_id <> ''$q$),
        ('gateways', 'gateways_status_domain', $q$status IN ('ONLINE','OFFLINE','DEGRADED','QUARANTINED','UNKNOWN')$q$),
        ('gateways', 'gateways_mqtt_state_domain', $q$mqtt_state IN ('CONNECTED','DISCONNECTED','UNKNOWN')$q$),
        ('gateways', 'gateways_counters_non_negative', $q$known_racks >= 0 AND connected_racks >= 0 AND stale_racks >= 0 AND disconnected_racks >= 0 AND blocked_racks >= 0 AND unidentified_connections >= 0 AND active_tcp_connections >= 0$q$),
        ('racks', 'racks_identity_not_blank', $q$gateway_id <> '' AND rack_id <> ''$q$),
        ('racks', 'racks_status_domain', $q$status IN ('connected','disconnected','stale','blocked','unknown')$q$),
        -- slot_number / slot_id / channel_id are NOT constrained here, even
        -- though a negative one is meaningless: they come straight from the
        -- gateway frame, and validate.mjs range-checks neither. A CHECK would
        -- turn one unexpected firmware value into silently dropped telemetry,
        -- so the range belongs in validate.mjs beside the identity checks that
        -- gateways_id_not_blank and racks_identity_not_blank below do mirror.
        ('mqtt_ingest_metrics', 'mqtt_ingest_metrics_non_negative', $q$metric_value >= 0$q$),
        -- Analysis. Scores are percentages and counts are counts.
        ('analysis_snapshots', 'analysis_snapshots_readiness_range', $q$readiness_score BETWEEN 0 AND 100$q$),
        ('analysis_overview_snapshots', 'analysis_overview_percent_range', $q$readiness_percent BETWEEN 0 AND 100 AND condition_score BETWEEN 0 AND 100 AND state_confidence BETWEEN 0 AND 100$q$),
        ('analysis_overview_snapshots', 'analysis_overview_counts_non_negative', $q$mapped_count >= 0 AND expected_points >= 0 AND live_count >= 0$q$),
        ('analysis_baselines', 'analysis_baselines_sample_count_non_negative', $q$sample_count >= 0$q$),
        -- An episode cannot be last seen, or resolved, before it started.
        ('analysis_anomaly_episodes', 'analysis_episodes_time_ordered', $q$last_seen_at >= started_at AND (resolved_at IS NULL OR resolved_at >= started_at)$q$),
        ('analysis_maintenance_cases', 'analysis_cases_closed_after_created', $q$closed_at IS NULL OR closed_at >= created_at$q$),
        -- SAP. The outbox ladder is pending -> processing -> completed | retry |
        -- failed, and nothing else ever writes state.
        ('sap_outbox', 'sap_outbox_state_domain', $q$state IN ('pending','processing','retry','completed','failed')$q$),
        ('sap_outbox', 'sap_outbox_attempts_non_negative', $q$attempts >= 0$q$),
        ('sap_sync_runs', 'sap_sync_runs_time_ordered', $q$finished_at IS NULL OR finished_at >= started_at$q$),
        ('sap_sync_runs', 'sap_sync_runs_counts_non_negative', $q$objects_read >= 0 AND objects_written >= 0 AND error_count >= 0$q$),
        ('sap_audit_log', 'sap_audit_log_http_status_range', $q$http_status IS NULL OR http_status BETWEEN 100 AND 599$q$),
        ('sap_audit_log', 'sap_audit_log_duration_non_negative', $q$duration_ms IS NULL OR duration_ms >= 0$q$)
      ) AS v(tbl, cname, expr) LOOP
        IF to_regclass(r.tbl) IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = r.cname AND conrelid = to_regclass(r.tbl)
        ) THEN
          EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I CHECK (%s) NOT VALID', r.tbl, r.cname, r.expr);
        END IF;
      END LOOP;
    END $$;
  `);

  // A folder cycle is not reachable through the UI -- saveHierarchy rejects one
  // before it writes -- but nothing stopped a direct UPDATE from creating one,
  // and the result is a left rail that never finishes rendering and a recursive
  // query that never returns. The walk is bounded by the depth of the tree and
  // only runs when parent_id is actually set, so a Save Config pays for it once
  // per folder that has a parent.
  await query(`
    CREATE OR REPLACE FUNCTION studio_folders_reject_cycle() RETURNS trigger AS $fn$
    DECLARE
      ancestor TEXT := NEW.parent_id;
      hops INT := 0;
    BEGIN
      WHILE ancestor IS NOT NULL LOOP
        IF ancestor = NEW.id THEN
          RAISE EXCEPTION 'studio_folders: % cannot be a descendant of itself', NEW.id
            USING ERRCODE = 'check_violation';
        END IF;
        hops := hops + 1;
        IF hops > 10000 THEN
          RAISE EXCEPTION 'studio_folders: the parent chain above % is already cyclic', NEW.id
            USING ERRCODE = 'check_violation';
        END IF;
        SELECT parent_id INTO ancestor FROM studio_folders WHERE id = ancestor;
      END LOOP;
      RETURN NEW;
    END;
    $fn$ LANGUAGE plpgsql;
  `);
  await query(`DROP TRIGGER IF EXISTS studio_folders_no_cycle ON studio_folders;`);
  await query(`
    CREATE TRIGGER studio_folders_no_cycle
      AFTER INSERT OR UPDATE OF parent_id ON studio_folders
      FOR EACH ROW WHEN (NEW.parent_id IS NOT NULL)
      EXECUTE FUNCTION studio_folders_reject_cycle();
  `);

  // The gateway row caches five counts that are really aggregates over racks,
  // refreshed by the ingest runtime at most once every few seconds. Caching them
  // is a deliberate choice -- the live console reads them per gateway on every
  // poll -- but a cache nothing can check is indistinguishable from a bug, so
  // this view recomputes the same numbers from the rows they summarise and
  // returns only the gateways where the two disagree. Empty is healthy.
  await query(`
    CREATE OR REPLACE VIEW gateway_rack_count_drift AS
    SELECT
      g.gateway_id,
      g.connected_racks    AS cached_connected,
      t.connected_racks    AS actual_connected,
      g.stale_racks        AS cached_stale,
      t.stale_racks        AS actual_stale,
      g.disconnected_racks AS cached_disconnected,
      t.disconnected_racks AS actual_disconnected,
      g.updated_at
    FROM gateways g
    JOIN (
      SELECT
        gateway_id,
        count(*) FILTER (WHERE active AND status = 'connected' AND data_current)::int     AS connected_racks,
        count(*) FILTER (WHERE active AND status = 'connected' AND NOT data_current)::int AS stale_racks,
        count(*) FILTER (WHERE NOT active OR status <> 'connected')::int                  AS disconnected_racks
      FROM racks
      GROUP BY gateway_id
    ) t ON t.gateway_id = g.gateway_id
    WHERE (g.connected_racks, g.stale_racks, g.disconnected_racks)
       IS DISTINCT FROM (t.connected_racks, t.stale_racks, t.disconnected_racks);
  `);

  // Written into the database itself, so the next person to open it in a Supabase
  // console meets the same caveats as the next person to read this file.
  for (const comment of [
    `COMMENT ON TABLE schema_migrations IS 'Ledger of the one-time steps applied by the runtime migrate(). Separate from supabase_migrations.schema_migrations, which the Supabase CLI owns.'`,
    `COMMENT ON TABLE rejected_email_reputation IS 'DEPRECATED, superseded by email_reputation. Retained only as the source of the one-time forward migration; nothing reads or writes it. Safe to drop once email_reputation is confirmed complete.'`,
    `COMMENT ON VIEW gateway_rack_count_drift IS 'Gateways whose cached *_racks counters disagree with the racks rows they summarise. Empty is healthy.'`,
    `COMMENT ON COLUMN gateways.connected_racks IS 'Cached aggregate over racks, refreshed by the ingest runtime. The racks table is authoritative; see gateway_rack_count_drift.'`,
    `COMMENT ON COLUMN gateways.stale_racks IS 'Cached aggregate over racks; see gateway_rack_count_drift.'`,
    `COMMENT ON COLUMN gateways.disconnected_racks IS 'Cached aggregate over racks; see gateway_rack_count_drift.'`,
    `COMMENT ON COLUMN users.email_lc IS 'Derived: lower(btrim(email)). Exists to make the unique index case-insensitive; kept honest by users_email_lc_derived.'`,
    `COMMENT ON COLUMN users.username_lc IS 'Derived: lower(username). Kept honest by users_username_lc_derived.'`,
    `COMMENT ON COLUMN users.reputation_status IS 'The email_reputation verdict as it stood at signup, copied here so the user list renders without a join. email_reputation is authoritative for the current verdict.'`,
    `COMMENT ON COLUMN studio_machines.project_id IS 'Denormalised from studio_folders.project_id so the tree reads without a recursive join. See docs/database-schema.md for why a composite foreign key does not yet enforce it.'`,
    `COMMENT ON COLUMN studio_machine_layouts.boxes IS 'Full canvas geometry including trail anchors. The card subset is also normalised into studio_machine_canvas_cards; saveMachineLayout writes both in one transaction.'`,
    `COMMENT ON COLUMN studio_machine_canvas_cards.data IS 'The layout box this row was projected from, kept whole so a box property the columns do not model yet survives a round trip.'`,
  ]) {
    // A COMMENT on a table a given deployment has not created yet is not worth
    // failing a boot over.
    try {
      await query(comment);
    } catch (err) {
      logServerError('db comment skipped', err);
    }
  }
}
