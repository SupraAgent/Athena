/**
 * Generic workflow execution engine.
 * BFS traversal of node/edge graph with pluggable action execution and persistence.
 * No database or app-specific dependencies.
 */
import type {
  FlowNode,
  FlowEdge,
  WorkflowData,
  WorkflowEvent,
  ActionContext,
  ActionResult,
  ActionExecutor,
  PersistenceAdapter,
  RunResult,
  ActionNodeData,
  ConditionNodeData,
  DelayNodeData,
  CodeNodeData,
  SwitchNodeData,
  LoopNodeData,
  TransformNodeData,
  SubWorkflowNodeData,
  ScheduleNodeData,
  DatabaseNodeData,
  DatabaseAdapter,
  WorkflowResolver,
  CredentialStore,
  RetryConfig,
  NodeTiming,
  ExecutionLogger,
  StreamingActionResult,
  OnStreamCallback,
} from "./types";
import { applyTransformPipeline } from "./data-mapper";
import {
  resolveExpression as resolveExpr,
  resolveTemplate,
  resolveAllValues,
  type ExpressionContext,
} from "./expression-resolver";
import type { TokenBucketRateLimiter } from "./rate-limiter";
import { validateSubWorkflow } from "./sub-workflow-validator";

export interface EngineConfig {
  /** Executes action nodes — provided by consuming app */
  executeAction: ActionExecutor;
  /** Persistence adapter for run tracking */
  persistence: PersistenceAdapter;
  /** Template variable renderer. Default: simple {{var}} replacement */
  renderTemplate?: (template: string, vars: Record<string, string | number | undefined>) => string;
  /** Max retries for failed actions. Default: 2 */
  maxRetries?: number;
  /** Optional credential store for resolving secret references at execution time */
  credentialStore?: CredentialStore;
  /** Optional structured logger for execution observability */
  logger?: ExecutionLogger;
  /** Optional callback invoked for each chunk when an action returns a stream */
  onStream?: OnStreamCallback;
  /**
   * Optional injectable rate limiter instance.
   * Shared across workflow runs so real API rate limits are respected.
   * Before each action node, the engine calls rateLimiter.acquire(actionType).
   */
  rateLimiter?: TokenBucketRateLimiter;
  /**
   * Optional workflow resolver for sub-workflow execution.
   * When a sub_workflow node is encountered, the engine calls this to load the child workflow.
   */
  workflowResolver?: WorkflowResolver;
  /**
   * Optional database adapter for database node execution.
   * Consuming apps provide this to connect to their choice of DB library.
   */
  databaseAdapter?: DatabaseAdapter;
}

/**
 * Simple {{var}} template renderer.
 */
export function defaultRenderTemplate(
  template: string,
  vars: Record<string, string | number | undefined>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const val = vars[key];
    return val == null ? "" : String(val);
  });
}

/**
 * Build an ExpressionContext from the engine's runtime state.
 * This bridges the engine's internal representation to the expression resolver's interface.
 */
function buildExpressionContext(
  nodeOutputs: Record<string, unknown>,
  actionCtx: ActionContext,
  credentialValues?: Record<string, Record<string, string>>,
): ExpressionContext {
  // Convert nodeOutputs to the expected Record<string, Record<string, unknown>> shape.
  // Each node output may be a plain object or an ActionResult with an `output` field.
  const normalizedOutputs: Record<string, Record<string, unknown>> = {};
  for (const [nodeId, value] of Object.entries(nodeOutputs)) {
    if (nodeId.startsWith("_")) continue; // skip internal keys like _resume_targets
    if (value != null && typeof value === "object") {
      normalizedOutputs[nodeId] = value as Record<string, unknown>;
    } else if (value !== undefined) {
      normalizedOutputs[nodeId] = { value };
    }
  }

  // Build vars: merge actionCtx.vars, converting all values to unknown for the resolver
  const vars: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(actionCtx.vars)) {
    vars[key] = val;
  }

  return {
    nodeOutputs: normalizedOutputs,
    vars,
    credentials: credentialValues,
    // Environment variables are passed through actionCtx or omitted in non-Node environments
    env: (actionCtx as Record<string, unknown>).env as Record<string, string> | undefined,
  };
}

/** Keys whose values may contain resolved secrets and must be redacted before persistence. */
const PERSIST_SECRET_PATTERN = /token|key|secret|password|authorization/i;

/**
 * Deep-redact secret-like values from nodeOutputs before passing to persistence.
 * Returns a new object — never mutates the original.
 */
