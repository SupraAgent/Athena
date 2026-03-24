// ── Core ────────────────────────────────────────────────────────
export type {
  // Node data
  WorkflowNodeType,
  TriggerNodeData,
  ActionNodeData,
  ConditionNodeData,
  DelayNodeData,
  ConditionConfig,
  DelayConfig,
  WorkflowNodeData,
  ConditionOperator,
  // Palette
  NodePaletteItem,
  ConfigFieldDef,
  NodeTypeRegistration,
  NodeRegistry,
  // Workflow
  WorkflowData,
  FlowNode,
  FlowEdge,
  // Engine
  WorkflowEvent,
  ActionContext,
  ActionResult,
  ActionExecutor,
  PersistenceAdapter,
  RunResult,
} from "./core/types";

export { DEFAULT_OPERATORS } from "./core/types";

export {
  executeWorkflow,
  resumeWorkflow,
  evaluateCondition,
  defaultRenderTemplate,
  type EngineConfig,
} from "./core/engine";

export { cn } from "./core/utils";

// ── Components ──────────────────────────────────────────────────
export { FlowCanvas, type FlowCanvasProps } from "./components/flow-canvas";
export { NodeSidebar } from "./components/node-sidebar";
export { NodeConfigPanel } from "./components/node-config-panel";
export { BuilderProvider, useBuilderContext, type BuilderProviderProps } from "./components/builder-context";

// ── Node components (for custom node type composition) ──────────
export { TriggerNode } from "./components/nodes/trigger-node";
export { ActionNode } from "./components/nodes/action-node";
export { ConditionNode } from "./components/nodes/condition-node";
export { DelayNode } from "./components/nodes/delay-node";

// ── Consumer registries ─────────────────────────────────────────
export {
  SUPRATEAM_REGISTRY,
  SUPRATEAM_TRIGGERS,
  SUPRATEAM_ACTIONS,
  SUPRALOOP_REGISTRY,
  SUPRALOOP_TRIGGERS,
  SUPRALOOP_ACTIONS,
  AUTOPURCHASER_REGISTRY,
  AUTOPURCHASER_TRIGGERS,
  AUTOPURCHASER_ACTIONS,
  mergeRegistries,
} from "./registries";
