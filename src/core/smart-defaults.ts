/**
 * Smart Defaults Engine.
 *
 * Computes intelligent default values for newly added workflow nodes
 * based on the existing workflow graph context. Ships with built-in rules;
 * consuming apps can register custom SmartDefaultRule objects.
 */

import type {
  FlowNode,
  FlowEdge,
  NodeRegistry,
  WorkflowNodeData,
  ActionNodeData,
  LoopNodeData,
  ConditionNodeData,
} from "./types";

// ── Types ────────────────────────────────────────────────────────

export interface SmartDefaultContext {
  /** The node type being added (e.g. "action", "condition", "delay") */
  newNodeType: string;
  /** Sub-type if applicable (e.g. "slack_send_message") */
  newNodeSubType?: string;
  /** All existing nodes in the workflow */
  existingNodes: FlowNode[];
  /** All existing edges in the workflow */
  existingEdges: FlowEdge[];
  /** The node registry for looking up palette items and config schemas */
  registry: NodeRegistry;
  /** If the drop happened on an edge, this is the source node of that edge */
  upstreamNodeId?: string;
}

export interface SmartDefaultRule {
  id: string;
  /** Which node type this rule applies to (e.g. "action", "condition", "loop", "*" for all) */
  nodeType: string;
  /** Return true if this rule should fire given the context */
  applies: (context: SmartDefaultContext) => boolean;
  /** Return a partial config to merge into the new node's config */
  getDefaults: (context: SmartDefaultContext) => Record<string, unknown>;
}

// ── Built-in rules ───────────────────────────────────────────────

/**
 * Same-connector prefill: if the workflow already has a node of the same
 * connector family (matching subType prefix before the last underscore segment),
 * copy relevant config from the most recently added matching node.
 */
const sameConnectorPrefillRule: SmartDefaultRule = {
  id: "builtin:same-connector-prefill",
  nodeType: "action",
  applies: (ctx) => {
    if (!ctx.newNodeSubType) return false;
    const prefix = getConnectorPrefix(ctx.newNodeSubType);
    if (!prefix) return false;
    return ctx.existingNodes.some((n) => {
      const data = n.data as WorkflowNodeData;
      if (data.nodeType !== "action") return false;
      const actionData = data as ActionNodeData;
      return getConnectorPrefix(actionData.actionType) === prefix;
    });
  },
  getDefaults: (ctx) => {
    const prefix = getConnectorPrefix(ctx.newNodeSubType!);
    if (!prefix) return {};

    // Find the most recent action node with the same connector prefix
    // (last in the array = most recently added in typical usage)
    const matchingNodes = ctx.existingNodes.filter((n) => {
      const data = n.data as WorkflowNodeData;
      if (data.nodeType !== "action") return false;
      return getConnectorPrefix((data as ActionNodeData).actionType) === prefix;
    });

    if (matchingNodes.length === 0) return {};

    const latestMatch = matchingNodes[matchingNodes.length - 1];
    const latestData = latestMatch.data as ActionNodeData;

    // Copy only connector-level config keys (channel, workspace, account, etc.)
    // Exclude action-specific keys like "message", "content", "subject"
    const connectorKeys = ["channel", "workspace", "account", "repository", "project", "team", "board", "database"];
    const defaults: Record<string, unknown> = {};

    for (const key of connectorKeys) {
      if (latestData.config[key] !== undefined && latestData.config[key] !== "") {
        defaults[key] = latestData.config[key];
      }
    }

    return defaults;
  },
};

/**
 * Condition after action: when adding a condition node that has an
 * upstream action node, pre-fill the condition field with the upstream
 * action's output key path.
 */
const conditionAfterActionRule: SmartDefaultRule = {
  id: "builtin:condition-after-action",
  nodeType: "condition",
  applies: (ctx) => {
    if (!ctx.upstreamNodeId) return false;
    const upstreamNode = ctx.existingNodes.find((n) => n.id === ctx.upstreamNodeId);
    if (!upstreamNode) return false;
    return (upstreamNode.data as WorkflowNodeData).nodeType === "action";
  },
  getDefaults: (ctx) => {
    const upstreamNode = ctx.existingNodes.find((n) => n.id === ctx.upstreamNodeId);
    if (!upstreamNode) return {};

    return {
      field: `{{${ctx.upstreamNodeId}.output.success}}`,
      operator: "equals",
      value: "true",
    };
  },
};

