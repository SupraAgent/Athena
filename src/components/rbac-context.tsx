"use client";

import * as React from "react";
import type { Permission } from "../core/types";
import type { RBACManager } from "../core/rbac";

// ── Context shape ───────────────────────────────────────────────

interface RBACContextValue {
  manager: RBACManager | null;
  currentUserId: string | null;
  hasPermission: (permission: Permission) => boolean;
  hasAnyPermission: (permissions: Permission[]) => boolean;
  hasAllPermissions: (permissions: Permission[]) => boolean;
}

const defaultValue: RBACContextValue = {
  manager: null,
  currentUserId: null,
  hasPermission: () => true,
  hasAnyPermission: () => true,
  hasAllPermissions: () => true,
};

export const RBACContext = React.createContext<RBACContextValue>(defaultValue);

// ── Provider ────────────────────────────────────────────────────

export interface RBACProviderProps {
  manager: RBACManager;
  currentUserId: string;
  children: React.ReactNode;
}

export function RBACProvider({ manager, currentUserId, children }: RBACProviderProps) {
  const value = React.useMemo<RBACContextValue>(() => ({
    manager,
    currentUserId,
    hasPermission: (permission: Permission) => manager.hasPermission(currentUserId, permission),
    hasAnyPermission: (permissions: Permission[]) => manager.hasAnyPermission(currentUserId, permissions),
    hasAllPermissions: (permissions: Permission[]) => manager.hasAllPermissions(currentUserId, permissions),
  }), [manager, currentUserId]);

  return (
    <RBACContext.Provider value={value}>
      {children}
    </RBACContext.Provider>
  );
}

// ── Hook ────────────────────────────────────────────────────────

export function useRBAC(): RBACContextValue {
  return React.useContext(RBACContext);
}
