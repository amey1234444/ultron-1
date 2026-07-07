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

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
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
  createdAt: string;
};
