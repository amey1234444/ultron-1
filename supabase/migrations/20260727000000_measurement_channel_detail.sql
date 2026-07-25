-- Per-channel detail a real controller reports next to the value. The CC v3
-- frame carries the sensor, the card type, alert/danger thresholds and the
-- alarm state per channel; the simulator omits them and they stay null.
-- Mirrors src/server/db.ts.

ALTER TABLE measurement_latest ADD COLUMN IF NOT EXISTS card_type TEXT;
ALTER TABLE measurement_latest ADD COLUMN IF NOT EXISTS sensor TEXT;
ALTER TABLE measurement_latest ADD COLUMN IF NOT EXISTS freshness TEXT NOT NULL DEFAULT 'FRESH';
ALTER TABLE measurement_latest ADD COLUMN IF NOT EXISTS channel_status TEXT;
ALTER TABLE measurement_latest ADD COLUMN IF NOT EXISTS alert_threshold DOUBLE PRECISION;
ALTER TABLE measurement_latest ADD COLUMN IF NOT EXISTS danger_threshold DOUBLE PRECISION;
ALTER TABLE measurement_latest ADD COLUMN IF NOT EXISTS alert_state TEXT NOT NULL DEFAULT 'INACTIVE';
ALTER TABLE measurement_latest ADD COLUMN IF NOT EXISTS danger_state TEXT NOT NULL DEFAULT 'INACTIVE';

ALTER TABLE measurement_history ADD COLUMN IF NOT EXISTS card_type TEXT;
ALTER TABLE measurement_history ADD COLUMN IF NOT EXISTS sensor TEXT;
ALTER TABLE measurement_history ADD COLUMN IF NOT EXISTS freshness TEXT NOT NULL DEFAULT 'FRESH';
ALTER TABLE measurement_history ADD COLUMN IF NOT EXISTS channel_status TEXT;
ALTER TABLE measurement_history ADD COLUMN IF NOT EXISTS alert_threshold DOUBLE PRECISION;
ALTER TABLE measurement_history ADD COLUMN IF NOT EXISTS danger_threshold DOUBLE PRECISION;
ALTER TABLE measurement_history ADD COLUMN IF NOT EXISTS alert_state TEXT NOT NULL DEFAULT 'INACTIVE';
ALTER TABLE measurement_history ADD COLUMN IF NOT EXISTS danger_state TEXT NOT NULL DEFAULT 'INACTIVE';
