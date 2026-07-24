import bcrypt from 'bcryptjs';

import {
  isRole,
  isReputationStatus,
  isUserPermission,
  isUserStatus,
  USER_PERMISSIONS,
  type PublicUser,
  type ReputationStatus,
  type Role,
  type UserPermission,
  type UserStatus,
} from '../lib/roles';
import { ensureSchema, isDbEnabled, query } from './db';
import { ApiError } from './errors';

export { ApiError };

// `reputationData` holds the complete raw reputation API response for the
// super-admin detail view. It is intentionally NOT part of PublicUser, so
// toPublic() strips it alongside the password hash.
export type StoredUser = PublicUser & { passwordHash: string; reputationData: unknown | null };

// Reputation metadata attached to a user at creation time.
export type UserReputation = {
  status: ReputationStatus;
  score: number | null;
  checkedAt: string | null;
  data: unknown | null;
};

// Pragmatic email shape check: exactly one @, non-empty local/domain parts, and
// a dotted domain. Deliberately permissive — the goal is to reject obvious junk,
// not to fully validate deliverability.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 254;

// Canonical key used for case-insensitive uniqueness (mirrors username_lc).
function emailKey(email: string): string {
  return email.trim().toLowerCase();
}

function assertValidEmail(email: string): void {
  if (!email) throw new ApiError(400, 'Email is required.');
  if (email.length > MAX_EMAIL_LENGTH || !EMAIL_RE.test(email)) {
    throw new ApiError(400, 'Enter a valid email address.');
  }
}

// A Postgres unique-constraint violation. Guards the narrow race where two
// concurrent requests pass the pre-check and both attempt to insert.
function uniqueViolationMessage(err: unknown): string | null {
  const e = err as { code?: string; constraint?: string } | null;
  if (!e || typeof e !== 'object' || e.code !== '23505') return null;
  const constraint = e.constraint ?? '';
  if (constraint.includes('email')) return 'An account with this email already exists.';
  if (constraint.includes('username')) return 'Username already exists.';
  return 'An account with these details already exists.';
}

// Production uses durable Supabase/PostgreSQL storage. Local dev / CI without a
// DATABASE_URL may use the in-memory seed store; production fails closed.
type Store = { users: StoredUser[] };

const globalRef = globalThis as unknown as { __ultronUserStore?: Store; __ultronSeeded?: boolean };

