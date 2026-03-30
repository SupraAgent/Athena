"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { AgentTaskChart } from "@/components/charts/agent-task-chart";
import { AgentTokenConfig } from "@/components/agents/agent-token-config";
import { PersonaSelector } from "@/components/agents/persona-selector";
import { PersonasTab } from "@/components/agents/personas-tab";
import { OrgChartPanel } from "@/components/agents/org-chart-panel";
import type { Persona } from "@/lib/personas";
import { mapPersona, DEFAULT_PERSONAS } from "@/lib/personas";
import type { AgentTask, AgentTaskStatus } from "@/lib/agent-tasks";
import type { AgentReputation } from "@/lib/reviews";
import { getReputationColor } from "@/lib/reviews";

type StatusFilter = "all" | "running" | "queued" | "completed" | "failed" | "timed_out";
const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "running", label: "Running" },
  { value: "queued", label: "Queued" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
  { value: "timed_out", label: "Timed Out" },
];

type Tab = "overview" | "tasks" | "leaderboard" | "personas" | "hierarchy" | "accounts" | "configure";

/* --- Status badges --- */

function TaskStatusBadge({ status }: { status: AgentTaskStatus }) {
  const config: Record<AgentTaskStatus, { label: string; classes: string; pulse?: boolean }> = {
    queued: { label: "Queued", classes: "bg-white/10 text-muted-foreground" },
    running: { label: "Running", classes: "bg-amber-500/20 text-amber-400", pulse: true },
    completed: { label: "Done", classes: "bg-primary/20 text-primary" },
    failed: { label: "Failed", classes: "bg-red-500/20 text-red-400" },
    cancelled: { label: "Cancelled", classes: "bg-white/10 text-muted-foreground" },
    timed_out: { label: "Timed out", classes: "bg-orange-500/20 text-orange-400" },
  };
  const c = config[status];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium", c.classes)}>
      {c.pulse && (
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-amber-400" />
        </span>
      )}
      {c.label}
    </span>
  );
}

/* --- Helpers --- */

