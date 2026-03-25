"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { TransformNodeData } from "../../core/types";
import { cn } from "../../core/utils";

export function TransformNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as TransformNodeData;
  const ops = nodeData.config?.operations ?? [];
  const opCount = ops.length;
  const firstOp = ops[0]?.type ?? "none";

  return (
    <div
      className={cn(
        "rounded-xl border bg-white/[0.035] px-4 py-3 min-w-[180px] max-w-[240px] transition-all",
        selected ? "border-emerald-400/60 shadow-lg shadow-emerald-500/10" : "border-emerald-500/20"
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-emerald-400 !border-2 !border-emerald-900"
      />

      <div className="flex items-center gap-2.5">
        <div className="h-8 w-8 rounded-lg bg-emerald-500/20 flex items-center justify-center shrink-0">
          <svg className="h-4 w-4 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 14l8-8 8 8" />
            <path d="M4 18h16" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-foreground truncate">
            {nodeData.label || "Transform"}
          </p>
          <p className="text-[10px] text-emerald-400/70 capitalize">{firstOp}</p>
        </div>
        {opCount > 0 && (
          <span className="shrink-0 text-[9px] font-medium bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-full">
            {opCount}
          </span>
        )}
      </div>

      {nodeData.config?.inputExpression && (
        <p className="mt-2 text-[10px] text-muted-foreground truncate">
          {nodeData.config.inputExpression.length > 40
            ? nodeData.config.inputExpression.slice(0, 40) + "\u2026"
            : nodeData.config.inputExpression}
        </p>
      )}

      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-emerald-400 !border-2 !border-emerald-900"
      />
    </div>
  );
}
