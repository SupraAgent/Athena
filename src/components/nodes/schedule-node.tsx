"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { ScheduleNodeData } from "../../core/types";
import { cn } from "../../core/utils";
import { scheduleToHumanReadable } from "../../core/scheduler";

export function ScheduleNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as ScheduleNodeData;
  const config = nodeData.config;

  const modeLabel =
    config.mode === "interval" ? "Interval" :
    config.mode === "cron" ? "Cron" :
    config.mode === "calendar" ? "Calendar" : "Schedule";

  let description = "Not configured";
  try {
    description = scheduleToHumanReadable(config);
  } catch {
    // fallback
  }

  return (
    <div
      className={cn(
        "rounded-xl border bg-white/[0.035] px-4 py-3 min-w-[180px] max-w-[240px] transition-all",
        selected ? "border-violet-400/60 shadow-lg shadow-violet-500/10" : "border-violet-500/20"
      )}
    >
      <div className="flex items-center gap-2.5">
        <div className="h-8 w-8 rounded-lg bg-violet-500/20 flex items-center justify-center shrink-0">
          {/* Clock/timer SVG icon */}
          <svg className="h-4 w-4 text-violet-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-foreground truncate">
            {nodeData.label || "Schedule"}
          </p>
          <p className="text-[10px] text-violet-400/70 truncate">
            {description}
          </p>
        </div>
      </div>

      {/* Mode badge */}
      <div className="mt-2 flex items-center gap-1.5">
        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-violet-500/15 text-violet-400 font-medium">
          {modeLabel}
        </span>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-violet-400 !border-2 !border-violet-900"
      />
    </div>
  );
}
