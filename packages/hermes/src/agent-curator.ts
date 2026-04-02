/**
 * Agentic Memory Curator — uses Anthropic tool_use API to let an LLM
 * autonomously decide what to add, update, and delete from memory.
 *
 * Replaces the two-step extract+consolidate pipeline with a single
 * agentic loop where the model sees the transcript AND existing memories,
 * then uses tools to curate directly.
 */

import type { Memory, MemoryType, MemoryScope } from "./types";
import { loadMemories, createMemory, updateMemory, deleteMemory } from "./memory-store";
import { sanitizeContent } from "./sanitize";
import { truncateTranscript, summarizeToolCalls } from "./llm-extract";

// ── Constants ────────────────────────────────────────────────────

const MODEL = "claude-haiku-4-5-20251001";
const MAX_TOKENS = 1024;
const MAX_TURNS = 3;
const MAX_TOOL_CALLS_PER_TURN = 15;
const MAX_EXISTING_MEMORIES = 50;
const API_URL = "https://api.anthropic.com/v1/messages";

const VALID_MEMORY_TYPES = new Set<string>([
  "fact", "decision", "preference", "project-context",
  "pattern", "pending", "guidance",
]);

// ── Tool Definitions ─────────────────────────────────────────────

const CURATOR_TOOLS = [
  {
    name: "add_memory",
    description: "Add a new memory. Use when you've identified important information not already captured in existing memories.",
    input_schema: {
      type: "object" as const,
      properties: {
        type: {
          type: "string",
          enum: ["fact", "decision", "preference", "project-context", "pattern", "pending", "guidance"],
          description: "Memory category",
        },
        content: {
          type: "string",
          description: "Concise memory content (under 200 chars). Single sentence capturing the key insight.",
        },
        relevance: {
          type: "number",
          description: "Relevance score 0.0-1.0. Decisions/preferences: 0.8-1.0, facts: 0.5-0.8, pending: 0.6-0.7.",
        },
      },
      required: ["type", "content", "relevance"],
    },
  },
  {
    name: "update_memory",
    description: "Update an existing memory with newer or more complete information. Use when a memory is partially correct but needs revision.",
    input_schema: {
      type: "object" as const,
      properties: {
        memory_id: {
          type: "string",
          description: "ID of the existing memory to update (from the list provided)",
        },
        content: {
          type: "string",
          description: "Updated content replacing the old memory content",
        },
        relevance: {
          type: "number",
          description: "Updated relevance score (optional)",
        },
      },
      required: ["memory_id", "content"],
    },
  },
  {
    name: "delete_memory",
    description: "Delete a memory that is outdated, wrong, or superseded by information in this session.",
    input_schema: {
      type: "object" as const,
      properties: {
        memory_id: {
          type: "string",
          description: "ID of the memory to delete",
        },
        reason: {
          type: "string",
          description: "Brief reason for deletion",
        },
      },
      required: ["memory_id", "reason"],
    },
  },
  {
    name: "session_summary",
    description: "Record the session summary, files touched, and unfinished work. Call this exactly once at the end.",
    input_schema: {
      type: "object" as const,
      properties: {
        summary: {
          type: "string",
          description: "1-2 sentence summary of what happened in this session",
        },
        files_touched: {
          type: "array",
          items: { type: "string" },
          description: "File paths that were created, modified, or deleted",
        },
        unfinished: {
          type: "array",
          items: { type: "string" },
          description: "Unfinished work or TODOs for follow-up",
        },
      },
      required: ["summary"],
    },
  },
];

// ── System Prompt ────────────────────────────────────────────────

