"use client";

import * as React from "react";
import type { Permission, WorkflowSummary } from "../core/types";
import type { ExecutionHistoryStore } from "../core/execution-history";
import type { RBACManager } from "../core/rbac";

// ── Props ───────────────────────────────────────────────────────

export interface WorkflowDashboardProps {
  workflows: WorkflowSummary[];
  executionStore?: ExecutionHistoryStore;
  rbac?: { manager: RBACManager; currentUserId: string };
  onToggle: (workflowId: string, enabled: boolean) => void;
  onExecute: (workflowId: string) => void;
  onEdit: (workflowId: string) => void;
  onDelete: (workflowId: string) => void;
  onCreateNew: () => void;
  onDuplicate?: (workflowId: string) => void;
}

// ── Helpers ─────────────────────────────────────────────────────

type ViewMode = "grid" | "list";
type StatusFilter = "all" | "active" | "inactive" | "error";
type SortKey = "name" | "lastRun" | "created" | "status";

function hasPerm(rbac: WorkflowDashboardProps["rbac"], permission: Permission): boolean {
  if (!rbac) return true; // no RBAC = everything allowed
  return rbac.manager.hasPermission(rbac.currentUserId, permission);
}

function relativeTime(iso: string | undefined): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

interface WorkflowStats {
  successRate: number;
  avgDurationMs: number;
  totalRuns: number;
}

function getWorkflowStats(
  executionStore: ExecutionHistoryStore | undefined,
  workflowId: string,
): WorkflowStats {
  if (!executionStore) return { successRate: 0, avgDurationMs: 0, totalRuns: 0 };
  const stats = executionStore.getStats(workflowId);
  return {
    successRate: stats.successRate,
    avgDurationMs: stats.avgDurationMs,
    totalRuns: stats.totalRuns,
  };
}

// ── SVG Icons (inline to avoid dep) ─────────────────────────────

function IconGrid() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
    </svg>
  );
}

function IconList() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}

function IconPlus() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function IconSearch() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function IconPlay() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  );
}