function redactForPersistence(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(redactForPersistence);

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (PERSIST_SECRET_PATTERN.test(key) && typeof value === "string") {
      result[key] = "[REDACTED]";
    } else if (typeof value === "object" && value !== null) {
      result[key] = redactForPersistence(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Safely invoke a logger callback. A buggy logger must never crash a workflow.
 */
function emitLog(logger: ExecutionLogger | undefined, fn: (l: ExecutionLogger) => void): void {
  if (!logger) return;
  try {
    fn(logger);
  } catch {
    // Swallow — logger errors must never propagate
  }
}

// ── Shared node execution result type ────────────────────────────

/**
 * Result of executing a single node. Tells the BFS loop what to do next.
 */
interface NodeExecutionResult {
  /** "completed" = enqueue nextNodes, "paused" = stop BFS and return paused, "failed" = skip downstream */
  status: "completed" | "paused" | "failed";
  /** The output to store in nodeOutputs[nodeId] */
  output: unknown;
  /** Timing for this node */
  timing: NodeTiming;
  /** Downstream nodes to enqueue (already filtered by handle logic) */
  nextNodes: Array<{ nodeId: string; viaHandle?: string }>;
  /** Error message if status is "failed" */
  error?: string;
  /**
   * For delay nodes: pause config that the BFS loop uses to persist pause state.
   * Contains the computed resumeAt and the raw next edge targets.
   */
  pauseConfig?: { resumeAt: string; nextNodeIds: string[] };
  /**
   * For try_catch nodes: if a delay inside the try branch caused a pause,
   * this contains the pause details. The BFS loop should return paused.
   */
  tryCatchPause?: { resumeAt: string; nextNodeIds: string[]; delayNodeId: string };
}

/**
 * Context passed to executeNode — bundles all the shared state the node handlers need.
 */
interface NodeExecContext {
  runId: string;
  actionCtx: ActionContext;
  config: EngineConfig;
  nodeOutputs: Record<string, unknown>;
  nodeTimings: Record<string, NodeTiming>;
  outEdges: Map<string, FlowEdge[]>;
  nodeMap: Map<string, FlowNode>;
  visited: Set<string>;
}

// ── Shared executeNode ───────────────────────────────────────────

/**
 * Execute a single node and return a result that tells the BFS loop what to do.
 * This is the shared core that both executeWorkflow and resumeWorkflow call.
 */
async function executeNode(
  node: FlowNode,
  nctx: NodeExecContext,
): Promise<NodeExecutionResult> {
  const { runId, actionCtx, config, nodeOutputs, nodeTimings, outEdges, nodeMap, visited } = nctx;
  const nodeId = node.id;
  const startedAt = new Date();
  const data = node.data;

  // ── Trigger: pass through ──
  if (data.nodeType === "trigger") {
    emitLog(config.logger, (l) => l.onNodeStart?.(runId, nodeId, "trigger", {}));
    const output = { type: "trigger", triggered: true };
    const timing = buildTiming(nodeId, startedAt);
    emitLog(config.logger, (l) =>
      l.onNodeComplete?.(runId, nodeId, output as Record<string, unknown>, timing.durationMs)
    );
    const nextEdges = outEdges.get(nodeId) ?? [];
    return {
      status: "completed",
      output,
      timing,
      nextNodes: nextEdges.map((e) => ({ nodeId: e.target })),
    };
  }

  // ── Schedule: pass through (similar to trigger) ──
  if (data.nodeType === "schedule") {
    const scheduleData = data as ScheduleNodeData;
    emitLog(config.logger, (l) => l.onNodeStart?.(runId, nodeId, "schedule", { config: scheduleData.config as unknown as Record<string, unknown> }));
    const output = { type: "schedule", mode: scheduleData.config.mode, triggered: true };
    const timing = buildTiming(nodeId, startedAt);
    emitLog(config.logger, (l) =>
      l.onNodeComplete?.(runId, nodeId, output as Record<string, unknown>, timing.durationMs)
    );
    const nextEdges = outEdges.get(nodeId) ?? [];
    return {
      status: "completed",
      output,
      timing,
      nextNodes: nextEdges.map((e) => ({ nodeId: e.target })),
    };
  }

  // ── Action: execute via plugin ──
  if (data.nodeType === "action") {
    const actionData = data as ActionNodeData;

    // Rate limiting: acquire token before executing the action
    if (config.rateLimiter) {
      let rateLimitResult;
      try {
        rateLimitResult = await config.rateLimiter.acquire(actionData.actionType);
      } catch (rateLimitErr) {
        // "fail" strategy throws — return a proper node failure instead of crashing the BFS
        const errorMsg = rateLimitErr instanceof Error ? rateLimitErr.message : String(rateLimitErr);
        const timing = buildTiming(nodeId, startedAt);
        emitLog(config.logger, (l) =>
          l.onRateLimited?.(runId, nodeId, actionData.actionType, "fail", 0)
        );
        emitLog(config.logger, (l) => l.onNodeError?.(runId, nodeId, errorMsg, false, 0));
        return { status: "failed", output: { success: false, error: errorMsg }, timing, nextNodes: [], error: errorMsg };
      }
      if (!rateLimitResult.allowed) {
        // Skip or wait-timeout strategy returned false — skip this action
        const skipOutput = { skipped: true, reason: "rate_limited" };
        const timing = buildTiming(nodeId, startedAt);
        emitLog(config.logger, (l) =>
          l.onRateLimited?.(runId, nodeId, actionData.actionType, "skip", rateLimitResult.waitedMs)
        );
        emitLog(config.logger, (l) => l.onNodeSkipped?.(runId, nodeId, "rate_limited"));
        const nextEdges = outEdges.get(nodeId) ?? [];
        return {
          status: "completed",
          output: skipOutput,
          timing,
          nextNodes: nextEdges.map((e) => ({ nodeId: e.target })),
        };
      }
      if (rateLimitResult.waitedMs > 0) {
        emitLog(config.logger, (l) =>
          l.onRateLimited?.(runId, nodeId, actionData.actionType, "wait", rateLimitResult.waitedMs)
        );
      }
    }

    emitLog(config.logger, (l) => l.onNodeStart?.(runId, nodeId, "action", actionData.config));
    const result = await executeActionWithRetry(
      actionData.actionType,
      actionData.config,
      actionCtx,
      config,
      actionData.retryConfig,
      nodeId,
      nodeOutputs
    );
    const timing = buildTiming(nodeId, startedAt);

    if (!result.success) {
      emitLog(config.logger, (l) => l.onNodeError?.(runId, nodeId, result.error ?? "Unknown error", false, 0));
      return { status: "failed", output: result, timing, nextNodes: [], error: result.error };
    }

    emitLog(config.logger, (l) =>
      l.onNodeComplete?.(runId, nodeId, result.output ?? {}, timing.durationMs)
    );
    const nextEdges = outEdges.get(nodeId) ?? [];
    return {
      status: "completed",
      output: result,
      timing,
      nextNodes: nextEdges.map((e) => ({ nodeId: e.target })),
    };
  }

  // ── Condition: evaluate and branch ──
  if (data.nodeType === "condition") {
    emitLog(config.logger, (l) => l.onNodeStart?.(runId, nodeId, "condition", (data as ConditionNodeData).config as unknown as Record<string, unknown>));
    const condResult = evaluateCondition(data as ConditionNodeData, actionCtx, nodeOutputs);
    const output = { condition: condResult };
    const timing = buildTiming(nodeId, startedAt);
    emitLog(config.logger, (l) =>
      l.onNodeComplete?.(runId, nodeId, { condition: condResult }, timing.durationMs)
    );

    const nextEdges = outEdges.get(nodeId) ?? [];
    const targetHandle = condResult ? "true" : "false";
    const skippedHandle = condResult ? "false" : "true";
    const nextNodes: Array<{ nodeId: string; viaHandle?: string }> = [];
    for (const e of nextEdges) {
      if (e.sourceHandle === targetHandle) {
        nextNodes.push({ nodeId: e.target, viaHandle: targetHandle });
      } else if (e.sourceHandle === skippedHandle) {
        emitLog(config.logger, (l) =>
          l.onNodeSkipped?.(runId, e.target, `Condition "${nodeId}" evaluated to ${condResult}`)
        );
      }
    }
    return { status: "completed", output, timing, nextNodes };
  }

  // ── Delay: pause the run ──
  if (data.nodeType === "delay") {
    const delayData = data as DelayNodeData;
    emitLog(config.logger, (l) => l.onNodeStart?.(runId, nodeId, "delay", delayData.config as unknown as Record<string, unknown>));
    const cfg = delayData.config;
    const delayMs = computeDelayMs(cfg.duration, cfg.unit);
    const resumeAt = new Date(Date.now() + delayMs).toISOString();
    const output = { delay: true, resumeAt, unit: cfg.unit, duration: cfg.duration };
    const timing = buildTiming(nodeId, startedAt);
    emitLog(config.logger, (l) =>
      l.onNodeComplete?.(runId, nodeId, output as unknown as Record<string, unknown>, timing.durationMs)
    );

    const nextEdges = outEdges.get(nodeId) ?? [];
    const nextNodeIds = nextEdges.map((e) => e.target);

    return {
      status: "paused",
      output,
      timing,
      nextNodes: [],
      pauseConfig: { resumeAt, nextNodeIds },
    };
  }

  // ── Try-Catch: execute try branch, route to catch on failure ──
  if (data.nodeType === "try_catch") {
    emitLog(config.logger, (l) => l.onNodeStart?.(runId, nodeId, "try_catch", {}));
    const allEdges = outEdges.get(nodeId) ?? [];

    const tryTargets = allEdges
      .filter((e) => e.sourceHandle === "success")
      .map((e) => e.target);
    const catchTargets = allEdges
      .filter((e) => e.sourceHandle === "error")
      .map((e) => e.target);

    let tryCatchError: string | undefined;
    const tryQueue = [...tryTargets];
    const tryVisited = new Set<string>();
    let tryFailed = false;

    try {
      while (tryQueue.length > 0) {
        const tryNodeId = tryQueue.shift()!;
        if (tryVisited.has(tryNodeId) || visited.has(tryNodeId)) continue;
        tryVisited.add(tryNodeId);
        visited.add(tryNodeId);

        const tryNode = nodeMap.get(tryNodeId);
        if (!tryNode) continue;

        await config.persistence.updateRun(runId, "running", redactForPersistence(nodeOutputs) as Record<string, unknown>, undefined, tryNodeId);

        // Execute the inner node using the shared function
        const innerResult = await executeNode(tryNode, nctx);
        nodeOutputs[tryNodeId] = innerResult.output;
        nodeTimings[tryNodeId] = innerResult.timing;

        if (innerResult.status === "paused") {
          // Delay inside try-catch: propagate pause to the outer BFS
          const timing = buildTiming(nodeId, startedAt);
          return {
            status: "paused",
            output: { type: "try_catch", trySucceeded: false, error: undefined },
            timing,
            nextNodes: [],
            tryCatchPause: {
              resumeAt: innerResult.pauseConfig!.resumeAt,
              nextNodeIds: innerResult.pauseConfig!.nextNodeIds,
              delayNodeId: tryNodeId,
            },
          };
        }

        if (innerResult.status === "failed") {
          tryCatchError = innerResult.error ?? `Action node ${tryNodeId} failed`;
          tryFailed = true;
          break;
        }

        // Enqueue downstream edges within try branch
        for (const next of innerResult.nextNodes) {
          tryQueue.push(next.nodeId);
        }
      }
    } catch (err) {
      tryFailed = true;
      tryCatchError = err instanceof Error ? err.message : String(err);
    }

    const output = {
      type: "try_catch",
      trySucceeded: !tryFailed,
      error: tryCatchError,
    };
    const timing = buildTiming(nodeId, startedAt);
    emitLog(config.logger, (l) =>
      l.onNodeComplete?.(runId, nodeId, output as unknown as Record<string, unknown>, timing.durationMs)
    );

    const nextNodes: Array<{ nodeId: string; viaHandle?: string }> = [];
    if (tryFailed) {
      actionCtx.vars._tryCatchError = tryCatchError ?? "Unknown error";
      for (const catchTarget of catchTargets) {
        nextNodes.push({ nodeId: catchTarget, viaHandle: "error" });
      }
    }

    return { status: "completed", output, timing, nextNodes };
  }

  // ── Code: execute user code in a sandbox ──
  if (data.nodeType === "code") {
    const codeData = data as CodeNodeData;
    emitLog(config.logger, (l) => l.onNodeStart?.(runId, nodeId, "code", { language: codeData.config.language }));
    const codeResult = await executeCodeNode(codeData, nodeOutputs, actionCtx);
    const timing = buildTiming(nodeId, startedAt);

    if (!codeResult.success) {
      emitLog(config.logger, (l) => l.onNodeError?.(runId, nodeId, codeResult.error ?? "Code execution failed", false, 0));
      return { status: "failed", output: codeResult, timing, nextNodes: [], error: codeResult.error };
    }

    emitLog(config.logger, (l) =>
      l.onNodeComplete?.(runId, nodeId, codeResult.output ?? {}, timing.durationMs)
    );
    const nextEdges = outEdges.get(nodeId) ?? [];
    return {
      status: "completed",
      output: codeResult,
      timing,
      nextNodes: nextEdges.map((e) => ({ nodeId: e.target })),
    };
  }

  // ── Switch: evaluate expression and route to matching case ──
  if (data.nodeType === "switch") {
    const switchData = data as SwitchNodeData;
    emitLog(config.logger, (l) => l.onNodeStart?.(runId, nodeId, "switch", { expression: switchData.config.expression }));
    const switchResult = executeSwitchNode(switchData, nodeOutputs, actionCtx, config);
    const timing = buildTiming(nodeId, startedAt);
    emitLog(config.logger, (l) =>
      l.onNodeComplete?.(runId, nodeId, switchResult as unknown as Record<string, unknown>, timing.durationMs)
    );

    const matchedHandle = switchResult.matchedCase;
    const nextNodes: Array<{ nodeId: string; viaHandle?: string }> = [];
    if (matchedHandle) {
      const nextEdges = outEdges.get(nodeId) ?? [];
      for (const e of nextEdges) {
        if (e.sourceHandle === matchedHandle) {
          nextNodes.push({ nodeId: e.target, viaHandle: matchedHandle });
        } else {
          emitLog(config.logger, (l) =>
            l.onNodeSkipped?.(runId, e.target, `Switch "${nodeId}" routed to "${matchedHandle}"`)
          );
        }
      }
    }
    return { status: "completed", output: switchResult, timing, nextNodes };
  }

  // ── Loop: iterate over array and execute body branch ──
  if (data.nodeType === "loop") {
    const loopData = data as LoopNodeData;
    emitLog(config.logger, (l) => l.onNodeStart?.(runId, nodeId, "loop", { arrayExpression: loopData.config.arrayExpression }));
    const loopResult = await executeLoopNode(
      loopData, nodeOutputs, actionCtx, config, outEdges, nodeMap, nodeId, visited, nodeTimings, runId, startedAt
    );
    const timing = buildTiming(nodeId, startedAt);

    if (!loopResult.success) {
      emitLog(config.logger, (l) => l.onNodeError?.(runId, nodeId, loopResult.error ?? "Loop execution failed", false, 0));
      return { status: "failed", output: loopResult, timing, nextNodes: [], error: loopResult.error };
    }

    emitLog(config.logger, (l) =>
      l.onNodeComplete?.(runId, nodeId, loopResult.output ?? {}, timing.durationMs)
    );
    const nextEdges = outEdges.get(nodeId) ?? [];
    const nextNodes: Array<{ nodeId: string; viaHandle?: string }> = [];
    for (const e of nextEdges) {
      if (e.sourceHandle === "complete") {
        nextNodes.push({ nodeId: e.target, viaHandle: "complete" });
      }
    }
    return { status: "completed", output: loopResult, timing, nextNodes };
  }

  // ── Transform: apply data transformation pipeline ──
  if (data.nodeType === "transform") {
    const transformData = data as TransformNodeData;
    emitLog(config.logger, (l) => l.onNodeStart?.(runId, nodeId, "transform", { inputExpression: transformData.config.inputExpression }));

    // Resolve input data from upstream using the expression resolver
    const exprCtx = buildExpressionContext(nodeOutputs, actionCtx);
    let resolvedInput: unknown;
    const inputExpr = transformData.config.inputExpression;
    if (inputExpr) {
      // Strip template delimiters if present
      const cleanExpr = inputExpr.replace(/^\{\{/, "").replace(/\}\}$/, "").trim();
      resolvedInput = resolveExpr(cleanExpr, exprCtx);
    } else {
      resolvedInput = undefined;
    }

    const transformResult = applyTransformPipeline(
      resolvedInput,
      transformData.config.operations,
      exprCtx,
    );

    const timing = buildTiming(nodeId, startedAt);

    if (!transformResult.success) {
      emitLog(config.logger, (l) => l.onNodeError?.(runId, nodeId, transformResult.error ?? "Transform failed", false, 0));
      return {
        status: "failed",
        output: { success: false, error: transformResult.error, operationsApplied: transformResult.operationsApplied },
        timing,
        nextNodes: [],
        error: transformResult.error,
      };
    }

    const output = {
      success: true,
      output: transformResult.output,
      operationsApplied: transformResult.operationsApplied,
    };
    emitLog(config.logger, (l) =>
      l.onNodeComplete?.(runId, nodeId, output as unknown as Record<string, unknown>, timing.durationMs)
    );
    const nextEdges = outEdges.get(nodeId) ?? [];
    return {
      status: "completed",
      output,
      timing,
      nextNodes: nextEdges.map((e) => ({ nodeId: e.target })),
    };
  }

  // ── Database: execute via adapter ──
  if (data.nodeType === "database") {
    const dbData = data as DatabaseNodeData;
    const dbConfig = dbData.config;
    emitLog(config.logger, (l) => l.onNodeStart?.(runId, nodeId, "database", {
      connectorType: dbConfig.connectorType,
      operationType: dbConfig.operation.type,
    }));

    if (!config.databaseAdapter) {
      const errorMsg = "Database adapter is not configured. Provide databaseAdapter in EngineConfig to execute database nodes.";
      const timing = buildTiming(nodeId, startedAt);
      emitLog(config.logger, (l) => l.onNodeError?.(runId, nodeId, errorMsg, false, 0));
      return {
        status: "failed",
        output: { success: false, error: errorMsg, durationMs: timing.durationMs },
        timing,
        nextNodes: [],
        error: errorMsg,
      };
    }

    // Resolve expression params for the query operation
    const exprCtx = buildExpressionContext(nodeOutputs, actionCtx);
    const resolvedParams: Record<string, unknown> = {};

    if (dbConfig.operation.type === "query" && dbConfig.operation.params) {
      for (const param of dbConfig.operation.params) {
        if (param.expression) {
          const cleanExpr = param.expression.replace(/^\{\{/, "").replace(/\}\}$/, "").trim();
          resolvedParams[param.name] = resolveExpr(cleanExpr, exprCtx);
        }
      }
    }

    // Resolve expression values for insert/update operations
    if (dbConfig.operation.type === "insert" || dbConfig.operation.type === "update") {
      for (const [key, expr] of Object.entries(dbConfig.operation.values)) {
        if (expr) {
          const cleanExpr = expr.replace(/^\{\{/, "").replace(/\}\}$/, "").trim();
          resolvedParams[key] = resolveExpr(cleanExpr, exprCtx);
        }
      }
    }

    // Resolve where expressions for update/delete
    if ((dbConfig.operation.type === "update" || dbConfig.operation.type === "delete") && dbConfig.operation.where) {
      const cleanExpr = dbConfig.operation.where.replace(/^\{\{/, "").replace(/\}\}$/, "").trim();
      resolvedParams["_where"] = resolveExpr(cleanExpr, exprCtx);
    }

    // Resolve filter expressions for MongoDB find
    if (dbConfig.operation.type === "find" && dbConfig.operation.filter) {
      try {
        const filterStr = resolveTemplate(dbConfig.operation.filter, actionCtx.vars as Record<string, string | number | undefined>);
        resolvedParams["_filter"] = JSON.parse(filterStr);
      } catch {
        resolvedParams["_filter"] = {};
      }
    }

    // Resolve pipeline expressions for MongoDB aggregate
    if (dbConfig.operation.type === "aggregate" && dbConfig.operation.pipeline) {
      try {
        const pipelineStr = resolveTemplate(dbConfig.operation.pipeline, actionCtx.vars as Record<string, string | number | undefined>);
        resolvedParams["_pipeline"] = JSON.parse(pipelineStr);
      } catch {
        resolvedParams["_pipeline"] = [];
      }
    }

    try {
      const dbResult = await config.databaseAdapter.execute(dbConfig, resolvedParams);
      const timing = buildTiming(nodeId, startedAt);

      if (!dbResult.success) {
        emitLog(config.logger, (l) => l.onNodeError?.(runId, nodeId, dbResult.error ?? "Database operation failed", false, 0));
        return {
          status: "failed",
          output: dbResult,
          timing,
          nextNodes: [],
          error: dbResult.error,
        };
      }

      emitLog(config.logger, (l) =>
        l.onNodeComplete?.(runId, nodeId, dbResult as unknown as Record<string, unknown>, timing.durationMs)
      );
      const nextEdges = outEdges.get(nodeId) ?? [];
      return {
        status: "completed",
        output: dbResult,
        timing,
        nextNodes: nextEdges.map((e) => ({ nodeId: e.target })),
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const timing = buildTiming(nodeId, startedAt);
      emitLog(config.logger, (l) => l.onNodeError?.(runId, nodeId, errorMsg, false, 0));
      return {
        status: "failed",
        output: { success: false, error: errorMsg, durationMs: timing.durationMs },
        timing,
        nextNodes: [],
        error: errorMsg,
      };
    }
  }

  // ── Sub-Workflow: resolve and execute child workflow ──
  if (data.nodeType === "sub_workflow") {
    const subData = data as SubWorkflowNodeData;
    const subConfig = subData.config;
    emitLog(config.logger, (l) => l.onNodeStart?.(runId, nodeId, "sub_workflow", { workflowId: subConfig.workflowId, version: subConfig.version }));

    // Ensure a workflow resolver is configured
    if (!config.workflowResolver) {
      const errorMsg = "Sub-workflow execution requires a workflowResolver in EngineConfig";
      const timing = buildTiming(nodeId, startedAt);
      emitLog(config.logger, (l) => l.onNodeError?.(runId, nodeId, errorMsg, false, 0));
      return { status: "failed", output: { success: false, error: errorMsg }, timing, nextNodes: [], error: errorMsg };
    }

    // Cycle detection via call stack
    const callStack = actionCtx._callStack ?? [];
    const maxDepth = subConfig.maxDepth ?? 10;

    if (callStack.includes(subConfig.workflowId)) {
      const errorMsg = `Circular sub-workflow detected: "${subConfig.workflowId}" is already in the call stack [${callStack.join(" -> ")}]`;
      const timing = buildTiming(nodeId, startedAt);
      emitLog(config.logger, (l) => l.onNodeError?.(runId, nodeId, errorMsg, false, 0));
      return { status: "failed", output: { success: false, error: errorMsg }, timing, nextNodes: [], error: errorMsg };
    }

    if (callStack.length >= maxDepth) {
      const errorMsg = `Sub-workflow max depth (${maxDepth}) exceeded. Call stack: [${callStack.join(" -> ")}]`;
      const timing = buildTiming(nodeId, startedAt);
      emitLog(config.logger, (l) => l.onNodeError?.(runId, nodeId, errorMsg, false, 0));
      return { status: "failed", output: { success: false, error: errorMsg }, timing, nextNodes: [], error: errorMsg };
    }

    // Resolve the child workflow
    let childWorkflow;
    try {
      childWorkflow = await config.workflowResolver.resolve(subConfig.workflowId, subConfig.version);
    } catch (resolveErr) {
      const errorMsg = `Failed to resolve sub-workflow "${subConfig.workflowId}": ${resolveErr instanceof Error ? resolveErr.message : String(resolveErr)}`;
      const timing = buildTiming(nodeId, startedAt);
      emitLog(config.logger, (l) => l.onNodeError?.(runId, nodeId, errorMsg, false, 0));
      return { status: "failed", output: { success: false, error: errorMsg }, timing, nextNodes: [], error: errorMsg };
    }

    if (!childWorkflow) {
      const errorMsg = `Sub-workflow "${subConfig.workflowId}"${subConfig.version ? ` (version ${subConfig.version})` : ""} not found`;
      const timing = buildTiming(nodeId, startedAt);
      emitLog(config.logger, (l) => l.onNodeError?.(runId, nodeId, errorMsg, false, 0));
      return { status: "failed", output: { success: false, error: errorMsg }, timing, nextNodes: [], error: errorMsg };
    }

    // Validate: no delay nodes in child workflow
    const validation = validateSubWorkflow(childWorkflow, actionCtx.workflowId);
    if (!validation.valid) {
      const errorMsg = `Sub-workflow validation failed: ${validation.errors.join("; ")}`;
      const timing = buildTiming(nodeId, startedAt);
      emitLog(config.logger, (l) => l.onNodeError?.(runId, nodeId, errorMsg, false, 0));
      return { status: "failed", output: { success: false, error: errorMsg }, timing, nextNodes: [], error: errorMsg };
    }

    // Build expression context for resolving input mappings
    const parentExprCtx = buildExpressionContext(nodeOutputs, actionCtx);

    // Resolve input mappings: parent expressions -> child context vars
    const childVars: Record<string, string | number | undefined> = {};
    for (const [childVarName, parentExpression] of Object.entries(subConfig.inputMappings)) {
      const cleanExpr = parentExpression.replace(/^\{\{/, "").replace(/\}\}$/, "").trim();
      const resolved = resolveExpr(cleanExpr, parentExprCtx);
      if (resolved === undefined || resolved === null) {
        childVars[childVarName] = undefined;
      } else if (typeof resolved === "string" || typeof resolved === "number") {
        childVars[childVarName] = resolved;
      } else {
        // For objects/arrays, JSON-stringify into the var
        try {
          childVars[childVarName] = JSON.stringify(resolved);
        } catch {
          childVars[childVarName] = String(resolved);
        }
      }
    }

    // Build child action context with updated call stack
    const childCallStack = [...callStack, actionCtx.workflowId];
    const childActionCtx: ActionContext = {
      workflowId: childWorkflow.id,
      runId,
      vars: childVars,
      _callStack: childCallStack,
    };

    // Build child graph structures
    const childNodes = childWorkflow.nodes ?? [];
    const childEdges = childWorkflow.edges ?? [];
    const childOutEdges = new Map<string, FlowEdge[]>();
    for (const edge of childEdges) {
      const existing = childOutEdges.get(edge.source) ?? [];
      existing.push(edge);
      childOutEdges.set(edge.source, existing);
    }
    const childNodeMap = new Map<string, FlowNode>();
    for (const n of childNodes) childNodeMap.set(n.id, n);

    // Find trigger node in child (entry point)
    const childTrigger = childNodes.find((n) => n.type === "trigger");
    if (!childTrigger) {
      const errorMsg = `Sub-workflow "${subConfig.workflowId}" has no trigger node`;
      const timing = buildTiming(nodeId, startedAt);
      emitLog(config.logger, (l) => l.onNodeError?.(runId, nodeId, errorMsg, false, 0));
      return { status: "failed", output: { success: false, error: errorMsg }, timing, nextNodes: [], error: errorMsg };
    }

    // Run the child workflow BFS inline (no new run record)
    const childNodeOutputs: Record<string, unknown> = {};
    const childNodeTimings: Record<string, NodeTiming> = {};
    const childVisited = new Set<string>();
    const childQueue = [childTrigger.id];

    const childNctx: NodeExecContext = {
      runId,
      actionCtx: childActionCtx,
      config,
      nodeOutputs: childNodeOutputs,
      nodeTimings: childNodeTimings,
      outEdges: childOutEdges,
      nodeMap: childNodeMap,
      visited: childVisited,
    };

    let childError: string | undefined;
    try {
      while (childQueue.length > 0) {
        const childNodeId = childQueue.shift()!;
        if (childVisited.has(childNodeId)) continue;
        childVisited.add(childNodeId);

        const childNode = childNodeMap.get(childNodeId);
        if (!childNode) continue;

        const childResult = await executeNode(childNode, childNctx);
        childNodeOutputs[childNodeId] = childResult.output;
        childNodeTimings[childNodeId] = childResult.timing;

        if (childResult.status === "paused") {
          // Delay nodes are validated away, but handle gracefully
          childError = "Sub-workflow attempted to pause (delay nodes are not allowed in sub-workflows)";
          break;
        }

        if (childResult.status === "failed") {
          childError = childResult.error ?? `Node ${childNodeId} failed in sub-workflow`;
          break;
        }

        for (const next of childResult.nextNodes) {
          childQueue.push(next.nodeId);
        }
      }
    } catch (err) {
      childError = err instanceof Error ? err.message : String(err);
    }

    if (childError) {
      const timing = buildTiming(nodeId, startedAt);
      emitLog(config.logger, (l) => l.onNodeError?.(runId, nodeId, childError!, false, 0));
      return { status: "failed", output: { success: false, error: childError, childOutputs: childNodeOutputs }, timing, nextNodes: [], error: childError };
    }

    // Resolve output mappings: child outputs -> parent context
    const childExprCtx = buildExpressionContext(childNodeOutputs, childActionCtx);
    const mappedOutput: Record<string, unknown> = {};
    for (const [parentVarName, childExpression] of Object.entries(subConfig.outputMappings)) {
      const cleanExpr = childExpression.replace(/^\{\{/, "").replace(/\}\}$/, "").trim();
      mappedOutput[parentVarName] = resolveExpr(cleanExpr, childExprCtx);
    }

    const output = { success: true, output: mappedOutput, childOutputs: childNodeOutputs };
    const timing = buildTiming(nodeId, startedAt);
    emitLog(config.logger, (l) =>
      l.onNodeComplete?.(runId, nodeId, output as unknown as Record<string, unknown>, timing.durationMs)
    );

    // Store mapped outputs in parent nodeOutputs so downstream can reference them
    nodeOutputs[nodeId] = output;

    const nextEdges = outEdges.get(nodeId) ?? [];
    return {
      status: "completed",
      output,
      timing,
      nextNodes: nextEdges.map((e) => ({ nodeId: e.target })),
    };
  }

  // ── Unknown type: pass through ──
  emitLog(config.logger, (l) => l.onNodeStart?.(runId, nodeId, (data as { nodeType: string }).nodeType, {}));
  const output = { type: (data as { nodeType: string }).nodeType, passthrough: true };
  const timing = buildTiming(nodeId, startedAt);
  emitLog(config.logger, (l) =>
    l.onNodeComplete?.(runId, nodeId, output as Record<string, unknown>, timing.durationMs)
  );
  const nextEdges = outEdges.get(nodeId) ?? [];
  return {
    status: "completed",
    output,
    timing,
    nextNodes: nextEdges.map((e) => ({ nodeId: e.target })),
  };
}

/**
 * Build a NodeTiming from a start time to now.
 */
function buildTiming(nodeId: string, startedAt: Date): NodeTiming {
  const completedAt = new Date();
  return {
    nodeId,
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    durationMs: completedAt.getTime() - startedAt.getTime(),
  };
}

// ── BFS runner shared by executeWorkflow and resumeWorkflow ──────

/**
 * Parameters for the shared BFS loop.
 */
interface BfsParams {
  runId: string;
  workflowId: string;
  queue: string[];
  visited: Set<string>;
  nodeOutputs: Record<string, unknown>;
  nodeTimings: Record<string, NodeTiming>;
  outEdges: Map<string, FlowEdge[]>;
  nodeMap: Map<string, FlowNode>;
  actionCtx: ActionContext;
  config: EngineConfig;
  event: WorkflowEvent;
  workflowStartTime: number;
}

/**
 * Shared BFS loop. Returns a RunResult. Both executeWorkflow and resumeWorkflow
 * set up the initial state and then call this.
 */
async function runBfsLoop(params: BfsParams): Promise<RunResult> {
  const {
    runId, workflowId, queue, visited, nodeOutputs, nodeTimings,
    outEdges, nodeMap, actionCtx, config, event, workflowStartTime,
  } = params;

  const nctx: NodeExecContext = {
    runId, actionCtx, config, nodeOutputs, nodeTimings, outEdges, nodeMap, visited,
  };

  try {
    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      if (visited.has(nodeId)) continue;
      visited.add(nodeId);

      const node = nodeMap.get(nodeId);
      if (!node) continue;

      await config.persistence.updateRun(runId, "running", redactForPersistence(nodeOutputs) as Record<string, unknown>, undefined, nodeId);

      const result = await executeNode(node, nctx);

      // Store output and timing
      nodeOutputs[nodeId] = result.output;
      nodeTimings[nodeId] = result.timing;

      // Handle pause (delay node)
      if (result.status === "paused" && result.pauseConfig) {
        const { resumeAt, nextNodeIds } = result.pauseConfig;
        await config.persistence.updateRun(
          runId,
          "paused",
          { ...(redactForPersistence(nodeOutputs) as Record<string, unknown>), _resume_targets: nextNodeIds, _resume_at: resumeAt },
          undefined,
          nodeId
        );
        if (config.persistence.scheduleResume) {
          await config.persistence.scheduleResume(runId, workflowId, resumeAt, event);
        }
        emitLog(config.logger, (l) => l.onWorkflowComplete?.(runId, "paused", Date.now() - workflowStartTime));
        return { runId, status: "paused", nodeOutputs, nodeTimings };
      }

      // Handle try_catch inner pause (delay within try branch)
      if (result.status === "paused" && result.tryCatchPause) {
        const { resumeAt, nextNodeIds, delayNodeId } = result.tryCatchPause;
        await config.persistence.updateRun(
          runId,
          "paused",
          { ...(redactForPersistence(nodeOutputs) as Record<string, unknown>), _resume_targets: nextNodeIds, _resume_at: resumeAt },
          undefined,
          delayNodeId
        );
        if (config.persistence.scheduleResume) {
          await config.persistence.scheduleResume(runId, workflowId, resumeAt, event);
        }
        emitLog(config.logger, (l) => l.onWorkflowComplete?.(runId, "paused", Date.now() - workflowStartTime));
        return { runId, status: "paused", nodeOutputs, nodeTimings };
      }

      // Handle failure — don't enqueue downstream
      if (result.status === "failed") {
        continue;
      }

      // Enqueue downstream nodes
      for (const next of result.nextNodes) {
        queue.push(next.nodeId);
      }
    }

    await config.persistence.updateRun(runId, "completed", redactForPersistence(nodeOutputs) as Record<string, unknown>);
    if (config.persistence.onWorkflowComplete) {
      await config.persistence.onWorkflowComplete(workflowId);
    }

    emitLog(config.logger, (l) => l.onWorkflowComplete?.(runId, "completed", Date.now() - workflowStartTime));
    return { runId, status: "completed", nodeOutputs, nodeTimings };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    await config.persistence.updateRun(runId, "failed", redactForPersistence(nodeOutputs) as Record<string, unknown>, errorMsg);
    emitLog(config.logger, (l) => l.onWorkflowComplete?.(runId, "failed", Date.now() - workflowStartTime));
    return { runId, status: "failed", nodeOutputs, nodeTimings, error: errorMsg };
  }
}

// ── Public API ───────────────────────────────────────────────────

/**
 * Execute a workflow from its data.
 */
export async function executeWorkflow(
  workflow: WorkflowData,
  event: WorkflowEvent,
  context: Partial<ActionContext>,
  config: EngineConfig
): Promise<RunResult> {
  const nodes = workflow.nodes ?? [];
  const edges = workflow.edges ?? [];

  if (nodes.length === 0) {
    emitLog(config.logger, (l) => l.onWorkflowComplete?.("", "failed", 0));
    return { runId: "", status: "failed", nodeOutputs: {}, nodeTimings: {}, error: "Workflow has no nodes" };
  }

  const runId = await config.persistence.createRun(workflow.id, event);
  const workflowStartTime = Date.now();
  emitLog(config.logger, (l) => l.onWorkflowStart?.(runId, workflow.id));
  const nodeOutputs: Record<string, unknown> = {};
  const nodeTimings: Record<string, NodeTiming> = {};

  // Build adjacency map
  const outEdges = new Map<string, FlowEdge[]>();
  for (const edge of edges) {
    const existing = outEdges.get(edge.source) ?? [];
    existing.push(edge);
    outEdges.set(edge.source, existing);
  }

  // Build node lookup map
  const nodeMap = new Map<string, FlowNode>();
  for (const n of nodes) nodeMap.set(n.id, n);

  const actionCtx: ActionContext = {
    workflowId: workflow.id,
    runId,
    vars: (context.vars ?? {}) as Record<string, string | number | undefined>,
    ...context,
  };

  // Find trigger node (entry point) — either a "trigger" or "schedule" node
  const triggerNode = nodes.find((n) => n.type === "trigger" || n.type === "schedule");
  if (!triggerNode) {
    await config.persistence.updateRun(runId, "failed", redactForPersistence(nodeOutputs) as Record<string, unknown>, "No trigger node found");
    return { runId, status: "failed", nodeOutputs, nodeTimings, error: "No trigger node found" };
  }

  return runBfsLoop({
    runId,
    workflowId: workflow.id,
    queue: [triggerNode.id],
    visited: new Set<string>(),
    nodeOutputs,
    nodeTimings,
    outEdges,
    nodeMap,
    actionCtx,
    config,
    event,
    workflowStartTime,
  });
}

/**
 * Resume a paused workflow from stored resume targets.
 */
export async function resumeWorkflow(
  workflow: WorkflowData,
  runId: string,
  resumeTargets: string[],
  existingOutputs: Record<string, unknown>,
  event: WorkflowEvent,
  context: Partial<ActionContext>,
  config: EngineConfig
): Promise<RunResult> {
  const nodes = workflow.nodes ?? [];
  const edges = workflow.edges ?? [];
  const nodeOutputs = { ...existingOutputs };
  const nodeTimings: Record<string, NodeTiming> = {};
  const resumeStartTime = Date.now();
  emitLog(config.logger, (l) => l.onWorkflowStart?.(runId, workflow.id));

  delete nodeOutputs._resume_targets;
  delete nodeOutputs._resume_at;

  const outEdges = new Map<string, FlowEdge[]>();
  for (const edge of edges) {
    const existing = outEdges.get(edge.source) ?? [];
    existing.push(edge);
    outEdges.set(edge.source, existing);
  }

  const nodeMap = new Map<string, FlowNode>();
  for (const n of nodes) nodeMap.set(n.id, n);

  const actionCtx: ActionContext = {
    workflowId: workflow.id,
    runId,
    vars: (context.vars ?? {}) as Record<string, string | number | undefined>,
    ...context,
  };

  await config.persistence.updateRun(runId, "running", redactForPersistence(nodeOutputs) as Record<string, unknown>);

  return runBfsLoop({
    runId,
    workflowId: workflow.id,
    queue: [...resumeTargets],
    visited: new Set<string>(Object.keys(nodeOutputs)),
    nodeOutputs,
    nodeTimings,
    outEdges,
    nodeMap,
    actionCtx,
    config,
    event,
    workflowStartTime: resumeStartTime,
  });
}

// ── Internal helpers ────────────────────────────────────────────

/**
 * Consume an async stream from a StreamingActionResult.
 * Calls onStream for each chunk, collects text chunks into a combined output,
 * and returns the final ActionResult with the combined text in output.
 * Handles errors mid-stream gracefully (partial output + error status).
 */
async function consumeStream(
  result: StreamingActionResult,
  nodeId: string,
  runId: string,
  engineConfig: EngineConfig
): Promise<ActionResult> {
  if (!result.stream) return result;

  const textParts: string[] = [];
  const onStream = engineConfig.onStream;
  const streamStartTime = Date.now();

  emitLog(engineConfig.logger, (l) =>
    l.onNodeStart?.(runId, nodeId, "stream", { streaming: true })
  );

  try {
    for await (const chunk of result.stream) {
      if (onStream) {
        try {
          onStream(nodeId, chunk);
        } catch {
          // Consumer callback errors must never crash the stream
        }
      }

      if (chunk.type === "text") {
        textParts.push(chunk.content);
      } else if (chunk.type === "error") {
        // Error chunk mid-stream: return partial output with error
        const partialText = textParts.join("");
        emitLog(engineConfig.logger, (l) =>
          l.onNodeError?.(runId, nodeId, chunk.content, false, 0)
        );
        return {
          success: false,
          error: chunk.content,
          output: {
            ...result.output,
            streamedText: partialText,
            streamCompleted: false,
          },
        };
      }
      // tool_call, tool_result, done are passed through to onStream but
      // only text chunks contribute to the combined output
    }
  } catch (err) {
    // Stream iteration threw — return partial output with error
    const partialText = textParts.join("");
    const errorMsg = err instanceof Error ? err.message : String(err);
    emitLog(engineConfig.logger, (l) =>
      l.onNodeError?.(runId, nodeId, `Stream error: ${errorMsg}`, false, 0)
    );
    return {
      success: false,
      error: `Stream error: ${errorMsg}`,
      output: {
        ...result.output,
        streamedText: partialText,
        streamCompleted: false,
      },
    };
  }

  const combinedText = textParts.join("");
  emitLog(engineConfig.logger, (l) =>
    l.onNodeComplete?.(runId, nodeId, { streamedText: combinedText, streamCompleted: true }, Date.now() - streamStartTime)
  );
  return {
    success: result.success,
    output: {
      ...result.output,
      streamedText: combinedText,
      streamCompleted: true,
    },
  };
}

/**
 * Convert a duration + unit into milliseconds.
 */
function computeDelayMs(duration: number, unit: "minutes" | "hours" | "days"): number {
  switch (unit) {
    case "hours": return duration * 60 * 60 * 1000;
    case "days": return duration * 24 * 60 * 60 * 1000;
    case "minutes":
    default: return duration * 60 * 1000;
  }
}

const CREDENTIAL_REF_PATTERN = /^credential:(.+)$/;

/**
 * Resolve credential references in action config.
 * Values matching `credential:<id>` are replaced with the real secret
 * from the credential store. Recursively traverses nested objects and arrays.
 * The resolved config is a deep copy — the original is never mutated.
 */
async function resolveCredentials(
  config: Record<string, unknown>,
  store: CredentialStore,
  depth = 0
): Promise<Record<string, unknown>> {
  if (depth > 10) return config; // prevent infinite recursion

  const resolved: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(config)) {
    if (typeof value === "string") {
      const match = CREDENTIAL_REF_PATTERN.exec(value);
      if (match) {
        const credentialId = match[1];
        const secret = await store.resolve(credentialId);
        if (secret === undefined) {
          throw new Error(`Credential "${credentialId}" not found for config key "${key}"`);
        }
        resolved[key] = secret;
      } else {
        resolved[key] = value;
      }
    } else if (Array.isArray(value)) {
      const resolvedArr: unknown[] = [];
      for (const item of value) {
        if (typeof item === "object" && item !== null && !Array.isArray(item)) {
          resolvedArr.push(await resolveCredentials(item as Record<string, unknown>, store, depth + 1));
        } else if (typeof item === "string") {
          const match = CREDENTIAL_REF_PATTERN.exec(item);
          if (match) {
            const secret = await store.resolve(match[1]);
            resolvedArr.push(secret ?? item);
          } else {
            resolvedArr.push(item);
          }
        } else {
          resolvedArr.push(item);
        }
      }
      resolved[key] = resolvedArr;
    } else if (typeof value === "object" && value !== null) {
      resolved[key] = await resolveCredentials(value as Record<string, unknown>, store, depth + 1);
    } else {
      resolved[key] = value;
    }
  }

  return resolved;
}

/**
 * Calculate retry delay based on backoff strategy.
 * Exponential: min(baseDelay * 2^attempt + jitter, maxDelay)
 * Linear: min(baseDelay * (attempt + 1) + jitter, maxDelay)
 */
function calculateRetryDelay(
  attempt: number,
  retryConfig: RetryConfig
): number {
  const baseDelay = retryConfig.baseDelayMs ?? 1000;
  const maxDelay = retryConfig.maxDelayMs ?? 30000;
  const backoffType = retryConfig.backoffType ?? "exponential";

  let delay: number;
  if (backoffType === "exponential") {
    delay = baseDelay * Math.pow(2, attempt);
  } else {
    delay = baseDelay * (attempt + 1);
  }

  // Cap first, then add jitter so we don't lose jitter near maxDelay
  // (prevents thundering herd when many retries hit the cap simultaneously)
  const capped = Math.min(delay, maxDelay);
  const jitter = Math.random() * Math.min(500, capped * 0.1);
  return capped + jitter;
}

/**
 * Merge per-node RetryConfig with engine defaults.
 * Per-node fields take precedence; missing fields fall back to engine/global defaults.
 */
function resolveRetryConfig(
  engineMaxRetries: number,
  nodeConfig?: RetryConfig
): Required<RetryConfig> {
  return {
    maxRetries: nodeConfig?.maxRetries ?? engineMaxRetries,
    backoffType: nodeConfig?.backoffType ?? "exponential",
    baseDelayMs: nodeConfig?.baseDelayMs ?? 1000,
    maxDelayMs: nodeConfig?.maxDelayMs ?? 30000,
  };
}

/**
 * Record timing for a node execution.
 */
function recordTiming(
  nodeTimings: Record<string, NodeTiming>,
  nodeId: string,
  startedAt: Date
): void {
  const completedAt = new Date();
  nodeTimings[nodeId] = {
    nodeId,
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    durationMs: completedAt.getTime() - startedAt.getTime(),
  };
}

async function executeActionWithRetry(
  actionType: string,
  config: Record<string, unknown>,
  ctx: ActionContext,
  engineConfig: EngineConfig,
  nodeRetryConfig?: RetryConfig,
  nodeId?: string,
  nodeOutputs?: Record<string, unknown>
): Promise<ActionResult> {
  const retryConfig = resolveRetryConfig(
    engineConfig.maxRetries ?? 2,
    nodeRetryConfig
  );
  const maxRetries = retryConfig.maxRetries;
  let lastResult: ActionResult = { success: false, error: "Unknown action" };

  // Resolve credential references before execution
  let resolvedConfig = config;
  if (engineConfig.credentialStore) {
    try {
      resolvedConfig = await resolveCredentials(config, engineConfig.credentialStore);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return { success: false, error: errorMsg };
    }
  }

  // Resolve template expressions in config values (e.g. {{nodeId.output.field}}, {{vars.name}})
  if (nodeOutputs) {
    const exprCtx = buildExpressionContext(nodeOutputs, ctx);
    resolvedConfig = resolveAllValues(resolvedConfig, exprCtx);
  }

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const rawResult = await engineConfig.executeAction(actionType, resolvedConfig, ctx);

    // If the result includes a stream, consume it before proceeding
    const streamingResult = rawResult as StreamingActionResult;
    if (streamingResult.stream) {
      lastResult = await consumeStream(streamingResult, nodeId ?? "unknown", ctx.runId, engineConfig);
    } else {
      lastResult = rawResult;
    }

    if (lastResult.success) return lastResult;

    // Don't retry non-transient errors.
    // Check the ActionResult for an explicit retryable flag first;
    // fall back to pattern matching only if the flag is not set.
    if (lastResult.retryable === false) {
      break;
    }
    if (lastResult.retryable === undefined) {
      const errLower = (lastResult.error ?? "").toLowerCase();
      if (
        errLower.startsWith("invalid ") ||
        errLower.startsWith("unknown ") ||
        errLower.startsWith("missing ") ||
        errLower.includes("unauthorized") ||
        errLower.includes("forbidden") ||
        errLower.includes("not found")
      ) {
        break;
      }
    }

    const willRetry = attempt < maxRetries;
    const errorMsg = lastResult.error ?? "Unknown error";
    if (nodeId) {
      emitLog(engineConfig.logger, (l) =>
        l.onNodeError?.(ctx.runId, nodeId, errorMsg, willRetry, attempt + 1)
      );
    }

    if (willRetry) {
      const delayMs = calculateRetryDelay(attempt, retryConfig);
      if (nodeId) {
        emitLog(engineConfig.logger, (l) =>
          l.onRetry?.(ctx.runId, nodeId, attempt + 1, delayMs)
        );
      }
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  return lastResult;
}

/**
 * Evaluate a condition node against the current context vars.
 */
export function evaluateCondition(
  data: ConditionNodeData,
  ctx: ActionContext,
  nodeOutputs?: Record<string, unknown>
): boolean {
  const config = data.config;

  if (config.conditions && config.conditions.length > 0) {
    const results = config.conditions.map((c) =>
      evalSingleCondition(c.field, c.operator, c.value, ctx, nodeOutputs)
    );
    return config.logic === "or" ? results.some(Boolean) : results.every(Boolean);
  }

  return evalSingleCondition(config.field, config.operator, config.value, ctx, nodeOutputs);
}

function evalSingleCondition(
  field: string,
  operator: string,
  value: string,
  ctx: ActionContext,
  nodeOutputs?: Record<string, unknown>
): boolean {
  // Use expression resolver to resolve the field reference, supporting
  // {{nodeId.field}}, {{vars.name}}, and backward-compatible plain var names
  let actual: string;
  if (nodeOutputs) {
    const exprCtx = buildExpressionContext(nodeOutputs, ctx);
    const resolved = resolveExpr(field, exprCtx);
    actual = resolved !== undefined ? String(resolved) : "";
  } else {
    actual = String(ctx.vars[field] ?? "");
  }
  const expected = value;

  switch (operator) {
    case "equals": return actual === expected;
    case "not_equals": return actual !== expected;
    case "contains": return actual.toLowerCase().includes(expected.toLowerCase());
    case "not_contains": return !actual.toLowerCase().includes(expected.toLowerCase());
    case "starts_with": return actual.toLowerCase().startsWith(expected.toLowerCase());
    case "gt":
    case "lt":
    case "gte":
    case "lte": {
      // Use numeric comparison when both sides are valid numbers,
      // otherwise fall back to lexicographic comparison
      const numActual = Number(actual);
      const numExpected = Number(expected);
      if (!Number.isNaN(numActual) && !Number.isNaN(numExpected)) {
        if (operator === "gt") return numActual > numExpected;
        if (operator === "lt") return numActual < numExpected;
        if (operator === "gte") return numActual >= numExpected;
        return numActual <= numExpected; // lte
      }
      // Non-numeric: lexicographic
      if (operator === "gt") return actual > expected;
      if (operator === "lt") return actual < expected;
      if (operator === "gte") return actual >= expected;
      return actual <= expected; // lte
    }
    case "is_empty": return actual === "" || actual === "undefined";
    case "is_not_empty": return actual !== "" && actual !== "undefined";
    default: return false;
  }
}

// ── Code Node execution ─────────────────────────────────────────

/**
 * Build a map of upstream node outputs keyed by node ID.
 * Used as the `input` parameter for code/switch/loop nodes.
 */
function buildUpstreamInput(nodeOutputs: Record<string, unknown>): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(nodeOutputs)) {
    if (key.startsWith("_")) continue; // skip internal keys
    input[key] = value;
  }
  return input;
}

/**
 * Execute a code node's user-provided code in a sandboxed Function constructor.
 * The code receives `input` (upstream outputs) and `context` (workflow vars).
 * Returns an ActionResult with the code's return value in output.result.
 */
async function executeCodeNode(
  data: CodeNodeData,
  nodeOutputs: Record<string, unknown>,
  ctx: ActionContext
): Promise<ActionResult> {
  const { code, timeout = 5000 } = data.config;

  if (!code || code.trim().length === 0) {
    return { success: false, error: "Code node has no code to execute" };
  }

  const input = buildUpstreamInput(nodeOutputs);
  const context: Record<string, unknown> = { ...ctx.vars };

  try {
    // Create a sandboxed function that blocks access to dangerous globals.
    // We shadow globals as local variables AND use .call(null, ...) to prevent
    // `this` from leaking the global object. We also block common escape hatches
    // like eval, Function constructor, import(), etc.
    //
    // NOTE: This is a best-effort sandbox using the Function constructor.
    // It is NOT equivalent to a true isolate (e.g., vm2, isolated-vm, or
    // a Web Worker). Determined attackers may find bypass vectors. For
    // production use with untrusted code, consider a process-level sandbox.

    // Reject code that attempts dynamic import (which cannot be blocked via shadowing)
    if (/\bimport\s*\(/.test(code)) {
      return { success: false, error: "Code execution error: dynamic import() is not allowed" };
    }

    // Reject code that accesses constructor chains (primary sandbox escape vector)
    if (/\bconstructor\b/.test(code)) {
      return { success: false, error: "Code execution error: 'constructor' access is not allowed" };
    }

    // Reject code that accesses prototype chains
    if (/__proto__|\.prototype\b/.test(code)) {
      return { success: false, error: "Code execution error: prototype access is not allowed" };
    }

    // Reject code that accesses arguments.callee (escape via arguments.callee.constructor)
    if (/\barguments\s*\.\s*callee\b/.test(code)) {
      return { success: false, error: "Code execution error: arguments.callee is not allowed" };
    }

    // Freeze input and context to prevent prototype chain traversal on passed objects
    const frozenInput = input !== null && typeof input === "object" ? Object.freeze(JSON.parse(JSON.stringify(input))) : input;
    const frozenContext = context !== null && typeof context === "object" ? Object.freeze(JSON.parse(JSON.stringify(context))) : context;

    const sandboxedFn = new Function(
      "input",
      "context",
      `"use strict";
      // Block access to dangerous globals and escape hatches
      const process = undefined;
      const require = undefined;
      const fetch = undefined;
      const globalThis = undefined;
      const global = undefined;
      const window = undefined;
      const self = undefined;
      const XMLHttpRequest = undefined;
      const importScripts = undefined;
      const eval = undefined;
      const Function = undefined;
      const constructor = undefined;
      const Proxy = undefined;
      const Reflect = undefined;
      const Symbol = undefined;
      return (async () => { ${code} })();`
    );

    // Call with Object.create(null) as `this` — has no prototype chain at all,
    // preventing escape via this.constructor.constructor("return process")()
    const resultPromise = sandboxedFn.call(Object.create(null), frozenInput, frozenContext);

    // Enforce timeout using Promise.race
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`Code execution timed out after ${timeout}ms`)), timeout);
    });

    const result = await Promise.race([resultPromise, timeoutPromise]);

    return {
      success: true,
      output: { result: result === undefined ? null : result },
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { success: false, error: `Code execution error: ${errorMsg}` };
  }
}