function buildSystemPrompt(existingMemories: Memory[]): string {
  const memoryLines = existingMemories.length > 0
    ? existingMemories.map((m) => `  [${m.id}] [${m.type}] ${m.content}`).join("\n")
    : "  (none)";

  return `You are a memory curator for a developer's AI coding assistant. Your job is to analyze a coding session transcript and decide what to remember for future sessions.

You have access to the developer's existing memories and the session transcript. Your tasks:

1. Identify important new information from the transcript (facts, decisions, preferences, patterns, pending work, guidance)
2. Check if any existing memories should be UPDATED with newer information
3. Check if any existing memories are now OUTDATED or CONTRADICTED and should be DELETED
4. Record a brief session summary by calling session_summary once

Rules:
- Add 3-10 new memories total, prioritizing high-value information
- Each memory should be a single, concise sentence (under 200 chars)
- Prefer updating existing memories over adding near-duplicates
- Delete memories that are clearly wrong or superseded
- Focus on what would help a NEW coding session — skip trivial observations
- Always call session_summary exactly once

Existing memories:
${memoryLines}`;
}

// ── Result Type ──────────────────────────────────────────────────

export type CurationResult = {
  added: number;
  updated: number;
  deleted: number;
  summary: string;
  filesTouched: string[];
  unfinished: string[];
  method: "agent" | "llm" | "heuristic";
  toolCallCount: number;
  turns: number;
};

// ── API Types ────────────────────────────────────────────────────

type MessageRole = "user" | "assistant";

type TextBlock = { type: "text"; text: string };
type ToolUseBlock = { type: "tool_use"; id: string; name: string; input: Record<string, unknown> };
type ToolResultBlock = { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };

type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock;
type Message = { role: MessageRole; content: string | ContentBlock[] };

type ApiResponse = {
  content: ContentBlock[];
  stop_reason: "end_turn" | "tool_use" | "max_tokens" | string;
};

// ── Tool Handlers ────────────────────────────────────────────────

type ToolContext = {
  hermesDir: string;
  sessionId: string;
  scope: MemoryScope;
  validIds: Set<string>;
  stats: { added: number; updated: number; deleted: number };
  sessionSummary: { summary: string; filesTouched: string[]; unfinished: string[] };
};

async function handleToolCall(
  tool: ToolUseBlock,
  ctx: ToolContext
): Promise<ToolResultBlock> {
  const result = (content: string, isError = false): ToolResultBlock => ({
    type: "tool_result",
    tool_use_id: tool.id,
    content,
    ...(isError ? { is_error: true } : {}),
  });

  try {
    switch (tool.name) {
      case "add_memory": {
        const { type, content, relevance } = tool.input as {
          type: string; content: string; relevance: number;
        };
        if (!VALID_MEMORY_TYPES.has(type)) {
          return result(`Invalid memory type: ${type}`, true);
        }
        const sanitized = sanitizeContent(String(content)).slice(0, 300);
        if (sanitized.length < 5) {
          return result("Content too short (min 5 chars)", true);
        }
        const rel = Math.max(0, Math.min(1, Number(relevance) || 0.7));
        const mem = await createMemory(
          ctx.hermesDir, type as MemoryType, sanitized, [], ctx.sessionId, rel, ctx.scope
        );
        ctx.validIds.add(mem.id);
        ctx.stats.added++;
        return result(`Added memory ${mem.id}: "${sanitized}"`);
      }

      case "update_memory": {
        const { memory_id, content, relevance } = tool.input as {
          memory_id: string; content: string; relevance?: number;
        };
        if (!ctx.validIds.has(memory_id)) {
          return result(`Unknown memory ID: ${memory_id}. Use an ID from the existing memories list.`, true);
        }
        const sanitized = sanitizeContent(String(content)).slice(0, 300);
        const updates: Parameters<typeof updateMemory>[2] = { content: sanitized };
        if (relevance !== undefined) {
          updates.relevance = Math.max(0, Math.min(1, Number(relevance)));
        }
        const updated = await updateMemory(ctx.hermesDir, memory_id, updates);
        if (!updated) {
          return result(`Failed to update memory ${memory_id}`, true);
        }
        ctx.stats.updated++;
        return result(`Updated memory ${memory_id}: "${sanitized}"`);
      }

      case "delete_memory": {
        const { memory_id, reason } = tool.input as {
          memory_id: string; reason: string;
        };
        if (!ctx.validIds.has(memory_id)) {
          return result(`Unknown memory ID: ${memory_id}. Use an ID from the existing memories list.`, true);
        }
        const deleted = await deleteMemory(ctx.hermesDir, memory_id);
        if (!deleted) {
          return result(`Failed to delete memory ${memory_id}`, true);
        }
        ctx.validIds.delete(memory_id);
        ctx.stats.deleted++;
        return result(`Deleted memory ${memory_id}: ${reason}`);
      }

      case "session_summary": {
        const { summary, files_touched, unfinished } = tool.input as {
          summary: string; files_touched?: string[]; unfinished?: string[];
        };
        ctx.sessionSummary = {
          summary: String(summary).slice(0, 500),
          filesTouched: Array.isArray(files_touched) ? files_touched.map(String).slice(0, 30) : [],
          unfinished: Array.isArray(unfinished) ? unfinished.map(String).slice(0, 10) : [],
        };
        return result("Session summary recorded.");
      }

      default:
        return result(`Unknown tool: ${tool.name}`, true);
    }
  } catch (err: unknown) {
    return result(`Error: ${err instanceof Error ? err.message : String(err)}`, true);
  }
}

