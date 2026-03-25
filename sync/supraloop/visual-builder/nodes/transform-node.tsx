"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { TransformNodeData } from "@/lib/flow-templates";

const TRANSFORM_STYLES: Record<string, { icon: string; border: string; bg: string }> = {
  map: { icon: "🔄", border: "border-sky-500/30", bg: "bg-sky-500/5" },
  filter: { icon: "🧹", border: "border-pink-500/30", bg: "bg-pink-500/5" },
  merge: { icon: "🔗", border: "border-violet-500/30", bg: "bg-violet-500/5" },
  extract: { icon: "📤", border: "border-teal-500/30", bg: "bg-teal-500/5" },
  custom: { icon: "🛠", border: "border-gray-500/30", bg: "bg-gray-500/5" },
};

export function TransformNode({ data }: NodeProps) {
  const d = data as TransformNodeData;
  const style = TRANSFORM_STYLES[d.transformType] ?? TRANSFORM_STYLES.custom;

  return (
    <div className={`rounded-xl border-2 ${style.border} ${style.bg} px-4 py-3 min-w-[160px]`}>
      <Handle type="target" position={Position.Left} className="!bg-white/40 !w-2 !h-2" />
      <Handle type="source" position={Position.Right} className="!bg-white/40 !w-2 !h-2" />
      <div className="flex items-center gap-2 mb-1">
        <span className="text-base">{style.icon}</span>
        <span className="font-semibold text-sm text-foreground">{d.label}</span>
      </div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
        {d.transformType}
      </div>
      {d.expression && (
        <p className="mt-1 text-[11px] text-muted-foreground font-mono truncate max-w-[200px]">
          {d.expression}
        </p>
      )}
    </div>
  );
}
