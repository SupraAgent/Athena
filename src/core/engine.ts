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
} from "./types";

export interface EngineConfig {
  /** Executes action nodes — provided by consuming app */
  executeAction: ActionExecutor;
  /** Persistence adapter for run tracking */
  persistence: PersistenceAdapter;
  /** Template variable renderer. Default: simple {{var}} replacement */
  renderTemplate?: (template: string, vars: Record<string, string | number | undefined>) => string;
  /** Max retries for failed actions. Default: 2 */
  maxRetries?: number;
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
    return { runId: "", status: "failed", nodeOutputs: {}, error: "Workflow has no nodes" };
  }

  const runId = await config.persistence.createRun(workflow.id, event);
  const nodeOutputs: Record<string, unknown> = {};

  // Build adjacency map
  const outEdges = new Map<string, FlowEdge[]>();
  for (const edge of edges) {
    const existing = outEdges.get(edge.source) ?? [];
    existing.push(edge);
    outEdges.set(edge.source, existing);
  }

  const actionCtx: ActionContext = {
    workflowId: workflow.id,
    runId,
    vars: (context.vars ?? {}) as Record<string, string | number | undefined>,
    ...context,
  };

  // Find trigger node (entry point)
  const triggerNode = nodes.find((n) => n.type === "trigger");
  if (!triggerNode) {
    await config.persistence.updateRun(runId, "failed", nodeOutputs, "No trigger node found");
    return { runId, status: "failed", nodeOutputs, error: "No trigger node found" };
  }

  const queue: string[] = [triggerNode.id];
  const visited = new Set<string>();

  try {
    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      if (visited.has(nodeId)) continue;
      visited.add(nodeId);

      const node = nodes.find((n) => n.id === nodeId);
      if (!node) continue;

      await config.persistence.updateRun(runId, "running", nodeOutputs, undefined, nodeId);

      const data = node.data;

      // ── Trigger: pass through ──
      if (data.nodeType === "trigger") {
        nodeOutputs[nodeId] = { type: "trigger", triggered: true };
        const nextEdges = outEdges.get(nodeId) ?? [];
        for (const e of nextEdges) queue.push(e.target);
        continue;
      }

      // ── Action: execute via plugin ──
      if (data.nodeType === "action") {
        const actionData = data as ActionNodeData;
        const result = await executeActionWithRetry(
          actionData.actionType,
          actionData.config,
          actionCtx,
          config
        );
        nodeOutputs[nodeId] = result;

        if (!result.success) {
          console.error(`[automation-builder] Action node ${nodeId} failed: ${result.error}`);
        }

        const nextEdges = outEdges.get(nodeId) ?? [];
        for (const e of nextEdges) queue.push(e.target);
        continue;
      }

      // ── Condition: evaluate and branch ──
      if (data.nodeType === "condition") {
        const condResult = evaluateCondition(data as ConditionNodeData, actionCtx);
        nodeOutputs[nodeId] = { condition: condResult };

        const nextEdges = outEdges.get(nodeId) ?? [];
        const targetHandle = condResult ? "true" : "false";
        for (const e of nextEdges) {
          if (e.sourceHandle === targetHandle) queue.push(e.target);
        }
        continue;
      }

      // ── Delay: pause the run ──
      if (data.nodeType === "delay") {
        const delayData = data as DelayNodeData;
        const cfg = delayData.config;
        let delayMs = cfg.duration * 60 * 1000;
        if (cfg.unit === "hours") delayMs = cfg.duration * 60 * 60 * 1000;
        if (cfg.unit === "days") delayMs = cfg.duration * 24 * 60 * 60 * 1000;

        const resumeAt = new Date(Date.now() + delayMs).toISOString();
        nodeOutputs[nodeId] = { delay: true, resumeAt, unit: cfg.unit, duration: cfg.duration };

        const nextEdges = outEdges.get(nodeId) ?? [];
        const nextNodeIds = nextEdges.map((e) => e.target);

        await config.persistence.updateRun(
          runId,
          "paused",
          { ...nodeOutputs, _resume_targets: nextNodeIds, _resume_at: resumeAt },
          undefined,
          nodeId
        );

        if (config.persistence.scheduleResume) {
          await config.persistence.scheduleResume(runId, workflow.id, resumeAt, event);
        }

        return { runId, status: "paused", nodeOutputs };
      }

      // Unknown type — skip and continue
      const nextEdges = outEdges.get(nodeId) ?? [];
      for (const e of nextEdges) queue.push(e.target);
    }

    await config.persistence.updateRun(runId, "completed", nodeOutputs);
    if (config.persistence.onWorkflowComplete) {
      await config.persistence.onWorkflowComplete(workflow.id);
    }

    return { runId, status: "completed", nodeOutputs };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    await config.persistence.updateRun(runId, "failed", nodeOutputs, errorMsg);
    return { runId, status: "failed", nodeOutputs, error: errorMsg };
  }
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

  delete nodeOutputs._resume_targets;
  delete nodeOutputs._resume_at;

  const outEdges = new Map<string, FlowEdge[]>();
  for (const edge of edges) {
    const existing = outEdges.get(edge.source) ?? [];
    existing.push(edge);
    outEdges.set(edge.source, existing);
  }

  const actionCtx: ActionContext = {
    workflowId: workflow.id,
    runId,
    vars: (context.vars ?? {}) as Record<string, string | number | undefined>,
    ...context,
  };

  await config.persistence.updateRun(runId, "running", nodeOutputs);

  const queue = [...resumeTargets];
  const visited = new Set<string>(Object.keys(nodeOutputs));

  try {
    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      if (visited.has(nodeId)) continue;
      visited.add(nodeId);

      const node = nodes.find((n) => n.id === nodeId);
      if (!node) continue;

      await config.persistence.updateRun(runId, "running", nodeOutputs, undefined, nodeId);
      const data = node.data;

      if (data.nodeType === "action") {
        const actionData = data as ActionNodeData;
        const result = await executeActionWithRetry(
          actionData.actionType,
          actionData.config,
          actionCtx,
          config
        );
        nodeOutputs[nodeId] = result;
        const nextEdges = outEdges.get(nodeId) ?? [];
        for (const e of nextEdges) queue.push(e.target);
        continue;
      }

      if (data.nodeType === "condition") {
        const condResult = evaluateCondition(data as ConditionNodeData, actionCtx);
        nodeOutputs[nodeId] = { condition: condResult };
        const nextEdges = outEdges.get(nodeId) ?? [];
        const targetHandle = condResult ? "true" : "false";
        for (const e of nextEdges) {
          if (e.sourceHandle === targetHandle) queue.push(e.target);
        }
        continue;
      }

      if (data.nodeType === "delay") {
        const delayData = data as DelayNodeData;
        const cfg = delayData.config;
        let delayMs = cfg.duration * 60 * 1000;
        if (cfg.unit === "hours") delayMs = cfg.duration * 60 * 60 * 1000;
        if (cfg.unit === "days") delayMs = cfg.duration * 24 * 60 * 60 * 1000;

        const resumeAt = new Date(Date.now() + delayMs).toISOString();
        nodeOutputs[nodeId] = { delay: true, resumeAt };

        const nextEdges = outEdges.get(nodeId) ?? [];
        const nextNodeIds = nextEdges.map((e) => e.target);

        await config.persistence.updateRun(
          runId,
          "paused",
          { ...nodeOutputs, _resume_targets: nextNodeIds, _resume_at: resumeAt },
          undefined,
          nodeId
        );

        if (config.persistence.scheduleResume) {
          await config.persistence.scheduleResume(runId, workflow.id, resumeAt, event);
        }

        return { runId, status: "paused", nodeOutputs };
      }

      const nextEdges = outEdges.get(nodeId) ?? [];
      for (const e of nextEdges) queue.push(e.target);
    }

    await config.persistence.updateRun(runId, "completed", nodeOutputs);
    if (config.persistence.onWorkflowComplete) {
      await config.persistence.onWorkflowComplete(workflow.id);
    }

    return { runId, status: "completed", nodeOutputs };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    await config.persistence.updateRun(runId, "failed", nodeOutputs, errorMsg);
    return { runId, status: "failed", nodeOutputs, error: errorMsg };
  }
}