function timeAgo(timestamp: string): string {
  const seconds = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function duration(start?: string, end?: string): string {
  if (!start) return "";
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : Date.now();
  const sec = Math.floor((e - s) / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const remSec = sec % 60;
  return `${min}m ${remSec.toString().padStart(2, "0")}s`;
}

/* --- Task card --- */

function TaskCard({ task }: { task: AgentTask }) {
  const isTerminal = ["completed", "failed", "cancelled", "timed_out"].includes(task.status);
  return (
    <Link
      href={`/agents/${task.id}`}
      className="block rounded-xl border border-white/10 bg-white/[0.02] p-4 transition hover:border-white/15"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-foreground">{task.title}</span>
            <TaskStatusBadge status={task.status} />
            <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {task.taskType}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
            <div className="flex items-center gap-1">
              {task.agentAvatar ? (
                <img src={task.agentAvatar} alt="" className="h-4 w-4 rounded-full" />
              ) : (
                <svg viewBox="0 0 16 16" width={12} height={12} fill="currentColor" className="text-muted-foreground"><path d="M8 0a1 1 0 0 1 1 1v1.07A6.002 6.002 0 0 1 14 8a6 6 0 0 1-12 0 6.002 6.002 0 0 1 5-5.93V1a1 1 0 0 1 1-1ZM6 8a1 1 0 1 0-2 0 1 1 0 0 0 2 0Zm6 0a1 1 0 1 0-2 0 1 1 0 0 0 2 0Zm-2 3.5c0-.28-.22-.5-.5-.5h-3a.5.5 0 0 0 0 1h3a.5.5 0 0 0 .5-.5Z"/></svg>
              )}
              <span>{task.agentName ?? "Agent"}</span>
            </div>
            {task.startedAt && (
              <>
                <span>&middot;</span>
                <span>{isTerminal ? `Completed in ${duration(task.startedAt, task.completedAt)}` : `Running ${duration(task.startedAt)}`}</span>
              </>
            )}
            <span>&middot;</span>
            <span>{timeAgo(task.updatedAt)}</span>
          </div>
          {task.output?.summary && (
            <p className="mt-2 text-xs text-muted-foreground line-clamp-2">{task.output.summary}</p>
          )}
        </div>
        <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2} className="flex-shrink-0 text-muted-foreground">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </div>
    </Link>
  );
}

/* --- Getting Started (shown when no agents exist) --- */

function GettingStarted({ onAgentCreated }: { onAgentCreated: () => void }) {
  const [name, setName] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [created, setCreated] = React.useState<{ id: string; name: string } | null>(null);
  const [copiedId, setCopiedId] = React.useState(false);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/agents/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: name.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to create agent");
        return;
      }
      const data = await res.json();
      setCreated({ id: data.agent?.id ?? "unknown", name: name.trim() });
      setName("");
      onAgentCreated();
    } catch {
      setError("Failed to create agent");
    } finally {
      setCreating(false);
    }
  };

  const copyId = () => {
    if (created) {
      navigator.clipboard.writeText(created.id);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    }
  };

  const STEPS = [
    {
      num: 1,
      title: "Create an agent account",
      desc: "Give your AI agent an identity. It gets a UUID and shows up alongside humans in the dashboard.",
      done: !!created,
    },
    {
      num: 2,
      title: "Configure its tokens",
      desc: "Give the agent its own GitHub and Anthropic API keys so it can read code and run reviews.",
      done: false,
    },
    {
      num: 3,
      title: "Start the agent process",
      desc: "Run AutoVibe or your own script. Tasks appear here in real time, reviews feed the leaderboard.",
      done: false,
    },
  ];

  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10">
          <svg viewBox="0 0 16 16" width={28} height={28} fill="currentColor" className="text-primary">
            <path d="M8 0a1 1 0 0 1 1 1v1.07A6.002 6.002 0 0 1 14 8a6 6 0 0 1-12 0 6.002 6.002 0 0 1 5-5.93V1a1 1 0 0 1 1-1ZM6 8a1 1 0 1 0-2 0 1 1 0 0 0 2 0Zm6 0a1 1 0 1 0-2 0 1 1 0 0 0 2 0Zm-2 3.5c0-.28-.22-.5-.5-.5h-3a.5.5 0 0 0 0 1h3a.5.5 0 0 0 .5-.5Z"/>
          </svg>
        </div>
        <h1 className="text-2xl font-semibold text-foreground">Add an AI agent to your team</h1>
        <p className="mt-2 text-sm text-muted-foreground max-w-lg mx-auto">
          Agents are AI-powered teammates that review code, score builds, and run tasks automatically.
          They compete on a leaderboard -- the human who builds the best agent wins.
        </p>
      </div>

      {/* How it works */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
        <h2 className="text-sm font-medium text-foreground mb-4">How it works</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {STEPS.map((step) => (
            <div key={step.num} className={cn(
              "rounded-xl border p-4",
              step.done ? "border-primary/30 bg-primary/[0.04]" : "border-white/10 bg-white/[0.02]"
            )}>
              <div className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold mb-3",
                step.done ? "bg-primary text-black" : "bg-white/10 text-muted-foreground"
              )}>
                {step.done ? (
                  <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={3}>
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : step.num}
              </div>
              <p className="text-sm font-medium text-foreground">{step.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">{step.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Leaderboard preview */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex items-center gap-1 text-lg">
            <span>&#x1F947;</span>
            <span>&#x1F948;</span>
            <span>&#x1F949;</span>
          </div>
          <div>
            <h2 className="text-sm font-medium text-foreground">Agent Leaderboard</h2>
            <p className="text-xs text-muted-foreground">Agents are ranked by reputation. Build the best one.</p>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-2">
          <div className="rounded-lg bg-white/[0.03] px-3 py-2 text-center">
            <div className="text-sm font-medium text-foreground">30%</div>
            <div className="text-[10px] text-muted-foreground">Build success</div>
          </div>
          <div className="rounded-lg bg-white/[0.03] px-3 py-2 text-center">
            <div className="text-sm font-medium text-foreground">25%</div>
            <div className="text-[10px] text-muted-foreground">Score accuracy</div>
          </div>
          <div className="rounded-lg bg-white/[0.03] px-3 py-2 text-center">
            <div className="text-sm font-medium text-foreground">25%</div>
            <div className="text-[10px] text-muted-foreground">Human agreement</div>
          </div>
          <div className="rounded-lg bg-white/[0.03] px-3 py-2 text-center">
            <div className="text-sm font-medium text-foreground">20%</div>
            <div className="text-[10px] text-muted-foreground">Consistency</div>
          </div>
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">
          Create 2+ agents to see them compete. Each review updates the scores.
        </p>
      </div>

      {/* Create form or success state */}
      {!created ? (
        <div className="space-y-4">
          {/* Persona Builder CTA */}
          <Link
            href="/agents/create"
            className="block rounded-2xl border border-primary/20 bg-primary/[0.04] p-6 hover:border-primary/30 hover:bg-primary/[0.06] transition group"
          >
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15">
                <svg viewBox="0 0 16 16" width={20} height={20} fill="currentColor" className="text-primary">
                  <path d="M7.53 1.282a.5.5 0 0 1 .94 0l1.14 3.135a.5.5 0 0 0 .293.293L13.04 5.85a.5.5 0 0 1 0 .94l-3.135 1.14a.5.5 0 0 0-.293.293L8.47 11.36a.5.5 0 0 1-.94 0L6.39 8.223a.5.5 0 0 0-.293-.293L2.96 6.79a.5.5 0 0 1 0-.94L6.097 4.71a.5.5 0 0 0 .293-.293L7.53 1.282ZM3.28 10.599a.375.375 0 0 1 .706 0l.503 1.384a.375.375 0 0 0 .22.22l1.384.503a.375.375 0 0 1 0 .706l-1.384.503a.375.375 0 0 0-.22.22l-.503 1.384a.375.375 0 0 1-.706 0l-.503-1.384a.375.375 0 0 0-.22-.22l-1.384-.503a.375.375 0 0 1 0-.706l1.384-.503a.375.375 0 0 0 .22-.22l.503-1.384Z" />
                </svg>
              </div>
              <div>
                <h2 className="text-sm font-medium text-foreground group-hover:text-primary transition">Build an agent persona</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Step-by-step builder. Pick a role, define their focus, add company inspirations, and generate a North Star. Creates a specialized agent with real context.
                </p>
              </div>
              <svg viewBox="0 0 16 16" width={16} height={16} fill="currentColor" className="mt-1 shrink-0 text-muted-foreground group-hover:text-primary transition">
                <path fillRule="evenodd" d="M8.22 2.97a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06l2.97-2.97H3a.75.75 0 0 1 0-1.5h8.19L8.22 4.03a.75.75 0 0 1 0-1.06Z" />
              </svg>
            </div>
          </Link>

          {/* Quick create fallback */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
            <h2 className="text-sm font-medium text-foreground mb-1">Or quick-create with just a name</h2>
            <p className="text-xs text-muted-foreground mb-4">Skip the persona builder if you just need a basic agent account.</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
                placeholder="e.g. AutoVibe, CodeReviewer, SecurityBot"
                className="flex-1 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none"
              />
              <Button variant="secondary" onClick={handleCreate} disabled={!name.trim() || creating}>
                {creating ? "Creating..." : "Create"}
              </Button>
            </div>
            {error && (
              <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                {error}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-primary/30 bg-primary/[0.06] p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/20">
              <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={2} className="text-primary">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">{created.name} created</p>
              <div className="flex items-center gap-2 mt-0.5">
                <code className="text-[11px] text-muted-foreground">{created.id}</code>
                <button
                  type="button"
                  onClick={copyId}
                  className={cn("text-[10px] font-medium", copiedId ? "text-primary" : "text-muted-foreground hover:text-foreground")}
                >
                  {copiedId ? "Copied" : "Copy ID"}
                </button>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
            <p className="text-xs font-medium text-foreground">Next steps:</p>
            <div className="flex items-start gap-3">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/10 text-[10px] font-bold text-muted-foreground">2</span>
              <div>
                <p className="text-xs text-foreground">Configure tokens for {created.name}</p>
                <p className="text-[11px] text-muted-foreground">Give it GitHub and Anthropic API keys so it can review code.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/10 text-[10px] font-bold text-muted-foreground">3</span>
              <div>
                <p className="text-xs text-foreground">Start the agent process</p>
                <p className="text-[11px] text-muted-foreground">
                  Run <code className="rounded bg-white/[0.06] px-1 py-0.5 text-[10px]">python3 autovibe/run_loop.py</code> with{" "}
                  <code className="rounded bg-white/[0.06] px-1 py-0.5 text-[10px]">AUTOVIBE_AGENT_USER_ID={created.id.slice(0, 8)}...</code>
                </p>
              </div>
            </div>
          </div>
          <Button onClick={() => { onAgentCreated(); }} size="sm">
            Go to Accounts to configure tokens
          </Button>
        </div>
      )}
    </div>
  );
}

/* --- Main page --- */

function AgentsPageInner() {
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const ALL_TABS: Tab[] = ["overview", "tasks", "leaderboard", "personas", "hierarchy", "accounts", "configure"];
  const initialTab: Tab = ALL_TABS.includes(tabParam as Tab)
    ? (tabParam as Tab)
    : tabParam === "reviewers" ? "leaderboard" : "overview";
  const [tab, setTab] = React.useState<Tab>(initialTab);

  // Sync tab with URL when navigating (e.g. from ReviewPanel "Create one" link)
  React.useEffect(() => {
    if (tabParam && ALL_TABS.includes(tabParam as Tab)) {
      setTab(tabParam as Tab);
    } else if (tabParam === "reviewers") {
      setTab("leaderboard");
    }
  }, [tabParam]);

  // Agent count -- drives whether we show getting-started or tabs
  const [agentCount, setAgentCount] = React.useState<number | null>(null);

  React.useEffect(() => {
    fetch("/api/agents/profiles")
      .then((r) => r.ok ? r.json() : { agents: [] })
      .then((data) => setAgentCount((data.agents ?? []).length))
      .catch(() => setAgentCount(0));
  }, []);

  // Tasks state
  const [tasks, setTasks] = React.useState<AgentTask[]>([]);
  const [tasksLoading, setTasksLoading] = React.useState(true);
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("all");

  // Fetch tasks on mount
  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/agent/tasks")
      .then((res) => res.ok ? res.json() : { tasks: [] })
      .then((data) => {
        if (!cancelled) setTasks(data.tasks ?? []);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setTasksLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Supabase Broadcast subscription for live task status updates
  React.useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;

    const channel = supabase
      .channel("agent-activity")
      .on("broadcast", { event: "task_status_change" }, (payload: { payload: unknown }) => {
        const update = payload.payload as Partial<AgentTask> & { id: string };
        if (!update?.id) return;
        setTasks((prev) => {
          const idx = prev.findIndex((t) => t.id === update.id);
          if (idx === -1) return prev;
          const existing = prev[idx];
          // Only apply if newer
          if (update.updatedAt && existing.updatedAt >= update.updatedAt) return prev;
          const next = [...prev];
          next[idx] = { ...existing, ...update };
          return next;
        });

        // Fire toasts for terminal state transitions (not stale reconnects)
        if (update.updatedAt) {
          const transitionAge = Date.now() - new Date(update.updatedAt).getTime();
          if (transitionAge > 60_000) return; // suppress stale events

          const title = update.title ?? "Agent task";
          if (update.status === "completed") {
            toast.success(`Task done: ${title}`, {
              action: { label: "View", onClick: () => { window.location.href = `/agents/${update.id}`; } },
            });
          } else if (update.status === "failed") {
            toast.error(`Task failed: ${title}`, {
              duration: 8000,
              description: (update as AgentTask).output?.summary ?? undefined,
              action: { label: "See logs", onClick: () => { window.location.href = `/agents/${update.id}`; } },
            });
            fetch("/api/notifications", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ type: "agent_task_failed", title: `Agent task failed: ${title}`, link: `/agents/${update.id}` }),
            }).catch(() => {});
          } else if (update.status === "timed_out") {
            toast.error(`Task timed out: ${title}`, { duration: 8000 });
            fetch("/api/notifications", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ type: "agent_task_failed", title: `Agent task timed out: ${title}`, link: `/agents/${update.id}` }),
            }).catch(() => {});
          }
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // Filtered tasks by status
  const filteredTasks = React.useMemo(() => {
    if (statusFilter === "all") return tasks;
    return tasks.filter((t) => t.status === statusFilter);
  }, [tasks, statusFilter]);

  // Show getting-started flow when no agents exist and no tasks
  const showGettingStarted = agentCount === 0 && tasks.length === 0 && !tasksLoading;

  // Still loading agent count
  if (agentCount === null) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="h-8 w-32 animate-pulse rounded-lg bg-white/[0.03]" />
        <div className="mt-6 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-white/[0.03]" />
          ))}
        </div>
      </div>
    );
  }

  if (showGettingStarted) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <GettingStarted onAgentCreated={() => { setAgentCount(1); setTab("accounts"); }} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Agents</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          AI agent tasks and configuration. Agent deployments appear in{" "}
          <Link href="/deployments" className="text-primary hover:underline">Deployments</Link>{" "}
          with a bot icon.
        </p>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex items-center gap-4">
        <div className="flex rounded-lg border border-white/10 bg-white/[0.02] p-0.5">
          {([
            { value: "overview" as Tab, label: "Overview" },
            { value: "tasks" as Tab, label: "Tasks" },
            { value: "leaderboard" as Tab, label: "Leaderboard" },
            { value: "personas" as Tab, label: "Personas" },
            { value: "hierarchy" as Tab, label: "Hierarchy" },
            { value: "accounts" as Tab, label: "Accounts" },
            { value: "configure" as Tab, label: "Configure" },
          ]).map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setTab(t.value)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition",
                tab === t.value ? "bg-white/10 text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Overview tab */}
      {tab === "overview" && (
        <OverviewTab
          tasks={tasks}
          tasksLoading={tasksLoading}
          agentCount={agentCount ?? 0}
          onSwitchTab={setTab}
        />
      )}

      {/* Tasks tab */}
      {tab === "tasks" && (
        <>
          {/* Status filter pills */}
          {!tasksLoading && tasks.length > 0 && (
            <div className="mb-4 flex rounded-lg border border-white/10 bg-white/[0.02] p-0.5 w-fit">
              {STATUS_FILTERS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => setStatusFilter(f.value)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm font-medium transition",
                    statusFilter === f.value ? "bg-white/10 text-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}

          <AgentTaskChart tasks={tasks} />

          {tasksLoading && (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-20 animate-pulse rounded-xl bg-white/[0.03]" />
              ))}
            </div>
          )}
          {!tasksLoading && filteredTasks.length === 0 && tasks.length === 0 && (
            <div className="rounded-2xl border border-dashed border-white/20 bg-white/[0.02] p-8 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-white/10">
                <svg viewBox="0 0 16 16" width={20} height={20} fill="currentColor" className="text-muted-foreground"><path d="M8 0a1 1 0 0 1 1 1v1.07A6.002 6.002 0 0 1 14 8a6 6 0 0 1-12 0 6.002 6.002 0 0 1 5-5.93V1a1 1 0 0 1 1-1ZM6 8a1 1 0 1 0-2 0 1 1 0 0 0 2 0Zm6 0a1 1 0 1 0-2 0 1 1 0 0 0 2 0Zm-2 3.5c0-.28-.22-.5-.5-.5h-3a.5.5 0 0 0 0 1h3a.5.5 0 0 0 .5-.5Z"/></svg>
              </div>
              <h3 className="text-sm font-medium text-foreground">No tasks running</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Your agents haven&apos;t run any tasks yet. Start an agent process (e.g. AutoVibe) and tasks will appear here in real time.
              </p>
              <button
                type="button"
                onClick={() => setTab("configure")}
                className="mt-3 inline-flex items-center justify-center rounded-md border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-foreground hover:bg-white/[0.08] transition"
              >
                See how to run an agent
              </button>
            </div>
          )}
          {!tasksLoading && filteredTasks.length === 0 && tasks.length > 0 && (
            <div className="rounded-2xl border border-dashed border-white/20 bg-white/[0.02] p-8 text-center">
              <p className="text-sm text-muted-foreground">No tasks match the selected filter.</p>
            </div>
          )}
          {!tasksLoading && filteredTasks.length > 0 && (
            <div className="space-y-2">
              {filteredTasks.map((t) => (
                <TaskCard key={t.id} task={t} />
              ))}
            </div>
          )}
        </>
      )}

      {/* Leaderboard tab */}
      {tab === "leaderboard" && <LeaderboardTab onSwitchToAccounts={() => setTab("accounts")} />}

      {/* Personas tab */}
      {tab === "personas" && <PersonasTab />}

      {/* Hierarchy tab */}
      {tab === "hierarchy" && <HierarchyTab />}

      {/* Accounts tab */}
      {tab === "accounts" && <AccountsTab onAgentCreated={() => setAgentCount((c) => (c ?? 0) + 1)} />}

      {/* Configure tab */}
      {tab === "configure" && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 space-y-4">
          <h2 className="text-sm font-medium text-foreground">Agent Configuration</h2>
          <p className="text-xs text-muted-foreground">
            Create agent accounts in the <button type="button" onClick={() => setTab("accounts")} className="text-primary hover:underline">Accounts</button> tab.
          </p>
          <div>
            <p className="mb-2 text-xs font-medium text-foreground">Start AutoVibe locally</p>
            <pre className="rounded-lg border border-white/10 bg-black/20 px-4 py-3 font-mono text-xs text-foreground overflow-x-auto">
python3 autovibe/run_loop.py
            </pre>
            <p className="mt-2 text-xs text-muted-foreground">
              Runs on your machine or a VPS. Vercel serverless cannot run long-lived processes.
            </p>
          </div>
          <div>
            <p className="mb-1.5 text-xs font-medium text-foreground">Environment variables</p>
            <ul className="space-y-1 text-xs text-muted-foreground">
              <li><code className="rounded bg-white/[0.06] px-1 py-0.5">SUPABASE_SERVICE_ROLE_KEY</code> — required for writing tasks</li>
              <li><code className="rounded bg-white/[0.06] px-1 py-0.5">AUTOVIBE_AGENT_USER_ID</code> — agent profile ID (from Settings)</li>
              <li><code className="rounded bg-white/[0.06] px-1 py-0.5">AUTOVIBE_API_URL</code> — e.g. <code className="rounded bg-white/[0.06] px-1 py-0.5">http://localhost:3001</code></li>
              <li><code className="rounded bg-white/[0.06] px-1 py-0.5">AUTOVIBE_INTERVAL</code> — seconds between cycles (default: 1800)</li>
            </ul>
          </div>
        </div>
      )}

    </div>
  );
}

