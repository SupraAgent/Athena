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
  ScheduleNodeData,
  ScheduleConfig,
  ScheduleState,
  ScheduleIntervalConfig,
  ScheduleCalendarConfig,
  DatabaseNodeData,
  DatabaseConfig,
  DatabaseOperation,
  DatabaseConnectorType,
  DatabaseResult,
  DatabaseAdapter,
  WorkflowNodeData,
  ConditionOperator,
  // AI Node
  AINodeConfig,
  AITool,
  AIToolCall,
  AINodeResult,
  AINodeData,
  AISuggestion,
  // Group Container
  GroupContainerChild,
  GroupContainerNodeData,
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
  // RBAC
  Permission,
  Role,
  User,
  RBACConfig,
  SerializedRBAC,
  // Workflow Dashboard
  WorkflowSummary,
  // Partner / Embedded Applets
  PartnerApplet,
  AppletConfigField,
  AppletInstance,
  PartnerRegistry,
  AppletSearchQuery,
  AppletSearchResult,
  SerializedAppletStore,
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

// ── AI Executor ──────────────────────────────────────────────────
export {
  AIExecutor,
  type AIProvider,
  type AIChatRequest,
  type AIChatResponse,
  type AIChatChunk,
  type AIChatMessage,
  type AIExpressionContext,
} from "./core/ai-executor";

// ── AI Suggestion Engine ─────────────────────────────────────────
export { AISuggestionEngine } from "./core/ai-suggestions";

// ── Database Connector ───────────────────────────────────────────
export {
  QueryBuilder,
  WhereBuilder,
  where,
  sanitizeIdentifier,
  validateMongoFilter,
  validateMongoPipeline,
  type BuiltQuery,
  type MongoQuery,
  type OrderByClause,
} from "./core/database-connector";

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

// ── Scheduler ────────────────────────────────────────────────────
export {
  parseCronExpression,
  getNextCronDate,
  getNextNDates,
  validateCronExpression,
  cronToHumanReadable,
  calendarToSchedule,
  intervalToNextDate,
  scheduleToHumanReadable,
  ScheduleManager,
  type CronParts,
  type CronField,
  type ScheduleFiredCallback,
} from "./core/scheduler";

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
export { CanvasIdContext } from "./components/canvas-id-context";

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
export { ScheduleNode } from "./components/nodes/schedule-node";
export { DatabaseNode } from "./components/nodes/database-node";
export { AINode } from "./components/nodes/ai-node";
export { AISuggestionsPanel, type AISuggestionsPanelProps } from "./components/ai-suggestions-panel";
export { GroupContainerNode } from "./components/nodes/group-container-node";

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
  getNextCopyName,
  copyTemplateForUse,
} from "./core/template-utils";

export { TemplateBrowser, type TemplateBrowserProps } from "./components/template-browser";
export { TemplateManager, type TemplateManagerProps, type ManagedTemplate } from "./components/template-manager";
export { NodeContextMenu, type NodeContextMenuProps, type ContextMenuItem } from "./components/node-context-menu";
export { AIFlowChat, type AIFlowChatProps, type AIFlowChatRequest, type AIFlowChatResponse, type AIFlowMessage } from "./components/ai-flow-chat";

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

// ── RBAC ─────────────────────────────────────────────────────────
export {
  RBACManager,
  BUILTIN_ADMIN_ROLE,
  BUILTIN_EDITOR_ROLE,
  BUILTIN_VIEWER_ROLE,
  BUILTIN_OPERATOR_ROLE,
} from "./core/rbac";

export { RBACProvider, RBACContext, useRBAC, type RBACProviderProps } from "./components/rbac-context";

// ── Workflow Dashboard ───────────────────────────────────────────
export { WorkflowDashboard, type WorkflowDashboardProps } from "./components/workflow-dashboard";

// ── Partner / Embedded Applets ────────────────────────────────────
export { AppletStore } from "./core/partner-applets";
export { EXAMPLE_APPLETS } from "./core/example-applets";
export { AppletMarketplace, type AppletMarketplaceProps } from "./components/applet-marketplace";
export { AppletConfigModal, type AppletConfigModalProps } from "./components/applet-config-modal";
export { AppletInstances, type AppletInstancesProps } from "./components/applet-instances";

// ── Template Persistence (localStorage CRUD) ─────────────────────
export { TemplatePersistence } from "./core/template-persistence";

// ── Undo/Redo ────────────────────────────────────────────────────
export { useUndoRedo } from "./core/use-undo-redo";

// ── Built-in connectors ──────────────────────────────────────────
export { webhookConnector } from "./connectors";