// ── Switch Node execution ───────────────────────────────────────

/**
 * Resolve a template expression against upstream outputs and context vars.
 * Delegates to the expression-resolver module for full support of
 * {{nodeId.output.field}}, {{vars.name}}, {{env.KEY}}, {{credential:id.field}},
 * array indexing, deep nesting, and backward-compatible {{varName}}.
 */
function resolveExpressionLocal(
  expression: string,
  nodeOutputs: Record<string, unknown>,
  ctx: ActionContext,
  _config: EngineConfig
): string {
  const exprCtx = buildExpressionContext(nodeOutputs, ctx);
  return resolveTemplate(expression, exprCtx);
}

/**
 * Execute a switch node: evaluate expression and find the matching case.
 * Returns the matched case handle name (case value) or default.
 */
function executeSwitchNode(
  data: SwitchNodeData,
  nodeOutputs: Record<string, unknown>,
  ctx: ActionContext,
  config: EngineConfig
): { type: "switch"; expressionValue: string; matchedCase: string | null } {
  const { expression, cases, defaultCase } = data.config;

  if (!expression) {
    return { type: "switch", expressionValue: "", matchedCase: defaultCase ?? null };
  }

  const resolvedValue = resolveExpressionLocal(expression, nodeOutputs, ctx, config);

  // Find matching case (trim both sides for resilience against whitespace)
  const trimmedResolved = resolvedValue.trim();
  for (const c of cases) {
    if (trimmedResolved === c.value.trim()) {
      return { type: "switch", expressionValue: resolvedValue, matchedCase: `case_${c.value}` };
    }
  }

  // No match found — use default if available
  if (defaultCase) {
    return { type: "switch", expressionValue: resolvedValue, matchedCase: "default" };
  }

  return { type: "switch", expressionValue: resolvedValue, matchedCase: null };
}

