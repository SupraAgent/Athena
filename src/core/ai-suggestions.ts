/**
 * AI Suggestion Engine — rule-based workflow analysis.
 *
 * Analyzes workflow structure and generates actionable suggestions
 * for improving error handling, performance, connections, and quality.
 * No LLM dependency — purely structural/heuristic analysis.
 */

import type { FlowNode, FlowEdge, AISuggestion } from "./types";

/**
 * Analyze a workflow and generate improvement suggestions.
 */
export class AISuggestionEngine {
  analyze(
    nodes: FlowNode[],
    edges: FlowEdge[],
    onApply?: (
      updatedNodes: FlowNode[],
      updatedEdges: FlowEdge[]
    ) => void
  ): AISuggestion[] {
    const suggestions: AISuggestion[] = [];

    // Build adjacency maps
    const incomingEdges = new Map<string, FlowEdge[]>();
    const outgoingEdges = new Map<string, FlowEdge[]>();
    for (const edge of edges) {
      const inc = incomingEdges.get(edge.target) ?? [];
      inc.push(edge);
      incomingEdges.set(edge.target, inc);

      const out = outgoingEdges.get(edge.source) ?? [];
      out.push(edge);
      outgoingEdges.set(edge.source, out);
    }

    const nodeMap = new Map<string, FlowNode>();
    for (const node of nodes) {
      nodeMap.set(node.id, node);
    }

    suggestions.push(
      ...this.checkUnconnectedNodes(nodes, incomingEdges, outgoingEdges, edges, onApply),
      ...this.checkMissingErrorHandling(nodes, outgoingEdges, edges, onApply),
      ...this.checkMissingConditionBranches(nodes, outgoingEdges, edges, onApply),
      ...this.checkRateLimitOpportunities(nodes, edges, outgoingEdges),
      ...this.checkAINodeValidation(nodes),
      ...this.checkDeadEnds(nodes, incomingEdges, outgoingEdges),
      ...this.checkParallelOpportunities(nodes, edges, incomingEdges, outgoingEdges),
    );

    return suggestions;
  }

  /**
   * Detect nodes with no incoming or outgoing edges.
   */
  private checkUnconnectedNodes(
    nodes: FlowNode[],
    incomingEdges: Map<string, FlowEdge[]>,
    outgoingEdges: Map<string, FlowEdge[]>,
    edges: FlowEdge[],
    onApply?: (nodes: FlowNode[], edges: FlowEdge[]) => void
  ): AISuggestion[] {
    const suggestions: AISuggestion[] = [];

    for (const node of nodes) {
      // Triggers naturally have no incoming edges
      if (node.data.nodeType === "trigger") continue;

      const hasIncoming = (incomingEdges.get(node.id) ?? []).length > 0;
      const hasOutgoing = (outgoingEdges.get(node.id) ?? []).length > 0;

      if (!hasIncoming && !hasOutgoing) {
        suggestions.push({
          id: `unconnected-${node.id}`,
          type: "add_edge",
          title: `"${node.data.label}" is disconnected`,
          description: `This node has no connections. It will never execute. Connect it to the workflow or remove it.`,
          confidence: 0.95,
          apply: () => {
            // No auto-fix for fully disconnected nodes — user must decide
            onApply?.(nodes, edges);
          },
        });
      } else if (!hasIncoming) {
        suggestions.push({
          id: `no-incoming-${node.id}`,
          type: "add_edge",
          title: `"${node.data.label}" has no incoming connection`,
          description: `This node cannot be reached. Connect an upstream node to it.`,
          confidence: 0.9,
          apply: () => {
            onApply?.(nodes, edges);
          },
        });
      }
    }

    return suggestions;
  }

