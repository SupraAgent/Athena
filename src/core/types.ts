/**
 * Core type definitions for the automation builder.
 * All types are generic — consuming apps provide their own
 * trigger/action types via the NodeRegistry plugin system.
 */

// ── Node data types ─────────────────────────────────────────────

export type WorkflowNodeType = "trigger" | "action" | "condition" | "delay" | "try_catch" | "code" | "switch" | "loop" | "transform" | "sub_workflow" | "schedule" | "database" | "ai";

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
  /** Optional per-node retry configuration. Falls back to engine defaults. */
  retryConfig?: RetryConfig;
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

export interface RetryConfig {
  /** Maximum number of retries. Falls back to engine default if omitted. */
  maxRetries?: number;
  /** Backoff strategy. Default: "exponential" */
  backoffType?: "linear" | "exponential";
  /** Base delay in milliseconds between retries. Default: 1000 */
  baseDelayMs?: number;
  /** Maximum delay cap in milliseconds. Default: 30000 */
  maxDelayMs?: number;
}

export interface TryCatchConfig {
  /** Edge identifier for the success/try path */
  tryPath: string;
  /** Edge identifier for the error/catch path */
  catchPath: string;
}

export interface TryCatchNodeData {
  nodeType: "try_catch";
  label: string;
  config: TryCatchConfig;
}

export interface CodeConfig {
  language: "javascript" | "typescript";
  code: string;
  timeout?: number;
}

export interface CodeNodeData {
  nodeType: "code";
  label: string;
  config: CodeConfig;
}

export interface SwitchCase {
  value: string;
  label: string;
}

export interface SwitchConfig {
  expression: string;
  cases: SwitchCase[];
  defaultCase?: string;
}

export interface SwitchNodeData {
  nodeType: "switch";
  label: string;
  config: SwitchConfig;
}

export interface LoopConfig {
  arrayExpression: string;
  itemVariable?: string;
  maxIterations?: number;
}

export interface LoopNodeData {
  nodeType: "loop";
  label: string;
  config: LoopConfig;
}

// ── Transform node types ─────────────────────────────────────────

export interface AggregateOp {
  field: string;
  operation: "sum" | "count" | "avg" | "min" | "max";
  alias: string;
}

export type TransformOperation =
  | { type: "map"; expression: string }
  | { type: "filter"; expression: string }
  | { type: "sort"; key: string; direction: "asc" | "desc" }
  | { type: "pick"; keys: string[] }
  | { type: "omit"; keys: string[] }
  | { type: "rename"; mapping: Record<string, string> }
  | { type: "flatten"; depth?: number }
  | { type: "group_by"; key: string }
  | { type: "aggregate"; operations: AggregateOp[] }
  | { type: "template"; template: string }
  | { type: "json_parse" }
  | { type: "json_stringify"; pretty?: boolean }
  | { type: "unique"; key?: string }
  | { type: "take"; count: number }
  | { type: "skip"; count: number };

export interface TransformConfig {
  inputExpression: string;
  operations: TransformOperation[];
}

export interface TransformNodeData {
  nodeType: "transform";
  label: string;
  config: TransformConfig;
}

export interface TransformResult {
  success: boolean;
  output: unknown;
  error?: string;
  operationsApplied: number;
}

// ── Sub-Workflow types ──────────────────────────────────────────

export interface SubWorkflowConfig {
  workflowId: string;
  /** Pin to a specific version of the sub-workflow */
  version?: string;
  /** Sub-workflow variable name -> expression to resolve from parent context */
  inputMappings: Record<string, string>;
  /** Parent variable name -> expression to resolve from sub-workflow output */
  outputMappings: Record<string, string>;
  /** Maximum nesting depth (default: 10) */
  maxDepth?: number;
}

export interface SubWorkflowNodeData {
  nodeType: "sub_workflow";
  label: string;
  config: SubWorkflowConfig;
}

/**
 * Resolver that loads workflow definitions by ID (and optional version).
 * Provided by consuming apps to enable sub-workflow execution.
 */