function id(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

type Seed = { username: string; name: string; email: string; role: Role; password: string };

function seedSpecs(): Seed[] {
  return [
    {
      username: 'superadmin',
      name: 'Super Admin',
      email: 'superadmin@ultron.local',
      role: 'super_admin',
      password: process.env.SUPER_ADMIN_PASSWORD || 'superadmin123',
    },
    {
      username: 'admin',
      name: 'Admin',
      email: 'admin@ultron.local',
      role: 'admin',
      password: process.env.ADMIN_PASSWORD || 'admin123',
    },
    {
      username: 'user',
      name: 'User',
      email: 'user@ultron.local',
      role: 'user',
      password: process.env.USER_PASSWORD || 'user123',
    },
  ];
}

function buildSeedUser(s: Seed): StoredUser {
  const now = new Date().toISOString();
  return {
    id: id(),
    username: s.username,
    name: s.name,
    email: s.email,
    role: s.role,
    // Seed accounts are provisioned by the operator, so they are active out of
    // the box; only self-service signups arrive as `pending`.
    status: 'active',
    permissions: s.role === 'super_admin' ? [USER_PERMISSIONS.SCHEMA_EDIT_DELETE] : [],
    createdAt: now,
    lastLoginAt: null,
    lastSeenAt: null,
    reputationStatus: 'unknown',
    reputationScore: null,
    reputationCheckedAt: null,
    reputationData: null,
    passwordHash: bcrypt.hashSync(s.password, 10),
  };
}

// -- in-memory backend ------------------------------------------------------

function memStore(): Store {
  if (!globalRef.__ultronUserStore) {
    globalRef.__ultronUserStore = { users: seedSpecs().map(buildSeedUser) };
  }
  return globalRef.__ultronUserStore;
}

// -- shared helpers ---------------------------------------------------------

export function toPublic(u: StoredUser): PublicUser {
  const { passwordHash: _passwordHash, reputationData: _reputationData, ...pub } = u;
  return {
    ...pub,
    permissions: normalizePermissions(pub.permissions, pub.role),
  };
}

function normalizePermissions(permissions: unknown, role: Role): UserPermission[] {
  if (role === 'super_admin') return [USER_PERMISSIONS.SCHEMA_EDIT_DELETE];
  if (!Array.isArray(permissions)) return [];
  return permissions.filter(isUserPermission);
}

// Ensure the DB schema exists and seed accounts are present. Idempotent.
async function ready(): Promise<void> {
  if (!isDbEnabled()) {
    if (process.env.NODE_ENV === 'production') {
      throw new ApiError(503, 'Supabase DATABASE_URL is required.');
    }
    memStore();
    return;
  }
  await ensureSchema();
  if (globalRef.__ultronSeeded) return;
  for (const spec of seedSpecs()) {
    const existing = await query('SELECT id FROM users WHERE username_lc = $1', [spec.username.toLowerCase()]);
    if (existing.rowCount === 0) {
      await insertRow(buildSeedUser(spec));
    }
  }
  globalRef.__ultronSeeded = true;
}

// -- row mapping (DB) -------------------------------------------------------

type UserRow = {
  id: string;
  username: string;
  name: string;
  email: string;
  email_lc: string;
  role: string;
  status: string;
  permissions: unknown;
  password_hash: string;
  created_at: Date | string;
  last_login_at: Date | string | null;
  last_seen_at: Date | string | null;
  reputation_status: string | null;
  reputation_score: number | string | null;
  reputation_checked_at: Date | string | null;
  reputation_data: unknown | null;
};

function iso(v: Date | string | null): string | null {
  if (v === null) return null;
  return v instanceof Date ? v.toISOString() : new Date(v).toISOString();
}

function rowToStored(r: UserRow): StoredUser {
  const role = isRole(r.role) ? r.role : 'user';
  return {
    id: r.id,
    username: r.username,
    name: r.name,
    email: r.email,
    role,
    status: isUserStatus(r.status) ? r.status : 'pending',
    permissions: normalizePermissions(r.permissions, role),
    createdAt: iso(r.created_at) ?? new Date().toISOString(),
    lastLoginAt: iso(r.last_login_at),
    lastSeenAt: iso(r.last_seen_at),
    reputationStatus: isReputationStatus(r.reputation_status) ? r.reputation_status : 'unknown',
    reputationScore: r.reputation_score === null || r.reputation_score === undefined ? null : Number(r.reputation_score),
    reputationCheckedAt: iso(r.reputation_checked_at),
    reputationData: r.reputation_data ?? null,
    passwordHash: r.password_hash,
  };
}

async function insertRow(u: StoredUser): Promise<void> {
  await query(
    `INSERT INTO users (id, username, username_lc, name, email, email_lc, role, status, permissions, password_hash, created_at, last_login_at, last_seen_at, reputation_status, reputation_score, reputation_checked_at, reputation_data)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13,$14,$15,$16,$17::jsonb)`,
    [
      u.id,
      u.username,
      u.username.toLowerCase(),
      u.name,
      u.email,
      emailKey(u.email),
      u.role,
      u.status,
      JSON.stringify(u.permissions),
      u.passwordHash,
      u.createdAt,
      u.lastLoginAt,
      u.lastSeenAt,
      u.reputationStatus,
      u.reputationScore,
      u.reputationCheckedAt,
      JSON.stringify(u.reputationData ?? null),
    ],
  );
}

// -- public API -------------------------------------------------------------

export async function listUsers(): Promise<PublicUser[]> {
  await ready();
  if (!isDbEnabled()) return memStore().users.map(toPublic);
  const res = await query<UserRow>('SELECT * FROM users ORDER BY created_at ASC');
  return res.rows.map(rowToStored).map(toPublic);
}

export async function findById(userId: string): Promise<StoredUser | undefined> {
  await ready();
  if (!isDbEnabled()) return memStore().users.find((u) => u.id === userId);
  const res = await query<UserRow>('SELECT * FROM users WHERE id = $1', [userId]);
  return res.rows[0] ? rowToStored(res.rows[0]) : undefined;
}

export async function findByUsername(username: string): Promise<StoredUser | undefined> {
  await ready();
  const key = username.trim().toLowerCase();
  if (!isDbEnabled()) return memStore().users.find((u) => u.username.toLowerCase() === key);
  const res = await query<UserRow>('SELECT * FROM users WHERE username_lc = $1', [key]);
  return res.rows[0] ? rowToStored(res.rows[0]) : undefined;
}

export async function findByEmail(email: string): Promise<StoredUser | undefined> {
  await ready();
  const key = emailKey(email);
  if (!key) return undefined;
  if (!isDbEnabled()) return memStore().users.find((u) => emailKey(u.email) === key);
  const res = await query<UserRow>('SELECT * FROM users WHERE email_lc = $1', [key]);
  return res.rows[0] ? rowToStored(res.rows[0]) : undefined;
}

export async function verifyCredentials(username: string, password: string): Promise<StoredUser | null> {
  const user = await findByUsername(username);
  if (!user) return null;
  const ok = await bcrypt.compare(password, user.passwordHash);
  return ok ? user : null;
}

// Stamp a successful login: records both the login time and initial activity.
export async function recordLogin(userId: string): Promise<void> {
  const now = new Date().toISOString();
  if (!isDbEnabled()) {
    const user = memStore().users.find((u) => u.id === userId);
    if (user) {
      user.lastLoginAt = now;
      user.lastSeenAt = now;
    }
    return;
  }
  await query('UPDATE users SET last_login_at = $2, last_seen_at = $2 WHERE id = $1', [userId, now]);
}

// Refresh the user's activity heartbeat (drives live "online" status).
export async function touchLastSeen(userId: string): Promise<void> {
  const now = new Date().toISOString();
  if (!isDbEnabled()) {
    const user = memStore().users.find((u) => u.id === userId);
    if (user) user.lastSeenAt = now;
    return;
  }
  await query('UPDATE users SET last_seen_at = $2 WHERE id = $1', [userId, now]);
}

export type CreateUserInput = {
  username: string;
  name: string;
  email: string;
  role: Role;
  password: string;
  permissions?: UserPermission[];
  status?: UserStatus;
  reputation?: UserReputation;
};

export async function createUser(input: CreateUserInput): Promise<PublicUser> {
  await ready();
  const username = input.username.trim();
  if (!username) throw new ApiError(400, 'Username is required.');
  if (!/^[a-zA-Z0-9._-]{3,32}$/.test(username)) {
    throw new ApiError(400, 'Username must be 3-32 characters (letters, numbers, . _ -).');
  }
  if (!input.password || input.password.length < 8) {
    throw new ApiError(400, 'Password must be at least 8 characters.');
  }
  if (!isRole(input.role)) throw new ApiError(400, 'Invalid role.');
  const email = input.email.trim();
  assertValidEmail(email);
  if (await findByUsername(username)) throw new ApiError(409, 'Username already exists.');
  if (await findByEmail(email)) throw new ApiError(409, 'An account with this email already exists.');

  const now = new Date().toISOString();
  const user: StoredUser = {
    id: id(),
    username,
    name: input.name.trim() || username,
    email,
    role: input.role,
    status: input.status ?? 'pending',
    permissions: normalizePermissions(input.permissions, input.role),
    createdAt: now,
    lastLoginAt: null,
    lastSeenAt: null,
    reputationStatus: input.reputation?.status ?? 'unknown',
    reputationScore: input.reputation?.score ?? null,
    reputationCheckedAt: input.reputation?.checkedAt ?? null,
    reputationData: input.reputation?.data ?? null,
    passwordHash: await bcrypt.hash(input.password, 10),
  };

  try {
    if (!isDbEnabled()) {
      memStore().users.push(user);
    } else {
      await insertRow(user);
    }
  } catch (err) {
    const message = uniqueViolationMessage(err);
    if (message) throw new ApiError(409, message);
    throw err;
  }
  return toPublic(user);
}

export type UpdateUserInput = Partial<{
  name: string;
  email: string;
  role: Role;
  status: UserStatus;
  password: string;
  permissions: UserPermission[];
}>;

async function countOtherSuperAdmins(excludeId: string): Promise<number> {
  if (!isDbEnabled()) {
    return memStore().users.filter((u) => u.role === 'super_admin' && u.id !== excludeId).length;
  }
  const res = await query<{ n: string }>(
    "SELECT COUNT(*)::text AS n FROM users WHERE role = 'super_admin' AND id <> $1",
    [excludeId],
  );
  return Number(res.rows[0]?.n ?? '0');
}

export async function updateUser(userId: string, patch: UpdateUserInput): Promise<PublicUser> {
  await ready();
  const user = await findById(userId);
  if (!user) throw new ApiError(404, 'User not found.');

  if (patch.name !== undefined) user.name = patch.name.trim() || user.name;
  if (patch.email !== undefined) {
    const email = patch.email.trim();
    if (email) {
      assertValidEmail(email);
      const existing = await findByEmail(email);
      if (existing && existing.id !== user.id) {
        throw new ApiError(409, 'An account with this email already exists.');
      }
    }
    user.email = email;
  }
  if (patch.role !== undefined) {
    if (!isRole(patch.role)) throw new ApiError(400, 'Invalid role.');
    if (user.role === 'super_admin' && patch.role !== 'super_admin') {
      if ((await countOtherSuperAdmins(userId)) === 0) throw new ApiError(400, 'Cannot demote the last super admin.');
    }
    user.role = patch.role;
    user.permissions = normalizePermissions(user.permissions, user.role);
  }
  if (patch.status !== undefined) {
    if (!isUserStatus(patch.status)) throw new ApiError(400, 'Invalid status.');
    if (user.role === 'super_admin' && patch.status !== 'active') {
      if ((await countOtherSuperAdmins(userId)) === 0) throw new ApiError(400, 'Cannot disable the last super admin.');
    }
    user.status = patch.status;
  }
  if (patch.permissions !== undefined) {
    user.permissions = normalizePermissions(patch.permissions, user.role);
  }
  if (patch.password !== undefined && patch.password !== '') {
    if (patch.password.length < 8) throw new ApiError(400, 'Password must be at least 8 characters.');
    user.passwordHash = await bcrypt.hash(patch.password, 10);
  }

  if (!isDbEnabled()) {
    // memStore held a reference; nothing else to persist.
  } else {
    try {
      await query(
        `UPDATE users SET name = $2, email = $3, email_lc = $4, role = $5, status = $6, permissions = $7::jsonb, password_hash = $8 WHERE id = $1`,
        [
          user.id,
          user.name,
          user.email,
          emailKey(user.email),
          user.role,
          user.status,
          JSON.stringify(user.permissions),
          user.passwordHash,
        ],
      );
    } catch (err) {
      const message = uniqueViolationMessage(err);
      if (message) throw new ApiError(409, message);
      throw err;
    }
  }
  return toPublic(user);
}

export async function deleteUser(userId: string): Promise<void> {
  await ready();
  const user = await findById(userId);
  if (!user) throw new ApiError(404, 'User not found.');
  if (user.role === 'super_admin' && (await countOtherSuperAdmins(userId)) === 0) {
    throw new ApiError(400, 'Cannot delete the last super admin.');
  }
  if (!isDbEnabled()) {
    const s = memStore();
    const idx = s.users.findIndex((u) => u.id === userId);
    if (idx !== -1) s.users.splice(idx, 1);
    return;
  }
  await query('DELETE FROM users WHERE id = $1', [userId]);
}

// Stamp a reputation verdict onto every account that shares an email. Called by
// the reputation queue worker once the (rate-limited) Abstract API call for that
// email completes, so the Manage Users row reflects the real verdict.
export async function applyReputationByEmail(email: string, rep: UserReputation): Promise<void> {
  const key = emailKey(email);
  if (!key) return;
  if (!isDbEnabled()) {
    for (const u of memStore().users) {
      if (emailKey(u.email) === key) {
        u.reputationStatus = rep.status;
        u.reputationScore = rep.score;
        u.reputationCheckedAt = rep.checkedAt;
        u.reputationData = rep.data ?? null;
      }
    }
    return;
  }
  await query(
    `UPDATE users SET reputation_status = $2, reputation_score = $3, reputation_checked_at = $4, reputation_data = $5::jsonb
     WHERE email_lc = $1`,
    [key, rep.status, rep.score, rep.checkedAt, JSON.stringify(rep.data ?? null)],
  );
}

// Full reputation record (including the complete raw API response) for a single
// user. Restricted to super admins at the route layer — the raw response can
// contain breach / risk data that must not reach ordinary callers.
export async function getUserReputation(userId: string): Promise<UserReputation | null> {
  const user = await findById(userId);
  if (!user) return null;
  return {
    status: user.reputationStatus,
    score: user.reputationScore,
    checkedAt: user.reputationCheckedAt,
    data: user.reputationData ?? null,
  };
}


