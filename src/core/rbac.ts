/**
 * Role-Based Access Control (RBAC) manager.
 * Provides permission checking, role management, and user management
 * with built-in roles and optional enforcement mode.
 */
import type { Permission, Role, User, RBACConfig, SerializedRBAC } from "./types";

// ── Built-in roles ──────────────────────────────────────────────

const ALL_PERMISSIONS: Permission[] = [
  "workflow:create", "workflow:read", "workflow:update", "workflow:delete", "workflow:execute",
  "workflow:toggle",
  "credential:create", "credential:read", "credential:update", "credential:delete",
  "template:create", "template:read", "template:publish",
  "history:read", "history:export",
  "admin:users", "admin:roles", "admin:settings",
];

export const BUILTIN_ADMIN_ROLE: Role = {
  id: "admin",
  name: "Admin",
  description: "Full access to all features and settings",
  permissions: [...ALL_PERMISSIONS],
  isBuiltIn: true,
};

export const BUILTIN_EDITOR_ROLE: Role = {
  id: "editor",
  name: "Editor",
  description: "Create and manage workflows and templates, read credentials and history",
  permissions: [
    "workflow:create", "workflow:read", "workflow:update", "workflow:delete", "workflow:execute",
    "workflow:toggle",
    "credential:read",
    "template:create", "template:read", "template:publish",
    "history:read",
  ],
  isBuiltIn: true,
};

export const BUILTIN_VIEWER_ROLE: Role = {
  id: "viewer",
  name: "Viewer",
  description: "Read-only access to workflows, templates, and history",
  permissions: [
    "workflow:read",
    "template:read",
    "history:read",
  ],
  isBuiltIn: true,
};

export const BUILTIN_OPERATOR_ROLE: Role = {
  id: "operator",
  name: "Operator",
  description: "Execute and toggle workflows, view history",
  permissions: [
    "workflow:read", "workflow:execute", "workflow:toggle",
    "history:read",
  ],
  isBuiltIn: true,
};

const BUILTIN_ROLES: Role[] = [
  BUILTIN_ADMIN_ROLE,
  BUILTIN_EDITOR_ROLE,
  BUILTIN_VIEWER_ROLE,
  BUILTIN_OPERATOR_ROLE,
];

// ── RBACManager ─────────────────────────────────────────────────

export class RBACManager {
  private config: RBACConfig;
  private roles = new Map<string, Role>();
  private users = new Map<string, User>();

  constructor(config: RBACConfig) {
    this.config = { ...config, superAdminIds: [...config.superAdminIds] };
    // Seed built-in roles
    for (const role of BUILTIN_ROLES) {
      this.roles.set(role.id, { ...role, permissions: [...role.permissions] });
    }
  }

  // ── Config ──────────────────────────────────────────────────────

  getConfig(): Readonly<RBACConfig> {
    return { ...this.config, superAdminIds: [...this.config.superAdminIds] };
  }

  setEnforced(enforced: boolean): void {
    this.config.enforced = enforced;
  }

  // ── Role management ─────────────────────────────────────────────

  addRole(role: Role): void {
    if (this.roles.has(role.id)) {
      throw new Error(`Role "${role.id}" already exists`);
    }
    this.roles.set(role.id, { ...role, permissions: [...role.permissions] });
  }

  removeRole(id: string): void {
    const role = this.roles.get(id);
    if (!role) throw new Error(`Role "${id}" not found`);
    if (role.isBuiltIn) throw new Error(`Cannot remove built-in role "${id}"`);
    this.roles.delete(id);
    // Remove this role from all users
    for (const user of this.users.values()) {
      const idx = user.roleIds.indexOf(id);
      if (idx !== -1) user.roleIds.splice(idx, 1);
    }
  }

  getRole(id: string): Role | undefined {
    const r = this.roles.get(id);
    return r ? { ...r, permissions: [...r.permissions] } : undefined;
  }

  getAllRoles(): Role[] {
    return Array.from(this.roles.values()).map(r => ({
      ...r,
      permissions: [...r.permissions],
    }));
  }

  // ── User management ─────────────────────────────────────────────

  addUser(user: User): void {
    if (this.users.has(user.id)) {
      throw new Error(`User "${user.id}" already exists`);
    }
    this.users.set(user.id, { ...user, roleIds: [...user.roleIds] });
  }