export interface WorkflowResolver {
  resolve(workflowId: string, version?: string): Promise<WorkflowData | undefined>;
}

// ── Schedule trigger types ────────────────────────────────────────

export interface ScheduleIntervalConfig {
  value: number;
  unit: "seconds" | "minutes" | "hours" | "days";
}

export interface ScheduleCalendarConfig {
  frequency: "daily" | "weekly" | "monthly" | "yearly";
  time: string;        // "HH:mm" 24h format
  dayOfWeek?: number;  // 0-6, for weekly
  dayOfMonth?: number; // 1-31, for monthly
  month?: number;      // 1-12, for yearly
}

export interface ScheduleConfig {
  mode: "interval" | "cron" | "calendar";
  // Interval mode
  interval?: ScheduleIntervalConfig;
  // Cron mode
  cronExpression?: string;
  // Calendar mode (consumer-friendly)
  calendar?: ScheduleCalendarConfig;
  timezone?: string;       // IANA timezone (default "UTC")
  startDate?: string;      // ISO date, optional
  endDate?: string;        // ISO date, optional
  maxExecutions?: number;  // cap total runs
}

export interface ScheduleState {
  lastRunAt?: string;       // ISO
  nextRunAt?: string;       // ISO
  executionCount: number;
  isActive: boolean;
}

export interface ScheduleNodeData {
  nodeType: "schedule";
  label: string;
  config: ScheduleConfig;
}

// ── Database connector types ─────────────────────────────────────

export type DatabaseConnectorType = "postgresql" | "mysql" | "sqlite" | "mongodb" | "custom";

export type DatabaseOperation =
  | { type: "query"; sql: string; params?: Array<{ name: string; expression: string }> }
  | { type: "insert"; table: string; values: Record<string, string> }
  | { type: "update"; table: string; values: Record<string, string>; where: string }
  | { type: "delete"; table: string; where: string }
  | { type: "find"; collection: string; filter: string; projection?: string[] }
  | { type: "aggregate"; collection: string; pipeline: string };

export interface DatabaseConfig {
  connectorType: DatabaseConnectorType;
  credentialId?: string;
  operation: DatabaseOperation;
}

export interface DatabaseNodeData {
  nodeType: "database";
  label: string;
  config: DatabaseConfig;
}

export interface DatabaseResult {
  success: boolean;
  rows?: Record<string, unknown>[];
  rowCount?: number;
  affectedRows?: number;
  error?: string;
  durationMs: number;
}

/**
 * Database adapter interface — consuming apps implement this
 * to connect the engine to their choice of DB library (pg, mysql2, etc.).
 */
export interface DatabaseAdapter {
  execute(config: DatabaseConfig, resolvedParams: Record<string, unknown>): Promise<DatabaseResult>;
  testConnection?(config: DatabaseConfig): Promise<{ connected: boolean; error?: string }>;
}

// ── AI Node types ────────────────────────────────────────────────

export interface AINodeConfig {
  /** Provider identifier: "openai", "anthropic", "custom", etc. */
  provider: string;
  /** Model identifier, e.g. "gpt-4o", "claude-sonnet-4-20250514" */
  model: string;
  /** User prompt — supports {{expressions}} for template resolution */
  prompt: string;
  /** Optional system prompt */
  systemPrompt?: string;
  /** Sampling temperature (0-2) */
  temperature?: number;
  /** Maximum tokens in the response */
  maxTokens?: number;
  /** Response format: plain text or structured JSON */
  responseFormat?: "text" | "json";
  /** Tool definitions for function calling / tool use */
  tools?: AITool[];
  /** Maximum tool-use rounds to prevent infinite loops (default: 5) */
  maxToolRounds?: number;
  /** Whether to use streaming if the provider supports it */
  stream?: boolean;
  /** Credential reference for API key resolution */
  credentialId?: string;
}

