-- Email reputation gate (Abstract Email Reputation API).
-- Mirrors the runtime schema initialization in src/server/db.ts.

-- Accepted signups carry their reputation verdict + full API response so the
-- super admin can review it in Manage Users.
ALTER TABLE users ADD COLUMN IF NOT EXISTS reputation_status TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE users ADD COLUMN IF NOT EXISTS reputation_score DOUBLE PRECISION;
ALTER TABLE users ADD COLUMN IF NOT EXISTS reputation_checked_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS reputation_data JSONB;

-- Emails whose reputation was judged not-acceptable. Checked BEFORE calling the
-- paid API on future signups; a hit short-circuits and rejects without a call.
-- overridden_at records a manual super-admin override that re-enables signup.
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

CREATE INDEX IF NOT EXISTS rejected_email_reputation_recent ON rejected_email_reputation (created_at DESC);
