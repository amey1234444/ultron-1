-- In-app analysis layer.
-- This ports analyzer outputs into the existing app database instead of
-- requiring a separately deployed Python/FastAPI analysis service.

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

CREATE INDEX IF NOT EXISTS analysis_snapshots_machine_recent
  ON analysis_snapshots (machine_id, generated_at DESC);

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

CREATE INDEX IF NOT EXISTS analysis_signal_quality_snapshot
  ON analysis_signal_quality (snapshot_id);

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

CREATE INDEX IF NOT EXISTS analysis_anomaly_episodes_machine_recent
  ON analysis_anomaly_episodes (machine_id, last_seen_at DESC);

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

CREATE INDEX IF NOT EXISTS analysis_maintenance_cases_machine
  ON analysis_maintenance_cases (machine_id, status, updated_at DESC);
