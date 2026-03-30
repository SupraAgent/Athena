/**
 * Local tasks channel.
 *
 * Reads tasks from .athena/tasks/ (YAML files) and surfaces
 * active, urgent, and in-progress items as session context.
 * No external dependencies — purely file-based.
 */

import * as fs from "fs/promises";
import * as path from "path";
import * as YAML from "yaml";
import type {
  ExternalChannel,
  ChannelConfig,
  ChannelFetchResult,
  ChannelMemoryCandidate,
  ChannelStatus,
} from "./channel";

type Task = {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  tags: string[];
  assignee: string;
  updatedAt: string;
};

/** Priority to relevance mapping. */
function priorityRelevance(priority: string): number {
  switch (priority) {
    case "urgent": return 0.85;
    case "high": return 0.7;
    case "medium": return 0.55;
    case "low": return 0.4;
    default: return 0.5;
  }
}

export class LocalTasksChannel implements ExternalChannel {
  readonly type = "local-tasks" as const;

  async check(): Promise<ChannelStatus> {
    // Always available — file-based, no auth
    return "available";
  }

  async fetch(config: ChannelConfig): Promise<ChannelFetchResult> {
    const errors: string[] = [];
    const memories: ChannelMemoryCandidate[] = [];
    const opts = config.options;

    // Resolve tasks directory
    const repoRoot = opts.repo_root as string || findRepoRoot();
    const tasksDir = path.join(repoRoot, ".athena", "tasks");

    try {
      const files = await fs.readdir(tasksDir);
      const tasks: Task[] = [];

      for (const file of files) {
        if (!file.endsWith(".yaml")) continue;
        try {
          const raw = await fs.readFile(path.join(tasksDir, file), "utf-8");
          const parsed = YAML.parse(raw);
          if (parsed?.id && parsed?.title) {
            tasks.push(parsed as Task);
          }
        } catch {
          // Skip corrupt files
        }
      }

      // Only surface active tasks (not done/archived)
      const active = tasks.filter(
        (t) => t.status !== "done" && t.status !== "archived"
      );

      // Sort: in-progress first, then by priority
      const priorityOrder: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
      active.sort((a, b) => {
        if (a.status === "in-progress" && b.status !== "in-progress") return -1;
        if (b.status === "in-progress" && a.status !== "in-progress") return 1;
        return (priorityOrder[a.priority] ?? 9) - (priorityOrder[b.priority] ?? 9);
      });

      const maxTasks = Number(opts.max_tasks) || 15;

      for (const task of active.slice(0, maxTasks)) {
        const relevance = priorityRelevance(task.priority);
        const statusLabel = task.status === "in-progress" ? "IN PROGRESS" : task.status.toUpperCase();
        const tagStr = task.tags.length > 0 ? ` [${task.tags.join(", ")}]` : "";
        const descSnippet = task.description ? ` — ${task.description.slice(0, 100)}` : "";

        memories.push({
          content: `[Task ${statusLabel}] ${task.title} — Priority: ${task.priority}${tagStr}${descSnippet}`,
          tags: ["task", task.status, task.priority, ...task.tags],
          relevance,
          externalId: `task-${task.id}`,
        });
      }
    } catch (err: unknown) {
      // No tasks directory = no tasks, not an error
      const msg = String(err);
      if (!msg.includes("ENOENT")) {
        errors.push(msg.slice(0, 200));
      }
    }

    return { channel: "local-tasks" as const, memories, fetchedAt: new Date().toISOString(), errors };
  }
}

function findRepoRoot(): string {
  try {
    const { execFileSync } = require("child_process") as typeof import("child_process");
    return execFileSync("git", ["rev-parse", "--show-toplevel"], {
      encoding: "utf-8",
      timeout: 3000,
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch {
    return process.cwd();
  }
}