export interface AITool {
  /** Tool/function name */
  name: string;
  /** Human-readable description of what the tool does */
  description: string;
  /** JSON Schema for the tool's parameters */
  parameters: Record<string, unknown>;
  /** Expression or action reference to execute when this tool is called */
  handler: string;
}

export interface AIToolCall {
  /** Unique identifier for this tool call */
  id: string;
  /** Name of the tool being called */
  name: string;
  /** Parsed arguments from the model */
  arguments: Record<string, unknown>;
}

export interface AINodeResult {
  /** Final text response from the model */
  response: string;
  /** Tool calls made during execution (if any) */
  toolCalls?: AIToolCall[];
  /** Results from tool executions (if any) */
  toolResults?: Record<string, unknown>[];
  /** Token usage statistics */
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
  /** Model that was used */
  model: string;
  /** Reason the model stopped generating */
  finishReason: string;
}

export interface AINodeData {
  nodeType: "ai";
  label: string;
  config: AINodeConfig;
}

// ── AI Suggestion types ─────────────────────────────────────────

export interface AISuggestion {
  id: string;
  type: "add_node" | "add_edge" | "modify_config" | "add_error_handling" | "optimize";
  title: string;
  description: string;
  /** Confidence score 0-1 */
  confidence: number;
  preview?: {
    nodes?: FlowNode[];
    edges?: FlowEdge[];
    configChanges?: Record<string, unknown>;
  };
  apply: () => void;
}

export type WorkflowNodeData =
  | TriggerNodeData
  | ActionNodeData
  | ConditionNodeData
  | DelayNodeData
  | TryCatchNodeData
  | CodeNodeData
  | SwitchNodeData
  | LoopNodeData
  | TransformNodeData
  | SubWorkflowNodeData
  | ScheduleNodeData
  | DatabaseNodeData
  | AINodeData;

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
  type: "text" | "textarea" | "number" | "select" | "secret";
  placeholder?: string;
  options?: { value: string; label: string }[]; // for select type
  defaultValue?: string | number;
  /** When set, this field can be populated from a stored credential */
  credentialRef?: {
    /** The credential definition ID this field can pull from */
    definitionId: string;
    /** The field key within the credential to use */
    fieldKey: string;
  };
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

// ── Credential Vault types ───────────────────────────────────────

/**
 * A stored credential — the vault never exposes raw values
 * outside of engine execution.
 */
export interface StoredCredential {
  id: string;
  name: string;
  /** The service this credential belongs to (e.g. "github", "slack") */
  service: string;
  /** ISO timestamp */
  createdAt: string;
  /** ISO timestamp */
  updatedAt: string;
}

/**
 * Credential store adapter — provided by consuming apps.
 * The engine calls `resolve` at execution time to swap
 * `{{credential:id}}` placeholders with real secret values.
 *
 * Implementations MUST keep raw values in memory only for
 * the duration of the resolve call.
 */
export interface CredentialStore {
  /** Resolve a credential ID to its secret value. Returns undefined if not found. */
  resolve(credentialId: string): Promise<string | undefined>;
  /** List available credentials (metadata only — no secret values). */
  list(service?: string): Promise<StoredCredential[]>;
}

/**
 * Masking utility type — the display value for a secret field.
 * Config stores only the credential reference, never the raw value.
 */
export type CredentialRef = `credential:${string}`;

// ── Execution Logger ────────────────────────────────────────────

/**
 * Structured execution logger for workflow observability.
 * All methods are optional — consumers only implement the callbacks they need.
 * Logger implementations must be safe; the engine wraps every call in try/catch
 * so a buggy logger can never crash a running workflow.
 */
