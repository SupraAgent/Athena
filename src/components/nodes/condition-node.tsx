"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { ConditionNodeData } from "../../core/types";
import { cn } from "../../core/utils";

export function ConditionNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as ConditionNodeData;
  const cfg = nodeData.config;
  const summary = cfg.field
    ? `${cfg.field} ${cfg.operator} ${cfg.value || "?"}`
    : "Configure condition…";

  return (
    <div
      className={cn(
        "rounded-xl border bg-white/[0.035] px-4 py-3 min-w-[180px] max-w-[240px] transition-all",
        selected ? "border-yellow-400/60 shadow-lg shadow-yellow-500/10" : "border-yellow-500/20"
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-yellow-400 !border-2 !border-yellow-900"
      />

      <div className="flex items-center gap-2.5">
        <div className="h-8 w-8 rounded-lg bg-yellow-500/20 flex items-center justify-center shrink-0">
          <svg className="h-4 w-4 text-yellow-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="6" y1="3" x2="6" y2="15" /><circle cx="18" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M18 9a9 9 0 0 1-9 9" />
          </svg>
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-foreground truncate">
            {nodeData.label || "Condition"}
          </p>
          <p className="text-[10px] text-yellow-400/70">If / Else</p>
        </div>
      </div>

      <p className="mt-2 text-[10px] text-muted-foreground truncate">{summary}</p>

      <div className="flex justify-between mt-2 text-[9px] text-muted-foreground px-1">
        <span className="text-emerald-400">True</span>
        <span className="text-red-400">False</span>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        id="true"
        className="!w-3 !h-3 !bg-emerald-400 !border-2 !border-emerald-900"
        style={{ left: "30%" }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="false"
        className="!w-3 !h-3 !bg-red-400 !border-2 !border-red-900"
        style={{ left: "70%" }}
      />
    </div>
  );
}
