-- Enforce one account per email address (case-insensitive).
-- Idempotent: safe for existing deployments; never drops or truncates data.

-- Lowercased shadow column powering case-insensitive uniqueness (mirrors
-- username_lc). Backfilled from any existing addresses.
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_lc TEXT NOT NULL DEFAULT '';
UPDATE users SET email_lc = lower(btrim(email)) WHERE email_lc IS DISTINCT FROM lower(btrim(email));

-- Partial unique index: blank emails are exempt so legacy rows without an
-- address don't collide. Build may fail if duplicate emails already exist —
-- dedupe those rows, then re-run this migration.
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lc_unique ON users (email_lc) WHERE email_lc <> '';
