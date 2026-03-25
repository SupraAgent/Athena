"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { PersonaNodeData } from "@/lib/flow-templates";

const ROLE_COLORS: Record<string, string> = {
  "Head of Product": "border-blue-500/40 bg-blue-500/10",
  "Engineering Lead": "border-emerald-500/40 bg-emerald-500/10",
  "Design Lead": "border-purple-500/40 bg-purple-500/10",
  "Growth & Analytics": "border-orange-500/40 bg-orange-500/10",
  "QA & Reliability": "border-red-500/40 bg-red-500/10",
};

export function PersonaNode({ data }: NodeProps) {
  const d = data as PersonaNodeData;
  const colorClass = ROLE_COLORS[d.role] ?? "border-white/20 bg-white/5";

  return (
    <div className={`rounded-xl border-2 px-4 py-3 min-w-[180px] ${colorClass}`}>
      <Handle type="source" position={Position.Bottom} id="bottom" className="!bg-primary !w-2.5 !h-2.5" />
      <Handle type="target" position={Position.Top} id="top" className="!bg-primary !w-2.5 !h-2.5" />
      <Handle type="source" position={Position.Right} id="right" className="!bg-primary !w-2.5 !h-2.5" />
      <Handle type="target" position={Position.Left} id="left" className="!bg-primary !w-2.5 !h-2.5" />
      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg">{d.emoji}</span>
        <span className="font-semibold text-sm text-foreground">{d.label}</span>
      </div>
      <div className="text-xs text-muted-foreground">{d.role}</div>
      <div className="mt-2 flex items-center gap-1">
        <span className="text-[10px] text-muted-foreground">Weight:</span>
        <span className="text-xs font-mono text-primary">{d.voteWeight}×</span>
      </div>
      {d.expertise.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {d.expertise.slice(0, 3).map((e) => (
            <span key={e} className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-muted-foreground">
              {e}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