function IconEdit() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function IconCopy() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function IconChevron({ direction }: { direction: "up" | "down" }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={direction === "up" ? { transform: "rotate(180deg)" } : undefined}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

// ── Status dot ──────────────────────────────────────────────────

function StatusDot({ enabled, lastRunStatus }: { enabled: boolean; lastRunStatus?: string }) {
  if (!enabled) {
    return <span className="inline-block w-2 h-2 rounded-full bg-zinc-500" title="Disabled" />;
  }
  if (lastRunStatus === "failed") {
    return <span className="inline-block w-2 h-2 rounded-full bg-amber-400 animate-pulse" title="Active (last run failed)" />;
  }
  return <span className="inline-block w-2 h-2 rounded-full bg-emerald-400" title="Active" />;
}

// ── Toggle switch ───────────────────────────────────────────────

function ToggleSwitch({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={(e) => { e.stopPropagation(); onChange(!checked); }}
      className={`
        relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent
        transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50
        ${checked ? "bg-emerald-500" : "bg-zinc-600"}
        ${disabled ? "opacity-40 cursor-not-allowed" : ""}
      `}
    >
      <span
        className={`
          pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm
          transform transition-transform ${checked ? "translate-x-4" : "translate-x-0"}
        `}
      />
    </button>
  );
}

// ── Empty state ─────────────────────────────────────────────────

function EmptyState({ canCreate, onCreate }: { canCreate: boolean; onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
      <div className="w-20 h-20 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-center mb-5">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground/40">
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
        </svg>
      </div>
      <h3 className="text-sm font-medium text-foreground mb-1">No workflows yet</h3>
      <p className="text-xs text-muted-foreground/60 mb-5 max-w-[280px]">
        Create your first workflow to start automating tasks and connecting your tools.
      </p>
      {canCreate && (
        <button
          onClick={onCreate}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors"
        >
          <IconPlus />
          Create your first workflow
        </button>
      )}
    </div>
  );
}

// ── Confirm dialog ──────────────────────────────────────────────

function ConfirmDialog({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-xl border border-white/10 bg-[#0a0a0f] p-5 shadow-2xl">
        <h3 className="text-sm font-semibold text-foreground mb-1">{title}</h3>
        <p className="text-xs text-muted-foreground/70 mb-4">{message}</p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-xs rounded-lg border border-white/10 text-muted-foreground hover:text-foreground hover:bg-white/[0.05] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-3 py-1.5 text-xs rounded-lg bg-red-600 hover:bg-red-500 text-white transition-colors"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────

export function WorkflowDashboard({
  workflows,
  executionStore,
  rbac,
  onToggle,
  onExecute,
  onEdit,
  onDelete,
  onCreateNew,
  onDuplicate,
}: WorkflowDashboardProps) {
  const [viewMode, setViewMode] = React.useState<ViewMode>("grid");
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("all");
  const [sortKey, setSortKey] = React.useState<SortKey>("lastRun");
  const [sortAsc, setSortAsc] = React.useState(false);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = React.useState<string[] | null>(null);

  // Permission checks
  const canCreate = hasPerm(rbac, "workflow:create");
  const canToggle = hasPerm(rbac, "workflow:toggle");
  const canExecute = hasPerm(rbac, "workflow:execute");
  const canEdit = hasPerm(rbac, "workflow:update");
  const canDelete = hasPerm(rbac, "workflow:delete");
  const canDuplicate = hasPerm(rbac, "workflow:create");

  // Derive unique trigger types and tags for filter dropdowns
  const triggerTypes = React.useMemo(() => {
    const set = new Set<string>();
    for (const w of workflows) if (w.triggerType) set.add(w.triggerType);
    return Array.from(set).sort();
  }, [workflows]);

  const [triggerFilter, setTriggerFilter] = React.useState<string | null>(null);

  // Filter + sort
  const filtered = React.useMemo(() => {
    const q = search.toLowerCase().trim();
    let result = workflows.filter((w) => {
      if (statusFilter === "active" && !w.enabled) return false;
      if (statusFilter === "inactive" && w.enabled) return false;
      if (statusFilter === "error" && w.lastRunStatus !== "failed") return false;
      if (triggerFilter && w.triggerType !== triggerFilter) return false;
      if (q) {
        const haystack = [w.name, w.description ?? "", ...(w.tags ?? [])].join(" ").toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });

    result.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "lastRun":
          cmp = (a.lastRunAt ?? "").localeCompare(b.lastRunAt ?? "");
          break;
        case "created":
          cmp = a.createdAt.localeCompare(b.createdAt);
          break;
        case "status": {
          const sa = a.enabled ? (a.lastRunStatus === "failed" ? 1 : 2) : 0;
          const sb = b.enabled ? (b.lastRunStatus === "failed" ? 1 : 2) : 0;
          cmp = sa - sb;
          break;
        }
      }
      return sortAsc ? cmp : -cmp;
    });

    return result;
  }, [workflows, search, statusFilter, triggerFilter, sortKey, sortAsc]);

  // Selection helpers
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((w) => w.id)));
    }
  };

  const clearSelection = () => setSelectedIds(new Set());

  // Bulk actions
  const bulkEnable = () => {
    if (!canToggle) return;
    for (const id of selectedIds) onToggle(id, true);
    clearSelection();
  };

  const bulkDisable = () => {
    if (!canToggle) return;
    for (const id of selectedIds) onToggle(id, false);
    clearSelection();
  };

  const bulkDelete = () => {
    if (!canDelete) return;
    setConfirmDelete(Array.from(selectedIds));
  };

  const handleConfirmDelete = () => {
    if (confirmDelete) {
      for (const id of confirmDelete) onDelete(id);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const id of confirmDelete) next.delete(id);
        return next;
      });
    }
    setConfirmDelete(null);
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-[#0a0a0f] text-foreground">
      {/* ── Header ────────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-white/10 px-5 py-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-base font-semibold text-foreground">Workflows</h1>
            <p className="text-[10px] text-muted-foreground/60 mt-0.5">
              {workflows.length} workflow{workflows.length !== 1 ? "s" : ""}
              {filtered.length !== workflows.length ? ` (${filtered.length} shown)` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* View mode toggle */}
            <div className="flex items-center border border-white/10 rounded-lg overflow-hidden">
              <button
                onClick={() => setViewMode("grid")}
                className={`p-1.5 transition-colors ${viewMode === "grid" ? "bg-white/10 text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                aria-label="Grid view"
              >
                <IconGrid />
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={`p-1.5 transition-colors ${viewMode === "list" ? "bg-white/10 text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                aria-label="List view"
              >
                <IconList />
              </button>
            </div>
            {canCreate && (
              <button
                onClick={onCreateNew}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors"
              >
                <IconPlus />
                New Workflow
              </button>
            )}
          </div>
        </div>

        {/* ── Search + Filters ──────────────────────────────────── */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[180px]">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50">
              <IconSearch />
            </span>
            <input
              type="text"
              placeholder="Search workflows..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-white/[0.04] border border-white/10 rounded-lg text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
            />
          </div>

          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="px-2.5 py-1.5 text-xs bg-white/[0.04] border border-white/10 rounded-lg text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500/50 appearance-none cursor-pointer"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="error">Error</option>
          </select>

          {/* Trigger filter */}
          {triggerTypes.length > 0 && (
            <select
              value={triggerFilter ?? ""}
              onChange={(e) => setTriggerFilter(e.target.value || null)}
              className="px-2.5 py-1.5 text-xs bg-white/[0.04] border border-white/10 rounded-lg text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500/50 appearance-none cursor-pointer"
            >
              <option value="">All Triggers</option>
              {triggerTypes.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          )}

          {/* Sort */}
          <select
            value={sortKey}
            onChange={(e) => handleSort(e.target.value as SortKey)}
            className="px-2.5 py-1.5 text-xs bg-white/[0.04] border border-white/10 rounded-lg text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500/50 appearance-none cursor-pointer"
          >
            <option value="lastRun">Last Run</option>
            <option value="name">Name</option>
            <option value="created">Created</option>
            <option value="status">Status</option>
          </select>

          <button
            onClick={() => setSortAsc(!sortAsc)}
            className="p-1.5 border border-white/10 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/[0.05] transition-colors"
            aria-label={sortAsc ? "Sort descending" : "Sort ascending"}
          >
            <IconChevron direction={sortAsc ? "up" : "down"} />
          </button>
        </div>
      </div>

      {/* ── Bulk actions bar ────────────────────────────────────── */}
      {selectedIds.size > 0 && (
        <div className="shrink-0 flex items-center gap-3 px-5 py-2.5 bg-blue-600/10 border-b border-blue-500/20">
          <span className="text-xs text-blue-300 font-medium">
            {selectedIds.size} selected
          </span>
          {canToggle && (
            <>
              <button onClick={bulkEnable} className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors">
                Enable All
              </button>
              <button onClick={bulkDisable} className="text-xs text-amber-400 hover:text-amber-300 transition-colors">
                Disable All
              </button>
            </>
          )}
          {canDelete && (
            <button onClick={bulkDelete} className="text-xs text-red-400 hover:text-red-300 transition-colors">
              Delete All
            </button>
          )}
          <button onClick={clearSelection} className="text-xs text-muted-foreground hover:text-foreground ml-auto transition-colors">
            Clear
          </button>
        </div>
      )}

      {/* ── Content ─────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-5">
        {filtered.length === 0 ? (
          workflows.length === 0 ? (
            <EmptyState canCreate={canCreate} onCreate={onCreateNew} />
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <p className="text-xs text-muted-foreground/60">No workflows match your filters.</p>
              <button
                onClick={() => { setSearch(""); setStatusFilter("all"); setTriggerFilter(null); }}
                className="mt-2 text-xs text-blue-400 hover:text-blue-300 transition-colors"
              >
                Clear filters
              </button>
            </div>
          )
        ) : viewMode === "grid" ? (
          <GridView
            workflows={filtered}
            executionStore={executionStore}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            canToggle={canToggle}
            canExecute={canExecute}
            canEdit={canEdit}
            canDelete={canDelete}
            canDuplicate={canDuplicate}
            onToggle={onToggle}
            onExecute={onExecute}
            onEdit={onEdit}
            onDelete={(id) => setConfirmDelete([id])}
            onDuplicate={onDuplicate}
          />
        ) : (
          <ListView
            workflows={filtered}
            executionStore={executionStore}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            onSelectAll={selectAll}
            allSelected={selectedIds.size === filtered.length && filtered.length > 0}
            canToggle={canToggle}
            canExecute={canExecute}
            canEdit={canEdit}
            canDelete={canDelete}
            canDuplicate={canDuplicate}
            onToggle={onToggle}
            onExecute={onExecute}
            onEdit={onEdit}
            onDelete={(id) => setConfirmDelete([id])}
            onDuplicate={onDuplicate}
            sortKey={sortKey}
            sortAsc={sortAsc}
            onSort={handleSort}
          />
        )}
      </div>

      {/* ── Confirm dialog ─────────────────────────────────────── */}
      {confirmDelete && (
        <ConfirmDialog
          title={confirmDelete.length === 1 ? "Delete workflow?" : `Delete ${confirmDelete.length} workflows?`}
          message="This action cannot be undone. All associated execution history will be preserved."
          confirmLabel="Delete"
          onConfirm={handleConfirmDelete}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}

// ── Grid view ───────────────────────────────────────────────────

interface ViewProps {
  workflows: WorkflowSummary[];
  executionStore?: ExecutionHistoryStore;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  canToggle: boolean;
  canExecute: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canDuplicate: boolean;
  onToggle: (id: string, enabled: boolean) => void;
  onExecute: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onDuplicate?: (id: string) => void;
}

function GridView(props: ViewProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {props.workflows.map((w) => (
        <GridCard key={w.id} workflow={w} {...props} />
      ))}
    </div>
  );
}

function GridCard({
  workflow: w,
  executionStore,
  selectedIds,
  onToggleSelect,
  canToggle,
  canExecute,
  canEdit,
  canDelete,
  canDuplicate,
  onToggle,
  onExecute,
  onEdit,
  onDelete,
  onDuplicate,
}: ViewProps & { workflow: WorkflowSummary }) {
  const stats = getWorkflowStats(executionStore, w.id);
  const selected = selectedIds.has(w.id);

  return (
    <div
      className={`
        group relative flex flex-col rounded-xl border transition-all
        ${selected
          ? "border-blue-500/40 bg-blue-500/[0.05]"
          : "border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]"
        }
      `}
    >
      {/* Select checkbox */}
      <button
        onClick={() => onToggleSelect(w.id)}
        className={`
          absolute top-3 left-3 w-4 h-4 rounded border flex items-center justify-center transition-all
          ${selected
            ? "bg-blue-500 border-blue-500"
            : "border-white/20 opacity-0 group-hover:opacity-100"
          }
        `}
        aria-label={`Select ${w.name}`}
      >
        {selected && (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </button>

      {/* Card body */}
      <div className="p-4 flex-1">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <StatusDot enabled={w.enabled} lastRunStatus={w.lastRunStatus} />
            <h3 className="text-xs font-medium text-foreground truncate">{w.name}</h3>
          </div>
          <ToggleSwitch checked={w.enabled} onChange={(v) => onToggle(w.id, v)} disabled={!canToggle} />
        </div>

        {w.description && (
          <p className="text-[10px] text-muted-foreground/60 mb-3 line-clamp-2">{w.description}</p>
        )}

        {/* Tags */}
        {w.tags && w.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {w.tags.slice(0, 3).map((tag) => (
              <span key={tag} className="px-1.5 py-0.5 text-[9px] rounded bg-white/[0.06] border border-white/10 text-muted-foreground">
                {tag}
              </span>
            ))}
            {w.tags.length > 3 && (
              <span className="text-[9px] text-muted-foreground/40">+{w.tags.length - 3}</span>
            )}
          </div>
        )}

        {/* Quick stats */}
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground/50">
          {stats.totalRuns > 0 && (
            <>
              <span title="Success rate">{Math.round(stats.successRate * 100)}%</span>
              <span title="Avg duration">{formatMs(stats.avgDurationMs)}</span>
              <span title="Total runs">{stats.totalRuns} runs</span>
            </>
          )}
          {w.lastRunAt && (
            <span className="ml-auto" title="Last run">{relativeTime(w.lastRunAt)}</span>
          )}
        </div>

        {w.triggerType && (
          <div className="mt-2">
            <span className="px-1.5 py-0.5 text-[9px] rounded bg-violet-500/10 border border-violet-500/20 text-violet-300">
              {w.triggerType}
            </span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 px-3 py-2 border-t border-white/[0.06]">
        {canExecute && (
          <button
            onClick={() => onExecute(w.id)}
            className="flex items-center gap-1 px-2 py-1 text-[10px] rounded-md text-emerald-400 hover:bg-emerald-500/10 transition-colors"
            title="Execute now"
          >
            <IconPlay /> Run
          </button>
        )}
        {canEdit && (
          <button
            onClick={() => onEdit(w.id)}
            className="flex items-center gap-1 px-2 py-1 text-[10px] rounded-md text-blue-400 hover:bg-blue-500/10 transition-colors"
            title="Edit"
          >
            <IconEdit /> Edit
          </button>
        )}
        {onDuplicate && canDuplicate && (
          <button
            onClick={() => onDuplicate(w.id)}
            className="flex items-center gap-1 px-2 py-1 text-[10px] rounded-md text-muted-foreground hover:bg-white/[0.05] transition-colors"
            title="Duplicate"
          >
            <IconCopy />
          </button>
        )}
        {canDelete && (
          <button
            onClick={() => onDelete(w.id)}
            className="flex items-center gap-1 px-2 py-1 text-[10px] rounded-md text-red-400 hover:bg-red-500/10 transition-colors ml-auto"
            title="Delete"
          >
            <IconTrash />
          </button>
        )}
      </div>
    </div>
  );
}

// ── List view ───────────────────────────────────────────────────

interface ListViewProps extends ViewProps {
  onSelectAll: () => void;
  allSelected: boolean;
  sortKey: SortKey;
  sortAsc: boolean;
  onSort: (key: SortKey) => void;
}

function SortHeader({ label, sortKey: sk, currentKey, ascending, onSort }: { label: string; sortKey: SortKey; currentKey: SortKey; ascending: boolean; onSort: (k: SortKey) => void }) {
  const active = sk === currentKey;
  return (
    <button
      onClick={() => onSort(sk)}
      className={`flex items-center gap-0.5 text-[10px] font-medium uppercase tracking-wider ${active ? "text-foreground" : "text-muted-foreground/50 hover:text-muted-foreground"} transition-colors`}
    >
      {label}
      {active && <IconChevron direction={ascending ? "up" : "down"} />}
    </button>
  );
}

function ListView({
  workflows,
  executionStore,
  selectedIds,
  onToggleSelect,
  onSelectAll,
  allSelected,
  canToggle,
  canExecute,
  canEdit,
  canDelete,
  onToggle,
  onExecute,
  onEdit,
  onDelete,
  onDuplicate,
  sortKey,
  sortAsc,
  onSort,
}: ListViewProps) {
  return (
    <div className="border border-white/10 rounded-xl overflow-hidden">
      {/* Table header */}
      <div className="grid grid-cols-[32px_1fr_100px_90px_90px_80px_120px] gap-2 items-center px-3 py-2 bg-white/[0.03] border-b border-white/10">
        <button
          onClick={onSelectAll}
          className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${allSelected ? "bg-blue-500 border-blue-500" : "border-white/20"}`}
          aria-label="Select all"
        >
          {allSelected && (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
        </button>
        <SortHeader label="Name" sortKey="name" currentKey={sortKey} ascending={sortAsc} onSort={onSort} />
        <SortHeader label="Status" sortKey="status" currentKey={sortKey} ascending={sortAsc} onSort={onSort} />
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">Success</span>
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">Avg Time</span>
        <SortHeader label="Last Run" sortKey="lastRun" currentKey={sortKey} ascending={sortAsc} onSort={onSort} />
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50 text-right">Actions</span>
      </div>

      {/* Rows */}
      {workflows.map((w) => {
        const stats = getWorkflowStats(executionStore, w.id);
        const selected = selectedIds.has(w.id);

        return (
          <div
            key={w.id}
            className={`
              grid grid-cols-[32px_1fr_100px_90px_90px_80px_120px] gap-2 items-center px-3 py-2.5
              border-b border-white/[0.05] last:border-b-0 transition-colors
              ${selected ? "bg-blue-500/[0.05]" : "hover:bg-white/[0.02]"}
            `}
          >
            <button
              onClick={() => onToggleSelect(w.id)}
              className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${selected ? "bg-blue-500 border-blue-500" : "border-white/20"}`}
              aria-label={`Select ${w.name}`}
            >
              {selected && (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </button>

            <div className="flex items-center gap-2 min-w-0">
              <StatusDot enabled={w.enabled} lastRunStatus={w.lastRunStatus} />
              <span className="text-xs font-medium text-foreground truncate">{w.name}</span>
              {w.triggerType && (
                <span className="px-1.5 py-0.5 text-[9px] rounded bg-violet-500/10 border border-violet-500/20 text-violet-300 shrink-0">
                  {w.triggerType}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <ToggleSwitch checked={w.enabled} onChange={(v) => onToggle(w.id, v)} disabled={!canToggle} />
              <span className="text-[10px] text-muted-foreground/50">{w.enabled ? "On" : "Off"}</span>
            </div>

            <span className="text-[10px] text-muted-foreground/60">
              {stats.totalRuns > 0 ? `${Math.round(stats.successRate * 100)}%` : "-"}
            </span>

            <span className="text-[10px] text-muted-foreground/60">
              {stats.totalRuns > 0 ? formatMs(stats.avgDurationMs) : "-"}
            </span>

            <span className="text-[10px] text-muted-foreground/60">{relativeTime(w.lastRunAt)}</span>

            <div className="flex items-center justify-end gap-1">
              {canExecute && (
                <button
                  onClick={() => onExecute(w.id)}
                  className="p-1 rounded text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                  title="Execute now"
                >
                  <IconPlay />
                </button>
              )}
              {canEdit && (
                <button
                  onClick={() => onEdit(w.id)}
                  className="p-1 rounded text-blue-400 hover:bg-blue-500/10 transition-colors"
                  title="Edit"
                >
                  <IconEdit />
                </button>
              )}
              {onDuplicate && canDuplicate && (
                <button
                  onClick={() => onDuplicate(w.id)}
                  className="p-1 rounded text-muted-foreground hover:bg-white/[0.05] transition-colors"
                  title="Duplicate"
                >
                  <IconCopy />
                </button>
              )}
              {canDelete && (
                <button
                  onClick={() => onDelete(w.id)}
                  className="p-1 rounded text-red-400 hover:bg-red-500/10 transition-colors"
                  title="Delete"
                >
                  <IconTrash />
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
