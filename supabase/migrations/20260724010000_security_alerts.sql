-- Security alarms surfaced to super admins (duplicate-email signup probing,
-- rate-limit / signup-limit breaches).
-- Idempotent: safe for existing deployments; never drops or truncates data.

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
CREATE INDEX IF NOT EXISTS security_alerts_recent ON security_alerts (created_at DESC);
CREATE INDEX IF NOT EXISTS security_alerts_dedup ON security_alerts (kind, email, ip, bucket, created_at);