export interface ExecutionLogger {
  onWorkflowStart?(runId: string, workflowId: string): void;
  onWorkflowComplete?(runId: string, status: string, durationMs: number): void;
  onNodeStart?(runId: string, nodeId: string, nodeType: string, input: Record<string, unknown>): void;
  onNodeComplete?(runId: string, nodeId: string, output: Record<string, unknown>, durationMs: number): void;
  onNodeError?(runId: string, nodeId: string, error: string, willRetry: boolean, attempt: number): void;
  onNodeSkipped?(runId: string, nodeId: string, reason: string): void;
  onRetry?(runId: string, nodeId: string, attempt: number, delayMs: number): void;
  onRateLimited?(runId: string, nodeId: string, actionType: string, strategy: string, waitedMs: number): void;
}

// ── Streaming types ─────────────────────────────────────────────

/**
 * A single chunk emitted during an AI streaming action.
 */
export interface StreamChunk {
  type: "text" | "tool_call" | "tool_result" | "error" | "done";
  content: string;
  metadata?: Record<string, unknown>;
}

/**
 * Extended action result that can include an async stream.
 * When `stream` is present, the engine iterates through it,
 * calls `onStream` for each chunk, and collects text into a combined output.
 */
export interface StreamingActionResult extends ActionResult {
  stream?: AsyncIterable<StreamChunk>;
}

/**
 * Callback invoked by the engine for each stream chunk.
 */
export type OnStreamCallback = (nodeId: string, chunk: StreamChunk) => void;

// ── Engine types ────────────────────────────────────────────────

export interface WorkflowEvent {
  type: string;
  payload: Record<string, unknown>;
}

export interface ActionContext {
  workflowId: string;
  runId: string;
  vars: Record<string, unknown>;
  /** Sub-workflow call stack for cycle detection. Managed by the engine. */
  _callStack?: string[];
  [key: string]: unknown; // consumers can add their own context
}