  /**
   * Detect action nodes not wrapped in error handling.
   */
  private checkMissingErrorHandling(
    nodes: FlowNode[],
    outgoingEdges: Map<string, FlowEdge[]>,
    edges: FlowEdge[],
    onApply?: (nodes: FlowNode[], edges: FlowEdge[]) => void
  ): AISuggestion[] {
    const suggestions: AISuggestion[] = [];

    // Find all action nodes
    const actionNodes = nodes.filter((n) => n.data.nodeType === "action");

    // Find all nodes reachable via the "success" path of try_catch nodes.
    // Walk the try path transitively so nested actions are also considered protected.
    const tryCatchProtected = new Set<string>();
    for (const node of nodes) {
      if ((node.data.nodeType as string) !== "try_catch") continue;
      const outs = outgoingEdges.get(node.id) ?? [];
      for (const edge of outs) {
        if (edge.sourceHandle === "success") {
          // BFS walk from the success target to mark all reachable nodes as protected
          const walkQueue = [edge.target];
          while (walkQueue.length > 0) {
            const nid = walkQueue.shift()!;
            if (tryCatchProtected.has(nid)) continue;
            tryCatchProtected.add(nid);
            const downstream = outgoingEdges.get(nid) ?? [];
            for (const de of downstream) {
              walkQueue.push(de.target);
            }
          }
        }
      }
    }

    for (const action of actionNodes) {
      if (tryCatchProtected.has(action.id)) continue;

      suggestions.push({
        id: `error-handling-${action.id}`,
        type: "add_error_handling",
        title: `Add error handling for "${action.data.label}"`,
        description: `This action node has no try/catch wrapper. If it fails, the entire workflow will fail. Consider wrapping it in a Try/Catch node.`,
        confidence: 0.7,
        apply: () => {
          onApply?.(nodes, edges);
        },
      });
    }

    // Also check AI nodes
    const aiNodes = nodes.filter((n) => n.data.nodeType === "ai");
    for (const ai of aiNodes) {
      if (tryCatchProtected.has(ai.id)) continue;

      suggestions.push({
        id: `error-handling-ai-${ai.id}`,
        type: "add_error_handling",
        title: `Add error handling for AI node "${ai.data.label}"`,
        description: `AI nodes can fail due to provider errors, rate limits, or invalid responses. Consider wrapping in a Try/Catch node.`,
        confidence: 0.8,
        apply: () => {
          onApply?.(nodes, edges);
        },
      });
    }

    return suggestions;
  }

