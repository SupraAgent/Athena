"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { AINodeData } from "../../core/types";
import { cn } from "../../core/utils";

export function AINode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as AINodeData;
  const config = nodeData.config;
  const hasTools = config?.tools && config.tools.length > 0;
  const modelName = config?.model || "AI";

  return (
    <div
      className={cn(
        "rounded-xl border bg-white/[0.035] px-4 py-3 min-w-[180px] max-w-[240px] transition-all",
        selected
          ? "border-purple-400/60 shadow-lg shadow-purple-500/10"
          : "border-purple-500/20"
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-purple-400 !border-2 !border-purple-900"
      />

      {/* Purple-to-blue gradient accent bar */}
      <div className="absolute top-0 left-3 right-3 h-[2px] rounded-b bg-gradient-to-r from-purple-500 to-blue-500 opacity-60" />

      <div className="flex items-center gap-2.5">
        <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-purple-500/20 to-blue-500/20 flex items-center justify-center shrink-0">
          <svg
            className="h-4 w-4 text-purple-400"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 2a4 4 0 0 1 4 4v1a2 2 0 0 1 2 2v1a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2V6a4 4 0 0 1 4-4z" />
            <path d="M9 18h6" />
            <path d="M10 22h4" />
            <path d="M12 14v4" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-foreground truncate">
            {nodeData.label || "AI Node"}
          </p>
          <p className="text-[10px] text-purple-400/70 truncate">{modelName}</p>
        </div>
        {hasTools && (
          <span className="shrink-0 text-[9px] font-medium bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded-full">
            {config.tools!.length} tool{config.tools!.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Token / streaming indicators */}
      <div className="flex gap-1.5 mt-2">
        {config?.maxTokens && (
          <span className="text-[9px] text-muted-foreground/60 bg-white/5 px-1.5 py-0.5 rounded">
            {config.maxTokens} max tokens
          </span>
        )}
        {config?.stream && (
          <span className="text-[9px] text-purple-400/50 bg-purple-500/10 px-1.5 py-0.5 rounded">
            stream
          </span>
        )}
        {config?.responseFormat === "json" && (
          <span className="text-[9px] text-blue-400/50 bg-blue-500/10 px-1.5 py-0.5 rounded">
            JSON
          </span>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-purple-400 !border-2 !border-purple-900"
      />
    </div>
  );
}
