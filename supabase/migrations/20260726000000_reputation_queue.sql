-- Unified email-reputation store + durable, rate-limited request queue.
-- Mirrors the runtime schema initialization in src/server/db.ts.

-- ONE row per email holding the latest verdict and the FULL Abstract API
-- response for acceptable, not_acceptable, unknown and overridden emails alike.
-- `allowed` = signup permitted (everything except an active rejection).
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
CREATE INDEX IF NOT EXISTS email_reputation_recent ON email_reputation (updated_at DESC);
CREATE INDEX IF NOT EXISTS email_reputation_status ON email_reputation (status);

-- Forward-migrate any legacy rejected rows into the unified table (idempotent).
INSERT INTO email_reputation (email, email_lc, status, allowed, reasons, detail, response, checked_at, overridden_at, created_at, updated_at)
SELECT email, email_lc,
       CASE WHEN overridden_at IS NOT NULL THEN 'overridden' ELSE 'not_acceptable' END,
       overridden_at IS NOT NULL,
       reasons, detail, response, created_at, overridden_at, created_at, created_at
FROM rejected_email_reputation
ON CONFLICT (email_lc) DO NOTHING;

-- Durable work queue for Abstract API calls. Signups / manual re-checks enqueue
-- here; a single-flight worker drains it at <= 1 request/second.
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
CREATE INDEX IF NOT EXISTS reputation_queue_pending ON reputation_queue (state, created_at);

-- At most one active (pending/processing) job per email.
CREATE UNIQUE INDEX IF NOT EXISTS reputation_queue_active_email
  ON reputation_queue (email_lc) WHERE state IN ('pending', 'processing');
