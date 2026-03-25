"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { DatabaseNodeData, DatabaseConnectorType } from "../../core/types";
import { cn } from "../../core/utils";

const connectorLabels: Record<DatabaseConnectorType, string> = {
  postgresql: "PostgreSQL",
  mysql: "MySQL",
  sqlite: "SQLite",
  mongodb: "MongoDB",
  custom: "Custom",
};

function operationLabel(op: DatabaseNodeData["config"]["operation"]): string {
  switch (op.type) {
    case "query": return "Query";
    case "insert": return "Insert";
    case "update": return "Update";
    case "delete": return "Delete";
    case "find": return "Find";
    case "aggregate": return "Aggregate";
    default: return "DB Op";
  }
}

function operationDetail(op: DatabaseNodeData["config"]["operation"]): string {
  switch (op.type) {
    case "query": return op.sql ? op.sql.slice(0, 40) + (op.sql.length > 40 ? "..." : "") : "No query";
    case "insert": return op.table || "No table";
    case "update": return op.table || "No table";
    case "delete": return op.table || "No table";
    case "find": return op.collection || "No collection";
    case "aggregate": return op.collection || "No collection";
    default: return "";
  }
}

export function DatabaseNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as DatabaseNodeData;
  const config = nodeData.config;
  const dbLabel = connectorLabels[config.connectorType] ?? "Database";

  return (
    <div
      className={cn(
        "rounded-xl border bg-white/[0.035] px-4 py-3 min-w-[180px] max-w-[240px] transition-all",
        selected ? "border-teal-400/60 shadow-lg shadow-teal-500/10" : "border-teal-500/20"
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-teal-400 !border-2 !border-teal-900"
      />

      <div className="flex items-center gap-2.5">
        <div className="h-8 w-8 rounded-lg bg-teal-500/20 flex items-center justify-center shrink-0">
          {/* Database/cylinder SVG icon */}
          <svg className="h-4 w-4 text-teal-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <ellipse cx="12" cy="5" rx="9" ry="3" />
            <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
            <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-foreground truncate">
            {nodeData.label || "Database"}
          </p>
          <p className="text-[10px] text-teal-400/70 truncate">
            {operationDetail(config.operation)}
          </p>
        </div>
      </div>

      {/* Badges: connector type + operation */}
      <div className="mt-2 flex items-center gap-1.5">
        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-teal-500/15 text-teal-400 font-medium">
          {dbLabel}
        </span>
        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/5 text-muted-foreground">
          {operationLabel(config.operation)}
        </span>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-teal-400 !border-2 !border-teal-900"
      />
    </div>
  );
}
