// Session check for the live WebSocket upgrade.
//
// The browser leg used to be authorized by a shared token baked into the client
// bundle (NEXT_PUBLIC_ULTRON_LIVE_WS_TOKEN), which is what a separate ingest
// service had to do — it had no way to read the app's session. Now that ingest
// runs inside the application, the socket can be gated by the same
// `ultron_session` cookie every API route uses, so a live subscription is worth
// exactly as much as a login and no more.
//
// This deliberately re-implements the small part of src/server/session.ts it
// needs rather than importing it: that module is TypeScript compiled by Next,
// while this runs in the plain Node server process.

import { createHash } from 'node:crypto';

import { query } from './db.mjs';

const COOKIE_NAME = 'ultron_session';

function cookieValue(header, name) {
  if (!header) return null;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    if (part.slice(0, index).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(index + 1).trim());
    } catch {
      return part.slice(index + 1).trim();
    }
  }
  return null;
}

// Returns the user id, or null when the request carries no usable session.
// Rejects rather than passes when the database is unreachable: a live feed of
// plant telemetry is not something to open up on a failed lookup.
export async function sessionUserId(req) {
  const token = cookieValue(req.headers?.cookie, COOKIE_NAME);
  if (!token) return null;
  const hash = createHash('sha256').update(token).digest('hex');
  try {
    const result = await query(
      `SELECT s.user_id
         FROM auth_sessions s
         JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = $1
          AND s.revoked_at IS NULL
          AND s.expires_at > now()
          AND u.status = 'active'`,
      [hash],
    );
    return result.rows[0]?.user_id ?? null;
  } catch (err) {
    console.error('[ws:auth] session lookup failed', err.message);
    return null;
  }
}
