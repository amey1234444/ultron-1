-- Ultron MQTT v2 current-state model.
-- Idempotent migration: preserves legacy tables while moving live identity to
-- exact string rack IDs and adding current-only v2 state surfaces.

ALTER TABLE studio_devices ALTER COLUMN real_rack_id TYPE TEXT USING real_rack_id::TEXT;

ALTER TABLE racks ALTER COLUMN rack_id TYPE TEXT USING rack_id::TEXT;
ALTER TABLE mqtt_messages ALTER COLUMN rack_id TYPE TEXT USING rack_id::TEXT;
ALTER TABLE rack_inventory_slots ALTER COLUMN rack_id TYPE TEXT USING rack_id::TEXT;
ALTER TABLE measurement_latest ALTER COLUMN rack_id TYPE TEXT USING rack_id::TEXT;
ALTER TABLE measurement_history ALTER COLUMN rack_id TYPE TEXT USING rack_id::TEXT;
ALTER TABLE gateway_events ALTER COLUMN rack_id DROP NOT NULL;
ALTER TABLE gateway_events ALTER COLUMN rack_id TYPE TEXT USING rack_id::TEXT;
ALTER TABLE mqtt_quarantine ALTER COLUMN rack_id TYPE TEXT USING rack_id::TEXT;

ALTER TABLE gateways ADD COLUMN IF NOT EXISTS mqtt_state TEXT NOT NULL DEFAULT 'UNKNOWN';
ALTER TABLE gateways ADD COLUMN IF NOT EXISTS last_gateway_sequence BIGINT NOT NULL DEFAULT -1;
ALTER TABLE gateways ADD COLUMN IF NOT EXISTS last_source_created_at TIMESTAMPTZ;
ALTER TABLE gateways ADD COLUMN IF NOT EXISTS last_source_created_at_us NUMERIC;
ALTER TABLE gateways ADD COLUMN IF NOT EXISTS status_payload JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE gateways ADD COLUMN IF NOT EXISTS topology_payload JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE gateways ADD COLUMN IF NOT EXISTS known_racks INT NOT NULL DEFAULT 0;
ALTER TABLE gateways ADD COLUMN IF NOT EXISTS connected_racks INT NOT NULL DEFAULT 0;
ALTER TABLE gateways ADD COLUMN IF NOT EXISTS stale_racks INT NOT NULL DEFAULT 0;
ALTER TABLE gateways ADD COLUMN IF NOT EXISTS disconnected_racks INT NOT NULL DEFAULT 0;
ALTER TABLE gateways ADD COLUMN IF NOT EXISTS blocked_racks INT NOT NULL DEFAULT 0;
ALTER TABLE gateways ADD COLUMN IF NOT EXISTS unidentified_connections INT NOT NULL DEFAULT 0;
ALTER TABLE gateways ADD COLUMN IF NOT EXISTS active_tcp_connections INT NOT NULL DEFAULT 0;

ALTER TABLE racks ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE racks ADD COLUMN IF NOT EXISTS data_current BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE racks ADD COLUMN IF NOT EXISTS current_ip TEXT;
ALTER TABLE racks ADD COLUMN IF NOT EXISTS last_known_ip TEXT;
ALTER TABLE racks ADD COLUMN IF NOT EXISTS connection_reason TEXT;
ALTER TABLE racks ADD COLUMN IF NOT EXISTS connection_payload JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE racks ADD COLUMN IF NOT EXISTS telemetry_payload JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE racks ADD COLUMN IF NOT EXISTS health_payload JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE racks ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;
ALTER TABLE racks ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMPTZ;
ALTER TABLE racks ADD COLUMN IF NOT EXISTS last_gateway_sequence BIGINT NOT NULL DEFAULT -1;
ALTER TABLE racks ADD COLUMN IF NOT EXISTS last_gateway_boot_id TEXT NOT NULL DEFAULT '';
ALTER TABLE racks ADD COLUMN IF NOT EXISTS last_source_created_at TIMESTAMPTZ;
ALTER TABLE racks ADD COLUMN IF NOT EXISTS last_source_created_at_us NUMERIC;
ALTER TABLE racks ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;

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
ALTER TABLE rack_inventory_slots ADD COLUMN IF NOT EXISTS card_type_code INT;
ALTER TABLE rack_inventory_slots ADD COLUMN IF NOT EXISTS sensor_code INT;
ALTER TABLE rack_inventory_slots ADD COLUMN IF NOT EXISTS sensor TEXT;
ALTER TABLE rack_inventory_slots ADD COLUMN IF NOT EXISTS unit_code INT;
ALTER TABLE rack_inventory_slots ADD COLUMN IF NOT EXISTS unit TEXT;
ALTER TABLE rack_inventory_slots ADD COLUMN IF NOT EXISTS decimal_places INT;
ALTER TABLE rack_inventory_slots ADD COLUMN IF NOT EXISTS slot_payload JSONB NOT NULL DEFAULT '{}'::jsonb;

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
CREATE INDEX IF NOT EXISTS rack_slot_latest_rack ON rack_slot_latest (gateway_id, rack_id, slot_number);

CREATE TABLE IF NOT EXISTS mqtt_ingest_metrics (
  metric_name TEXT PRIMARY KEY,
  metric_value BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