// ── Loop Node execution ─────────────────────────────────────────

/**
 * Resolve an array expression from upstream outputs or context vars.
 * Delegates to the expression-resolver for path resolution, with
 * fallback JSON parsing for string values.
 * Returns the resolved array, or an error string if resolution fails.
 */
function resolveArray(
  arrayExpression: string,
  nodeOutputs: Record<string, unknown>,
  ctx: ActionContext
): unknown[] | string {
  const exprCtx = buildExpressionContext(nodeOutputs, ctx);

  // Strip optional {{ }} wrapper so we get a raw expression path
  const rawExpr = arrayExpression.trim().replace(/^\{\{/, "").replace(/\}\}$/, "").trim();

  // Use the expression resolver to resolve the path
  const resolved = resolveExpr(rawExpr, exprCtx);

  // If resolved to a string, try JSON-parsing it as an array
  if (typeof resolved === "string") {
    try {
      const parsed = JSON.parse(resolved);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // Not JSON
    }
    return `Array expression "${arrayExpression}" resolved to non-array string value`;
  }

  if (resolved === undefined || resolved === null) {
    return `Array expression "${arrayExpression}" resolved to undefined`;
  }

  if (!Array.isArray(resolved)) {
    return `Array expression "${arrayExpression}" resolved to non-array value: ${typeof resolved}`;
  }

  return resolved;
}