// ── Agentic Loop ─────────────────────────────────────────────────

/**
 * Run the agentic memory curator. Sends transcript + existing memories
 * to Haiku with tool_use, then loops until the model stops or max turns.
 */
export async function agentCurateMemories(
  hermesDir: string,
  transcript: string,
  sessionId: string,
  apiKey: string,
  scope: MemoryScope = "user"
): Promise<CurationResult> {
  // Load existing memories for context
  const existingMemories = (await loadMemories(hermesDir))
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, MAX_EXISTING_MEMORIES);

  const validIds = new Set(existingMemories.map((m) => m.id));

  const ctx: ToolContext = {
    hermesDir,
    sessionId,
    scope,
    validIds,
    stats: { added: 0, updated: 0, deleted: 0 },
    sessionSummary: { summary: "Session completed.", filesTouched: [], unfinished: [] },
  };

  // Prepare transcript
  const truncated = truncateTranscript(summarizeToolCalls(transcript));

  // Build messages
  const systemPrompt = buildSystemPrompt(existingMemories);
  const messages: Message[] = [
    { role: "user", content: `Here is the coding session transcript to analyze:\n\n<transcript>\n${truncated}\n</transcript>` },
  ];

  let totalToolCalls = 0;

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await callApi(apiKey, systemPrompt, messages);

    // Collect tool_use blocks from response
    const toolUses = response.content.filter(
      (b): b is ToolUseBlock => b.type === "tool_use"
    );

    // If no tool calls or end_turn, we're done
    if (toolUses.length === 0 || response.stop_reason === "end_turn") {
      return buildResult(ctx, totalToolCalls, turn + 1);
    }

    // Cap tool calls per turn
    const cappedTools = toolUses.slice(0, MAX_TOOL_CALLS_PER_TURN);
    totalToolCalls += cappedTools.length;

    // Execute tool calls
    const toolResults: ToolResultBlock[] = [];
    for (const toolUse of cappedTools) {
      const result = await handleToolCall(toolUse, ctx);
      toolResults.push(result);
    }

    // Append assistant response + tool results to message history
    messages.push({ role: "assistant", content: response.content });
    messages.push({ role: "user", content: toolResults });
  }

  // Max turns reached — return what we have
  return buildResult(ctx, totalToolCalls, MAX_TURNS);
}

// ── API Call ─────────────────────────────────────────────────────

async function callApi(
  apiKey: string,
  system: string,
  messages: Message[]
): Promise<ApiResponse> {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system,
      tools: CURATOR_TOOLS,
      messages,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Anthropic API error ${response.status}: ${text.slice(0, 200)}`);
  }

  return response.json() as Promise<ApiResponse>;
}

// ── Result Builder ───────────────────────────────────────────────

function buildResult(ctx: ToolContext, toolCallCount: number, turns: number): CurationResult {
  return {
    added: ctx.stats.added,
    updated: ctx.stats.updated,
    deleted: ctx.stats.deleted,
    summary: ctx.sessionSummary.summary,
    filesTouched: ctx.sessionSummary.filesTouched,
    unfinished: ctx.sessionSummary.unfinished,
    method: "agent",
    toolCallCount,
    turns,
  };
}
