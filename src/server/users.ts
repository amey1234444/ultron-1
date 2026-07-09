import bcrypt from 'bcryptjs';

import { isRole, isUserPermission, USER_PERMISSIONS, type PublicUser, type Role, type UserPermission } from '../lib/roles';

export type StoredUser = PublicUser & { passwordHash: string };

// In-memory user store, seeded once per server instance. This works out of the
// box on Vercel; super-admin edits persist for the life of a running instance.
// For durable persistence across cold starts, swap this module for a DB-backed
// implementation (see README — set DATABASE_URL and implement the same API).
type Store = { users: StoredUser[] };

const globalRef = globalThis as unknown as { __ultronUserStore?: Store };

function id(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function seed(): Store {
  const now = new Date().toISOString();
  const seeds: Array<{ username: string; name: string; email: string; role: Role; password: string }> = [
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

  return {
    users: seeds.map((s) => ({
      id: id(),
      username: s.username,
      name: s.name,
      email: s.email,
      role: s.role,
      permissions: s.role === 'super_admin' ? [USER_PERMISSIONS.SCHEMA_EDIT_DELETE] : [],
      createdAt: now,
      lastLoginAt: null,
      lastSeenAt: null,
      passwordHash: bcrypt.hashSync(s.password, 10),
    })),
  };
}

function store(): Store {
  if (!globalRef.__ultronUserStore) {
    globalRef.__ultronUserStore = seed();
  }
  return globalRef.__ultronUserStore;
}

export function toPublic(u: StoredUser): PublicUser {
  const { passwordHash: _passwordHash, ...pub } = u;
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

export function listUsers(): PublicUser[] {
  return store().users.map(toPublic);
}

export function findById(userId: string): StoredUser | undefined {
  return store().users.find((u) => u.id === userId);
}

export function findByUsername(username: string): StoredUser | undefined {
  const key = username.trim().toLowerCase();
  return store().users.find((u) => u.username.toLowerCase() === key);
}

export async function verifyCredentials(username: string, password: string): Promise<StoredUser | null> {
  const user = findByUsername(username);
  if (!user) return null;
  const ok = await bcrypt.compare(password, user.passwordHash);
  return ok ? user : null;
}

// Stamp a successful login: records both the login time and initial activity.
export function recordLogin(userId: string): void {
  const user = findById(userId);
  if (!user) return;
  const now = new Date().toISOString();
  user.lastLoginAt = now;
  user.lastSeenAt = now;
}

// Refresh the user's activity heartbeat (drives live "online" status).
export function touchLastSeen(userId: string): void {
  const user = findById(userId);
  if (!user) return;
  user.lastSeenAt = new Date().toISOString();
}

export type CreateUserInput = {
  username: string;
  name: string;
  email: string;
  role: Role;
  password: string;
  permissions?: UserPermission[];
};

export async function createUser(input: CreateUserInput): Promise<PublicUser> {
  const username = input.username.trim();
  if (!username) throw new ApiError(400, 'Username is required.');
  if (!input.password || input.password.length < 6) {
    throw new ApiError(400, 'Password must be at least 6 characters.');
  }
  if (!isRole(input.role)) throw new ApiError(400, 'Invalid role.');
  if (findByUsername(username)) throw new ApiError(409, 'Username already exists.');

  const user: StoredUser = {
    id: id(),
    username,
    name: input.name.trim() || username,
    email: input.email.trim(),
    role: input.role,
    permissions: normalizePermissions(input.permissions, input.role),
    createdAt: new Date().toISOString(),
    lastLoginAt: null,
    lastSeenAt: null,
    passwordHash: await bcrypt.hash(input.password, 10),
  };
  store().users.push(user);
  return toPublic(user);
}

export type UpdateUserInput = Partial<{
  name: string;
  email: string;
  role: Role;
  password: string;
  permissions: UserPermission[];
}>;

export async function updateUser(userId: string, patch: UpdateUserInput): Promise<PublicUser> {
  const user = findById(userId);
  if (!user) throw new ApiError(404, 'User not found.');

  if (patch.name !== undefined) user.name = patch.name.trim() || user.name;
  if (patch.email !== undefined) user.email = patch.email.trim();
  if (patch.role !== undefined) {
    if (!isRole(patch.role)) throw new ApiError(400, 'Invalid role.');
    if (user.role === 'super_admin' && patch.role !== 'super_admin') {
      const remainingSupers = store().users.filter((u) => u.role === 'super_admin' && u.id !== userId).length;
      if (remainingSupers === 0) throw new ApiError(400, 'Cannot demote the last super admin.');
    }
    user.role = patch.role;
    user.permissions = normalizePermissions(user.permissions, user.role);
  }
  if (patch.permissions !== undefined) {
    user.permissions = normalizePermissions(patch.permissions, user.role);
  }
  if (patch.password !== undefined && patch.password !== '') {
    if (patch.password.length < 6) throw new ApiError(400, 'Password must be at least 6 characters.');
    user.passwordHash = await bcrypt.hash(patch.password, 10);
  }
  return toPublic(user);
}

export function deleteUser(userId: string): void {
  const s = store();
  const idx = s.users.findIndex((u) => u.id === userId);
  if (idx === -1) throw new ApiError(404, 'User not found.');
  const remainingSupers = s.users.filter((u) => u.role === 'super_admin' && u.id !== userId).length;
  if (s.users[idx].role === 'super_admin' && remainingSupers === 0) {
    throw new ApiError(400, 'Cannot delete the last super admin.');
  }
  s.users.splice(idx, 1);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
