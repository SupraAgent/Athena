"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { ActionNodeData } from "../../core/types";
import { cn } from "../../core/utils";
import { useBuilderContext } from "../builder-context";

export function ActionNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as ActionNodeData;
  const { iconMap } = useBuilderContext();
  const Icon = iconMap[nodeData.actionType];

  // Build short config summary from first string field
  let summary = "";
  const cfg = nodeData.config as Record<string, unknown>;
  for (const val of Object.values(cfg)) {
    if (typeof val === "string" && val.length > 0) {
      summary = val.length > 40 ? val.slice(0, 40) + "…" : val;
      break;
    }
  }

  return (
    <div
      className={cn(
        "rounded-xl border bg-white/[0.035] px-4 py-3 min-w-[180px] max-w-[240px] transition-all",
        selected ? "border-blue-400/60 shadow-lg shadow-blue-500/10" : "border-blue-500/20"
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-blue-400 !border-2 !border-blue-900"
      />

      <div className="flex items-center gap-2.5">
        <div className="h-8 w-8 rounded-lg bg-blue-500/20 flex items-center justify-center shrink-0">
          {Icon && <Icon className="h-4 w-4 text-blue-400" />}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-foreground truncate">
            {nodeData.label || "Action"}
          </p>
          <p className="text-[10px] text-blue-400/70 truncate">
            {nodeData.actionType.replace(/_/g, " ")}
          </p>
        </div>
      </div>

      {summary && (
        <p className="mt-2 text-[10px] text-muted-foreground truncate">{summary}</p>
      )}

      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-blue-400 !border-2 !border-blue-900"
      />
    </div>
  );
}
