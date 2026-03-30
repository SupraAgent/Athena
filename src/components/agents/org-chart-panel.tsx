"use client";

import * as React from "react";
import type { Persona } from "@/lib/personas";

type OrgNode = Persona & { children: OrgNode[] };

function buildTree(personas: Persona[]): OrgNode[] {
  const map = new Map<string, OrgNode>();
  for (const p of personas) {
    map.set(p.id, { ...p, children: [] });
  }

  const roots: OrgNode[] = [];
  for (const node of map.values()) {
    if (node.reportsTo && map.has(node.reportsTo)) {
      map.get(node.reportsTo)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

function getMaxDepth(nodes: OrgNode[], depth = 1): number {
  let max = depth;
  for (const n of nodes) {
    if (n.children.length > 0) {
      max = Math.max(max, getMaxDepth(n.children, depth + 1));
    }
  }
  return max;
}

function OrgNodeCard({ node, depth = 0 }: { node: OrgNode; depth?: number }) {
  return (
    <div className={depth > 0 ? "ml-6 mt-2" : ""}>
      <div className="flex items-center gap-2">
        {depth > 0 && (
          <div className="flex items-center gap-1 text-white/20">
            <div className="w-4 border-t border-white/15" />
          </div>
        )}
        <div className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-sm flex-1">
          <div className="flex items-center justify-between">
            <div>
              {node.icon && <span className="mr-1.5">{node.icon}</span>}
              <span className="font-medium text-foreground">{node.name}</span>
              <span className="text-muted-foreground ml-2 text-xs">{node.role}</span>
            </div>
            <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
              <span>{node.heartbeatMinutes}m</span>
              <span>${node.monthlyBudgetUsd}/mo</span>
              {node.triggers.length > 0 && (
                <span className="text-primary">{node.triggers.length} triggers</span>
              )}
            </div>
          </div>
        </div>
      </div>
      {node.children.map((child) => (
        <OrgNodeCard key={child.id} node={child} depth={depth + 1} />
      ))}
    </div>
  );
}

export function OrgChartPanel({ personas }: { personas: Persona[] }) {
  if (personas.length === 0) {
    return (
      <div className="rounded-lg border border-white/10 bg-white/[0.02] p-8 text-center text-sm text-muted-foreground">
        No personas to display. Create personas first.
      </div>
    );
  }

  const tree = buildTree(personas);
  const totalBudget = personas.reduce((s, p) => s + p.monthlyBudgetUsd, 0);

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex items-center gap-4 rounded-lg border border-white/10 bg-white/[0.02] px-4 py-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Agents
          </div>
          <div className="text-lg font-semibold text-foreground">
            {personas.length}
          </div>
        </div>
        <div className="h-8 w-px bg-white/10" />
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Monthly Budget
          </div>
          <div className="text-lg font-semibold text-foreground">
            ${totalBudget}
          </div>
        </div>
        <div className="h-8 w-px bg-white/10" />
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Hierarchy Depth
          </div>
          <div className="text-lg font-semibold text-foreground">
            {getMaxDepth(tree)}
          </div>
        </div>
      </div>

      {/* Org tree */}
      <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4 space-y-2">
        {tree.map((root) => (
          <OrgNodeCard key={root.id} node={root} />
        ))}
      </div>

      <p className="text-[10px] text-muted-foreground">
        Set <code className="bg-white/5 px-1 rounded">reports_to</code> on a
        persona to define hierarchy (use the ID of the manager persona).
      </p>
    </div>
  );
}
