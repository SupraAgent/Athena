"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { DelayNodeData } from "../../core/types";
import { cn } from "../../core/utils";

export function DelayNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as DelayNodeData;
  const cfg = nodeData.config;
  const summary = cfg.duration
    ? `Wait ${cfg.duration} ${cfg.unit}`
    : "Configure delay…";

  return (
    <div
      className={cn(
        "rounded-xl border bg-white/[0.035] px-4 py-3 min-w-[180px] max-w-[240px] transition-all",
        selected ? "border-gray-400/60 shadow-lg shadow-gray-500/10" : "border-white/10"
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-gray-400 !border-2 !border-gray-900"
      />

      <div className="flex items-center gap-2.5">
        <div className="h-8 w-8 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
          <svg className="h-4 w-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
          </svg>
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-foreground truncate">
            {nodeData.label || "Delay"}
          </p>
          <p className="text-[10px] text-muted-foreground truncate">{summary}</p>
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-gray-400 !border-2 !border-gray-900"
      />
    </div>
  );
}
