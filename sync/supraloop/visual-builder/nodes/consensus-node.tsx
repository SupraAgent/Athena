"use client";

import * as React from "react";
import { Handle, Position, type NodeProps, useReactFlow } from "@xyflow/react";
import type { ConsensusNodeData } from "@/lib/flow-templates";

const ROLE_COLORS: Record<string, string> = {
  "Head of Product": "border-blue-500/50 bg-blue-500/15",
  "Engineering Lead": "border-emerald-500/50 bg-emerald-500/15",
  "Design Lead": "border-purple-500/50 bg-purple-500/15",
  "Growth & Analytics": "border-orange-500/50 bg-orange-500/15",
  "QA & Reliability": "border-red-500/50 bg-red-500/15",
};

export function ConsensusNode({ id, data }: NodeProps) {
  const d = data as ConsensusNodeData;
  const personas = d.personas ?? [];
  const ceo = personas.find((p) => p.isCeo);
  const others = personas.filter((p) => !p.isCeo);
  const [dragOver, setDragOver] = React.useState(false);
  const { setNodes } = useReactFlow();

  function handleDragOver(event: React.DragEvent) {
    const type = event.dataTransfer.types.includes("application/reactflow-type")
      ? "persona"
      : null;
    if (!type) return;
    event.preventDefault();
    event.stopPropagation();
    setDragOver(true);
  }

  function handleDragLeave() {
    setDragOver(false);
  }

  function handleDrop(event: React.DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    setDragOver(false);

    const type = event.dataTransfer.getData("application/reactflow-type");
    if (type !== "personaNode") return;

    const dataStr = event.dataTransfer.getData("application/reactflow-data");
    if (!dataStr) return;

    try {
      const personaData = JSON.parse(dataStr);
      const newPersona = {
        name: personaData.label ?? "Persona",
        role: personaData.role ?? "Team Member",
        emoji: personaData.emoji ?? "👤",
        voteWeight: personaData.voteWeight ?? 1.0,
        isCeo: personas.length === 0,
      };

      // Skip duplicates
      if (personas.some((p) => p.name === newPersona.name && p.role === newPersona.role)) return;

      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== id) return n;
          const current = (n.data as ConsensusNodeData).personas ?? [];
          return {
            ...n,
            data: { ...n.data, personas: [...current, newPersona] },
          };
        })
      );
    } catch {
      // Ignore parse errors
    }
  }

  return (
    <div
      className={`rounded-xl border-2 border-primary/30 bg-primary/5 px-5 py-4 shadow-lg shadow-primary/10 transition-all ${
        dragOver ? "ring-2 ring-primary/40 border-primary/60" : ""
      }`}
      style={{ minWidth: Math.max(280, personas.length * 100 + 40) }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <Handle type="target" position={Position.Top} className="!bg-primary !w-3 !h-3" />
      <Handle type="source" position={Position.Bottom} className="!bg-primary !w-3 !h-3" />

      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">🗳️</span>
          <div>
            <div className="font-bold text-sm text-foreground">{d.label || "Consensus"}</div>
            <div className="text-[10px] text-muted-foreground">
              {personas.length} persona{personas.length !== 1 ? "s" : ""} voting
            </div>
          </div>
        </div>
        {d.consensusScore > 0 && (
          <div className="flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-1">
            <span className="text-[10px] text-muted-foreground">Score:</span>
            <span className="text-sm font-mono font-bold text-primary">{d.consensusScore}</span>
          </div>
        )}
      </div>

      {/* CEO / Decision Maker — highlighted at top */}
      {ceo && (
        <div className="mb-3">
          <div className="text-[9px] font-medium text-primary/70 uppercase tracking-wider mb-1">
            Decision Maker
          </div>
          <div className="rounded-lg border-2 border-primary/50 bg-primary/10 px-3 py-2.5 ring-2 ring-primary/20">
            <div className="flex items-center gap-2">
              <span className="text-base">{ceo.emoji}</span>
              <div className="flex-1">
                <div className="font-semibold text-xs text-foreground">{ceo.name}</div>
                <div className="text-[10px] text-muted-foreground">{ceo.role}</div>
              </div>
              <span className="text-xs font-mono text-primary font-bold">{ceo.voteWeight}x</span>
            </div>
          </div>
        </div>
      )}

      {/* Other personas grid */}
      {others.length > 0 && (
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(others.length, 3)}, 1fr)` }}>
          {others.map((p) => {
            const colorClass = ROLE_COLORS[p.role] ?? "border-white/20 bg-white/5";
            return (
              <div key={p.name} className={`rounded-lg border ${colorClass} px-2.5 py-2`}>
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-sm">{p.emoji}</span>
                  <span className="font-medium text-[11px] text-foreground truncate">{p.name}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[9px] text-muted-foreground truncate">{p.role}</span>
                  <span className="text-[10px] font-mono text-muted-foreground">{p.voteWeight}x</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {personas.length === 0 && (
        <div className={`rounded-lg border border-dashed px-4 py-6 text-center transition-colors ${
          dragOver ? "border-primary/40 bg-primary/5" : "border-white/10"
        }`}>
          <div className="text-xs text-muted-foreground">Drag persona nodes here</div>
          <div className="text-[10px] text-muted-foreground/60 mt-1">or use AI to populate</div>
        </div>
      )}
    </div>
  );
}