/**
 * Delay after rate-limited action: if adding a delay node and the upstream
 * action has config hints about rate limiting (e.g. a rateLimitPerMinute field),
 * suggest a delay matching that rate limit window.
 */
const delayAfterRateLimitedRule: SmartDefaultRule = {
  id: "builtin:delay-after-rate-limited",
  nodeType: "delay",
  applies: (ctx) => {
    if (!ctx.upstreamNodeId) return false;
    const upstreamNode = ctx.existingNodes.find((n) => n.id === ctx.upstreamNodeId);
    if (!upstreamNode) return false;
    const data = upstreamNode.data as WorkflowNodeData;
    if (data.nodeType !== "action") return false;
    const config = (data as ActionNodeData).config;
    return (
      config.rateLimitPerMinute !== undefined ||
      config.rateLimitPerSecond !== undefined ||
      config.rateLimit !== undefined
    );
  },
  getDefaults: (ctx) => {
    const upstreamNode = ctx.existingNodes.find((n) => n.id === ctx.upstreamNodeId)!;
    const config = (upstreamNode.data as ActionNodeData).config;

    if (config.rateLimitPerSecond !== undefined) {
      const rps = Number(config.rateLimitPerSecond);
      if (rps > 0) {
        // Compute inter-request delay in seconds; pick the best unit
        const delaySeconds = Math.ceil(1 / rps);
        if (delaySeconds < 60) {
          // Sub-minute delay: express in minutes with minimum 1,
          // since DelayConfig only supports minutes/hours/days
          return { duration: 1, unit: "minutes" };
        }
        return { duration: Math.ceil(delaySeconds / 60), unit: "minutes" };
      }
    }

    if (config.rateLimitPerMinute !== undefined) {
      const rpm = Number(config.rateLimitPerMinute);
      if (rpm > 0) {
        const delayMinutes = Math.max(1, Math.ceil(60 / rpm));
        return { duration: delayMinutes, unit: "minutes" };
      }
    }

    // Generic rateLimit field — assume per-minute
    if (config.rateLimit !== undefined) {
      const rate = Number(config.rateLimit);
      if (rate > 0) {
        return { duration: Math.max(1, Math.ceil(60 / rate)), unit: "minutes" };
      }
    }

    return { duration: 1, unit: "minutes" };
  },
};

/**
 * Try-catch wrapper suggestion: if adding an action that calls external APIs,
 * suggest wrapping in try-catch by returning a hint in the defaults.
 * The canvas can use this hint to show a suggestion tooltip.
 */
const tryCatchSuggestionRule: SmartDefaultRule = {
  id: "builtin:try-catch-suggestion",
  nodeType: "action",
  applies: (ctx) => {
    if (!ctx.newNodeSubType) return false;
    // Heuristic: actions with these keywords likely call external APIs
    const externalHints = ["send", "post", "fetch", "request", "api", "call", "webhook", "http", "email", "sms", "notify"];
    const subTypeLower = ctx.newNodeSubType.toLowerCase();
    return externalHints.some((hint) => subTypeLower.includes(hint));
  },
  getDefaults: () => {
    return {
      _suggestTryCatch: true,
    };
  },
};

/**
 * Loop array prefill: if adding a loop node and the upstream node outputs
 * an array, pre-fill the loop's arrayExpression with that output path.
 */
const loopArrayPrefillRule: SmartDefaultRule = {
  id: "builtin:loop-array-prefill",
  nodeType: "loop",
  applies: (ctx) => {
    if (!ctx.upstreamNodeId) return false;
    const upstreamNode = ctx.existingNodes.find((n) => n.id === ctx.upstreamNodeId);
    if (!upstreamNode) return false;
    const data = upstreamNode.data as WorkflowNodeData;

    // Check if upstream is an action with output keys suggesting arrays
    if (data.nodeType === "action") {
      const actionData = data as ActionNodeData;
      const config = actionData.config;
      // Check for array-suggesting config keys
      return (
        config.outputType === "array" ||
        config.returnsList === true ||
        config.list !== undefined ||
        config.items !== undefined ||
        config.results !== undefined
      );
    }

    // Check if upstream is a code node (code nodes often return arrays)
    if (data.nodeType === "code") return true;

    // Check if upstream is itself a loop (loop outputs results array)
    if (data.nodeType === "loop") return true;

    return false;
  },
  getDefaults: (ctx) => {
    const upstreamNode = ctx.existingNodes.find((n) => n.id === ctx.upstreamNodeId);
    if (!upstreamNode) return {};
    const data = upstreamNode.data as WorkflowNodeData;

    if (data.nodeType === "action") {
      const actionConfig = (data as ActionNodeData).config;
      // Try to find the most likely array key in the output
      if (actionConfig.items !== undefined) {
        return { arrayExpression: `{{${ctx.upstreamNodeId}.output.items}}` };
      }
      if (actionConfig.results !== undefined) {
        return { arrayExpression: `{{${ctx.upstreamNodeId}.output.results}}` };
      }
      if (actionConfig.list !== undefined) {
        return { arrayExpression: `{{${ctx.upstreamNodeId}.output.list}}` };
      }
      return { arrayExpression: `{{${ctx.upstreamNodeId}.output.data}}` };
    }

    if (data.nodeType === "code") {
      return { arrayExpression: `{{${ctx.upstreamNodeId}.output.result}}` };
    }

    if (data.nodeType === "loop") {
      return { arrayExpression: `{{${ctx.upstreamNodeId}.output.results}}` };
    }

    return {};
  },
};

