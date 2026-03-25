"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { ActionNodeData } from "@/lib/flow-templates";

const ACTION_STYLES: Record<string, { icon: string; border: string; bg: string }> = {
  score: { icon: "📊", border: "border-blue-500/30", bg: "bg-blue-500/5" },
  analyze: { icon: "🔍", border: "border-purple-500/30", bg: "bg-purple-500/5" },
  improve: { icon: "⚡", border: "border-primary/30", bg: "bg-primary/5" },
  generate: { icon: "🤖", border: "border-cyan-500/30", bg: "bg-cyan-500/5" },
  commit: { icon: "💾", border: "border-emerald-500/30", bg: "bg-emerald-500/5" },
};

export function ActionNode({ data }: NodeProps) {
  const d = data as ActionNodeData;
  const style = ACTION_STYLES[d.actionType] ?? ACTION_STYLES.score;

  return (
    <div className={`rounded-xl border-2 ${style.border} ${style.bg} px-4 py-3 min-w-[160px]`}>
      <Handle type="target" position={Position.Left} className="!bg-white/40 !w-2 !h-2" />
      <Handle type="source" position={Position.Right} className="!bg-white/40 !w-2 !h-2" />
      <div className="flex items-center gap-2 mb-1">
        <span className="text-base">{style.icon}</span>
        <span className="font-semibold text-sm text-foreground">{d.label}</span>
      </div>
      {d.description && (
        <p className="text-[11px] text-muted-foreground">{d.description}</p>
      )}
    </div>
  );
}
