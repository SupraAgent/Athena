"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { LLMNodeData } from "@/lib/flow-templates";

const PROVIDER_STYLES: Record<string, { icon: string; border: string; bg: string; accent: string }> = {
  claude: { icon: "🟣", border: "border-violet-500/40", bg: "bg-violet-500/10", accent: "text-violet-400" },
  "claude-code": { icon: "🖥", border: "border-fuchsia-500/40", bg: "bg-fuchsia-500/10", accent: "text-fuchsia-400" },
  ollama: { icon: "🦙", border: "border-orange-500/40", bg: "bg-orange-500/10", accent: "text-orange-400" },
  custom: { icon: "🤖", border: "border-sky-500/40", bg: "bg-sky-500/10", accent: "text-sky-400" },
};

export function LLMNode({ data }: NodeProps) {
  const d = data as LLMNodeData;
  const style = PROVIDER_STYLES[d.provider] ?? PROVIDER_STYLES.custom;

  return (
    <div className={`rounded-xl border-2 ${style.border} ${style.bg} px-4 py-3 min-w-[200px] shadow-lg shadow-black/10`}>
      <Handle type="target" position={Position.Left} className="!bg-white/40 !w-2.5 !h-2.5" />
      <Handle type="source" position={Position.Right} className="!bg-white/40 !w-2.5 !h-2.5" />
      <div className="flex items-center gap-2 mb-1">
        <span className="text-base">{style.icon}</span>
        <span className="font-semibold text-sm text-foreground">{d.label}</span>
      </div>
      <div className={`text-[10px] font-medium uppercase tracking-wide ${style.accent}`}>
        {d.provider === "claude-code" ? "Claude Code" : d.provider}
        {d.model && ` / ${d.model}`}
      </div>
      {d.systemPrompt && (
        <p className="mt-1.5 text-[11px] text-muted-foreground line-clamp-2 italic">
          &quot;{d.systemPrompt}&quot;
        </p>
      )}
      {d.provider === "claude-code" && (
        <div className="mt-2 flex items-center gap-1 rounded-md bg-fuchsia-500/10 px-2 py-0.5">
          <span className="text-[10px] text-fuchsia-300">Agent Mode</span>
        </div>
      )}
    </div>
  );
}