// ── All built-in rules ───────────────────────────────────────────

export const BUILTIN_SMART_DEFAULT_RULES: SmartDefaultRule[] = [
  sameConnectorPrefillRule,
  conditionAfterActionRule,
  delayAfterRateLimitedRule,
  tryCatchSuggestionRule,
  loopArrayPrefillRule,
];

// ── Main API ─────────────────────────────────────────────────────

/**
 * Compute smart defaults for a new node being added to the workflow.
 * Runs all applicable rules (built-in + custom) and merges results.
 * Later rules override earlier ones if they set the same key.
 *
 * @param context - The context for the new node being added
 * @param customRules - Optional custom rules to run in addition to built-ins
 * @returns Merged defaults record to apply to the new node's config
 */
export function computeSmartDefaults(
  context: SmartDefaultContext,
  customRules?: SmartDefaultRule[]
): Record<string, unknown> {
  const allRules = [...BUILTIN_SMART_DEFAULT_RULES, ...(customRules ?? [])];
  const merged: Record<string, unknown> = {};

  for (const rule of allRules) {
    // Rule must match either the specific node type or "*" wildcard
    if (rule.nodeType !== "*" && rule.nodeType !== context.newNodeType) {
      continue;
    }

    try {
      if (!rule.applies(context)) continue;
    } catch {
      // Safety: a broken applies() must never crash node creation
      continue;
    }

    try {
      const defaults = rule.getDefaults(context);
      Object.assign(merged, defaults);
    } catch {
      // Safety: a broken getDefaults() must never crash node creation
      continue;
    }
  }

  return merged;
}

/**
 * Detect the upstream node when a node is dropped onto an existing edge.
 * Returns the source node ID of the edge closest to the drop position,
 * or undefined if no edge is close enough.
 */
export function detectUpstreamFromEdges(
  dropPosition: { x: number; y: number },
  existingNodes: FlowNode[],
  existingEdges: FlowEdge[]
): string | undefined {
  if (existingEdges.length === 0) return undefined;

  // Build a position map for all nodes
  const nodePositions = new Map<string, { x: number; y: number }>();
  for (const n of existingNodes) {
    nodePositions.set(n.id, n.position);
  }

  // For each edge, compute midpoint between source and target node positions.
  // The edge whose midpoint is closest to the drop position is the one we pick.
  let bestEdge: FlowEdge | undefined;
  let bestDistance = Infinity;

  for (const edge of existingEdges) {
    const sourcePos = nodePositions.get(edge.source);
    const targetPos = nodePositions.get(edge.target);
    if (!sourcePos || !targetPos) continue;

    const midX = (sourcePos.x + targetPos.x) / 2;
    const midY = (sourcePos.y + targetPos.y) / 2;

    const dx = dropPosition.x - midX;
    const dy = dropPosition.y - midY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < bestDistance) {
      bestDistance = distance;
      bestEdge = edge;
    }
  }

  // Only return if drop was reasonably close to an edge (within 200px of midpoint)
  if (bestEdge && bestDistance < 200) {
    return bestEdge.source;
  }

  return undefined;
}

// ── Utility helpers ──────────────────────────────────────────────

/**
 * Extract the connector prefix from a subType string.
 * e.g. "slack_send_message" -> "slack", "github_create_issue" -> "github"
 * Returns the first segment before the first underscore, or undefined if no underscore.
 */
function getConnectorPrefix(subType: string): string | undefined {
  const idx = subType.indexOf("_");
  if (idx <= 0) return undefined;
  return subType.substring(0, idx);
}
