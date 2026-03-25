/**
 * AI Executor — provider-agnostic AI/LLM execution engine with tool-use loop.
 *
 * The AIProvider interface is generic: no imports from any specific SDK.
 * Consuming apps implement this interface to bridge to OpenAI, Anthropic, etc.
 */

import type { AINodeConfig, AIToolCall, AINodeResult, AITool } from "./types";

// ── Provider interfaces ─────────────────────────────────────────

export interface AIChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCallId?: string;
}

export interface AIChatRequest {
  model: string;
  messages: AIChatMessage[];
  temperature?: number;
  maxTokens?: number;
  responseFormat?: "text" | "json";
  tools?: Array<{
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  }>;
}

export interface AIChatResponse {
  content: string;
  toolCalls?: AIToolCall[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model: string;
  finishReason: string;
}

export interface AIChatChunk {
  content?: string;
  toolCalls?: AIToolCall[];
  finishReason?: string;
}

/**
 * Generic AI provider interface.
 * Consuming apps implement this to bridge to any LLM SDK.
 */
export interface AIProvider {
  /** Send a chat completion request and get the full response. */
  chat(request: AIChatRequest): Promise<AIChatResponse>;
  /** Optional streaming variant. */
  chatStream?(request: AIChatRequest): AsyncIterable<AIChatChunk>;
}

// ── Expression context type (minimal to avoid circular deps) ────

export interface AIExpressionContext {
  nodeOutputs: Record<string, Record<string, unknown>>;
  vars: Record<string, unknown>;
  credentials?: Record<string, Record<string, string>>;
  env?: Record<string, string>;
}

// ── Template resolution (inline to avoid importing the full module) ──

const TEMPLATE_RE = /\{\{([^}]+)\}\}/g;

function resolvePromptTemplate(
  template: string,
  context: AIExpressionContext
): string {
  return template.replace(TEMPLATE_RE, (_match, expr: string) => {
    const trimmed = expr.trim();
    if (!trimmed) return "";

    const parts = trimmed.split(".");

    // vars.x
    if (parts[0] === "vars" && parts.length > 1) {
      const val = traversePath(context.vars, parts.slice(1));
      return stringify(val);
    }

    // env.x
    if (parts[0] === "env" && parts.length > 1 && context.env) {
      const val = traversePath(context.env, parts.slice(1));
      return stringify(val);
    }

    // nodeId.field
    const nodeId = parts[0];
    if (nodeId && context.nodeOutputs[nodeId] !== undefined) {
      if (parts.length === 1) return stringify(context.nodeOutputs[nodeId]);
      const val = traversePath(context.nodeOutputs[nodeId], parts.slice(1));
      return stringify(val);
    }

    // Plain variable
    if (parts.length === 1 && context.vars[trimmed] !== undefined) {
      return stringify(context.vars[trimmed]);
    }

    return "";
  });
}

