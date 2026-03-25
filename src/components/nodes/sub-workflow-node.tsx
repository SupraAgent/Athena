"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { SubWorkflowNodeData } from "../../core/types";
import { cn } from "../../core/utils";

export function SubWorkflowNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as SubWorkflowNodeData;
  const config = nodeData.config;
  const inputCount = Object.keys(config?.inputMappings ?? {}).length;
  const outputCount = Object.keys(config?.outputMappings ?? {}).length;

  return (
    <div
      className={cn(
        "rounded-xl border bg-white/[0.035] px-4 py-3 min-w-[180px] max-w-[240px] transition-all",
        selected ? "border-sky-400/60 shadow-lg shadow-sky-500/10" : "border-sky-500/20"
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-sky-400 !border-2 !border-sky-900"
      />

      <div className="flex items-center gap-2.5">
        <div className="h-8 w-8 rounded-lg bg-sky-500/20 flex items-center justify-center shrink-0">
          <svg className="h-4 w-4 text-sky-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <path d="M8 21h8" />
            <path d="M12 17v4" />
            <path d="M7 8h2" />
            <path d="M7 11h2" />
            <path d="M15 8h2" />
            <path d="M15 11h2" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-foreground truncate">
            {nodeData.label || "Sub-Workflow"}
          </p>
          <p className="text-[10px] text-sky-400/70 truncate">
            {config?.workflowId || "No workflow set"}
          </p>
        </div>
      </div>

      {/* Version badge */}
      {config?.version && (
        <p className="mt-1.5 text-[9px] text-muted-foreground">
          v{config.version}
        </p>
      )}

      {/* Input/output mapping count badges */}
      {(inputCount > 0 || outputCount > 0) && (
        <div className="mt-2 flex gap-1.5">
          {inputCount > 0 && (
            <span className="text-[9px] font-medium bg-sky-500/20 text-sky-400 px-1.5 py-0.5 rounded-full">
              {inputCount} in
            </span>
          )}
          {outputCount > 0 && (
            <span className="text-[9px] font-medium bg-sky-500/20 text-sky-400 px-1.5 py-0.5 rounded-full">
              {outputCount} out
            </span>
          )}
        </div>
      )}

      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-sky-400 !border-2 !border-sky-900"
      />
    </div>
  );
}