// ── Internal helpers ────────────────────────────────────────────

async function executeActionWithRetry(
  actionType: string,
  config: Record<string, unknown>,
  ctx: ActionContext,
  engineConfig: EngineConfig
): Promise<ActionResult> {
  const maxRetries = engineConfig.maxRetries ?? 2;
  let lastResult: ActionResult = { success: false, error: "Unknown action" };

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    lastResult = await engineConfig.executeAction(actionType, config, ctx);
    if (lastResult.success) return lastResult;

    // Don't retry validation/config errors
    const err = lastResult.error ?? "";
    if (
      err.includes("not found") ||
      err.includes("No ") ||
      err.includes("Invalid") ||
      err.includes("Unknown")
    ) {
      break;
    }

    if (attempt < maxRetries) {
      await new Promise((r) => setTimeout(r, (attempt + 1) * 1000 + 1000));
    }
  }

  return lastResult;
}

/**
 * Evaluate a condition node against the current context vars.
 */
export function evaluateCondition(
  data: ConditionNodeData,
  ctx: ActionContext
): boolean {
  const config = data.config;

  if (config.conditions && config.conditions.length > 0) {
    const results = config.conditions.map((c) =>
      evalSingleCondition(c.field, c.operator, c.value, ctx)
    );
    return config.logic === "or" ? results.some(Boolean) : results.every(Boolean);
  }

  return evalSingleCondition(config.field, config.operator, config.value, ctx);
}

function evalSingleCondition(
  field: string,
  operator: string,
  value: string,
  ctx: ActionContext
): boolean {
  const actual = String(ctx.vars[field] ?? "");
  const expected = value;

  switch (operator) {
    case "equals": return actual === expected;
    case "not_equals": return actual !== expected;
    case "contains": return actual.toLowerCase().includes(expected.toLowerCase());
    case "not_contains": return !actual.toLowerCase().includes(expected.toLowerCase());
    case "starts_with": return actual.toLowerCase().startsWith(expected.toLowerCase());
    case "gt": return Number(actual) > Number(expected);
    case "lt": return Number(actual) < Number(expected);
    case "gte": return Number(actual) >= Number(expected);
    case "lte": return Number(actual) <= Number(expected);
    case "is_empty": return actual === "" || actual === "undefined";
    case "is_not_empty": return actual !== "" && actual !== "undefined";
    default: return false;
  }
}
