"use client";

import * as React from "react";
import type { NodePaletteItem } from "../core/types";
import { useBuilderContext } from "./builder-context";

function PaletteGroup({
  title,
  items,
  accentClass,
  iconMap,
}: {
  title: string;
  items: NodePaletteItem[];
  accentClass: string;
  iconMap: Record<string, React.ElementType>;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 px-1">
        {title}
      </p>
      {items.map((item) => {
        const Icon = iconMap[item.icon] ?? iconMap[item.subType];
        return (
          <div
            key={`${item.type}-${item.subType}`}
            className="flex items-center gap-2.5 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 cursor-grab hover:bg-white/[0.05] hover:border-white/10 transition-colors active:cursor-grabbing"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(
                "application/reactflow",
                JSON.stringify({
                  nodeType: item.type,
                  subType: item.subType,
                  label: item.label,
                  defaultConfig: item.defaultConfig,
                })
              );
              e.dataTransfer.effectAllowed = "move";
            }}
          >
            <div className={`h-6 w-6 rounded flex items-center justify-center shrink-0 ${accentClass}`}>
              {Icon && <Icon className="h-3 w-3" />}
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-foreground truncate">{item.label}</p>
              <p className="text-[9px] text-muted-foreground/60 truncate">{item.description}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function NodeSidebar() {
  const { triggers, actions, logic, iconMap } = useBuilderContext();

  return (
    <div className="w-52 shrink-0 border-r border-white/10 bg-white/[0.02] p-3 space-y-4 overflow-y-auto">
      <p className="text-xs font-semibold text-foreground px-1">Nodes</p>
      <p className="text-[10px] text-muted-foreground/60 px-1">Drag onto canvas</p>

      <PaletteGroup
        title="Triggers"
        items={triggers}
        accentClass="bg-purple-500/20 text-purple-400"
        iconMap={iconMap}
      />
      <PaletteGroup
        title="Actions"
        items={actions}
        accentClass="bg-blue-500/20 text-blue-400"
        iconMap={iconMap}
      />
      <PaletteGroup
        title="Logic"
        items={logic}
        accentClass="bg-yellow-500/20 text-yellow-400"
        iconMap={iconMap}
      />
    </div>
  );
}