function traversePath(root: unknown, parts: string[]): unknown {
  let current: unknown = root;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function stringify(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

// ── Tool handler execution ──────────────────────────────────────

/**
 * Execute a tool call by resolving its handler against the context.
 * Handlers can reference upstream node outputs or context variables.
 */
function executeToolHandler(
  tool: AITool,
  toolCall: AIToolCall,
  context: AIExpressionContext
): Record<string, unknown> {
  const handler = tool.handler.trim();

  // If handler references a node output (e.g., "node_1.output"), use that as a function-like lookup
  // Combined with the tool call arguments, produce a result
  const parts = handler.split(".");
  const nodeId = parts[0];

  if (nodeId && context.nodeOutputs[nodeId] !== undefined) {
    const nodeOutput = context.nodeOutputs[nodeId];
    return {
      source: handler,
      nodeOutput,
      arguments: toolCall.arguments,
      result: nodeOutput,
    };
  }

  // If handler is a vars reference
  if (parts[0] === "vars" && parts.length > 1) {
    const val = traversePath(context.vars, parts.slice(1));
    return {
      source: handler,
      result: val,
      arguments: toolCall.arguments,
    };
  }

  // Generic handler: return the arguments back with the handler reference
  // The consuming app's action executor handles the actual logic
  return {
    source: handler,
    arguments: toolCall.arguments,
    handler,
  };
}

// ── AIExecutor class ────────────────────────────────────────────

const DEFAULT_MAX_TOOL_ROUNDS = 5;

export class AIExecutor {
  private defaultProvider: AIProvider | undefined;

  constructor(defaultProvider?: AIProvider) {
    this.defaultProvider = defaultProvider;
  }

  /**
   * Execute an AI node configuration.
   *
   * 1. Resolve prompt templates against the expression context
   * 2. Send the initial chat request
   * 3. If the response has tool calls, execute them and loop
   * 4. Return the final aggregated result
   */
  async execute(
    config: AINodeConfig,
    context: AIExpressionContext,
    provider?: AIProvider
  ): Promise<AINodeResult> {
    const activeProvider = provider ?? this.defaultProvider;
    if (!activeProvider) {
      throw new Error(
        "No AIProvider available. Provide one via constructor or execute() argument."
      );
    }

    // Resolve prompt templates
    const resolvedPrompt = resolvePromptTemplate(config.prompt, context);
    const resolvedSystemPrompt = config.systemPrompt
      ? resolvePromptTemplate(config.systemPrompt, context)
      : undefined;

    // Build initial messages
    const messages: AIChatMessage[] = [];
    if (resolvedSystemPrompt) {
      messages.push({ role: "system", content: resolvedSystemPrompt });
    }
    messages.push({ role: "user", content: resolvedPrompt });

    // Build tools array for the request
    const requestTools = config.tools?.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }));

    const maxRounds = config.maxToolRounds ?? DEFAULT_MAX_TOOL_ROUNDS;
    let totalUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    const allToolCalls: AIToolCall[] = [];
    const allToolResults: Record<string, unknown>[] = [];
    let lastResponse: AIChatResponse | undefined;
    let round = 0;

    // Use streaming path if configured and available
    if (config.stream && activeProvider.chatStream) {
      return this.executeStream(
        config,
        messages,
        requestTools,
        context,
        activeProvider,
        maxRounds
      );
    }

    // Standard (non-streaming) execution loop
    // round tracks the number of tool-call round-trips completed.
    // The initial prompt is round 0 (not counted against maxRounds).
    // After processing tool calls, round increments. We stop when
    // round reaches maxRounds, ensuring exactly maxRounds tool loops.
    while (true) {
      const request: AIChatRequest = {
        model: config.model,
        messages: [...messages],
        temperature: config.temperature,
        maxTokens: config.maxTokens,
        responseFormat: config.responseFormat,
        tools: requestTools,
      };

      let response: AIChatResponse;
      try {
        response = await activeProvider.chat(request);
      } catch (err) {
        const errorMsg =
          err instanceof Error ? err.message : String(err);
        throw new Error(`AI provider error: ${errorMsg}`);
      }

      lastResponse = response;

      // Accumulate usage
      if (response.usage) {
        totalUsage.promptTokens += response.usage.promptTokens;
        totalUsage.completionTokens += response.usage.completionTokens;
        totalUsage.totalTokens += response.usage.totalTokens;
      }

      // If no tool calls, we're done
      if (
        !response.toolCalls ||
        response.toolCalls.length === 0 ||
        !config.tools ||
        config.tools.length === 0
      ) {
        break;
      }

      // Safety: if we've exhausted tool rounds, stop looping
      if (round >= maxRounds) {
        break;
      }

      // Process tool calls
      // Add assistant message with tool calls indication
      messages.push({
        role: "assistant",
        content: response.content || "",
      });

      for (const toolCall of response.toolCalls) {
        // Defensive: skip malformed tool calls (missing name or id)
        if (!toolCall.name || !toolCall.id) {
          const malformedResult = {
            error: `Malformed tool call: missing ${!toolCall.name ? "name" : "id"}`,
          };
          allToolResults.push(malformedResult);
          messages.push({
            role: "tool",
            content: JSON.stringify(malformedResult),
            toolCallId: toolCall.id ?? `malformed-${allToolCalls.length}`,
          });
          continue;
        }

        allToolCalls.push(toolCall);

        // Find the matching tool definition
        const toolDef = config.tools.find((t) => t.name === toolCall.name);
        let toolResult: Record<string, unknown>;

        if (!toolDef) {
          toolResult = {
            error: `Unknown tool: ${toolCall.name}`,
          };
        } else {
          try {
            toolResult = executeToolHandler(toolDef, toolCall, context);
          } catch (err) {
            toolResult = {
              error:
                err instanceof Error
                  ? err.message
                  : String(err),
            };
          }
        }

        allToolResults.push(toolResult);

        // Add tool result message
        messages.push({
          role: "tool",
          content: JSON.stringify(toolResult),
          toolCallId: toolCall.id,
        });
      }

      round++;
    }

    if (!lastResponse) {
      throw new Error("AI execution produced no response");
    }

    return {
      response: lastResponse.content,
      toolCalls: allToolCalls.length > 0 ? allToolCalls : undefined,
      toolResults: allToolResults.length > 0 ? allToolResults : undefined,
      usage: totalUsage.totalTokens > 0 ? totalUsage : undefined,
      model: lastResponse.model,
      finishReason: lastResponse.finishReason,
    };
  }

  /**
   * Streaming execution path. Collects streamed chunks into a final result.
   */
  private async executeStream(
    config: AINodeConfig,
    messages: AIChatMessage[],
    requestTools:
      | Array<{
          name: string;
          description: string;
          parameters: Record<string, unknown>;
        }>
      | undefined,
    context: AIExpressionContext,
    provider: AIProvider,
    maxRounds: number
  ): Promise<AINodeResult> {
    const allToolCalls: AIToolCall[] = [];
    const allToolResults: Record<string, unknown>[] = [];
    let round = 0;
    let finalContent = "";
    let finalFinishReason = "stop";
    let totalUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

    while (true) {
      const request: AIChatRequest = {
        model: config.model,
        messages: [...messages],
        temperature: config.temperature,
        maxTokens: config.maxTokens,
        responseFormat: config.responseFormat,
        tools: requestTools,
      };

      let content = "";
      const roundToolCalls: AIToolCall[] = [];
      let finishReason = "stop";

      try {
        const stream = provider.chatStream!(request);
        for await (const chunk of stream) {
          if (chunk.content) {
            content += chunk.content;
          }
          if (chunk.toolCalls) {
            roundToolCalls.push(...chunk.toolCalls);
          }
          if (chunk.finishReason) {
            finishReason = chunk.finishReason;
          }
        }
      } catch (err) {
        const errorMsg =
          err instanceof Error ? err.message : String(err);
        throw new Error(`AI provider stream error: ${errorMsg}`);
      }

      finalContent = content;
      finalFinishReason = finishReason;

      // If no tool calls, we're done
      if (
        roundToolCalls.length === 0 ||
        !config.tools ||
        config.tools.length === 0
      ) {
        break;
      }

      // Safety: if we've exhausted tool rounds, stop looping
      if (round >= maxRounds) {
        break;
      }

      // Process tool calls
      messages.push({ role: "assistant", content: content || "" });

      for (const toolCall of roundToolCalls) {
        // Defensive: skip malformed tool calls (missing name or id)
        if (!toolCall.name || !toolCall.id) {
          const malformedResult = {
            error: `Malformed tool call: missing ${!toolCall.name ? "name" : "id"}`,
          };
          allToolResults.push(malformedResult);
          messages.push({
            role: "tool",
            content: JSON.stringify(malformedResult),
            toolCallId: toolCall.id ?? `malformed-${allToolCalls.length}`,
          });
          continue;
        }

        allToolCalls.push(toolCall);

        const toolDef = config.tools.find((t) => t.name === toolCall.name);
        let toolResult: Record<string, unknown>;

        if (!toolDef) {
          toolResult = { error: `Unknown tool: ${toolCall.name}` };
        } else {
          try {
            toolResult = executeToolHandler(toolDef, toolCall, context);
          } catch (err) {
            toolResult = {
              error: err instanceof Error ? err.message : String(err),
            };
          }
        }

        allToolResults.push(toolResult);
        messages.push({
          role: "tool",
          content: JSON.stringify(toolResult),
          toolCallId: toolCall.id,
        });
      }

      round++;
    }

    return {
      response: finalContent,
      toolCalls: allToolCalls.length > 0 ? allToolCalls : undefined,
      toolResults: allToolResults.length > 0 ? allToolResults : undefined,
      usage: totalUsage.totalTokens > 0 ? totalUsage : undefined,
      model: config.model,
      finishReason: finalFinishReason,
    };
  }
}