/* --- Overview Tab --- */

function OverviewTab({
  tasks,
  tasksLoading,
  agentCount,
  onSwitchTab,
}: {
  tasks: AgentTask[];
  tasksLoading: boolean;
  agentCount: number;
  onSwitchTab: (tab: Tab) => void;
}) {
  const [leaderboard, setLeaderboard] = React.useState<AgentReputation[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = React.useState(true);

  React.useEffect(() => {
    fetch("/api/reviews/agents")
      .then((r) => (r.ok ? r.json() : { agents: [] }))
      .then((data) => setLeaderboard(data.agents ?? []))
      .catch(() => {})
      .finally(() => setLeaderboardLoading(false));
  }, []);

  const ranked = React.useMemo(
    () => [...leaderboard].sort((a, b) => b.reputationScore - a.reputationScore),
    [leaderboard]
  );

  const runningCount = tasks.filter((t) => t.status === "running").length;
  const completedCount = tasks.filter((t) => t.status === "completed").length;
  const failedCount = tasks.filter((t) => t.status === "failed").length;
  const recentTasks = tasks.slice(0, 5);

  const rankMedal = (rank: number) => {
    if (rank === 0) return <span className="text-base">&#x1F947;</span>;
    if (rank === 1) return <span className="text-base">&#x1F948;</span>;
    if (rank === 2) return <span className="text-base">&#x1F949;</span>;
    return <span className="text-sm font-medium text-muted-foreground">#{rank + 1}</span>;
  };

  return (
    <div className="space-y-6">
      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Agents", value: agentCount, color: "text-primary" },
          { label: "Running", value: runningCount, color: runningCount > 0 ? "text-amber-400" : "text-muted-foreground" },
          { label: "Completed", value: completedCount, color: "text-foreground" },
          { label: "Failed", value: failedCount, color: failedCount > 0 ? "text-red-400" : "text-muted-foreground" },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
            <div className={cn("text-2xl font-bold tabular-nums", stat.color)}>{stat.value}</div>
            <div className="text-[11px] text-muted-foreground">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <div className="flex gap-2">
        <Button size="sm" onClick={() => onSwitchTab("accounts")}>
          <svg viewBox="0 0 16 16" width={14} height={14} fill="currentColor" className="mr-1.5">
            <path d="M8 0a1 1 0 0 1 1 1v1.07A6.002 6.002 0 0 1 14 8a6 6 0 0 1-12 0 6.002 6.002 0 0 1 5-5.93V1a1 1 0 0 1 1-1ZM6 8a1 1 0 1 0-2 0 1 1 0 0 0 2 0Zm6 0a1 1 0 1 0-2 0 1 1 0 0 0 2 0Zm-2 3.5c0-.28-.22-.5-.5-.5h-3a.5.5 0 0 0 0 1h3a.5.5 0 0 0 .5-.5Z"/>
          </svg>
          New agent
        </Button>
        <Button variant="outline" size="sm" onClick={() => onSwitchTab("configure")}>
          Configure
        </Button>
      </div>

      {/* Leaderboard section */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-medium text-foreground">Agent Leaderboard</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Ranked by reputation. Build the best agent.
            </p>
          </div>
          <button type="button" onClick={() => onSwitchTab("leaderboard")} className="text-xs text-primary hover:underline">
            View full leaderboard
          </button>
        </div>

        {leaderboardLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-lg bg-white/[0.03]" />
            ))}
          </div>
        ) : ranked.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/20 bg-white/[0.02] p-6 text-center">
            <p className="text-sm text-muted-foreground">No agents yet. Create one to start competing.</p>
            <Button size="sm" className="mt-3" onClick={() => onSwitchTab("accounts")}>
              Create first agent
            </Button>
          </div>
        ) : (
          <>
            {/* Podium for top 3 */}
            {ranked.length >= 3 && (
              <div className="grid grid-cols-3 gap-3 mb-4">
                {ranked.slice(0, 3).map((agent, i) => {
                  const borderColor = i === 0 ? "border-primary/40" : i === 1 ? "border-white/20" : "border-amber-700/30";
                  const bgColor = i === 0 ? "bg-primary/[0.06]" : "bg-white/[0.02]";
                  return (
                    <div key={agent.agentId} className={cn("rounded-xl border p-4 text-center", borderColor, bgColor)}>
                      <div className="mb-2">{rankMedal(i)}</div>
                      <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-white/10">
                        {agent.agentAvatar ? (
                          <img src={agent.agentAvatar} alt="" className="h-10 w-10 rounded-full" />
                        ) : (
                          <svg viewBox="0 0 16 16" width={16} height={16} fill="currentColor" className="text-muted-foreground"><path d="M8 0a1 1 0 0 1 1 1v1.07A6.002 6.002 0 0 1 14 8a6 6 0 0 1-12 0 6.002 6.002 0 0 1 5-5.93V1a1 1 0 0 1 1-1ZM6 8a1 1 0 1 0-2 0 1 1 0 0 0 2 0Zm6 0a1 1 0 1 0-2 0 1 1 0 0 0 2 0Zm-2 3.5c0-.28-.22-.5-.5-.5h-3a.5.5 0 0 0 0 1h3a.5.5 0 0 0 .5-.5Z"/></svg>
                        )}
                      </div>
                      <p className="text-sm font-medium text-foreground truncate">{agent.agentName}</p>
                      <div className={cn("mt-1 text-xl font-bold", getReputationColor(agent.tier))}>
                        {agent.reputationScore}
                      </div>
                      <div className="mt-1 grid grid-cols-2 gap-1 text-[10px] text-muted-foreground">
                        <div>
                          <div className="font-medium text-foreground">{agent.totalReviews}</div>
                          reviews
                        </div>
                        <div>
                          <div className="font-medium text-foreground">{Math.round(agent.buildSuccessRate)}%</div>
                          build pass
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Compact ranked list (fewer than 3) */}
            {ranked.length < 3 && (
              <div className="space-y-2">
                {ranked.map((agent, i) => (
                  <div key={agent.agentId} className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.02] px-4 py-3">
                    <div className="flex h-6 w-6 items-center justify-center">{rankMedal(i)}</div>
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10">
                      {agent.agentAvatar ? (
                        <img src={agent.agentAvatar} alt="" className="h-8 w-8 rounded-full" />
                      ) : (
                        <svg viewBox="0 0 16 16" width={14} height={14} fill="currentColor" className="text-muted-foreground"><path d="M8 0a1 1 0 0 1 1 1v1.07A6.002 6.002 0 0 1 14 8a6 6 0 0 1-12 0 6.002 6.002 0 0 1 5-5.93V1a1 1 0 0 1 1-1ZM6 8a1 1 0 1 0-2 0 1 1 0 0 0 2 0Zm6 0a1 1 0 1 0-2 0 1 1 0 0 0 2 0Zm-2 3.5c0-.28-.22-.5-.5-.5h-3a.5.5 0 0 0 0 1h3a.5.5 0 0 0 .5-.5Z"/></svg>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="text-sm font-medium text-foreground">{agent.agentName}</span>
                    </div>
                    <div className={cn("text-lg font-bold tabular-nums", getReputationColor(agent.tier))}>
                      {agent.reputationScore}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Reputation breakdown */}
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-lg bg-white/[0.03] px-3 py-2 text-center">
                <div className="text-sm font-medium text-foreground">30%</div>
                <div className="text-[10px] text-muted-foreground">Build success</div>
              </div>
              <div className="rounded-lg bg-white/[0.03] px-3 py-2 text-center">
                <div className="text-sm font-medium text-foreground">25%</div>
                <div className="text-[10px] text-muted-foreground">Score accuracy</div>
              </div>
              <div className="rounded-lg bg-white/[0.03] px-3 py-2 text-center">
                <div className="text-sm font-medium text-foreground">25%</div>
                <div className="text-[10px] text-muted-foreground">Human agreement</div>
              </div>
              <div className="rounded-lg bg-white/[0.03] px-3 py-2 text-center">
                <div className="text-sm font-medium text-foreground">20%</div>
                <div className="text-[10px] text-muted-foreground">Consistency</div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Recent tasks */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium text-foreground">Recent tasks</h2>
          <button type="button" onClick={() => onSwitchTab("tasks")} className="text-xs text-primary hover:underline">
            View all tasks
          </button>
        </div>
        {tasksLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-lg bg-white/[0.03]" />
            ))}
          </div>
        ) : recentTasks.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/20 bg-white/[0.02] p-6 text-center">
            <p className="text-sm text-muted-foreground">No tasks yet. Start an agent process to see tasks here.</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => onSwitchTab("configure")}>
              See how to run an agent
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {recentTasks.map((t) => (
              <TaskCard key={t.id} task={t} />
            ))}
          </div>
        )}
      </div>

      {/* Agent accounts summary */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-medium text-foreground">Agent accounts</h2>
          <button type="button" onClick={() => onSwitchTab("accounts")} className="text-xs text-primary hover:underline">
            Manage accounts
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          {agentCount === 0
            ? "No agents yet. Create one to get started."
            : `${agentCount} agent${agentCount === 1 ? "" : "s"} configured. Each has its own tokens and identity.`}
        </p>
        {agentCount === 0 && (
          <Button size="sm" className="mt-3" onClick={() => onSwitchTab("accounts")}>
            Create first agent
          </Button>
        )}
      </div>
    </div>
  );
}

/* --- Leaderboard Tab --- */

function TierBadge({ tier, score }: { tier: string; score: number }) {
  const color = getReputationColor(tier as AgentReputation["tier"]);
  const bg = tier === "trusted" ? "bg-primary/10" : tier === "developing" ? "bg-amber-500/10" : "bg-white/[0.06]";
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", color, bg)}>
      {score}/100 {tier}
    </span>
  );
}

function HierarchyTab() {
  const [personas, setPersonas] = React.useState<Persona[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/personas");
        const data = await res.json();
        const dbPersonas = (data.personas || []).map((r: Record<string, unknown>) => mapPersona(r));
        setPersonas([...DEFAULT_PERSONAS, ...dbPersonas]);
      } catch {
        setPersonas([...DEFAULT_PERSONAS]);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
        Loading hierarchy...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-foreground">Agent Hierarchy</h2>
      </div>
      <OrgChartPanel personas={personas} />
    </div>
  );
}

function LeaderboardTab({ onSwitchToAccounts }: { onSwitchToAccounts: () => void }) {
  const [agents, setAgents] = React.useState<AgentReputation[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    fetch("/api/reviews/agents")
      .then((r) => r.ok ? r.json() : { agents: [] })
      .then((data) => setAgents(data.agents ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const ranked = React.useMemo(
    () => [...agents].sort((a, b) => b.reputationScore - a.reputationScore),
    [agents]
  );

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl bg-white/[0.03]" />
        ))}
      </div>
    );
  }

  if (agents.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-white/20 bg-white/[0.02] p-8 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-white/10">
          <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={1.5} className="text-muted-foreground">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" strokeLinecap="round" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87" strokeLinecap="round" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" strokeLinecap="round" />
          </svg>
        </div>
        <h3 className="text-sm font-medium text-foreground">No agents yet</h3>
        <p className="mt-1 text-xs text-muted-foreground max-w-md mx-auto">
          Create an agent account and assign it reviews. Agents compete on output quality -- build success rate, scoring accuracy, and consistency. The human who builds the best agent gets bragging rights.
        </p>
        <button
          type="button"
          onClick={onSwitchToAccounts}
          className="mt-3 inline-flex items-center justify-center rounded-md border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-foreground hover:bg-white/[0.08] transition"
        >
          Create agent
        </button>
      </div>
    );
  }

  const rankMedal = (rank: number) => {
    if (rank === 0) return <span className="text-base">&#x1F947;</span>;
    if (rank === 1) return <span className="text-base">&#x1F948;</span>;
    if (rank === 2) return <span className="text-base">&#x1F949;</span>;
    return <span className="text-sm font-medium text-muted-foreground">#{rank + 1}</span>;
  };

  return (
    <div className="space-y-4">
      {/* Leaderboard header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium text-foreground">Agent Leaderboard</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Ranked by reputation score. Agents compete on output quality, not humans on commits.
          </p>
        </div>
        <button type="button" onClick={onSwitchToAccounts} className="text-xs text-primary hover:underline">
          + New agent
        </button>
      </div>

      {/* Top 3 podium (when 3+ agents) */}
      {ranked.length >= 3 && (
        <div className="grid grid-cols-3 gap-3">
          {ranked.slice(0, 3).map((agent, i) => {
            const borderColor = i === 0 ? "border-primary/40" : i === 1 ? "border-white/20" : "border-amber-700/30";
            const bgColor = i === 0 ? "bg-primary/[0.06]" : "bg-white/[0.02]";
            return (
              <div key={agent.agentId} className={cn("rounded-xl border p-4 text-center", borderColor, bgColor)}>
                <div className="mb-2">{rankMedal(i)}</div>
                <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-white/10">
                  {agent.agentAvatar ? (
                    <img src={agent.agentAvatar} alt="" className="h-12 w-12 rounded-full" />
                  ) : (
                    <svg viewBox="0 0 16 16" width={20} height={20} fill="currentColor" className="text-muted-foreground"><path d="M8 0a1 1 0 0 1 1 1v1.07A6.002 6.002 0 0 1 14 8a6 6 0 0 1-12 0 6.002 6.002 0 0 1 5-5.93V1a1 1 0 0 1 1-1ZM6 8a1 1 0 1 0-2 0 1 1 0 0 0 2 0Zm6 0a1 1 0 1 0-2 0 1 1 0 0 0 2 0Zm-2 3.5c0-.28-.22-.5-.5-.5h-3a.5.5 0 0 0 0 1h3a.5.5 0 0 0 .5-.5Z"/></svg>
                  )}
                </div>
                <p className="text-sm font-medium text-foreground truncate">{agent.agentName}</p>
                <div className={cn("mt-1 text-2xl font-bold", getReputationColor(agent.tier))}>
                  {agent.reputationScore}
                </div>
                <TierBadge tier={agent.tier} score={agent.reputationScore} />
                <div className="mt-2 grid grid-cols-2 gap-1 text-[10px] text-muted-foreground">
                  <div>
                    <div className="font-medium text-foreground">{agent.totalReviews}</div>
                    reviews
                  </div>
                  <div>
                    <div className="font-medium text-foreground">{Math.round(agent.buildSuccessRate)}%</div>
                    build pass
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Full ranked list */}
      <div className="overflow-hidden rounded-xl border border-white/10">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 bg-white/[0.02] text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-2.5 font-medium w-12">#</th>
              <th className="px-4 py-2.5 font-medium">Agent</th>
              <th className="px-4 py-2.5 font-medium text-right">Score</th>
              <th className="px-4 py-2.5 font-medium text-center hidden sm:table-cell">Tier</th>
              <th className="px-4 py-2.5 font-medium text-right hidden sm:table-cell">Reviews</th>
              <th className="px-4 py-2.5 font-medium text-right hidden md:table-cell">Build %</th>
              <th className="px-4 py-2.5 font-medium text-right hidden md:table-cell">Consistency</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {ranked.map((agent, i) => (
              <tr key={agent.agentId} className="transition hover:bg-white/[0.03]">
                <td className="px-4 py-3">
                  <div className="flex h-6 w-6 items-center justify-center">
                    {rankMedal(i)}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10">
                      {agent.agentAvatar ? (
                        <img src={agent.agentAvatar} alt="" className="h-8 w-8 rounded-full" />
                      ) : (
                        <svg viewBox="0 0 16 16" width={14} height={14} fill="currentColor" className="text-muted-foreground"><path d="M8 0a1 1 0 0 1 1 1v1.07A6.002 6.002 0 0 1 14 8a6 6 0 0 1-12 0 6.002 6.002 0 0 1 5-5.93V1a1 1 0 0 1 1-1ZM6 8a1 1 0 1 0-2 0 1 1 0 0 0 2 0Zm6 0a1 1 0 1 0-2 0 1 1 0 0 0 2 0Zm-2 3.5c0-.28-.22-.5-.5-.5h-3a.5.5 0 0 0 0 1h3a.5.5 0 0 0 .5-.5Z"/></svg>
                      )}
                    </div>
                    <span className="font-medium text-foreground">{agent.agentName}</span>
                  </div>
                </td>
                <td className={cn("px-4 py-3 text-right font-bold tabular-nums", getReputationColor(agent.tier))}>
                  {agent.reputationScore}
                </td>
                <td className="px-4 py-3 text-center hidden sm:table-cell">
                  <TierBadge tier={agent.tier} score={agent.reputationScore} />
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-muted-foreground hidden sm:table-cell">
                  {agent.totalReviews}
                </td>
                <td className="px-4 py-3 text-right tabular-nums hidden md:table-cell">
                  <span className={cn(
                    agent.buildSuccessRate >= 90 ? "text-emerald-400" :
                    agent.buildSuccessRate >= 70 ? "text-amber-400" : "text-red-400"
                  )}>
                    {Math.round(agent.buildSuccessRate)}%
                  </span>
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-muted-foreground hidden md:table-cell">
                  {Math.round(agent.scoreConsistency)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Reputation formula */}
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <p className="text-xs font-medium text-muted-foreground mb-2">How reputation is calculated</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-lg bg-white/[0.03] px-3 py-2 text-center">
            <div className="text-sm font-medium text-foreground">30%</div>
            <div className="text-[10px] text-muted-foreground">Build success</div>
          </div>
          <div className="rounded-lg bg-white/[0.03] px-3 py-2 text-center">
            <div className="text-sm font-medium text-foreground">25%</div>
            <div className="text-[10px] text-muted-foreground">Score accuracy</div>
          </div>
          <div className="rounded-lg bg-white/[0.03] px-3 py-2 text-center">
            <div className="text-sm font-medium text-foreground">25%</div>
            <div className="text-[10px] text-muted-foreground">Human agreement</div>
          </div>
          <div className="rounded-lg bg-white/[0.03] px-3 py-2 text-center">
            <div className="text-sm font-medium text-foreground">20%</div>
            <div className="text-[10px] text-muted-foreground">Consistency</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* --- Accounts Tab --- */

type AgentProfile = {
  id: string;
  display_name: string;
  github_username: string | null;
  avatar_url: string | null;
  created_at: string;
  persona_id: string | null;
  personas: { id: string; name: string; icon: string | null } | null;
};

function AgentAccountCard({
  agent,
  copiedId,
  onCopyId,
  onUpdate,
  personas,
}: {
  agent: AgentProfile;
  copiedId: string | null;
  onCopyId: (id: string) => void;
  onUpdate: () => void;
  personas: Persona[];
}) {
  const [configOpen, setConfigOpen] = React.useState(false);

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden">
      <div className="flex items-center gap-4 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <svg viewBox="0 0 16 16" width={16} height={16} fill="currentColor" className="text-primary">
            <path d="M8 0a1 1 0 0 1 1 1v1.07A6.002 6.002 0 0 1 14 8a6 6 0 0 1-12 0 6.002 6.002 0 0 1 5-5.93V1a1 1 0 0 1 1-1ZM6 8a1 1 0 1 0-2 0 1 1 0 0 0 2 0Zm6 0a1 1 0 1 0-2 0 1 1 0 0 0 2 0Zm-2 3.5c0-.28-.22-.5-.5-.5h-3a.5.5 0 0 0 0 1h3a.5.5 0 0 0 .5-.5Z"/>
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">{agent.display_name}</span>
            {agent.github_username && (
              <span className="text-xs text-muted-foreground">@{agent.github_username}</span>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-2">
            <code className="text-[11px] text-muted-foreground">{agent.id}</code>
            <button
              type="button"
              onClick={() => onCopyId(agent.id)}
              className={cn(
                "text-[10px] font-medium",
                copiedId === agent.id ? "text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {copiedId === agent.id ? "Copied" : "Copy ID"}
            </button>
          </div>
          <div className="mt-1.5">
            <PersonaSelector agentId={agent.id} currentPersonaId={agent.persona_id} personas={personas} onUpdate={onUpdate} />
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setConfigOpen(!configOpen)}
          className="shrink-0 text-xs"
        >
          {configOpen ? "Hide tokens" : "Configure tokens"}
        </Button>
      </div>
      {configOpen && (
        <div className="border-t border-white/10 px-4 py-3 bg-black/10">
          <AgentTokenConfig agentId={agent.id} agentName={agent.display_name} onUpdate={onUpdate} />
        </div>
      )}
    </div>
  );
}

function AccountsTab({ onAgentCreated }: { onAgentCreated?: () => void } = {}) {
  const [agents, setAgents] = React.useState<AgentProfile[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [copiedId, setCopiedId] = React.useState<string | null>(null);
  const [personas, setPersonas] = React.useState<Persona[]>([]);

  // Fetch personas once for all PersonaSelectors
  React.useEffect(() => {
    fetch("/api/personas")
      .then((r) => r.ok ? r.json() : { personas: [] })
      .then((data) => setPersonas(data.personas ?? []))
      .catch(() => {});
  }, []);

  const fetchAgents = React.useCallback(async () => {
    try {
      const res = await fetch("/api/agents/profiles");
      if (res.ok) {
        const data = await res.json();
        setAgents(data.agents ?? []);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  const copyId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium text-foreground">Agent accounts</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Create accounts for AI agents (AutoVibe, reviewers, etc). Each gets a UUID for <code className="text-[10px]">AUTOVIBE_AGENT_USER_ID</code> or similar.
          </p>
        </div>
        <Link href="/agents/create" className="inline-flex items-center justify-center gap-2 rounded-md font-medium transition-all duration-150 active:scale-[0.97] bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-4 text-sm">
          Persona Builder
        </Link>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-white/[0.03]" />
          ))}
        </div>
      ) : agents.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-8 text-center text-sm text-muted-foreground">
          No agent accounts yet. Create one to give AI processes their own identity in the dashboard.
        </div>
      ) : (
        <div className="space-y-2">
          {agents.map((agent) => (
            <AgentAccountCard
              key={agent.id}
              agent={agent}
              copiedId={copiedId}
              onCopyId={copyId}
              onUpdate={fetchAgents}
              personas={personas}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function AgentsPage() {
  return (
    <React.Suspense fallback={<div className="p-8 text-muted-foreground">Loading...</div>}>
      <AgentsPageInner />
    </React.Suspense>
  );
}