  /**
   * Detect condition and switch nodes with missing branches.
   */
  private checkMissingConditionBranches(
    nodes: FlowNode[],
    outgoingEdges: Map<string, FlowEdge[]>,
    edges: FlowEdge[],
    onApply?: (nodes: FlowNode[], edges: FlowEdge[]) => void
  ): AISuggestion[] {
    const suggestions: AISuggestion[] = [];

    // Check condition nodes for true/false branches
    const conditionNodes = nodes.filter(
      (n) => n.data.nodeType === "condition"
    );

    for (const cond of conditionNodes) {
      const outs = outgoingEdges.get(cond.id) ?? [];
      const hasTrueBranch = outs.some((e) => e.sourceHandle === "true");
      const hasFalseBranch = outs.some((e) => e.sourceHandle === "false");

      if (hasTrueBranch && !hasFalseBranch) {
        suggestions.push({
          id: `missing-false-branch-${cond.id}`,
          type: "add_edge",
          title: `"${cond.data.label}" is missing a false branch`,
          description: `This condition only handles the true case. When the condition is false, execution stops. Add a false branch to handle all cases.`,
          confidence: 0.85,
          apply: () => {
            onApply?.(nodes, edges);
          },
        });
      } else if (hasFalseBranch && !hasTrueBranch) {
        suggestions.push({
          id: `missing-true-branch-${cond.id}`,
          type: "add_edge",
          title: `"${cond.data.label}" is missing a true branch`,
          description: `This condition only handles the false case. When the condition is true, execution stops. Add a true branch.`,
          confidence: 0.85,
          apply: () => {
            onApply?.(nodes, edges);
          },
        });
      } else if (!hasTrueBranch && !hasFalseBranch) {
        suggestions.push({
          id: `no-branches-${cond.id}`,
          type: "add_edge",
          title: `"${cond.data.label}" has no branches connected`,
          description: `This condition node has no output connections. Connect true and false branches.`,
          confidence: 0.95,
          apply: () => {
            onApply?.(nodes, edges);
          },
        });
      }
    }

    // Check switch nodes for missing case branches
    const switchNodes = nodes.filter(
      (n) => (n.data.nodeType as string) === "switch"
    );

    for (const sw of switchNodes) {
      const outs = outgoingEdges.get(sw.id) ?? [];
      const connectedHandles = new Set(
        outs.map((e) => e.sourceHandle).filter(Boolean)
      );
      const config = sw.data.config as { cases?: { value: string; label: string }[]; defaultCase?: string };
      const cases = config?.cases ?? [];

      // Check each case has a connected edge
      for (const c of cases) {
        if (!connectedHandles.has(c.value)) {
          suggestions.push({
            id: `missing-switch-case-${sw.id}-${c.value}`,
            type: "add_edge",
            title: `"${sw.data.label}" is missing branch for case "${c.label}"`,
            description: `Switch case "${c.label}" (value: ${c.value}) has no outgoing connection. Matching values will stop execution.`,
            confidence: 0.8,
            apply: () => {
              onApply?.(nodes, edges);
            },
          });
        }
      }

      // Check if default branch is connected
      if (!connectedHandles.has("default") && cases.length > 0) {
        suggestions.push({
          id: `missing-switch-default-${sw.id}`,
          type: "add_edge",
          title: `"${sw.data.label}" has no default branch`,
          description: `This switch node has no default case. If no cases match, execution will stop. Consider adding a default branch.`,
          confidence: 0.7,
          apply: () => {
            onApply?.(nodes, edges);
          },
        });
      }
    }

    return suggestions;
  }

  /**
   * Detect sequences of multiple API-calling actions that could benefit from rate limiting.
   */
  private checkRateLimitOpportunities(
    nodes: FlowNode[],
    edges: FlowEdge[],
    outgoingEdges: Map<string, FlowEdge[]>
  ): AISuggestion[] {
    const suggestions: AISuggestion[] = [];

    // Find sequential chains of action/AI nodes
    const apiNodes = nodes.filter(
      (n) => n.data.nodeType === "action" || n.data.nodeType === "ai"
    );

    if (apiNodes.length < 2) return suggestions;

    // Check for consecutive action/AI nodes in chains
    for (const node of apiNodes) {
      const outs = outgoingEdges.get(node.id) ?? [];
      for (const edge of outs) {
        const target = nodes.find((n) => n.id === edge.target);
        if (
          target &&
          (target.data.nodeType === "action" || target.data.nodeType === "ai")
        ) {
          suggestions.push({
            id: `rate-limit-${node.id}-${target.id}`,
            type: "optimize",
            title: `Consider rate limiting between "${node.data.label}" and "${target.data.label}"`,
            description: `Back-to-back API calls can trigger rate limits. Consider adding a delay node between them or configuring a rate limiter.`,
            confidence: 0.5,
            apply: () => {
              // Informational only
            },
          });
          // Only suggest once per chain
          break;
        }
      }
    }

    return suggestions;
  }

