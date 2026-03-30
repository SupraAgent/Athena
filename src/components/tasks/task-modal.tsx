"use client";

import * as React from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type TaskStatus = "backlog" | "todo" | "in-progress" | "done" | "archived";
type TaskPriority = "urgent" | "high" | "medium" | "low";

type TaskFormData = {
  id?: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  tags: string[];
  assignee: string;
};

type TaskModalProps = {
  open: boolean;
  onClose: () => void;
  onSave: (data: TaskFormData) => void;
  initial?: TaskFormData | null;
};

const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: "backlog", label: "Backlog" },
  { value: "todo", label: "To Do" },
  { value: "in-progress", label: "In Progress" },
  { value: "done", label: "Done" },
];

const PRIORITY_OPTIONS: { value: TaskPriority; label: string; color: string }[] = [
  { value: "urgent", label: "Urgent", color: "bg-red-500/20 text-red-400 border-red-500/30" },
  { value: "high", label: "High", color: "bg-orange-500/20 text-orange-400 border-orange-500/30" },
  { value: "medium", label: "Medium", color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
  { value: "low", label: "Low", color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
];

export function TaskModal({ open, onClose, onSave, initial }: TaskModalProps) {
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [status, setStatus] = React.useState<TaskStatus>("todo");
  const [priority, setPriority] = React.useState<TaskPriority>("medium");
  const [tagInput, setTagInput] = React.useState("");
  const [tags, setTags] = React.useState<string[]>([]);
  const [assignee, setAssignee] = React.useState("");

  React.useEffect(() => {
    if (initial) {
      setTitle(initial.title);
      setDescription(initial.description);
      setStatus(initial.status);
      setPriority(initial.priority);
      setTags(initial.tags);
      setAssignee(initial.assignee);
    } else {
      setTitle("");
      setDescription("");
      setStatus("todo");
      setPriority("medium");
      setTags([]);
      setAssignee("");
    }
  }, [initial, open]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    onSave({ id: initial?.id, title: title.trim(), description, status, priority, tags, assignee });
  }

  function handleTagKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      const tag = tagInput.trim().toLowerCase();
      if (tag && !tags.includes(tag)) {
        setTags([...tags, tag]);
      }
      setTagInput("");
    }
  }

  function removeTag(tag: string) {
    setTags(tags.filter((t) => t !== tag));
  }

  return (
    <Modal open={open} onClose={onClose} title={initial ? "Edit Task" : "New Task"}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Title</label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What needs to be done?"
            autoFocus
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Details, context, acceptance criteria..."
            rows={3}
            className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none transition hover:border-white/15 focus:border-primary/40 focus:ring-2 focus:ring-primary/15 resize-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as TaskStatus)}
              className="h-10 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-foreground outline-none transition hover:border-white/15 focus:border-primary/40"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Priority</label>
            <div className="flex gap-1.5">
              {PRIORITY_OPTIONS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setPriority(p.value)}
                  className={`flex-1 rounded-lg border px-2 py-2 text-xs font-medium transition ${
                    priority === p.value
                      ? p.color
                      : "border-white/10 bg-white/5 text-muted-foreground hover:border-white/20"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Tags</label>
          <div className="flex flex-wrap gap-1.5 mb-1.5">
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-muted-foreground"
              >
                {tag}
                <button type="button" onClick={() => removeTag(tag)} className="hover:text-foreground">
                  x
                </button>
              </span>
            ))}
          </div>
          <Input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={handleTagKeyDown}
            placeholder="Type and press Enter to add tags"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Assignee</label>
          <Input
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
            placeholder="Who's working on this?"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={!title.trim()}>
            {initial ? "Save Changes" : "Create Task"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
