import crypto from 'crypto';

import { serialize, parse } from 'cookie';
import jwt from 'jsonwebtoken';
import type { NextApiRequest, NextApiResponse } from 'next';

import type { Role } from '../lib/roles';
import { ApiError, findById, toPublic, type StoredUser } from './users';
import type { PublicUser } from '../lib/roles';

const COOKIE_NAME = 'ultron_session';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

let ephemeralSecret: string | null = null;

function secret(): string {
  if (process.env.AUTH_SECRET) return process.env.AUTH_SECRET;
  // Never fall back to a hardcoded, source-visible key in production — that would
  // let anyone forge sessions. Use a random per-instance key instead (sessions then
  // don't survive restarts until AUTH_SECRET is configured — set it in Vercel).
  if (process.env.NODE_ENV === 'production') {
    if (!ephemeralSecret) ephemeralSecret = crypto.randomBytes(48).toString('hex');
    return ephemeralSecret;
  }
  return 'ultron-dev-secret-change-me';
}

type TokenPayload = { sub: string; role: Role };

export function issueSession(res: NextApiResponse, user: StoredUser): void {
  const token = jwt.sign({ sub: user.id, role: user.role } satisfies TokenPayload, secret(), {
    expiresIn: MAX_AGE_SECONDS,
  });
  res.setHeader(
    'Set-Cookie',
    serialize(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: MAX_AGE_SECONDS,
    }),
  );
}

export function clearSession(res: NextApiResponse): void {
  res.setHeader(
    'Set-Cookie',
    serialize(COOKIE_NAME, '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    }),
  );
}

export function getSessionUser(req: NextApiRequest): PublicUser | null {
  const header = req.headers.cookie;
  if (!header) return null;
  const token = parse(header)[COOKIE_NAME];
  if (!token) return null;
  try {
    const payload = jwt.verify(token, secret()) as TokenPayload;
    const user = findById(payload.sub);
    return user ? toPublic(user) : null;
  } catch {
    return null;
  }
}

// Throws ApiError(401/403) unless the caller is authenticated with >= minRole.
export function requireUser(req: NextApiRequest, minRole?: Role): PublicUser {
  const user = getSessionUser(req);
  if (!user) throw new ApiError(401, 'Not authenticated.');
  if (minRole && !hasAtLeastRank(user.role, minRole)) throw new ApiError(403, 'Forbidden.');
  return user;
}

function hasAtLeastRank(role: Role, min: Role): boolean {
  const rank: Record<Role, number> = { user: 1, admin: 2, super_admin: 3 };
  return rank[role] >= rank[min];
}
