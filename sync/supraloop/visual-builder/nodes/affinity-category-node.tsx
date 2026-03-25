"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { AffinityCategoryNodeData } from "@/lib/flow-templates";

export function AffinityCategoryNode({ data }: NodeProps) {
  const d = data as AffinityCategoryNodeData;
  const scorePercent = Math.max(0, Math.min(100, d.score));

  return (
    <div className="rounded-xl border-2 border-violet-500/30 bg-violet-500/5 px-4 py-3 min-w-[180px]">
      <Handle type="target" position={Position.Left} className="!bg-violet-400 !w-2.5 !h-2.5" />
      <Handle type="source" position={Position.Right} className="!bg-violet-400 !w-2.5 !h-2.5" />

      {/* Category name */}
      <div className="font-semibold text-sm text-foreground mb-1">{d.label}</div>

      {/* Weight badge */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] text-muted-foreground">Weight:</span>
        <span className="text-xs font-mono text-violet-400">{d.weight}x</span>
      </div>

      {/* Score bar */}
      <div className="relative h-2 rounded-full bg-white/5 overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-violet-500/60 to-violet-400/80 transition-all duration-500"
          style={{ width: `${scorePercent}%` }}
        />
      </div>
      <div className="flex items-center justify-between mt-1">
        <span className="text-[10px] font-mono text-violet-400">{d.score}/100</span>
        {d.domainExpert && (
          <span className="text-[9px] text-muted-foreground truncate max-w-[100px]">
            Expert: {d.domainExpert}
          </span>
        )}
      </div>
    </div>
  );
}
