"use client";

import * as React from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { CanvasIdContext } from "../canvas-id-context";

// ── Types ────────────────────────────────────────────────────────

export interface GroupContainerChild {
  id: string;
  label: string;
  icon?: string;
  color?: string;
  meta?: Record<string, unknown>;
}

export interface GroupContainerNodeData {
  nodeType: "group_container";
  label: string;
  children: GroupContainerChild[];
  /** Accept this drag type (defaults to "application/reactflow-group-item") */
  acceptType?: string;
  /** Max children allowed (0 = unlimited) */
  maxChildren?: number;
  /** Color accent class (e.g. "blue", "purple", "emerald") */
  accent?: string;
  /** Placeholder text when empty */
  emptyText?: string;
  config: Record<string, unknown>;
}

// ── Color helpers ────────────────────────────────────────────────

const ACCENT_STYLES: Record<string, { border: string; bg: string; ring: string; text: string; handleBg: string }> = {
  blue: { border: "border-blue-500/30", bg: "bg-blue-500/5", ring: "ring-blue-500/40", text: "text-blue-400", handleBg: "!bg-blue-400" },
  purple: { border: "border-purple-500/30", bg: "bg-purple-500/5", ring: "ring-purple-500/40", text: "text-purple-400", handleBg: "!bg-purple-400" },
  emerald: { border: "border-emerald-500/30", bg: "bg-emerald-500/5", ring: "ring-emerald-500/40", text: "text-emerald-400", handleBg: "!bg-emerald-400" },
  orange: { border: "border-orange-500/30", bg: "bg-orange-500/5", ring: "ring-orange-500/40", text: "text-orange-400", handleBg: "!bg-orange-400" },
  primary: { border: "border-primary/30", bg: "bg-primary/5", ring: "ring-primary/40", text: "text-primary", handleBg: "!bg-primary" },
};

// Static lookup for child color bars — avoids dynamic Tailwind class construction
const CHILD_COLOR_CLASSES: Record<string, string> = {
  blue: "bg-blue-500/40",
  purple: "bg-purple-500/40",
  emerald: "bg-emerald-500/40",
  orange: "bg-orange-500/40",
  red: "bg-red-500/40",
  green: "bg-green-500/40",
  yellow: "bg-yellow-500/40",
  pink: "bg-pink-500/40",
  cyan: "bg-cyan-500/40",
  indigo: "bg-indigo-500/40",
};

const DEFAULT_ACCENT = "primary";

// ── Component ────────────────────────────────────────────────────

export function GroupContainerNode({ id, data }: NodeProps) {
  const d = data as unknown as GroupContainerNodeData;
  const children = d.children ?? [];
  const accent = ACCENT_STYLES[d.accent ?? DEFAULT_ACCENT] ?? ACCENT_STYLES[DEFAULT_ACCENT];
  const acceptType = d.acceptType ?? "application/reactflow-group-item";
  const maxChildren = d.maxChildren ?? 0;
  const atCapacity = maxChildren > 0 && children.length >= maxChildren;
  const canvasId = React.useContext(CanvasIdContext);

  const [dragOver, setDragOver] = React.useState(false);

  function handleDragOver(event: React.DragEvent) {
    if (atCapacity) return;
    if (!event.dataTransfer.types.includes(acceptType)) return;
    event.preventDefault();
    event.stopPropagation();
    setDragOver(true);
  }

  function handleDragLeave() {
    setDragOver(false);
  }

  function handleDrop(event: React.DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    setDragOver(false);

    if (atCapacity) return;

    const rawData = event.dataTransfer.getData(acceptType);
    if (!rawData) return;

    try {
      const itemData = JSON.parse(rawData) as GroupContainerChild;
      if (!itemData.id && !itemData.label) return;

      // Dedupe by id
      if (itemData.id && children.some((c) => c.id === itemData.id)) return;

      // Dispatch custom event so FlowCanvas can update node data (scoped by canvasId)
      const detail = { canvasId, nodeId: id, child: itemData };
      window.dispatchEvent(new CustomEvent("supra:group-add-child", { detail }));
    } catch {
      // Ignore parse errors
    }
  }

  return (
    <div
      className={`rounded-xl border-2 ${accent.border} ${accent.bg} px-5 py-4 shadow-lg transition-all ${
        dragOver ? `ring-2 ${accent.ring} border-opacity-60` : ""
      }`}
      style={{ minWidth: Math.max(260, children.length * 90 + 40) }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <Handle type="target" position={Position.Top} className={`!w-3 !h-3 ${accent.handleBg}`} />
      <Handle type="source" position={Position.Bottom} className={`!w-3 !h-3 ${accent.handleBg}`} />

      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">📦</span>
          <div>
            <div className="font-bold text-sm text-foreground">{d.label || "Group"}</div>
            <div className="text-[10px] text-muted-foreground">
              {children.length} item{children.length !== 1 ? "s" : ""}
              {maxChildren > 0 && ` / ${maxChildren} max`}
            </div>
          </div>
        </div>
      </div>

      {/* Children grid */}
      {children.length > 0 && (
        <div
          className="grid gap-2"
          style={{ gridTemplateColumns: `repeat(${Math.min(children.length, 3)}, 1fr)` }}
        >
          {children.map((child) => (
            <div
              key={child.id ?? child.label}
              className={`rounded-lg border border-white/10 bg-white/5 px-2.5 py-2`}
            >
              <div className="flex items-center gap-1.5 mb-0.5">
                {child.icon && <span className="text-sm">{child.icon}</span>}
                <span className="font-medium text-[11px] text-foreground truncate">
                  {child.label}
                </span>
              </div>
              {child.color && (
                <div className={`h-0.5 w-full rounded-full mt-1 ${CHILD_COLOR_CLASSES[child.color] ?? "bg-white/20"}`} />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {children.length === 0 && (
        <div
          className={`rounded-lg border border-dashed px-4 py-6 text-center transition-colors ${
            dragOver ? `${accent.border} ${accent.bg}` : "border-white/10"
          }`}
        >
          <div className="text-xs text-muted-foreground">
            {d.emptyText ?? "Drag items here to group them"}
          </div>
        </div>
      )}
    </div>
  );
}
