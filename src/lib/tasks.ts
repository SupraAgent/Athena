/**
 * Task management — lightweight project tracker for Athena.
 *
 * Tasks are stored as YAML files in .athena/tasks/ (travels with the repo).
 * No external dependencies, no vendor lock-in.
 */

import * as fs from "fs/promises";
import * as path from "path";
import * as YAML from "yaml";

// ── Types ──────────────────────────────────────────────────────

export type TaskStatus = "backlog" | "todo" | "in-progress" | "done" | "archived";
export type TaskPriority = "urgent" | "high" | "medium" | "low";

export type Task = {
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

export const TASK_STATUSES: TaskStatus[] = ["backlog", "todo", "in-progress", "done", "archived"];
export const TASK_PRIORITIES: TaskPriority[] = ["urgent", "high", "medium", "low"];

export const STATUS_LABELS: Record<TaskStatus, string> = {
  backlog: "Backlog",
  todo: "To Do",
  "in-progress": "In Progress",
  done: "Done",
  archived: "Archived",
};

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  urgent: "Urgent",
  high: "High",
  medium: "Medium",
  low: "Low",
};

// ── Paths ──────────────────────────────────────────────────────

function tasksDir(repoRoot: string): string {
  return path.join(repoRoot, ".athena", "tasks");
}

function taskPath(repoRoot: string, id: string): string {
  return path.join(tasksDir(repoRoot), `${id}.yaml`);
}

// ── ID Generation ──────────────────────────────────────────────

export function taskId(): string {
  return `task_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

// ── CRUD ───────────────────────────────────────────────────────

export async function loadTasks(repoRoot: string): Promise<Task[]> {
  const dir = tasksDir(repoRoot);
  try {
    const files = await fs.readdir(dir);
    const tasks: Task[] = [];
    for (const file of files) {
      if (!file.endsWith(".yaml")) continue;
      try {
        const raw = await fs.readFile(path.join(dir, file), "utf-8");
        const parsed = YAML.parse(raw);
        if (parsed?.id && parsed?.title) {
          tasks.push(parsed as Task);
        }
      } catch {
        // Skip corrupt files
      }
    }
    return tasks.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  } catch {
    return [];
  }
}

export async function loadTask(repoRoot: string, id: string): Promise<Task | null> {
  try {
    const raw = await fs.readFile(taskPath(repoRoot, id), "utf-8");
    return YAML.parse(raw) as Task;
  } catch {
    return null;
  }
}

export async function saveTask(repoRoot: string, task: Task): Promise<void> {
  const dir = tasksDir(repoRoot);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(taskPath(repoRoot, task.id), YAML.stringify(task), "utf-8");
}

export async function deleteTask(repoRoot: string, id: string): Promise<boolean> {
  try {
    await fs.unlink(taskPath(repoRoot, id));
    return true;
  } catch {
    return false;
  }
}

export async function createTask(
  repoRoot: string,
  input: {
    title: string;
    description?: string;
    status?: TaskStatus;
    priority?: TaskPriority;
    tags?: string[];
    assignee?: string;
  }
): Promise<Task> {
  const now = new Date().toISOString();
  const task: Task = {
    id: taskId(),
    title: input.title,
    description: input.description ?? "",
    status: input.status ?? "todo",
    priority: input.priority ?? "medium",
    tags: input.tags ?? [],
    assignee: input.assignee ?? "",
    createdAt: now,
    updatedAt: now,
  };
  await saveTask(repoRoot, task);
  return task;
}

export async function updateTask(
  repoRoot: string,
  id: string,
  updates: Partial<Omit<Task, "id" | "createdAt">>
): Promise<Task | null> {
  const task = await loadTask(repoRoot, id);
  if (!task) return null;

  const updated: Task = {
    ...task,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  // Track completion time
  if (updates.status === "done" && task.status !== "done") {
    updated.completedAt = new Date().toISOString();
  } else if (updates.status && updates.status !== "done") {
    updated.completedAt = undefined;
  }

  await saveTask(repoRoot, updated);
  return updated;
}

// ── Stats ──────────────────────────────────────────────────────

export type TaskStats = {
  total: number;
  byStatus: Record<TaskStatus, number>;
  byPriority: Record<TaskPriority, number>;
  completedThisWeek: number;
};

export async function getTaskStats(repoRoot: string): Promise<TaskStats> {
  const tasks = await loadTasks(repoRoot);
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

  const stats: TaskStats = {
    total: tasks.length,
    byStatus: { backlog: 0, todo: 0, "in-progress": 0, done: 0, archived: 0 },
    byPriority: { urgent: 0, high: 0, medium: 0, low: 0 },
    completedThisWeek: 0,
  };

  for (const task of tasks) {
    stats.byStatus[task.status]++;
    stats.byPriority[task.priority]++;
    if (task.completedAt && new Date(task.completedAt).getTime() > weekAgo) {
      stats.completedThisWeek++;
    }
  }

  return stats;
}
