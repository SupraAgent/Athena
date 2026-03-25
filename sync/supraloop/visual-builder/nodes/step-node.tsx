"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { StepNodeData } from "@/lib/flow-templates";

const STEP_STYLES: Record<string, { icon: string; color: string; bg: string }> = {
  team: { icon: "👥", color: "border-blue-500/40", bg: "bg-blue-500/8" },
  app: { icon: "🚀", color: "border-primary/40", bg: "bg-primary/8" },
  benchmark: { icon: "📊", color: "border-orange-500/40", bg: "bg-orange-500/8" },
  scoring: { icon: "🎯", color: "border-purple-500/40", bg: "bg-purple-500/8" },
  improve: { icon: "⚡", color: "border-emerald-500/40", bg: "bg-emerald-500/8" },
};

const STATUS_INDICATORS: Record<string, { dot: string; text: string }> = {
  pending: { dot: "bg-white/20", text: "text-muted-foreground" },
  active: { dot: "bg-primary animate-pulse", text: "text-primary" },
  completed: { dot: "bg-emerald-400", text: "text-emerald-400" },
};

export function StepNode({ data }: NodeProps) {
  const d = data as StepNodeData;
  const style = STEP_STYLES[d.flowCategory] ?? STEP_STYLES.team;
  const status = STATUS_INDICATORS[d.status] ?? STATUS_INDICATORS.pending;

  return (
    <div className={`rounded-xl border-2 ${style.color} ${style.bg} px-5 py-4 min-w-[220px] max-w-[260px]`}>
      <Handle type="target" position={Position.Left} id="left" className="!bg-white/40 !w-2.5 !h-2.5" />
      <Handle type="source" position={Position.Right} id="right" className="!bg-white/40 !w-2.5 !h-2.5" />
      <Handle type="target" position={Position.Top} id="top" className="!bg-white/40 !w-2.5 !h-2.5" />
      <Handle type="source" position={Position.Bottom} id="bottom" className="!bg-white/40 !w-2.5 !h-2.5" />

      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">{style.icon}</span>
          <div>
            <div className="font-bold text-sm text-foreground">{d.label}</div>
            <div className="text-[10px] text-muted-foreground">{d.subtitle}</div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <div className={`w-2 h-2 rounded-full ${status.dot}`} />
          <span className={`text-[10px] font-medium ${status.text} capitalize`}>{d.status}</span>
        </div>
      </div>

      {/* Step number badge */}
      <div className="mb-2">
        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-white/10 text-[10px] font-bold text-foreground">
          {d.stepIndex + 1}
        </span>
      </div>

      {/* Summary */}
      {d.summary && (
        <div className="rounded-lg bg-black/20 px-3 py-2 text-[11px] text-muted-foreground leading-relaxed">
          {d.summary}
        </div>
      )}
    </div>
  );
}
