"use client";

import * as React from "react";
import type { ExecutionRecord, ExecutionHistoryQuery, NodeExecutionEvent } from "../core/types";
import type { ExecutionHistoryStore } from "../core/execution-history";
import { formatRunSummary, formatNodeEvent, formatDuration } from "../core/plain-language";

// ── Props ───────────────────────────────────────────────────────

export interface ExecutionHistoryPanelProps {
  store: ExecutionHistoryStore;
  mode: "developer" | "consumer";
  workflowId?: string;
  onClose?: () => void;
}

// ── Status config ───────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; icon: string; color: string; bgColor: string }> = {
  completed: { label: "Completed", icon: "\u2705", color: "text-emerald-400", bgColor: "bg-emerald-500/15 border-emerald-500/25" },
  failed: { label: "Failed", icon: "\u274C", color: "text-red-400", bgColor: "bg-red-500/15 border-red-500/25" },
  paused: { label: "Paused", icon: "\u23F8\uFE0F", color: "text-amber-400", bgColor: "bg-amber-500/15 border-amber-500/25" },
  running: { label: "Running", icon: "\uD83D\uDD04", color: "text-blue-400", bgColor: "bg-blue-500/15 border-blue-500/25" },
};

function getStatusConfig(status: string) {
  return STATUS_CONFIG[status] ?? { label: status, icon: "\u2022", color: "text-muted-foreground", bgColor: "bg-white/5 border-white/10" };
}

// ── Main component ──────────────────────────────────────────────

export function ExecutionHistoryPanel({
  store,
  mode,
  workflowId,
  onClose,
}: ExecutionHistoryPanelProps) {
  // Subscribe to store changes via useSyncExternalStore
  const subscribeFn = React.useCallback((cb: () => void) => store.subscribe(cb), [store]);
  const getSnapshotFn = React.useCallback(() => store.getSnapshot(), [store]);
  const records = React.useSyncExternalStore(subscribeFn, getSnapshotFn, getSnapshotFn);

  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<string | null>(null);
  const [page, setPage] = React.useState(0);
  const pageSize = mode === "developer" ? 20 : 10;

  // Build query
  const query: ExecutionHistoryQuery = React.useMemo(() => ({
    workflowId: workflowId ?? undefined,
    status: statusFilter ?? undefined,
    search: search.trim() || undefined,
    limit: pageSize,
    offset: page * pageSize,
  }), [workflowId, statusFilter, search, pageSize, page]);

  const result = React.useMemo(() => store.query(query), [store, query, records]);

  // Reset page when filters change
  React.useEffect(() => { setPage(0); }, [search, statusFilter, workflowId]);

  const totalPages = Math.max(1, Math.ceil(result.total / pageSize));

  if (mode === "consumer") {
    return (
      <ConsumerFeed
        result={result}
        page={page}
        totalPages={totalPages}
        onLoadMore={() => setPage((p) => Math.min(p + 1, totalPages - 1))}
        onClose={onClose}
      />
    );
  }

  return (
    <DeveloperPanel
      result={result}
      search={search}
      onSearchChange={setSearch}
      statusFilter={statusFilter}
      onStatusFilterChange={setStatusFilter}
      page={page}
      totalPages={totalPages}
      onPageChange={setPage}
      onClose={onClose}
      store={store}
    />
  );
}

// ── Developer mode ──────────────────────────────────────────────

