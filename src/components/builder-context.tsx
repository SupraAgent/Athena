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
