-- Ultron durable Supabase/PostgreSQL schema.
-- Idempotent: safe for existing deployments; never drops or truncates data.

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

CREATE TABLE IF NOT EXISTS auth_sessions (
  token_hash   TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ NOT NULL,
  revoked_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS auth_sessions_user ON auth_sessions (user_id, expires_at);

CREATE TABLE IF NOT EXISTS app_settings (
  id         INT PRIMARY KEY DEFAULT 1,
  data       JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT app_settings_singleton CHECK (id = 1)
);

CREATE TABLE IF NOT EXISTS rate_events (
  id     BIGSERIAL PRIMARY KEY,
  bucket TEXT NOT NULL,
  key    TEXT NOT NULL,
  ts     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rate_events_lookup ON rate_events (bucket, key, ts);
CREATE INDEX IF NOT EXISTS rate_events_key_ts ON rate_events (key, ts);

CREATE TABLE IF NOT EXISTS studio_projects (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL DEFAULT '',
  code        TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  sort_order  INT NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS studio_folders (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES studio_projects(id) ON DELETE CASCADE,
  parent_id   TEXT REFERENCES studio_folders(id) ON DELETE CASCADE,
  name        TEXT NOT NULL DEFAULT '',
  type        TEXT NOT NULL DEFAULT 'Custom Folder',
  code        TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  sort_order  INT NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS studio_folders_project ON studio_folders (project_id);

CREATE TABLE IF NOT EXISTS studio_machines (
  id         TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES studio_projects(id) ON DELETE CASCADE,
  folder_id  TEXT NOT NULL REFERENCES studio_folders(id) ON DELETE CASCADE,
  name       TEXT NOT NULL DEFAULT '',
  template   TEXT NOT NULL DEFAULT 'Custom Machine',
  components JSONB NOT NULL DEFAULT '[]'::jsonb,
  sort_order INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS studio_machines_folder ON studio_machines (folder_id);

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
  sort_order  INT NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS studio_cards (
  id         TEXT PRIMARY KEY,
  device_id  TEXT NOT NULL REFERENCES studio_devices(id) ON DELETE CASCADE,
  slot       INT NOT NULL DEFAULT 0,
  type       TEXT NOT NULL DEFAULT '',
  enabled    BOOLEAN NOT NULL DEFAULT true,
  config     JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort_order INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS studio_cards_device ON studio_cards (device_id);

-- Canvas geometry is stored in fixed 1600x900 stage units. The JSON arrays
-- include card/box coordinates, channel mappings, trail points, and anchors.
CREATE TABLE IF NOT EXISTS studio_machine_layouts (
  machine_id TEXT PRIMARY KEY,
  trails     JSONB NOT NULL DEFAULT '[]'::jsonb,
  boxes      JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS studio_meta (
  id              INT PRIMARY KEY DEFAULT 1,
  hier_revision   BIGINT NOT NULL DEFAULT 0,
  layout_revision BIGINT NOT NULL DEFAULT 0,
  seeded          BOOLEAN NOT NULL DEFAULT false,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT studio_meta_singleton CHECK (id = 1)
);
INSERT INTO studio_meta (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
