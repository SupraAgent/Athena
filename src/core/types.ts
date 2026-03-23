/**
 * Core type definitions for the automation builder.
 * All types are generic — consuming apps provide their own
 * trigger/action types via the NodeRegistry plugin system.
 */

// ── Node data types ─────────────────────────────────────────────

export type WorkflowNodeType = "trigger" | "action" | "condition" | "delay";

export interface TriggerNodeData {
  nodeType: "trigger";
  triggerType: string;
  label: string;
  config: Record<string, unknown>;
}

export interface ActionNodeData {
  nodeType: "action";
  actionType: string;
  label: string;
  config: Record<string, unknown>;
}

export interface ConditionOperator {
  value: string;
  label: string;
}

export const DEFAULT_OPERATORS: ConditionOperator[] = [
  { value: "equals", label: "Equals" },
  { value: "not_equals", label: "Not Equals" },
  { value: "contains", label: "Contains" },
  { value: "not_contains", label: "Not Contains" },
  { value: "starts_with", label: "Starts With" },
  { value: "gt", label: "Greater Than" },
  { value: "lt", label: "Less Than" },
  { value: "gte", label: "Greater or Equal" },
  { value: "lte", label: "Less or Equal" },
  { value: "is_empty", label: "Is Empty" },
  { value: "is_not_empty", label: "Is Not Empty" },
];

export interface ConditionConfig {
  field: string;
  operator: string;
  value: string;
  conditions?: { field: string; operator: string; value: string }[];
  logic?: "and" | "or";
}

export interface ConditionNodeData {
  nodeType: "condition";
  label: string;
  config: ConditionConfig;
}

export interface DelayConfig {
  duration: number;
  unit: "minutes" | "hours" | "days";
}

export interface DelayNodeData {
  nodeType: "delay";
  label: string;
  config: DelayConfig;
}

export type WorkflowNodeData =
  | TriggerNodeData
  | ActionNodeData
  | ConditionNodeData
  | DelayNodeData;

// ── Node palette (what shows in the sidebar) ────────────────────

export interface NodePaletteItem {
  type: WorkflowNodeType;
  subType: string;
  label: string;
  description: string;
  icon: string; // lucide icon name
  defaultConfig: Record<string, unknown>;
}

// ── Plugin: Node registry ───────────────────────────────────────

/**
 * Config field definition for the config panel.
 * The builder renders form fields based on these definitions.
 */
export interface ConfigFieldDef {
  key: string;
  label: string;
  type: "text" | "textarea" | "number" | "select";
  placeholder?: string;
  options?: { value: string; label: string }[]; // for select type
  defaultValue?: string | number;
}

/**
 * Registration for a custom trigger or action type.
 * Consumers provide these to define what config fields
 * appear in the config panel when a node of this type is selected.
 */
export interface NodeTypeRegistration {
  /** Matches NodePaletteItem.subType */
  subType: string;
  /** Config fields to render in the panel */
  configFields: ConfigFieldDef[];
  /** Optional info text shown at top of config section */
  infoText?: string;
}

/**
 * Full registry provided by the consuming app.
 * Defines all available triggers, actions, and their config schemas.
 */
export interface NodeRegistry {
  triggers: NodePaletteItem[];
  actions: NodePaletteItem[];
  logic?: NodePaletteItem[];
  /** Config field definitions per subType */
  triggerConfigs?: Record<string, NodeTypeRegistration>;
  actionConfigs?: Record<string, NodeTypeRegistration>;
  /** Condition field options (what fields can be compared) */
  conditionFields?: { value: string; label: string }[];
}

// ── Workflow data (DB-agnostic) ─────────────────────────────────

export interface WorkflowData {
  id: string;
  name: string;
  description?: string | null;
  nodes: FlowNode[];
  edges: FlowEdge[];
  is_active: boolean;
  trigger_type?: string | null;
  metadata?: Record<string, unknown>;
}

export interface FlowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: WorkflowNodeData;
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
}

// ── Engine types ────────────────────────────────────────────────

export interface WorkflowEvent {
  type: string;
  payload: Record<string, unknown>;
}

export interface ActionContext {
  workflowId: string;
  runId: string;
  vars: Record<string, string | number | undefined>;
  [key: string]: unknown; // consumers can add their own context
}

export interface ActionResult {
  success: boolean;
  output?: Record<string, unknown>;
  error?: string;
}

/**
 * Action executor function — provided by consuming apps.
 * The engine calls this for each action node encountered during traversal.
 */
export type ActionExecutor = (
  actionType: string,
  config: Record<string, unknown>,
  context: ActionContext
) => Promise<ActionResult>;

/**
 * Persistence adapter — provided by consuming apps.
 * The engine uses this to create/update run records.
 */
export interface PersistenceAdapter {
  createRun(workflowId: string, event: WorkflowEvent): Promise<string>;
  updateRun(
    runId: string,
    status: string,
    nodeOutputs: Record<string, unknown>,
    error?: string,
    currentNodeId?: string
  ): Promise<void>;
  scheduleResume?(
    runId: string,
    workflowId: string,
    resumeAt: string,
    event: WorkflowEvent
  ): Promise<void>;
  onWorkflowComplete?(workflowId: string): Promise<void>;
}

export interface RunResult {
  runId: string;
  status: "completed" | "failed" | "paused";
  nodeOutputs: Record<string, unknown>;
  error?: string;
}
