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
    globalRef.__ultronPgReady = migrate().catch((err) => {
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

async function migrate(): Promise<void> {
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
  await query(`UPDATE users SET email_lc = lower(btrim(email)) WHERE email_lc IS DISTINCT FROM lower(btrim(email));`);
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
  await query(`CREATE INDEX IF NOT EXISTS rate_events_lookup ON rate_events (bucket, key, ts);`);
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
  // One-time forward migration of any legacy rejected rows into the unified table.
  await query(`
    INSERT INTO email_reputation (email, email_lc, status, allowed, reasons, detail, response, checked_at, overridden_at, created_at, updated_at)
    SELECT email, email_lc,
           CASE WHEN overridden_at IS NOT NULL THEN 'overridden' ELSE 'not_acceptable' END,
           overridden_at IS NOT NULL,
           reasons, detail, response, created_at, overridden_at, created_at, created_at
    FROM rejected_email_reputation
    ON CONFLICT (email_lc) DO NOTHING;
  `);

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
      real_rack_id INT,
      archived    BOOLEAN NOT NULL DEFAULT false,
      sort_order  INT  NOT NULL DEFAULT 0,
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await query(`ALTER TABLE studio_devices ADD COLUMN IF NOT EXISTS gateway_id TEXT REFERENCES studio_devices(id) ON DELETE SET NULL;`);
  await query(`ALTER TABLE studio_devices ADD COLUMN IF NOT EXISTS real_gateway_id TEXT;`);
  await query(`ALTER TABLE studio_devices ADD COLUMN IF NOT EXISTS real_rack_id INT;`);
  await query(`ALTER TABLE studio_devices ALTER COLUMN real_rack_id TYPE TEXT USING real_rack_id::TEXT;`);
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
  await query(`CREATE INDEX IF NOT EXISTS studio_cards_device ON studio_cards (device_id);`);
  // Per-channel simulated signal definition; null for a card in a real rack.
  await query(`ALTER TABLE studio_cards ADD COLUMN IF NOT EXISTS simulation JSONB;`);
  await query(`
    DELETE FROM studio_cards stale
    USING studio_cards keep
    WHERE stale.device_id = keep.device_id
      AND stale.slot = keep.slot
      AND (
        stale.sort_order < keep.sort_order
        OR (stale.sort_order = keep.sort_order AND stale.updated_at < keep.updated_at)
        OR (stale.sort_order = keep.sort_order AND stale.updated_at = keep.updated_at AND stale.id < keep.id)
      );
  `);
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS studio_cards_device_slot_unique ON studio_cards (device_id, slot);`);

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
  await query(`
    CREATE TABLE IF NOT EXISTS studio_machine_templates (
      machine_template TEXT PRIMARY KEY,
      trails           JSONB NOT NULL DEFAULT '[]'::jsonb,
      boxes            JSONB NOT NULL DEFAULT '[]'::jsonb,
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
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
      rack_id       INT NOT NULL,
      site_id       TEXT,
      plant_id      TEXT,
      friendly_name TEXT NOT NULL DEFAULT '',
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (gateway_id, rack_id)
    );
  `);
  await query(`CREATE INDEX IF NOT EXISTS racks_live_gateway_rack ON racks (gateway_id, rack_id);`);
  await query(`
    CREATE TABLE IF NOT EXISTS mqtt_messages (
      message_id     TEXT PRIMARY KEY,
      topic          TEXT NOT NULL,
      schema         TEXT NOT NULL,
      schema_version TEXT NOT NULL,
      gateway_id     TEXT NOT NULL,
      gateway_ip     TEXT NOT NULL,
      rack_id        INT,
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
      rack_id           INT NOT NULL,
      slot_id           INT NOT NULL,
      presence          TEXT NOT NULL DEFAULT 'EMPTY',
      online_state      TEXT NOT NULL DEFAULT 'UNKNOWN',
      card_type         TEXT,
      snapshot_revision BIGINT NOT NULL DEFAULT 0,
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (gateway_id, rack_id, slot_id)
    );
  `);
  await query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'rack_inventory_slots' AND column_name = 'slot_id'
      ) THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS rack_inventory_slots_live ON rack_inventory_slots (gateway_id, rack_id, slot_id)';
      END IF;
    END $$;
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS measurement_latest (
      gateway_id          TEXT NOT NULL,
      rack_id             INT NOT NULL,
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
      rack_id             INT NOT NULL,
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
  await query(`
    CREATE TABLE IF NOT EXISTS gateway_events (
      id          BIGSERIAL PRIMARY KEY,
      message_id  TEXT NOT NULL,
      gateway_id  TEXT NOT NULL,
      rack_id     INT NOT NULL,
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
      rack_id     INT,
      raw_payload JSONB,
      received_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await query(`CREATE INDEX IF NOT EXISTS mqtt_quarantine_live_conflict ON mqtt_quarantine (reason, received_at DESC, gateway_id, gateway_ip);`);

  // --- Ultron MQTT v2 current state ---------------------------------------
  await query(`ALTER TABLE racks ALTER COLUMN rack_id TYPE TEXT USING rack_id::TEXT;`);
  await query(`ALTER TABLE mqtt_messages ALTER COLUMN rack_id TYPE TEXT USING rack_id::TEXT;`);
  await query(`ALTER TABLE rack_inventory_slots ALTER COLUMN rack_id TYPE TEXT USING rack_id::TEXT;`);
  await query(`ALTER TABLE measurement_latest ALTER COLUMN rack_id TYPE TEXT USING rack_id::TEXT;`);
  await query(`ALTER TABLE measurement_history ALTER COLUMN rack_id TYPE TEXT USING rack_id::TEXT;`);
  await query(`ALTER TABLE gateway_events ALTER COLUMN rack_id DROP NOT NULL;`);
  await query(`ALTER TABLE gateway_events ALTER COLUMN rack_id TYPE TEXT USING rack_id::TEXT;`);
  await query(`ALTER TABLE mqtt_quarantine ALTER COLUMN rack_id TYPE TEXT USING rack_id::TEXT;`);

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
  await query(`CREATE INDEX IF NOT EXISTS rack_inventory_slots_live ON rack_inventory_slots (gateway_id, rack_id, slot_number);`);

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
  await query(`CREATE INDEX IF NOT EXISTS rack_slot_latest_rack ON rack_slot_latest (gateway_id, rack_id, slot_number);`);
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
}
