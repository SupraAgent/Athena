// ── Core ────────────────────────────────────────────────────────
export type {
  // Node data
  WorkflowNodeType,
  TriggerNodeData,
  ActionNodeData,
  ConditionNodeData,
  DelayNodeData,
  TryCatchNodeData,
  CodeNodeData,
  SwitchNodeData,
  LoopNodeData,
  ConditionConfig,
  DelayConfig,
  TryCatchConfig,
  CodeConfig,
  SwitchConfig,
  SwitchCase,
  LoopConfig,
  TransformNodeData,
  TransformConfig,
  TransformOperation,
  TransformResult,
  AggregateOp,
  SubWorkflowNodeData,
  SubWorkflowConfig,
  WorkflowResolver,
  WorkflowNodeData,
  ConditionOperator,
  // Retry
  RetryConfig,
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
  NodeTiming,
  // Credential Vault
  StoredCredential,
  CredentialStore,
  CredentialRef,
  // Execution Logger
  ExecutionLogger,
  // Connector Manifest
  ConnectorManifest,
  // Template Marketplace
  TemplateManifest,
  ShareableTemplate,
  TemplateValidationResult,
  // Streaming
  StreamChunk,
  StreamingActionResult,
  OnStreamCallback,
  // Execution History
  ExecutionRecord,
  NodeExecutionEvent,
  ExecutionHistoryQuery,
  ExecutionHistoryResult,
  ExecutionStats,
  TimeSeriesBucket,
  SerializedHistory,
} from "./core/types";

export { DEFAULT_OPERATORS } from "./core/types";

export {
  executeWorkflow,
  resumeWorkflow,
  evaluateCondition,
  defaultRenderTemplate,
  type EngineConfig,
} from "./core/engine";

export {
  resolveExpression,
  resolveTemplate,
  resolveAllValues,
  type ExpressionContext,
} from "./core/expression-resolver";

export { cn } from "./core/utils";

// ── Sub-Workflow Validator ────────────────────────────────────────
export {
  validateSubWorkflow,
  type SubWorkflowValidationResult,
} from "./core/sub-workflow-validator";

// ── Data Mapper ──────────────────────────────────────────────────
export { applyTransformPipeline } from "./core/data-mapper";

// ── Rate Limiter ─────────────────────────────────────────────────
export {
  TokenBucketRateLimiter,
  type RateLimitConfig,
  type RateLimitAcquireResult,
  type RateLimitStatus,
} from "./core/rate-limiter";

// ── Smart Defaults ───────────────────────────────────────────────
export {
  computeSmartDefaults,
  detectUpstreamFromEdges,
  BUILTIN_SMART_DEFAULT_RULES,
  type SmartDefaultContext,
  type SmartDefaultRule,
} from "./core/smart-defaults";

export { ConsoleLogger } from "./core/console-logger";

export { ExecutionHistoryStore } from "./core/execution-history";

export {
  formatRunSummary,
  formatNodeEvent,
  formatDuration,
} from "./core/plain-language";

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
export { TryCatchNode } from "./components/nodes/try-catch-node";
export { CodeNode } from "./components/nodes/code-node";
export { SwitchNode } from "./components/nodes/switch-node";
export { LoopNode } from "./components/nodes/loop-node";
export { TransformNode } from "./components/nodes/transform-node";
export { SubWorkflowNode } from "./components/nodes/sub-workflow-node";

// ── Personas & Agents ────────────────────────────────────────────
export type { CPOPersona, ProductThesis, DecisionHeuristic, StrategicPriority } from "./personas";
export { CPO_N8N, CPO_IFTTT, CPO_CRYPTO_AUTOMATION } from "./personas";

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
  registerConnector,
} from "./registries";

// ── Connector SDK ────────────────────────────────────────────────
export {
  defineConnector,
  type ConnectorAuthType,
  type ConnectorAuthField,
  type ConnectorAuthConfig,
  type ConnectorTrigger,
  type ConnectorAction,
  type ConnectorActionExecutor,
  type ConnectorActionExecutorResult,
  type ConnectorDefinition,
  type ConnectorOutput,
  type CredentialDefinition,
} from "./core/connector-sdk";

// ── Template Marketplace ─────────────────────────────────────────
export {
  exportTemplate,
  importTemplate,
  validateTemplate,
  encodeTemplateToUrl,
  decodeTemplateFromUrl,
  workflowToTemplate,
  type ExportTemplateInput,
  type ImportTemplateResult,
} from "./core/template-utils";

export { TemplateBrowser, type TemplateBrowserProps } from "./components/template-browser";

// ── Workflow Portability ──────────────────────────────────────────
export {
  WORKFLOW_SCHEMA_VERSION,
  exportWorkflow,
  importWorkflow,
  validateWorkflowSchema,
  encodeWorkflowToLink,
  decodeWorkflowFromLink,
  copyWorkflowToClipboard,
  pasteWorkflowFromClipboard,
  type ExportedWorkflow,
  type ImportWorkflowResult,
  type SchemaValidationResult,
  type WorkflowPortabilityMetadata,
} from "./core/portability";

// ── Execution History ────────────────────────────────────────────
export { ExecutionHistoryPanel, type ExecutionHistoryPanelProps } from "./components/execution-history";

// ── Built-in connectors ──────────────────────────────────────────
export { webhookConnector } from "./connectors";
