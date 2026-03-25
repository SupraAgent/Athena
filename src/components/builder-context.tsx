"use client";

import * as React from "react";
import type { NodeRegistry, NodePaletteItem } from "../core/types";

/**
 * Default logic palette items (condition + delay).
 * These are always available unless overridden via registry.logic.
 */
const DEFAULT_LOGIC: NodePaletteItem[] = [
  {
    type: "condition",
    subType: "condition",
    label: "Condition",
    description: "If/else branch",
    icon: "GitBranch",
    defaultConfig: { field: "", operator: "equals", value: "" },
  },
  {
    type: "delay",
    subType: "delay",
    label: "Delay",
    description: "Wait before continuing",
    icon: "Clock",
    defaultConfig: { duration: 1, unit: "hours" },
  },
  {
    type: "try_catch",
    subType: "try_catch",
    label: "Try / Catch",
    description: "Error handling branch",
    icon: "ShieldAlert",
    defaultConfig: { tryPath: "success", catchPath: "error" },
  },
  {
    type: "code",
    subType: "code",
    label: "Code",
    description: "Run custom code",
    icon: "Code",
    defaultConfig: { language: "javascript", code: "", timeout: 5000 },
  },
  {
    type: "switch",
    subType: "switch",
    label: "Switch",
    description: "Multi-way branch",
    icon: "Signpost",
    defaultConfig: { expression: "", cases: [], defaultCase: "default" },
  },
  {
    type: "loop",
    subType: "loop",
    label: "Loop",
    description: "Iterate over array",
    icon: "Repeat",
    defaultConfig: { arrayExpression: "", itemVariable: "item", maxIterations: 100 },
  },
  {
    type: "transform",
    subType: "transform",
    label: "Transform",
    description: "Transform data pipeline",
    icon: "Shuffle",
    defaultConfig: { inputExpression: "", operations: [] },
  },
  {
    type: "sub_workflow",
    subType: "sub_workflow",
    label: "Sub-Workflow",
    description: "Execute another workflow",
    icon: "Workflow",
    defaultConfig: { workflowId: "", inputMappings: {}, outputMappings: {}, maxDepth: 10 },
  },
  {
    type: "schedule",
    subType: "schedule",
    label: "Schedule",
    description: "Time-based trigger",
    icon: "CalendarClock",
    defaultConfig: { mode: "interval", interval: { value: 5, unit: "minutes" } },
  },
  {
    type: "database",
    subType: "database",
    label: "Database",
    description: "Query or modify a database",
    icon: "Database",
    defaultConfig: {
      connectorType: "postgresql",
      operation: { type: "query", sql: "", params: [] },
    },
  },
  {
    type: "ai",
    subType: "ai",
    label: "AI / LLM",
    description: "AI model with tool use",
    icon: "Brain",
    defaultConfig: { provider: "", model: "", prompt: "", temperature: 0.7, maxToolRounds: 5 },
  },
];

export interface BuilderContextValue {
  registry: NodeRegistry;
  iconMap: Record<string, React.ElementType>;
  triggers: NodePaletteItem[];
  actions: NodePaletteItem[];
  logic: NodePaletteItem[];
}

const BuilderContext = React.createContext<BuilderContextValue | null>(null);

export function useBuilderContext(): BuilderContextValue {
  const ctx = React.useContext(BuilderContext);
  if (!ctx) {
    throw new Error("useBuilderContext must be used within <AutomationBuilder>");
  }
  return ctx;
}

export interface BuilderProviderProps {
  registry: NodeRegistry;
  /** Map of icon name → React component. Used by node components. */
  iconMap?: Record<string, React.ElementType>;
  children: React.ReactNode;
}

export function BuilderProvider({ registry, iconMap = {}, children }: BuilderProviderProps) {
  const value = React.useMemo<BuilderContextValue>(
    () => ({
      registry,
      iconMap,
      triggers: registry.triggers,
      actions: registry.actions,
      logic: registry.logic ?? DEFAULT_LOGIC,
    }),
    [registry, iconMap]
  );

  return (
    <BuilderContext.Provider value={value}>{children}</BuilderContext.Provider>
  );
}
