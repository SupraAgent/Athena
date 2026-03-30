"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";

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
};

type TaskBoardProps = {
  tasks: Task[];
  onTaskClick: (task: Task) => void;
  onStatusChange: (taskId: string, status: TaskStatus) => void;
};

const COLUMNS: { status: TaskStatus; label: string; accent: string }[] = [
  { status: "backlog", label: "Backlog", accent: "bg-zinc-500" },
  { status: "todo", label: "To Do", accent: "bg-blue-500" },
  { status: "in-progress", label: "In Progress", accent: "bg-amber-500" },
  { status: "done", label: "Done", accent: "bg-emerald-500" },
];

const PRIORITY_DOTS: Record<TaskPriority, string> = {
  urgent: "bg-red-400",
  high: "bg-orange-400",
  medium: "bg-yellow-400",
  low: "bg-blue-400",
};

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function TaskCard({
  task,
  onClick,
}: {
  task: Task;
  onClick: () => void;
}) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", task.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={onClick}
      className="group cursor-pointer rounded-xl border border-white/10 bg-white/[0.02] p-3 transition hover:border-white/20 hover:bg-white/[0.04] active:scale-[0.98]"
    >
      <div className="flex items-start gap-2">
        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${PRIORITY_DOTS[task.priority]}`} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-foreground leading-snug">{task.title}</div>
          {task.description && (
            <div className="mt-1 text-xs text-muted-foreground line-clamp-2">{task.description}</div>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {task.tags.slice(0, 3).map((tag) => (
              <Badge key={tag} className="px-1.5 py-0 text-[10px]">{tag}</Badge>
            ))}
            {task.tags.length > 3 && (
              <span className="text-[10px] text-muted-foreground">+{task.tags.length - 3}</span>
            )}
          </div>
          <div className="mt-2 flex items-center justify-between">
            {task.assignee ? (
              <span className="text-[10px] text-muted-foreground">{task.assignee}</span>
            ) : (
              <span />
            )}
            <span className="text-[10px] text-muted-foreground">{timeAgo(task.updatedAt)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function TaskBoard({ tasks, onTaskClick, onStatusChange }: TaskBoardProps) {
  const [dragOver, setDragOver] = React.useState<TaskStatus | null>(null);

  function handleDragOver(e: React.DragEvent, status: TaskStatus) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOver(status);
  }

  function handleDrop(e: React.DragEvent, status: TaskStatus) {
    e.preventDefault();
    setDragOver(null);
    const taskId = e.dataTransfer.getData("text/plain");
    if (taskId) onStatusChange(taskId, status);
  }

  return (
    <div className="grid grid-cols-4 gap-4">
      {COLUMNS.map((col) => {
        const colTasks = tasks.filter((t) => t.status === col.status);
        return (
          <div
            key={col.status}
            onDragOver={(e) => handleDragOver(e, col.status)}
            onDragLeave={() => setDragOver(null)}
            onDrop={(e) => handleDrop(e, col.status)}
            className={`rounded-2xl border p-3 transition-colors min-h-[200px] ${
              dragOver === col.status
                ? "border-primary/40 bg-primary/5"
                : "border-white/5 bg-white/[0.01]"
            }`}
          >
            <div className="mb-3 flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${col.accent}`} />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {col.label}
              </span>
              <span className="ml-auto text-xs text-muted-foreground">{colTasks.length}</span>
            </div>
            <div className="space-y-2">
              {colTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onClick={() => onTaskClick(task)}
                />
              ))}
              {colTasks.length === 0 && (
                <div className="py-8 text-center text-xs text-muted-foreground/50">
                  Drop tasks here
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
