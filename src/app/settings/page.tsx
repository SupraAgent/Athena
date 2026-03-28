"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { useSearchParams } from "next/navigation";
import {
  ROLE_LABELS,
  ROLE_DESCRIPTIONS,
  assignableRoles,
  canManageRole,
  type UserRole,
  type ProfileWithRole,
} from "@/lib/admin";

type Tab = "api-keys" | "admin";

export default function SettingsPage() {
  return (
    <React.Suspense>
      <SettingsContent />
    </React.Suspense>
  );
}

function SettingsContent() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab") === "admin" ? "admin" : "api-keys";
  const [tab, setTab] = React.useState<Tab>(initialTab);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold text-foreground">Settings</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Manage API keys and user access.
      </p>

      {/* Tab bar */}
      <div className="mt-6 flex gap-1 border-b border-white/10 pb-px">
        {([
          { id: "api-keys" as Tab, label: "API Keys" },
          { id: "admin" as Tab, label: "Admin" },
        ]).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "px-4 py-2 text-sm font-medium rounded-t-lg transition-colors cursor-pointer",
              tab === t.id
                ? "text-foreground bg-white/5 border border-white/10 border-b-transparent -mb-px"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === "api-keys" ? <ApiKeysTab /> : <AdminTab />}
      </div>
    </div>
  );
}

/* ───────── API Keys Tab ───────── */

function ApiKeysTab() {
  const [apiKey, setApiKey] = React.useState("");
  const [saved, setSaved] = React.useState(false);

  React.useEffect(() => {
    const stored = localStorage.getItem("athena_anthropic_key");
    if (stored) {
      setApiKey(stored);
      setSaved(true);
    }
  }, []);

  function handleSave() {
    if (apiKey.trim()) {
      localStorage.setItem("athena_anthropic_key", apiKey.trim());
      setSaved(true);
    }
  }

  function handleClear() {
    localStorage.removeItem("athena_anthropic_key");
    setApiKey("");
    setSaved(false);
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1.5 block text-sm font-medium text-foreground">
          Anthropic API Key
        </label>
        <Input
          type="password"
          value={apiKey}
          onChange={(e) => {
            setApiKey(e.target.value);
            setSaved(false);
          }}
          placeholder="sk-ant-..."
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Stored in localStorage only. Used for CPO scoring and improvement
          analysis.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Button onClick={handleSave} disabled={!apiKey.trim() || saved}>
          {saved ? "Saved" : "Save Key"}
        </Button>
        {saved && (
          <Button variant="ghost" size="sm" onClick={handleClear}>
            Clear
          </Button>
        )}
      </div>

      {saved && (
        <div className="rounded-xl border border-green-500/20 bg-green-500/5 px-4 py-3">
          <p className="text-sm text-green-400">
            API key saved. Athena will use Claude for real CPO scoring and
            improvement analysis.
          </p>
        </div>
      )}
    </div>
  );
}

/* ───────── Admin Tab ───────── */

