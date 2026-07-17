-- Ultron MQTT ingestion schema (gateways, racks, binding, dedup, telemetry).
-- Idempotent: safe for existing deployments; never drops or truncates data.

-- Permanent gateway identity is gateway_id; current_ip is the mandatory
-- network-binding field and may change over a gateway's life.
CREATE TABLE IF NOT EXISTS gateways (
  id              BIGSERIAL PRIMARY KEY,
  gateway_id      TEXT NOT NULL UNIQUE,
  current_ip      TEXT NOT NULL DEFAULT '',
  gateway_boot_id TEXT NOT NULL DEFAULT '',
  mqtt_client_id  TEXT NOT NULL DEFAULT '',
  status          TEXT NOT NULL DEFAULT 'UNKNOWN', -- ONLINE | OFFLINE | DEGRADED | QUARANTINED | UNKNOWN
  last_seen_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gateway_ip_history (
  id            BIGSERIAL PRIMARY KEY,
  gateway_id    TEXT NOT NULL,
  ip_address    TEXT NOT NULL,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved      BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (gateway_id, ip_address)
);

-- gateway_id + rack_id is the permanent rack identity.
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

-- Envelope-level dedup for QoS 1 at-least-once redelivery.
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
ALTER TABLE mqtt_messages ADD COLUMN IF NOT EXISTS source_event JSONB;
CREATE INDEX IF NOT EXISTS mqtt_messages_gateway ON mqtt_messages (gateway_id, received_at);

-- Latest retained inventory snapshot per rack slot.
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

-- Current value per measurement point.
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
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (gateway_id, rack_id, slot_id, channel_id, measurement_type)
);

-- Historical time series keyed by source (gateway) time, not backend arrival.
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
  received_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (gateway_id, rack_id, slot_id, channel_id, measurement_type, source_sequence, source_timestamp_us)
);
CREATE INDEX IF NOT EXISTS measurement_history_point
  ON measurement_history (gateway_id, rack_id, slot_id, channel_id, source_timestamp_us);

-- Alarm / fault / system events.
CREATE TABLE IF NOT EXISTS gateway_events (
  id          BIGSERIAL PRIMARY KEY,
  message_id  TEXT NOT NULL,
  gateway_id  TEXT NOT NULL,
  rack_id     INT NOT NULL,
  event_kind  TEXT NOT NULL, -- alarm | fault | system
  payload     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gateway_events_rack ON gateway_events (gateway_id, rack_id, created_at);

-- Messages that fail schema/identity/binding checks are quarantined, never
-- silently bound (unknown gateway_id claiming a known IP, topic/payload
-- identity mismatch, invalid schema...).
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
