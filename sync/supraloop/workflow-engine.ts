/**
 * Workflow Execution Engine
 *
 * Executes a chain of operations defined by React Flow nodes and edges.
 * Resolves execution order via topological sort (respects the visual chain).
 *
 */

import type { Node, Edge } from "@xyflow/react";

export type WorkflowStepResult = {
  nodeId: string;
  nodeType: string;
  label: string;
  status: "pending" | "running" | "success" | "error" | "skipped";
  output?: string;
  error?: string;
  startedAt?: string;
  completedAt?: string;
};

export type WorkflowExecution = {
  id: string;
  status: "idle" | "running" | "completed" | "error";
  steps: WorkflowStepResult[];
  startedAt?: string;
  completedAt?: string;
};

/**
 * Topological sort of nodes based on edges.
 * Returns nodes in execution order (sources first, sinks last).
 */
export function getExecutionOrder(nodes: Node[], edges: Edge[]): Node[] {
  const adjacency = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  for (const node of nodes) {
    adjacency.set(node.id, []);
    inDegree.set(node.id, 0);
  }

  for (const edge of edges) {
    const neighbors = adjacency.get(edge.source);
    if (neighbors) {
      neighbors.push(edge.target);
    }
    inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
  }

  // Kahn's algorithm
  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  const sorted: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    sorted.push(current);
    for (const neighbor of adjacency.get(current) ?? []) {
      const newDeg = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDeg);
      if (newDeg === 0) queue.push(neighbor);
    }
  }

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  return sorted.map((id) => nodeMap.get(id)!).filter(Boolean);
}

/**
 * Get downstream nodes from a given node.
 */
export function getDownstream(nodeId: string, edges: Edge[]): string[] {
  return edges.filter((e) => e.source === nodeId).map((e) => e.target);
}

/**
 * Get upstream nodes feeding into a given node.
 */
export function getUpstream(nodeId: string, edges: Edge[]): string[] {
  return edges.filter((e) => e.target === nodeId).map((e) => e.source);
}

/**
 * Find all trigger nodes (entry points) in the workflow.
 */
export function findTriggerNodes(nodes: Node[]): Node[] {
  return nodes.filter((n) => n.type === "triggerNode");
}

/**
 * Find all output/terminal nodes (no outgoing edges).
 */
export function findTerminalNodes(nodes: Node[], edges: Edge[]): Node[] {
  const sourcesSet = new Set(edges.map((e) => e.source));
  return nodes.filter((n) => !sourcesSet.has(n.id));
}

/**
 * Validate a workflow for execution readiness.
 */
