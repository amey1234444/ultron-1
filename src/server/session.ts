import crypto from 'crypto';

import { serialize, parse } from 'cookie';
import type { NextApiRequest, NextApiResponse } from 'next';

import type { Role, PublicUser } from '../lib/roles';
import { ensureSchema, isDbEnabled, query } from './db';
import { ApiError, findById, toPublic, type StoredUser } from './users';

const COOKIE_NAME = 'ultron_session';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

// Development-only fallback for `npm run dev` without DATABASE_URL. Production
// authentication is always Supabase/PostgreSQL-backed and fails closed when the
// connection string is missing.
type DevSession = { userId: string; expiresAt: number };
const globalRef = globalThis as unknown as { __ultronDevSessions?: Map<string, DevSession> };
function devSessions(): Map<string, DevSession> {
  if (!globalRef.__ultronDevSessions) globalRef.__ultronDevSessions = new Map();
  return globalRef.__ultronDevSessions;
}

function tokenHash(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function sessionToken(req: NextApiRequest): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  return parse(header)[COOKIE_NAME] ?? null;
}

function sessionCookie(token: string, maxAge: number) {
  return serialize(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge,
  });
}

// Create an opaque random session. The browser gets the raw token; PostgreSQL
// stores only its hash, tied to the user and a durable expiry.
export async function issueSession(res: NextApiResponse, user: StoredUser): Promise<void> {
  const token = crypto.randomBytes(48).toString('base64url');
  const expiresAt = new Date(Date.now() + MAX_AGE_SECONDS * 1000);
  if (!isDbEnabled()) {
    if (process.env.NODE_ENV === 'production') throw new ApiError(503, 'Supabase DATABASE_URL is required.');
    devSessions().set(tokenHash(token), { userId: user.id, expiresAt: expiresAt.getTime() });
  } else {
    await ensureSchema();
    await query(
      `INSERT INTO auth_sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)`,
      [tokenHash(token), user.id, expiresAt.toISOString()],
    );
    // Opportunistic cleanup of old rows.
    await query(`DELETE FROM auth_sessions WHERE expires_at <= now() OR revoked_at IS NOT NULL`);
  }
  res.setHeader('Set-Cookie', sessionCookie(token, MAX_AGE_SECONDS));
}

export async function clearSession(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  const token = sessionToken(req);
  if (token) {
    const hash = tokenHash(token);
    if (isDbEnabled()) {
      await ensureSchema();
      await query('UPDATE auth_sessions SET revoked_at = now() WHERE token_hash = $1', [hash]);
    } else {
      devSessions().delete(hash);
    }
  }
  res.setHeader('Set-Cookie', sessionCookie('', 0));
}

export async function getSessionUser(req: NextApiRequest): Promise<PublicUser | null> {
  const token = sessionToken(req);
  if (!token) return null;
  const hash = tokenHash(token);

  let userId: string | null = null;
  if (!isDbEnabled()) {
    if (process.env.NODE_ENV === 'production') return null;
    const session = devSessions().get(hash);
    if (!session || session.expiresAt <= Date.now()) {
      devSessions().delete(hash);
      return null;
    }
    userId = session.userId;
  } else {
    await ensureSchema();
    const result = await query<{ user_id: string }>(
      `UPDATE auth_sessions
       SET last_seen_at = now()
       WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()
       RETURNING user_id`,
      [hash],
    );
    userId = result.rows[0]?.user_id ?? null;
  }
  if (!userId) return null;

  const user = await findById(userId);
  if (!user || user.status !== 'active') return null;
  return toPublic(user);
}

// Throws ApiError(401/403) unless the caller is authenticated with >= minRole.
export async function requireUser(req: NextApiRequest, minRole?: Role): Promise<PublicUser> {
  const user = await getSessionUser(req);
  if (!user) throw new ApiError(401, 'Not authenticated.');
  if (minRole && !hasAtLeastRank(user.role, minRole)) throw new ApiError(403, 'Forbidden.');
  return user;
}

function hasAtLeastRank(role: Role, min: Role): boolean {
  const rank: Record<Role, number> = { user: 1, admin: 2, super_admin: 3 };
  return rank[role] >= rank[min];
}
