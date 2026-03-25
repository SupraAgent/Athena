"use client";

import type { NodeProps } from "@xyflow/react";
import type { NoteNodeData } from "@/lib/flow-templates";

export function NoteNode({ data }: NodeProps) {
  const d = data as NoteNodeData;

  return (
    <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 px-3 py-2 max-w-[200px]">
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-xs">📌</span>
        <span className="font-medium text-xs text-yellow-300">{d.label}</span>
      </div>
      <p className="text-[11px] text-muted-foreground leading-relaxed">{d.content}</p>
    </div>
  );
}
