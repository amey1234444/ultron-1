// Role model shared by client and server. Three levels, ranked so a higher rank
// implies every capability of the ranks below it.
export const ROLES = ['user', 'admin', 'super_admin'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_RANK: Record<Role, number> = {
  user: 1,
  admin: 2,
  super_admin: 3,
};

export const ROLE_LABEL: Record<Role, string> = {
  user: 'User',
  admin: 'Admin',
  super_admin: 'Super Admin',
};

export const USER_PERMISSIONS = {
  SCHEMA_EDIT_DELETE: 'schema.edit_delete',
} as const;

export type UserPermission = (typeof USER_PERMISSIONS)[keyof typeof USER_PERMISSIONS];

export function isUserPermission(value: unknown): value is UserPermission {
  return typeof value === 'string' && (Object.values(USER_PERMISSIONS) as string[]).includes(value);
}

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

// Account lifecycle. New self-service signups start as `pending` and have NO
// access until a super admin approves them (-> `active`). `disabled` accounts
// are kept for the record but cannot sign in. Only `active` accounts hold a
// usable session.
export const USER_STATUSES = ['pending', 'active', 'disabled'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const STATUS_LABEL: Record<UserStatus, string> = {
  pending: 'Pending approval',
  active: 'Active',
  disabled: 'Disabled',
};

export function isUserStatus(value: unknown): value is UserStatus {
  return typeof value === 'string' && (USER_STATUSES as readonly string[]).includes(value);
}

export function hasAtLeast(role: Role, min: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[min];
}

// Only super admins may add/edit/remove users of any type.
export function canManageUsers(role: Role): boolean {
  return role === 'super_admin';
}

export type PublicUser = {
  id: string;
  username: string;
  name: string;
  email: string;
  role: Role;
  status: UserStatus;
  permissions: UserPermission[];
  createdAt: string;
  // When the user last authenticated, and when they were last seen active
  // (heartbeat). Null until the first login / activity. Used to show live
  // "online" status and last-seen times in User Management.
  lastLoginAt: string | null;
  lastSeenAt: string | null;
};

export function userHasPermission(user: Pick<PublicUser, 'role' | 'permissions'> | null | undefined, permission: UserPermission): boolean {
  if (!user) return false;
  if (user.role === 'super_admin') return true;
  return user.permissions.includes(permission);
}

// A user counts as "online" if their last heartbeat is within this window.
export const ONLINE_WINDOW_MS = 2 * 60 * 1000;
