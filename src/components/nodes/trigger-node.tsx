"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { TriggerNodeData } from "../../core/types";
import { cn } from "../../core/utils";
import { useBuilderContext } from "../builder-context";

export function TriggerNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as TriggerNodeData;
  const { iconMap } = useBuilderContext();
  const Icon = iconMap[nodeData.triggerType];

  return (
    <div
      className={cn(
        "rounded-xl border bg-white/[0.035] px-4 py-3 min-w-[180px] max-w-[240px] transition-all",
        selected ? "border-purple-400/60 shadow-lg shadow-purple-500/10" : "border-purple-500/20"
      )}
    >
      <div className="flex items-center gap-2.5">
        <div className="h-8 w-8 rounded-lg bg-purple-500/20 flex items-center justify-center shrink-0">
          {Icon && <Icon className="h-4 w-4 text-purple-400" />}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-foreground truncate">
            {nodeData.label || "Trigger"}
          </p>
          <p className="text-[10px] text-purple-400/70 truncate">
            {nodeData.triggerType.replace(/_/g, " ")}
          </p>
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-purple-400 !border-2 !border-purple-900"
      />
    </div>
  );
}