  removeUser(id: string): void {
    if (!this.users.has(id)) throw new Error(`User "${id}" not found`);
    this.users.delete(id);
  }

  getUser(id: string): User | undefined {
    const u = this.users.get(id);
    return u ? { ...u, roleIds: [...u.roleIds] } : undefined;
  }

  getAllUsers(): User[] {
    return Array.from(this.users.values()).map(u => ({
      ...u,
      roleIds: [...u.roleIds],
    }));
  }

  assignRole(userId: string, roleId: string): void {
    const user = this.users.get(userId);
    if (!user) throw new Error(`User "${userId}" not found`);
    if (!this.roles.has(roleId)) throw new Error(`Role "${roleId}" not found`);
    if (!user.roleIds.includes(roleId)) {
      user.roleIds.push(roleId);
    }
  }

  revokeRole(userId: string, roleId: string): void {
    const user = this.users.get(userId);
    if (!user) throw new Error(`User "${userId}" not found`);
    const idx = user.roleIds.indexOf(roleId);
    if (idx !== -1) user.roleIds.splice(idx, 1);
  }

  // ── Permission checking ─────────────────────────────────────────

  /**
   * Get all permissions for a user by merging permissions from all assigned roles.
   * Super admins get all permissions. When not enforced, returns all permissions.
   */
  getUserPermissions(userId: string): Permission[] {
    if (!this.config.enforced) return [...ALL_PERMISSIONS];
    if (this.config.superAdminIds.includes(userId)) return [...ALL_PERMISSIONS];

    const user = this.users.get(userId);
    if (!user || !user.isActive) return [];

    const perms = new Set<Permission>();
    for (const roleId of user.roleIds) {
      const role = this.roles.get(roleId);
      if (role) {
        for (const p of role.permissions) perms.add(p);
      }
    }
    return Array.from(perms);
  }

  /**
   * Check if a user has a specific permission.
   */
  hasPermission(userId: string, permission: Permission): boolean {
    if (!this.config.enforced) return true;
    if (this.config.superAdminIds.includes(userId)) return true;

    const user = this.users.get(userId);
    if (!user || !user.isActive) return false;

    for (const roleId of user.roleIds) {
      const role = this.roles.get(roleId);
      if (role && role.permissions.includes(permission)) return true;
    }
    return false;
  }

  /**
   * Check if a user has at least one of the specified permissions.
   */
  hasAnyPermission(userId: string, permissions: Permission[]): boolean {
    if (!this.config.enforced) return true;
    if (this.config.superAdminIds.includes(userId)) return true;
    return permissions.some(p => this.hasPermission(userId, p));
  }

  /**
   * Check if a user has all of the specified permissions.
   */
  hasAllPermissions(userId: string, permissions: Permission[]): boolean {
    if (!this.config.enforced) return true;
    if (this.config.superAdminIds.includes(userId)) return true;
    return permissions.every(p => this.hasPermission(userId, p));
  }

  /**
   * Guard: throws an error if the user lacks the specified permission.
   */
  guard(userId: string, permission: Permission): void {
    if (!this.hasPermission(userId, permission)) {
      const user = this.users.get(userId);
      const name = user?.name ?? userId;
      throw new Error(
        `Access denied: user "${name}" lacks permission "${permission}"`
      );
    }
  }

  // ── Persistence ─────────────────────────────────────────────────

  export(): SerializedRBAC {
    return {
      version: 1,
      config: { ...this.config, superAdminIds: [...this.config.superAdminIds] },
      roles: this.getAllRoles(),
      users: this.getAllUsers(),
    };
  }

  static fromSnapshot(data: SerializedRBAC): RBACManager {
    const manager = new RBACManager(data.config);

    // Override built-in roles with snapshot data (in case permissions were extended),
    // but preserve the isBuiltIn flag for built-in roles to prevent deletion bypass.
    for (const role of data.roles) {
      const existing = manager.roles.get(role.id);
      const isBuiltIn = existing?.isBuiltIn || role.isBuiltIn;
      manager.roles.set(role.id, { ...role, isBuiltIn, permissions: [...role.permissions] });
    }

    for (const user of data.users) {
      manager.users.set(user.id, { ...user, roleIds: [...user.roleIds] });
    }

    return manager;
  }
}
