"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { AppNodeData } from "@/lib/flow-templates";

const STATE_BADGES: Record<string, string> = {
  MVP: "bg-yellow-500/20 text-yellow-400",
  Beta: "bg-blue-500/20 text-blue-400",
  Production: "bg-emerald-500/20 text-emerald-400",
};

export function AppNode({ data }: NodeProps) {
  const d = data as AppNodeData;
  const badgeClass = STATE_BADGES[d.currentState] ?? "bg-white/10 text-muted-foreground";

  return (
    <div className="rounded-xl border-2 border-primary/40 bg-primary/10 px-5 py-4 min-w-[220px] shadow-lg shadow-primary/10">
      <Handle type="target" position={Position.Top} className="!bg-primary !w-3 !h-3" />
      <Handle type="source" position={Position.Bottom} className="!bg-primary !w-3 !h-3" />
      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg">🚀</span>
        <span className="font-bold text-base text-foreground">{d.label || "Your App"}</span>
      </div>
      {d.currentState && (
        <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${badgeClass}`}>
          {d.currentState}
        </span>
      )}
      {d.description && (
        <p className="mt-2 text-xs text-muted-foreground line-clamp-2">{d.description}</p>
      )}
      {d.targetUsers && (
        <div className="mt-1 text-[10px] text-muted-foreground">
          👥 {d.targetUsers}
        </div>
      )}
    </div>
  );
}