function DeveloperPanel({
  result,
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  page,
  totalPages,
  onPageChange,
  onClose,
  store,
}: {
  result: ReturnType<ExecutionHistoryStore["query"]>;
  search: string;
  onSearchChange: (v: string) => void;
  statusFilter: string | null;
  onStatusFilterChange: (v: string | null) => void;
  page: number;
  totalPages: number;
  onPageChange: (p: number) => void;
  onClose?: () => void;
  store: ExecutionHistoryStore;
}) {
  const [expandedRunId, setExpandedRunId] = React.useState<string | null>(null);
  const { stats } = result;

  const handleExportJSON = React.useCallback(() => {
    const data = store.export();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `execution-history-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [store]);

  const handleExportCSV = React.useCallback(() => {
    const rows = [
      ["Run ID", "Workflow ID", "Status", "Started At", "Duration (ms)", "Trigger", "Error", "Tags"],
    ];
    // Export all records by using a very high limit
    const all = store.query({ limit: Number.MAX_SAFE_INTEGER, offset: 0 });
    for (const r of all.records) {
      rows.push([
        r.runId,
        r.workflowId,
        r.status,
        r.startedAt,
        String(r.durationMs ?? ""),
        r.triggerType ?? "",
        r.error ?? "",
        (r.tags ?? []).join("; "),
      ]);
    }
    // Escape double quotes and handle newlines within cells for valid CSV
    const csv = rows
      .map((row) =>
        row.map((cell) => `"${cell.replace(/"/g, '""').replace(/\r?\n/g, " ")}"`).join(",")
      )
      .join("\r\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `execution-history-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [store]);

  return (
    <div className="flex flex-col h-full rounded-2xl border border-white/10 bg-[#0a0a0f] shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0 border-b border-white/10 px-6 py-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Execution History</h2>
          <p className="text-[10px] text-muted-foreground/60 mt-0.5">
            {result.total} run{result.total !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[10px] text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors"
          >
            <DownloadIcon />
            CSV
          </button>
          <button
            onClick={handleExportJSON}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[10px] text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors"
          >
            <DownloadIcon />
            JSON
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="flex items-center justify-center h-7 w-7 rounded-lg border border-white/10 text-muted-foreground hover:text-foreground hover:bg-white/[0.05] transition-colors"
              aria-label="Close"
            >
              <CloseIcon />
            </button>
          )}
        </div>
      </div>

      {/* Stats bar */}
      <div className="shrink-0 flex items-center gap-4 border-b border-white/10 px-6 py-3">
        <StatBadge label="Total" value={String(stats.totalRuns)} />
        <StatBadge label="Success Rate" value={`${Math.round(stats.successRate * 100)}%`} />
        <StatBadge
          label="Avg Duration"
          value={stats.avgDurationMs > 0 ? formatDuration(stats.avgDurationMs) : "--"}
        />
        <StatBadge label="Failures" value={String(stats.failureCount)} />
      </div>

      {/* Filters */}
      <div className="shrink-0 border-b border-white/10 px-6 py-3 space-y-3">
        <div className="relative">
          <SearchIcon />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search by run ID, workflow, error..."
            className="w-full rounded-lg border border-white/10 bg-white/[0.02] pl-9 pr-3 py-2 text-xs outline-none placeholder:text-muted-foreground/40 focus:border-white/20 transition-colors"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <FilterChip
            label="All"
            active={statusFilter === null}
            onClick={() => onStatusFilterChange(null)}
          />
          {(["completed", "failed", "running", "paused"] as const).map((s) => (
            <FilterChip
              key={s}
              label={getStatusConfig(s).label}
              active={statusFilter === s}
              onClick={() => onStatusFilterChange(statusFilter === s ? null : s)}
            />
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto">
        {result.records.length === 0 ? (
          <EmptyState onClear={() => { onSearchChange(""); onStatusFilterChange(null); }} />
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {result.records.map((record) => (
              <DeveloperRow
                key={record.runId}
                record={record}
                expanded={expandedRunId === record.runId}
                onToggle={() =>
                  setExpandedRunId((prev) =>
                    prev === record.runId ? null : record.runId
                  )
                }
              />
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="shrink-0 flex items-center justify-between border-t border-white/10 px-6 py-3">
          <button
            onClick={() => onPageChange(Math.max(0, page - 1))}
            disabled={page === 0}
            className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            Previous
          </button>
          <span className="text-[10px] text-muted-foreground/60">
            Page {page + 1} of {totalPages}
          </span>
          <button
            onClick={() => onPageChange(Math.min(totalPages - 1, page + 1))}
            disabled={page >= totalPages - 1}
            className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

// ── Developer row ───────────────────────────────────────────────

function DeveloperRow({
  record,
  expanded,
  onToggle,
}: {
  record: ExecutionRecord;
  expanded: boolean;
  onToggle: () => void;
}) {
  const sc = getStatusConfig(record.status);
  const startDate = new Date(record.startedAt);
  const timeStr = startDate.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-4 px-6 py-3 text-left hover:bg-white/[0.02] transition-colors"
      >
        {/* Expand chevron */}
        <svg
          className={`h-3 w-3 text-muted-foreground/40 shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>

        {/* Status badge */}
        <span className={`shrink-0 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-medium ${sc.bgColor} ${sc.color}`}>
          <span>{sc.icon}</span>
          {sc.label}
        </span>

        {/* Run ID */}
        <span className="shrink-0 text-[10px] text-muted-foreground/50 font-mono w-24 truncate">
          {record.runId.slice(0, 8)}
        </span>

        {/* Workflow ID */}
        <span className="flex-1 text-[10px] text-muted-foreground/70 truncate">
          {record.workflowId}
        </span>

        {/* Duration */}
        <span className="shrink-0 text-[10px] text-muted-foreground/50 w-16 text-right">
          {record.durationMs != null ? formatDuration(record.durationMs) : "--"}
        </span>

        {/* Timestamp */}
        <span className="shrink-0 text-[10px] text-muted-foreground/40 w-36 text-right">
          {timeStr}
        </span>
      </button>

      {/* Expanded node timeline */}
      {expanded && (
        <div className="border-t border-white/[0.04] bg-white/[0.01] px-6 py-4">
          {record.error && (
            <div className="mb-3 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-[10px] text-red-400">
              {record.error}
            </div>
          )}
          {record.nodeEvents.length === 0 ? (
            <p className="text-[10px] text-muted-foreground/40">No node events recorded.</p>
          ) : (
            <div className="space-y-1.5">
              {record.nodeEvents.map((event, idx) => (
                <NodeEventRow key={`${event.nodeId}-${event.status}-${idx}`} event={event} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Node event row (developer detail) ───────────────────────────

function NodeEventRow({ event }: { event: NodeExecutionEvent }) {
  const [showData, setShowData] = React.useState(false);
  const hasData = (event.input && Object.keys(event.input).length > 0) ||
                  (event.output && Object.keys(event.output).length > 0);

  const eventColor = event.status === "completed"
    ? "text-emerald-400/70"
    : event.status === "failed"
    ? "text-red-400/70"
    : event.status === "skipped"
    ? "text-muted-foreground/40"
    : event.status === "retried"
    ? "text-amber-400/70"
    : "text-blue-400/70";

  return (
    <div>
      <div className="flex items-center gap-3">
        {/* Timeline dot */}
        <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${
          event.status === "completed" ? "bg-emerald-400" :
          event.status === "failed" ? "bg-red-400" :
          event.status === "skipped" ? "bg-muted-foreground/30" :
          event.status === "retried" ? "bg-amber-400" :
          "bg-blue-400"
        }`} />

        <span className={`text-[10px] ${eventColor}`}>
          {formatNodeEvent(event)}
        </span>

        <span className="text-[9px] text-muted-foreground/30 font-mono">
          {event.nodeId}
        </span>

        {hasData && (
          <button
            onClick={() => setShowData((v) => !v)}
            className="text-[9px] text-blue-400/60 hover:text-blue-400 transition-colors"
          >
            {showData ? "hide" : "data"}
          </button>
        )}
      </div>

      {showData && hasData && (
        <div className="ml-4.5 mt-1 space-y-1">
          {event.input && Object.keys(event.input).length > 0 && (
            <div>
              <span className="text-[9px] text-muted-foreground/40">Input:</span>
              <pre className="mt-0.5 rounded-md bg-white/[0.02] border border-white/[0.04] p-2 text-[9px] text-muted-foreground/60 overflow-x-auto max-h-32 overflow-y-auto">
                {JSON.stringify(event.input, null, 2)}
              </pre>
            </div>
          )}
          {event.output && Object.keys(event.output).length > 0 && (
            <div>
              <span className="text-[9px] text-muted-foreground/40">Output:</span>
              <pre className="mt-0.5 rounded-md bg-white/[0.02] border border-white/[0.04] p-2 text-[9px] text-muted-foreground/60 overflow-x-auto max-h-32 overflow-y-auto">
                {JSON.stringify(event.output, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Consumer mode (Activity Feed) ───────────────────────────────

function ConsumerFeed({
  result,
  page,
  totalPages,
  onLoadMore,
  onClose,
}: {
  result: ReturnType<ExecutionHistoryStore["query"]>;
  page: number;
  totalPages: number;
  onLoadMore: () => void;
  onClose?: () => void;
}) {
  return (
    <div className="flex flex-col h-full rounded-2xl border border-white/10 bg-[#0a0a0f] shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0 border-b border-white/10 px-6 py-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Activity</h2>
          <p className="text-[10px] text-muted-foreground/60 mt-0.5">
            Recent automation runs
          </p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="flex items-center justify-center h-7 w-7 rounded-lg border border-white/10 text-muted-foreground hover:text-foreground hover:bg-white/[0.05] transition-colors"
            aria-label="Close"
          >
            <CloseIcon />
          </button>
        )}
      </div>

      {/* Feed */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {result.records.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground/50">
            <p className="text-xs">No activity yet</p>
            <p className="text-[10px] mt-1">Runs will appear here as workflows execute.</p>
          </div>
        ) : (
          <div className="space-y-0">
            {result.records.map((record, idx) => (
              <ConsumerFeedItem
                key={record.runId}
                record={record}
                isLast={idx === result.records.length - 1}
              />
            ))}
          </div>
        )}
      </div>

      {/* Load more */}
      {page < totalPages - 1 && result.records.length > 0 && (
        <div className="shrink-0 border-t border-white/10 px-6 py-3 flex justify-center">
          <button
            onClick={onLoadMore}
            className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-1.5 text-[10px] text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors"
          >
            Load more
          </button>
        </div>
      )}
    </div>
  );
}

function ConsumerFeedItem({
  record,
  isLast,
}: {
  record: ExecutionRecord;
  isLast: boolean;
}) {
  const sc = getStatusConfig(record.status);
  const summary = formatRunSummary(record);
  const startDate = new Date(record.startedAt);
  const timeStr = formatRelativeTime(startDate);

  return (
    <div className="flex gap-3 py-3">
      {/* Timeline line + icon */}
      <div className="flex flex-col items-center shrink-0">
        <span className="text-sm leading-none">{sc.icon}</span>
        {!isLast && (
          <div className="w-px flex-1 bg-white/[0.06] mt-1.5" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 pb-1">
        <p className="text-[11px] text-foreground/90 leading-relaxed">
          {summary}
        </p>
        <p className="text-[9px] text-muted-foreground/40 mt-1">
          {timeStr}
        </p>
      </div>
    </div>
  );
}

// ── Shared sub-components ───────────────────────────────────────

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`
        rounded-full px-3 py-1 text-[10px] font-medium transition-colors
        ${
          active
            ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
            : "bg-white/[0.03] text-muted-foreground/60 border border-white/5 hover:bg-white/[0.06] hover:text-muted-foreground"
        }
      `}
    >
      {label}
    </button>
  );
}

function StatBadge({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-xs font-semibold text-foreground">{value}</span>
      <span className="text-[9px] text-muted-foreground/50">{label}</span>
    </div>
  );
}

function EmptyState({ onClear }: { onClear: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground/50">
      <svg
        className="h-10 w-10 mb-3"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <p className="text-xs">No runs match your filters</p>
      <button
        onClick={onClear}
        className="mt-2 text-[10px] text-blue-400 hover:text-blue-300 transition-colors"
      >
        Clear filters
      </button>
    </div>
  );
}

// ── Icons ───────────────────────────────────────────────────────

function CloseIcon() {
  return (
    <svg
      className="h-3.5 w-3.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg
      className="h-3 w-3"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg
      className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/40"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

// ── Time formatting ─────────────────────────────────────────────

function formatRelativeTime(date: Date): string {
  const nowMs = Date.now();
  const diffMs = nowMs - date.getTime();

  if (diffMs < 0) return "just now";

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return "just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
  });
}
