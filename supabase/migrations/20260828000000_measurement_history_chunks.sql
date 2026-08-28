-- Lossless compressed channel history chunks.
-- Existing measurement_latest / measurement_history tables remain intact; this
-- table is the canonical compact historian used by graphs and analysis.
CREATE TABLE IF NOT EXISTS measurement_history_chunks (
  id                 TEXT PRIMARY KEY,
  gateway_id         TEXT NOT NULL,
  rack_id            TEXT NOT NULL,
  slot_id            INT NOT NULL,
  channel_id         INT NOT NULL,
  measurement_type   TEXT NOT NULL DEFAULT '',
  unit               TEXT NOT NULL DEFAULT '',
  quality            TEXT NOT NULL DEFAULT 'GOOD',
  card_type          TEXT,
  sensor             TEXT,
  first_timestamp_ms BIGINT NOT NULL,
  last_timestamp_ms  BIGINT NOT NULL,
  sample_count       INT NOT NULL,
  encoding           TEXT NOT NULL DEFAULT 'delta-varint-f64xor-v1',
  payload            JSONB NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS measurement_history_chunks_point_range
  ON measurement_history_chunks (gateway_id, rack_id, slot_id, channel_id, last_timestamp_ms DESC);

CREATE INDEX IF NOT EXISTS measurement_history_chunks_created
  ON measurement_history_chunks (created_at DESC);