export interface ActionResult {
  success: boolean;
  output?: Record<string, unknown>;
  error?: string;
  /** If explicitly false, the engine will not retry this error. If true or undefined, normal retry logic applies. */
  retryable?: boolean;
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

export interface NodeTiming {
  nodeId: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
}

export interface RunResult {
  runId: string;
  status: "completed" | "failed" | "paused";
  nodeOutputs: Record<string, unknown>;
  nodeTimings: Record<string, NodeTiming>;
  error?: string;
}
// ── Template Marketplace ────────────────────────────────────────

/**
 * Metadata for a shareable workflow template.
 * Used by the template marketplace to describe and discover templates.
 */
export interface TemplateManifest {
  id: string;
  name: string;
  description: string;
  author: string;
  version: string;
  tags: string[];
  category: string;
  requiredConnectors: string[];
  createdAt: string;
  updatedAt: string;
  popularity?: number;
}

/**
 * A complete shareable template — manifest metadata plus the full
 * workflow definition (nodes + edges). This is the unit of exchange
 * for import/export operations.
 */
export interface ShareableTemplate extends TemplateManifest {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

/**
 * Result of template validation.
 */
export interface TemplateValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ── Connector Manifest ──────────────────────────────────────────

/**
 * Package-level metadata for a published connector.
 * Used by registries and marketplaces to describe a connector package.
 */
export interface ConnectorManifest {
  /** Unique package identifier (e.g. "supra-webhook", "@acme/salesforce") */
  id: string;
  /** Human-readable display name */
  name: string;
  /** Semver version string */
  version: string;
  /** Package author or organization */
  author: string;
  /** URL to the connector's homepage or documentation */
  homepage?: string;
  /** SPDX license identifier (e.g. "MIT", "Apache-2.0") */
  license?: string;
  /** Runtime dependencies required by this connector */
  dependencies?: Record<string, string>;
}

// ── Execution History ────────────────────────────────────────────

export interface ExecutionRecord {
  runId: string;
  workflowId: string;
  status: "running" | "completed" | "failed" | "paused";
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  triggerType?: string;
  nodeEvents: NodeExecutionEvent[];
  error?: string;
  tags?: string[];
}

export interface NodeExecutionEvent {
  nodeId: string;
  nodeType: string;
  status: "started" | "completed" | "failed" | "skipped" | "retried";
  timestamp: string;
  durationMs?: number;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
  attempt?: number;
}

export interface ExecutionHistoryQuery {
  workflowId?: string;
  status?: string;
  search?: string;
  triggerType?: string;
  tags?: string[];
  dateRange?: { start: string; end: string };
  limit?: number;
  offset?: number;
}

export interface ExecutionHistoryResult {
  records: ExecutionRecord[];
  total: number;
  stats: ExecutionStats;
}

export interface ExecutionStats {
  totalRuns: number;
  successRate: number;
  avgDurationMs: number;
  failureCount: number;
  runsByStatus: Record<string, number>;
}

export interface TimeSeriesBucket {
  bucket: string;
  total: number;
  completed: number;
  failed: number;
  avgDurationMs: number;
}

export interface SerializedHistory {
  version: 1;
  records: ExecutionRecord[];
  exportedAt: string;
}

// ── RBAC (Role-Based Access Control) ─────────────────────────────

export type Permission =
  | "workflow:create" | "workflow:read" | "workflow:update" | "workflow:delete" | "workflow:execute"
  | "workflow:toggle"
  | "credential:create" | "credential:read" | "credential:update" | "credential:delete"
  | "template:create" | "template:read" | "template:publish"
  | "history:read" | "history:export"
  | "admin:users" | "admin:roles" | "admin:settings";

export interface Role {
  id: string;
  name: string;
  description: string;
  permissions: Permission[];
  isBuiltIn: boolean;
}

export interface User {
  id: string;
  name: string;
  email: string;
  roleIds: string[];
  isActive: boolean;
  lastLoginAt?: string;
  createdAt: string;
}

export interface RBACConfig {
  enforced: boolean;
  defaultRoleId: string;
  superAdminIds: string[];
}

export interface SerializedRBAC {
  version: 1;
  config: RBACConfig;
  roles: Role[];
  users: User[];
}

// ── Workflow Dashboard ───────────────────────────────────────────

export interface WorkflowSummary {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  triggerType?: string;
  lastRunAt?: string;
  lastRunStatus?: string;
  nextRunAt?: string;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

// ── Partner / Embedded Applets ────────────────────────────────────

export interface PartnerApplet {
  id: string;
  partnerId: string;
  partnerName: string;
  partnerLogo?: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  /** Pre-built workflow template */
  template: {
    nodes: FlowNode[];
    edges: FlowEdge[];
  };
  /** Configuration the end-user must provide */
  requiredConfig: AppletConfigField[];
  /** Consumer-friendly summary of what the applet does */
  summary: string;
  /** Usage examples */
  examples?: string[];
  /** Popularity / quality signals */
  installs?: number;
  rating?: number;
  verified: boolean;
  publishedAt: string;
}

export interface AppletConfigField {
  key: string;
  label: string;
  type: "text" | "select" | "number" | "boolean" | "credential";
  placeholder?: string;
  options?: Array<{ label: string; value: string }>;
  required: boolean;
  defaultValue?: unknown;
  helpText?: string;
}

export interface AppletInstance {
  id: string;
  appletId: string;
  userId?: string;
  config: Record<string, unknown>;
  enabled: boolean;
  installedAt: string;
  lastRunAt?: string;
}

export interface PartnerRegistry {
  partners: Array<{
    id: string;
    name: string;
    logo?: string;
    website?: string;
    appletCount: number;
    verified: boolean;
  }>;
  applets: PartnerApplet[];
}

export interface AppletSearchQuery {
  text?: string;
  category?: string;
  partnerId?: string;
  tags?: string[];
  verified?: boolean;
  sortBy?: "popular" | "rating" | "newest" | "name";
  limit?: number;
  offset?: number;
}

export interface AppletSearchResult {
  applets: PartnerApplet[];
  total: number;
  categories: Array<{ name: string; count: number }>;
}

export interface SerializedAppletStore {
  version: 1;
  applets: PartnerApplet[];
  instances: AppletInstance[];
  exportedAt: string;
}

// v0.1.1