  /**
   * Check AI nodes for common configuration improvements.
   */
  private checkAINodeValidation(nodes: FlowNode[]): AISuggestion[] {
    const suggestions: AISuggestion[] = [];

    const aiNodes = nodes.filter((n) => n.data.nodeType === "ai");

    for (const node of aiNodes) {
      const config = node.data.config as {
        responseFormat?: string;
        tools?: unknown[];
        maxToolRounds?: number;
        systemPrompt?: string;
      };

      // Suggest JSON format for nodes with tools
      if (
        config.tools &&
        config.tools.length > 0 &&
        config.responseFormat !== "json"
      ) {
        suggestions.push({
          id: `ai-json-format-${node.id}`,
          type: "modify_config",
          title: `Consider JSON response format for "${node.data.label}"`,
          description: `AI nodes with tools often benefit from structured JSON responses for more reliable tool call parsing.`,
          confidence: 0.6,
          preview: {
            configChanges: { responseFormat: "json" },
          },
          apply: () => {
            // Informational
          },
        });
      }

      // Warn about missing system prompt
      if (!config.systemPrompt) {
        suggestions.push({
          id: `ai-system-prompt-${node.id}`,
          type: "modify_config",
          title: `Add system prompt to "${node.data.label}"`,
          description: `A system prompt helps set context and constraints for the AI model, improving response quality and consistency.`,
          confidence: 0.55,
          apply: () => {
            // Informational
          },
        });
      }
    }

    return suggestions;
  }

  /**
   * Detect dead-end nodes — branching nodes (condition, switch) with incoming
   * edges but no outgoing edges. Action/AI nodes at the end of a chain are
   * valid terminal nodes and are not flagged here.
   */
  private checkDeadEnds(
    nodes: FlowNode[],
    incomingEdges: Map<string, FlowEdge[]>,
    outgoingEdges: Map<string, FlowEdge[]>
  ): AISuggestion[] {
    const suggestions: AISuggestion[] = [];

    // Node types that should always have outgoing edges (branching/routing nodes)
    // Action/AI nodes at the end of a chain are legitimate terminal nodes.
    // Condition/switch without branches are caught by checkMissingConditionBranches,
    // but try_catch and loop must always route somewhere.
    const mustHaveOutgoing = new Set(["try_catch", "loop"]);

    for (const node of nodes) {
      if (node.data.nodeType === "trigger") continue;
      if (!mustHaveOutgoing.has(node.data.nodeType as string)) continue;

      const hasIncoming = (incomingEdges.get(node.id) ?? []).length > 0;
      const hasOutgoing = (outgoingEdges.get(node.id) ?? []).length > 0;

      if (hasIncoming && !hasOutgoing) {
        suggestions.push({
          id: `dead-end-${node.id}`,
          type: "add_edge",
          title: `"${node.data.label}" is a dead end`,
          description: `This ${node.data.nodeType} node has incoming connections but no outgoing ones. It must route execution to downstream nodes.`,
          confidence: 0.85,
          apply: () => {
            // Informational
          },
        });
      }
    }

    return suggestions;
  }

  /**
   * Detect opportunities for parallel execution.
   * When a single node fans out to multiple independent branches.
   */
  private checkParallelOpportunities(
    nodes: FlowNode[],
    edges: FlowEdge[],
    incomingEdges: Map<string, FlowEdge[]>,
    outgoingEdges: Map<string, FlowEdge[]>
  ): AISuggestion[] {
    const suggestions: AISuggestion[] = [];

    for (const node of nodes) {
      if (node.data.nodeType === "condition") continue; // Conditions naturally fan out
      const outs = outgoingEdges.get(node.id) ?? [];

      // A node with 2+ outgoing edges to non-condition action/AI nodes
      const actionTargets = outs
        .map((e) => nodes.find((n) => n.id === e.target))
        .filter(
          (n) =>
            n &&
            (n.data.nodeType === "action" || n.data.nodeType === "ai")
        );

      if (actionTargets.length >= 2) {
        const targetLabels = actionTargets
          .map((n) => `"${n!.data.label}"`)
          .join(", ");
        suggestions.push({
          id: `parallel-${node.id}`,
          type: "optimize",
          title: `Parallel execution opportunity after "${node.data.label}"`,
          description: `The branches ${targetLabels} could potentially run in parallel for faster execution.`,
          confidence: 0.45,
          apply: () => {
            // Informational
          },
        });
      }
    }

    return suggestions;
  }
}
