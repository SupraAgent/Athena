"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { OutputNodeData } from "@/lib/flow-templates";

const OUTPUT_STYLES: Record<string, { icon: string; border: string; bg: string }> = {
  log: { icon: "📋", border: "border-gray-500/30", bg: "bg-gray-500/5" },
  api: { icon: "🌐", border: "border-blue-500/30", bg: "bg-blue-500/5" },
  file: { icon: "💾", border: "border-emerald-500/30", bg: "bg-emerald-500/5" },
  notify: { icon: "🔔", border: "border-amber-500/30", bg: "bg-amber-500/5" },
  github: { icon: "🐙", border: "border-purple-500/30", bg: "bg-purple-500/5" },
};

export function OutputNode({ data }: NodeProps) {
  const d = data as OutputNodeData;
  const style = OUTPUT_STYLES[d.outputType] ?? OUTPUT_STYLES.log;

  return (
    <div className={`rounded-xl border-2 ${style.border} ${style.bg} px-4 py-3 min-w-[160px]`}>
      <Handle type="target" position={Position.Left} className="!bg-white/40 !w-2 !h-2" />
      <div className="flex items-center gap-2 mb-1">
        <span className="text-base">{style.icon}</span>
        <span className="font-semibold text-sm text-foreground">{d.label}</span>
      </div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
        {d.outputType} output
      </div>
      {d.destination && (
        <p className="mt-1 text-[11px] text-muted-foreground truncate max-w-[200px]">
          {d.destination}
        </p>
      )}
    </div>
  );
}
