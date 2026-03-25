"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { CompetitorNodeData } from "@/lib/flow-templates";

export function CompetitorNode({ data }: NodeProps) {
  const d = data as CompetitorNodeData;

  return (
    <div className="rounded-xl border-2 border-orange-500/30 bg-orange-500/5 px-4 py-3 min-w-[180px]">
      <Handle type="source" position={Position.Bottom} className="!bg-orange-400 !w-2.5 !h-2.5" />
      <Handle type="target" position={Position.Top} className="!bg-orange-400 !w-2.5 !h-2.5" />
      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg">🏢</span>
        <span className="font-semibold text-sm text-foreground">{d.label || "Competitor"}</span>
      </div>
      {d.why && <div className="text-xs text-muted-foreground">{d.why}</div>}
      {d.overallScore > 0 && (
        <div className="mt-2 flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground">Score:</span>
          <span className="text-sm font-mono font-bold text-orange-400">{d.overallScore}</span>
        </div>
      )}
      {d.cpoName && (
        <div className="mt-1 text-[10px] text-muted-foreground">
          CPO: {d.cpoName}
        </div>
      )}
    </div>
  );
}
