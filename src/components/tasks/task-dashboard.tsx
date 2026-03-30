"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { TaskBoard } from "./task-board";
import { TaskModal } from "./task-modal";

type TaskStatus = "backlog" | "todo" | "in-progress" | "done" | "archived";
type TaskPriority = "urgent" | "high" | "medium" | "low";

type Task = {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  tags: string[];
  assignee: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
};

type TaskStats = {
  total: number;
  byStatus: Record<TaskStatus, number>;
  byPriority: Record<TaskPriority, number>;
  completedThisWeek: number;
};

type TaskFormData = {
  id?: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  tags: string[];
  assignee: string;
};

const QUICK_LINKS = [
  { icon: "\u{1F9E9}", label: "Workflow Builder", href: "/builder", desc: "Drag-and-drop automation" },
  { icon: "\u{1F504}", label: "Improvement Loop", href: "/improve", desc: "SupraLoop benchmark cycle" },
  { icon: "\u{1F3AD}", label: "Persona Studio", href: "/studio", desc: "Create AI advisors" },
  { icon: "\u{1F680}", label: "Launch Kit", href: "/launch-kit", desc: "Full project planning" },
];

export function TaskDashboard() {
  const [tasks, setTasks] = React.useState<Task[]>([]);
  const [stats, setStats] = React.useState<TaskStats | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [modalOpen, setModalOpen] = React.useState(false);
  const [editingTask, setEditingTask] = React.useState<Task | null>(null);

  const fetchTasks = React.useCallback(async () => {
    try {
      const res = await fetch("/api/tasks");
      const data = await res.json();
      setTasks(data.tasks ?? []);
      setStats(data.stats ?? null);
    } catch {
      // Silent fail
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  async function handleSave(data: TaskFormData) {
    if (data.id) {
      await fetch(`/api/tasks/${data.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
    } else {
      await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
    }
    setModalOpen(false);
    setEditingTask(null);
    fetchTasks();
  }

  async function handleStatusChange(taskId: string, status: TaskStatus) {
    await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    fetchTasks();
  }

  function handleTaskClick(task: Task) {
    setEditingTask(task);
    setModalOpen(true);
  }

  function handleNewTask() {
    setEditingTask(null);
    setModalOpen(true);
  }

  const activeTasks = tasks.filter((t) => t.status !== "archived");
  const inProgress = stats?.byStatus["in-progress"] ?? 0;
  const urgent = stats?.byPriority.urgent ?? 0;
  const high = stats?.byPriority.high ?? 0;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Athena</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Your project command center
          </p>
        </div>
        <Button onClick={handleNewTask}>+ New Task</Button>
      </div>

      {/* Stats Row */}
      <div className="mb-6 grid grid-cols-4 gap-3">
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <div className="text-2xl font-bold text-foreground">
            {loading ? "..." : activeTasks.length}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">Active Tasks</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <div className="text-2xl font-bold text-foreground">
            {loading ? "..." : inProgress}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">In Progress</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <div className={`text-2xl font-bold ${urgent + high > 0 ? "text-orange-400" : "text-foreground"}`}>
            {loading ? "..." : urgent + high}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">Urgent / High</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <div className="text-2xl font-bold text-primary">
            {loading ? "..." : stats?.completedThisWeek ?? 0}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">Done This Week</div>
        </div>
      </div>

      {/* Task Board */}
      {loading ? (
        <div className="py-20 text-center text-sm text-muted-foreground">Loading tasks...</div>
      ) : activeTasks.length === 0 ? (
        <div className="mb-8 rounded-2xl border border-dashed border-white/10 p-12 text-center">
          <div className="text-3xl mb-3">-</div>
          <div className="text-sm text-muted-foreground mb-4">No tasks yet. Create your first task to get started.</div>
          <Button onClick={handleNewTask}>+ New Task</Button>
        </div>
      ) : (
        <div className="mb-8">
          <TaskBoard
            tasks={activeTasks}
            onTaskClick={handleTaskClick}
            onStatusChange={handleStatusChange}
          />
        </div>
      )}

      {/* Quick Links */}
      <div>
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Quick Actions
        </h2>
        <div className="grid grid-cols-4 gap-3">
          {QUICK_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="group rounded-xl border border-white/10 bg-white/[0.02] p-3 transition hover:border-white/20 hover:bg-white/[0.04]"
            >
              <div className="flex items-center gap-2.5">
                <span className="text-lg">{link.icon}</span>
                <div>
                  <div className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                    {link.label}
                  </div>
                  <div className="text-[10px] text-muted-foreground">{link.desc}</div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Task Modal */}
      <TaskModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditingTask(null); }}
        onSave={handleSave}
        initial={editingTask}
      />
    </div>
  );
}