/**
 * Execute a loop node: iterate over an array and execute body branch for each item.
 * Collects iteration results into an array output.
 */
async function executeLoopNode(
  data: LoopNodeData,
  nodeOutputs: Record<string, unknown>,
  ctx: ActionContext,
  config: EngineConfig,
  outEdges: Map<string, FlowEdge[]>,
  nodeMap: Map<string, FlowNode>,
  loopNodeId: string,
  visited: Set<string>,
  nodeTimings: Record<string, NodeTiming>,
  runId: string,
  _startedAt: Date
): Promise<ActionResult> {
  const { arrayExpression, itemVariable = "item", maxIterations = 100 } = data.config;

  if (!arrayExpression || arrayExpression.trim().length === 0) {
    return { success: false, error: "Loop node has no array expression" };
  }

  const arrayResult = resolveArray(arrayExpression, nodeOutputs, ctx);
  if (typeof arrayResult === "string") {
    return { success: false, error: arrayResult };
  }

  const array = arrayResult;

  // Find "body" handle edges
  const allEdges = outEdges.get(loopNodeId) ?? [];
  const bodyTargets = allEdges
    .filter((e) => e.sourceHandle === "body")
    .map((e) => e.target);

  if (bodyTargets.length === 0) {
    // No body branch connected — just return the array as results
    return {
      success: true,
      output: { results: array, iterations: array.length },
    };
  }

  const iterationResults: unknown[] = [];
  const effectiveMax = Math.min(array.length, maxIterations);

  for (let i = 0; i < effectiveMax; i++) {
    const currentItem = array[i];
    // Set iteration variable in context
    ctx.vars[itemVariable] = typeof currentItem === "object"
      ? JSON.stringify(currentItem)
      : String(currentItem ?? "");
    ctx.vars._loopIndex = i;
    ctx.vars._loopLength = array.length;

    emitLog(config.logger, (l) =>
      l.onNodeStart?.(runId, `${loopNodeId}_iter_${i}`, "loop_iteration", { index: i, item: currentItem as Record<string, unknown> })
    );

    // Execute body branch nodes for this iteration via shared executeNode (BFS)
    // This ensures ALL node types (action, code, condition, switch, transform,
    // sub_workflow, try_catch) work inside loops — no manual duplication.
    const bodyQueue = [...bodyTargets];
    const bodyVisited = new Set<string>();
    let iterationOutput: unknown = null;
    let iterationFailed = false;
    let iterationError: string | undefined;

    const bodyNctx: NodeExecContext = {
      runId,
      actionCtx: ctx,
      config,
      nodeOutputs,
      nodeTimings,
      outEdges,
      nodeMap,
      visited: bodyVisited,
    };

    while (bodyQueue.length > 0) {
      const bodyNodeId = bodyQueue.shift()!;
      if (bodyVisited.has(bodyNodeId)) continue;
      bodyVisited.add(bodyNodeId);

      const bodyNode = nodeMap.get(bodyNodeId);
      if (!bodyNode) continue;

      // Delay nodes are not allowed inside loops (would pause the entire workflow)
      if (bodyNode.data.nodeType === "delay") {
        iterationFailed = true;
        iterationError = `Delay nodes are not supported inside loop bodies (node ${bodyNodeId})`;
        break;
      }

      const result = await executeNode(bodyNode, bodyNctx);

      // Store output
      nodeOutputs[bodyNodeId] = result.output;
      nodeTimings[bodyNodeId] = result.timing;

      if (result.status === "failed") {
        iterationFailed = true;
        iterationError = result.error ?? `Node ${bodyNodeId} failed in loop iteration ${i}`;
        break;
      }

      if (result.status === "paused") {
        iterationFailed = true;
        iterationError = `Node ${bodyNodeId} caused a pause inside loop iteration ${i}, which is not supported`;
        break;
      }

      iterationOutput = result.output;

      // Enqueue downstream body edges (but NOT back to the loop node)
      for (const next of result.nextNodes) {
        if (next.nodeId !== loopNodeId) {
          bodyQueue.push(next.nodeId);
        }
      }
    }

    if (iterationFailed) {
      return {
        success: false,
        error: iterationError ?? `Loop iteration ${i} failed`,
        output: { results: iterationResults, failedAtIndex: i },
      };
    }

    iterationResults.push(iterationOutput);

    emitLog(config.logger, (l) =>
      l.onNodeComplete?.(runId, `${loopNodeId}_iter_${i}`, { index: i, output: iterationOutput as Record<string, unknown> }, 0)
    );
  }

  // Clean up loop context vars
  delete ctx.vars[itemVariable];
  delete ctx.vars._loopIndex;
  delete ctx.vars._loopLength;

  return {
    success: true,
    output: {
      results: iterationResults,
      iterations: effectiveMax,
      totalItems: array.length,
      maxIterationsReached: array.length > maxIterations,
    },
  };
}