export function validateWorkflow(
  nodes: Node[],
  edges: Edge[]
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (nodes.length === 0) {
    errors.push("Workflow has no nodes");
    return { valid: false, errors };
  }

  // Check for trigger nodes
  const triggers = findTriggerNodes(nodes);
  if (triggers.length === 0) {
    errors.push("Workflow needs at least one Trigger node as entry point");
  }

  // Check for cycles (if topological sort doesn't include all nodes)
  const sorted = getExecutionOrder(nodes, edges);
  if (sorted.length < nodes.length) {
    errors.push("Workflow contains a cycle — break the loop or add a termination condition");
  }

  // Check for disconnected nodes
  const connectedIds = new Set([
    ...edges.map((e) => e.source),
    ...edges.map((e) => e.target),
  ]);
  const disconnected = nodes.filter(
    (n) => !connectedIds.has(n.id) && n.type !== "noteNode" && nodes.length > 1
  );
  if (disconnected.length > 0) {
    errors.push(
      `${disconnected.length} node(s) not connected: ${disconnected.map((n) => (n.data as { label?: string }).label || n.id).join(", ")}`
    );
  }

  // Check LLM nodes have a provider
  const llmNodes = nodes.filter((n) => n.type === "llmNode");
  for (const n of llmNodes) {
    const data = n.data as { provider?: string; systemPrompt?: string };
    if (!data.provider) {
      errors.push(`LLM node "${(n.data as { label?: string }).label}" needs a provider (claude, claude-code, ollama)`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Create an initial execution plan from the workflow.
 */
export function createExecution(nodes: Node[], edges: Edge[]): WorkflowExecution {
  const ordered = getExecutionOrder(nodes, edges);

  return {
    id: `exec-${Date.now()}`,
    status: "idle",
    steps: ordered
      .filter((n) => n.type !== "noteNode") // skip annotation nodes
      .map((n) => ({
        nodeId: n.id,
        nodeType: n.type ?? "unknown",
        label: (n.data as { label?: string }).label ?? n.id,
        status: "pending" as const,
      })),
  };
}

// ── Step Executor ──────────────────────────────────────────────

type StepContext = {
  inputs: Record<string, string>; // nodeId -> output from upstream
};

async function executeStep(
  node: Node,
  edges: Edge[],
  ctx: StepContext,
  apiKey: string | null
): Promise<{ output: string; _branch?: string }> {
  const data = node.data as Record<string, unknown>;
  const upstreamIds = getUpstream(node.id, edges);
  const upstreamText = upstreamIds
    .map((id) => ctx.inputs[id])
    .filter(Boolean)
    .join("\n\n");

  switch (node.type) {
    case "triggerNode": {
      const config = (data.config as string) || "Manual trigger activated";
      return { output: `[Trigger: ${data.label}] ${config}` };
    }

    case "llmNode": {
      const provider = data.provider as string;
      const systemPrompt = (data.systemPrompt as string) || "";
      const temp = (data.temperature as number) ?? 0.7;
      const maxTokens = (data.maxTokens as number) ?? 2048;

      if (!apiKey) {
        return {
          output: `[LLM: ${data.label}] Skipped — no API key. Would process: "${upstreamText.slice(0, 100)}..."`,
        };
      }

      if (provider === "claude" || provider === "claude-code") {
        const res = await fetch("/api/flow-execute-llm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            apiKey,
            systemPrompt,
            userMessage: upstreamText || `Execute: ${data.label}`,
            temperature: temp,
            maxTokens,
            model: (data.model as string) || undefined,
          }),
        });

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`LLM API error: ${errText}`);
        }

        const result = await res.json();
        return { output: result.content as string };
      }

      return {
        output: `[LLM: ${data.label}] Provider "${provider}" not yet supported. Input: "${upstreamText.slice(0, 200)}"`,
      };
    }

    case "conditionNode": {
      const condition = (data.condition as string) || "";
      const input = upstreamText;

      // Evaluate condition expression against upstream input
      let passed = false;
      try {
        // Support common patterns: "contains X", "length > N", comparison operators
        const trimmed = condition.trim().toLowerCase();
        if (!trimmed) {
          // No condition: pass if there's any upstream content
          passed = input.length > 0;
        } else if (trimmed.startsWith("contains ")) {
          passed = input.toLowerCase().includes(trimmed.slice(9).trim().replace(/['"]/g, ""));
        } else if (/^length\s*[><=!]+\s*\d+$/.test(trimmed)) {
          const match = trimmed.match(/^length\s*([><=!]+)\s*(\d+)$/);
          if (match) {
            const op = match[1], val = parseInt(match[2]);
            if (op === ">") passed = input.length > val;
            else if (op === "<") passed = input.length < val;
            else if (op === ">=" || op === "=>") passed = input.length >= val;
            else if (op === "<=" || op === "=<") passed = input.length <= val;
            else if (op === "==" || op === "=") passed = input.length === val;
          }
        } else if (/^(true|yes|pass|ok)$/i.test(trimmed)) {
          passed = true;
        } else if (/^(false|no|fail)$/i.test(trimmed)) {
          passed = false;
        } else {
          // Try to match "score > 80" style expressions against numeric values in upstream
          const numMatch = condition.match(/(\w+)\s*([><=!]+)\s*(\d+)/);
          if (numMatch) {
            const [, , op, valStr] = numMatch;
            const threshold = parseInt(valStr);
            // Extract numbers from upstream text
            const numbers = input.match(/\d+/g)?.map(Number) ?? [];
            const testVal = numbers.length > 0 ? numbers[numbers.length - 1] : 0;
            if (op === ">") passed = testVal > threshold;
            else if (op === "<") passed = testVal < threshold;
            else if (op === ">=" || op === "=>") passed = testVal >= threshold;
            else if (op === "<=" || op === "=<") passed = testVal <= threshold;
            else if (op === "==" || op === "=") passed = testVal === threshold;
            else if (op === "!=" || op === "<>") passed = testVal !== threshold;
          } else {
            // Fallback: check if upstream contains the condition text
            passed = input.toLowerCase().includes(trimmed);
          }
        }
      } catch {
        passed = false;
      }

      return {
        output: `[Condition: ${data.label}] "${condition}" → ${passed ? "TRUE" : "FALSE"}`,
        _branch: passed ? "true" : "false",
      };
    }

    case "transformNode": {
      const expr = (data.expression as string) || "";
      const tType = (data.transformType as string) || "custom";
      return {
        output: `[Transform: ${data.label}] ${tType}(${expr})\nInput: ${upstreamText.slice(0, 300)}`,
      };
    }

    case "outputNode": {
      const dest = (data.destination as string) || "";
      const oType = (data.outputType as string) || "log";
      return {
        output: `[Output: ${data.label}] → ${oType}://${dest}\nContent: ${upstreamText.slice(0, 500)}`,
      };
    }

    case "actionNode": {
      const actionType = (data.actionType as string) || "analyze";
      const desc = (data.description as string) || "";
      return {
        output: `[Action: ${data.label}] ${actionType}: ${desc}\nInput: ${upstreamText.slice(0, 300)}`,
      };
    }

    case "personaNode": {
      return {
        output: `[Persona: ${data.label}] Role: ${data.role}, Weight: ${data.voteWeight}×`,
      };
    }

    case "appNode": {
      return {
        output: `[App: ${data.label}] ${data.description || ""} | State: ${data.currentState || "unknown"} | Users: ${data.targetUsers || ""}`,
      };
    }

    case "competitorNode": {
      return {
        output: `[Competitor: ${data.label}] ${data.why || ""} | Score: ${data.overallScore || 0}`,
      };
    }

    default:
      return { output: `[${node.type}: ${data.label}] Executed` };
  }
}

/**
 * Execute a workflow step-by-step, calling onProgress after each step.
 */
export async function executeWorkflow(
  execution: WorkflowExecution,
  nodes: Node[],
  edges: Edge[],
  apiKey: string | null,
  onProgress: (exec: WorkflowExecution) => void
): Promise<WorkflowExecution> {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const ctx: StepContext = { inputs: {} };
  // Track which nodes should be skipped due to condition branching
  const skippedNodes = new Set<string>();

  const exec: WorkflowExecution = {
    ...execution,
    status: "running",
    startedAt: new Date().toISOString(),
    steps: execution.steps.map((s) => ({ ...s })),
  };
  onProgress(exec);

  for (let i = 0; i < exec.steps.length; i++) {
    const step = exec.steps[i];
    const node = nodeMap.get(step.nodeId);
    if (!node) {
      step.status = "skipped";
      step.output = "Node not found";
      onProgress({ ...exec, steps: [...exec.steps] });
      continue;
    }

    // Skip if this node is on a branch that was not taken
    if (skippedNodes.has(step.nodeId)) {
      step.status = "skipped";
      step.output = "Skipped — condition branch not taken";
      step.completedAt = new Date().toISOString();
      onProgress({ ...exec, steps: [...exec.steps] });
      continue;
    }

    step.status = "running";
    step.startedAt = new Date().toISOString();
    onProgress({ ...exec, steps: [...exec.steps] });

    try {
      const result = await executeStep(node, edges, ctx, apiKey);
      step.status = "success";
      step.output = result.output;
      step.completedAt = new Date().toISOString();
      ctx.inputs[step.nodeId] = result.output;

      // Handle condition branching: skip nodes on the non-taken branch
      if (node.type === "conditionNode" && result._branch) {
        const takenBranch = result._branch; // "true" or "false"
        const skippedBranch = takenBranch === "true" ? "false" : "true";
        // Find edges from this condition node on the non-taken branch
        const skippedEdges = edges.filter(
          (e) => e.source === node.id && e.sourceHandle === skippedBranch
        );
        // Collect all downstream nodes from the skipped branch
        const toSkip = new Set<string>();
        const queue = skippedEdges.map((e) => e.target);
        while (queue.length > 0) {
          const nid = queue.shift()!;
          if (toSkip.has(nid)) continue;
          // Don't skip nodes that also have inputs from non-skipped paths
          const allIncoming = edges.filter((e) => e.target === nid);
          const allSourcesSkipped = allIncoming.every(
            (e) => toSkip.has(e.source) || (e.source === node.id && e.sourceHandle === skippedBranch)
          );
          if (!allSourcesSkipped) continue;
          toSkip.add(nid);
          const downstream = edges.filter((e) => e.source === nid).map((e) => e.target);
          queue.push(...downstream);
        }
        toSkip.forEach((id) => skippedNodes.add(id));
      }
    } catch (err) {
      step.status = "error";
      step.error = err instanceof Error ? err.message : String(err);
      step.completedAt = new Date().toISOString();
      // Continue executing remaining steps
    }

    onProgress({ ...exec, steps: [...exec.steps] });
  }

  exec.status = exec.steps.some((s) => s.status === "error")
    ? "error"
    : "completed";
  exec.completedAt = new Date().toISOString();
  onProgress({ ...exec });

  return exec;
}