function AdminTab() {
  const { user } = useAuth();
  const [users, setUsers] = React.useState<ProfileWithRole[]>([]);
  const [callerRole, setCallerRole] = React.useState<UserRole | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [actionLoading, setActionLoading] = React.useState<string | null>(null);

  const fetchUsers = React.useCallback(async () => {
    try {
      const res = await fetch("/api/admin/users");
      if (res.status === 403) {
        setError("You don't have admin access.");
        setLoading(false);
        return;
      }
      if (!res.ok) {
        setError("Failed to load users.");
        setLoading(false);
        return;
      }
      const data = await res.json();
      setUsers(data.users);
      setCallerRole(data.callerRole);
      setError(null);
    } catch {
      setError("Failed to load users.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  async function handleRoleChange(targetUserId: string, newRole: UserRole) {
    setActionLoading(targetUserId);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId, newRole }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Failed to update role.");
        return;
      }
      await fetchUsers();
    } catch {
      alert("Failed to update role.");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleRemoveUser(targetUserId: string, displayName: string) {
    if (!confirm(`Remove ${displayName || "this user"} from the workspace?`)) {
      return;
    }
    setActionLoading(targetUserId);
    try {
      const res = await fetch(`/api/admin/users?id=${targetUserId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Failed to remove user.");
        return;
      }
      await fetchUsers();
    } catch {
      alert("Failed to remove user.");
    } finally {
      setActionLoading(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        Loading users...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3">
        <p className="text-sm text-red-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Role legend */}
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <h3 className="text-sm font-medium text-foreground mb-3">Access Roles</h3>
        <div className="grid grid-cols-2 gap-3">
          {(["owner", "admin", "member", "viewer"] as UserRole[]).map((role) => (
            <div key={role} className="flex items-start gap-2">
              <RoleBadge role={role} />
              <p className="text-xs text-muted-foreground leading-relaxed">
                {ROLE_DESCRIPTIONS[role]}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Users list */}
      <div>
        <h3 className="text-sm font-medium text-foreground mb-3">
          Users ({users.length})
        </h3>
        <div className="space-y-2">
          {users.map((u) => {
            const isCurrentUser = u.id === user?.id;
            const canManage =
              callerRole && !isCurrentUser && canManageRole(callerRole, u.role);
            const rolesAvailable =
              callerRole ? assignableRoles(callerRole) : [];
            const isLoading = actionLoading === u.id;

            return (
              <div
                key={u.id}
                className={cn(
                  "flex items-center justify-between rounded-xl border px-4 py-3 transition-colors",
                  isCurrentUser
                    ? "border-primary/20 bg-primary/5"
                    : "border-white/10 bg-white/[0.02]"
                )}
              >
                <div className="flex items-center gap-3 min-w-0">
                  {u.avatar_url ? (
                    <img
                      src={u.avatar_url}
                      alt=""
                      className="h-8 w-8 rounded-full"
                    />
                  ) : (
                    <div className="h-8 w-8 rounded-full bg-white/10 flex items-center justify-center text-xs text-muted-foreground">
                      {(u.display_name || u.github_username || "?")[0]?.toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {u.display_name || u.github_username || "Unknown"}
                      {isCurrentUser && (
                        <span className="ml-1.5 text-xs text-muted-foreground">
                          (you)
                        </span>
                      )}
                    </p>
                    {u.github_username && (
                      <p className="text-xs text-muted-foreground truncate">
                        @{u.github_username}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {canManage && rolesAvailable.length > 0 ? (
                    <select
                      value={u.role}
                      onChange={(e) =>
                        handleRoleChange(u.id, e.target.value as UserRole)
                      }
                      disabled={isLoading}
                      className="h-8 rounded-md border border-white/10 bg-white/5 px-2 text-xs text-foreground cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary/50"
                    >
                      <option value={u.role}>{ROLE_LABELS[u.role]}</option>
                      {rolesAvailable
                        .filter((r) => r !== u.role)
                        .map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABELS[r]}
                          </option>
                        ))}
                    </select>
                  ) : (
                    <RoleBadge role={u.role} />
                  )}

                  {canManage && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        handleRemoveUser(
                          u.id,
                          u.display_name || u.github_username || ""
                        )
                      }
                      disabled={isLoading}
                      className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                      title="Remove user"
                    >
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={1.5}
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
                        />
                      </svg>
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ───────── Role Badge ───────── */

const roleColors: Record<UserRole, string> = {
  owner: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  admin: "border-blue-500/30 bg-blue-500/10 text-blue-400",
  member: "border-green-500/30 bg-green-500/10 text-green-400",
  viewer: "border-white/15 bg-white/5 text-muted-foreground",
};

function RoleBadge({ role }: { role: UserRole }) {
  return (
    <Badge className={cn("text-[11px] capitalize", roleColors[role])}>
      {ROLE_LABELS[role]}
    </Badge>
  );
}
