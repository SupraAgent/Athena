"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { TriggerNodeData } from "@/lib/flow-templates";

const TRIGGER_STYLES: Record<string, { icon: string; border: string; bg: string }> = {
  manual: { icon: "▶", border: "border-emerald-500/40", bg: "bg-emerald-500/10" },
  schedule: { icon: "🕐", border: "border-indigo-500/40", bg: "bg-indigo-500/10" },
  webhook: { icon: "🔗", border: "border-cyan-500/40", bg: "bg-cyan-500/10" },
  event: { icon: "⚡", border: "border-amber-500/40", bg: "bg-amber-500/10" },
};

export function TriggerNode({ data }: NodeProps) {
  const d = data as TriggerNodeData;
  const style = TRIGGER_STYLES[d.triggerType] ?? TRIGGER_STYLES.manual;

  return (
    <div className={`rounded-xl border-2 ${style.border} ${style.bg} px-4 py-3 min-w-[170px]`}>
      <Handle type="source" position={Position.Right} className="!bg-emerald-400 !w-2.5 !h-2.5" />
      <div className="flex items-center gap-2 mb-1">
        <span className="text-base">{style.icon}</span>
        <span className="font-semibold text-sm text-foreground">{d.label}</span>
      </div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
        {d.triggerType} trigger
      </div>
      {d.config && (
        <p className="mt-1 text-[11px] text-muted-foreground">{d.config}</p>
      )}
    </div>
  );
}
