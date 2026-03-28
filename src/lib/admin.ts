/**
 * Admin types and role-based access control for Athena.
 *
 * Role hierarchy (highest → lowest):
 *   owner  — Full control, can manage all admins, only one per instance
 *   admin  — Can manage members, change roles (except owner), all features
 *   member — Can use all features (loop, benchmark, repos)
 *   viewer — Read-only access, cannot run loops or commit
 */

export type UserRole = "owner" | "admin" | "member" | "viewer";

export type ProfileWithRole = {
  id: string;
  github_username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  role: UserRole;
  created_at: string;
  updated_at: string;
};

/** What each role is allowed to do */
export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  owner: [
    "manage_admins",
    "manage_members",
    "manage_settings",
    "run_loop",
    "benchmark",
    "commit_to_repo",
    "view_all",
  ],
  admin: [
    "manage_members",
    "manage_settings",
    "run_loop",
    "benchmark",
    "commit_to_repo",
    "view_all",
  ],
  member: [
    "run_loop",
    "benchmark",
    "commit_to_repo",
    "view_all",
  ],
  viewer: [
    "view_all",
  ],
};

/** Check if a role has a specific permission */
export function hasPermission(role: UserRole, permission: string): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

/** Check if `actor` role can modify `target` role */
export function canManageRole(actorRole: UserRole, targetRole: UserRole): boolean {
  const hierarchy: Record<UserRole, number> = {
    owner: 4,
    admin: 3,
    member: 2,
    viewer: 1,
  };
  return hierarchy[actorRole] > hierarchy[targetRole];
}

/** Roles that a given actor can assign to others */
export function assignableRoles(actorRole: UserRole): UserRole[] {
  if (actorRole === "owner") return ["admin", "member", "viewer"];
  if (actorRole === "admin") return ["member", "viewer"];
  return [];
}

/** Human-readable labels */
export const ROLE_LABELS: Record<UserRole, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
  viewer: "Viewer",
};

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  owner: "Full control. Can manage all users and settings.",
  admin: "Can manage members and settings. Cannot change owner.",
  member: "Can use all features: loop, benchmark, commit.",
  viewer: "Read-only access. Cannot run loops or commit.",
};
