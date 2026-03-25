"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { ConditionNodeData } from "@/lib/flow-templates";

export function ConditionNode({ data }: NodeProps) {
  const d = data as ConditionNodeData;

  return (
    <div className="rounded-xl border-2 border-yellow-500/40 bg-yellow-500/10 px-4 py-3 min-w-[170px]">
      <Handle type="target" position={Position.Left} className="!bg-yellow-400 !w-2.5 !h-2.5" />
      <Handle
        type="source"
        position={Position.Right}
        id="true"
        style={{ top: "35%" }}
        className="!bg-emerald-400 !w-2 !h-2"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="false"
        style={{ top: "65%" }}
        className="!bg-red-400 !w-2 !h-2"
      />
      <div className="flex items-center gap-2 mb-1">
        <span className="text-base">🔀</span>
        <span className="font-semibold text-sm text-foreground">{d.label}</span>
      </div>
      <p className="text-[11px] text-muted-foreground font-mono">{d.condition || "if ..."}</p>
      <div className="mt-2 flex items-center gap-3 text-[10px]">
        <span className="text-emerald-400">● Yes</span>
        <span className="text-red-400">● No</span>
      </div>
    </div>
  );
}
