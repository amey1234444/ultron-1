-- Overview analysis computed in the browser and posted back for durable
-- history. Drives the health / vibration-spread / RPM-deviation trends and the
-- activity feed on the machine Overview tab.
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

CREATE INDEX IF NOT EXISTS analysis_overview_snapshots_machine_recent
  ON analysis_overview_snapshots (machine_id, generated_at DESC);
