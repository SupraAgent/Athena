// ── Memory Types ────────────────────────────────────────────────

/** Memory categories — structured blocks inspired by claude-subconscious. */
export type MemoryType =
  | "fact"
  | "decision"
  | "preference"
  | "project-context"
  | "pattern"
  | "pending"
  | "guidance"
  | "session-summary"
  | "agent-heartbeat";

/** Memory scope — controls visibility and lifecycle. */
export type MemoryScope = "user" | "agent" | "session";

/** A single memory entry. */
export type Memory = {
  id: string;
  type: MemoryType;
  content: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  /** Session ID that created/last modified this memory. */
  source: string;
  /** Relevance score 0-1 for retrieval ranking. */
  relevance: number;
  /** Scope: user (persistent), agent (namespaced), session (auto-pruned). */
  scope: MemoryScope;
};

/** Session summary stored at session end. */
export type SessionSummary = {
  sessionId: string;
  startedAt: string;
  endedAt: string;
  summary: string;
  filesTouched: string[];
  decisionsMade: string[];
  unfinished: string[];
};

// ── Operational Modes ───────────────────────────────────────────

/** Injection mode: whisper (messages only), full (blocks + diffs), off. */
export type HermesMode = "whisper" | "full" | "off";

// ── Conversation Threading ──────────────────────────────────────

/** Maps Claude Code session IDs to Hermes conversation threads. */
export type ConversationMap = Record<string, ConversationThread>;

/** A persistent conversation thread across sessions. */
export type ConversationThread = {
  threadId: string;
  sessionIds: string[];
  createdAt: string;
  lastActiveAt: string;
  /** Snapshot of memory IDs injected last time (for diffing). */
  lastInjectedMemoryIds: string[];
  /** Hash of last injected content (for diffing). */
  lastInjectedHash: string;
};

// ── Sync State (for memory diffing) ────────────────────────────

/** Per-session state tracking what was last injected. */
export type SyncState = {
  sessionId: string;
  lastInjectedAt: string;
  lastMemoryHash: string;
  lastMemoryIds: string[];
  injectionCount: number;
};

// ── External Sources ────────────────────────────────────────────

/** External memory source (cross-repo relay). */
export type ExternalSource = {
  repo: string;
  branch: string;
  path: string;
};

// ── Agent Orchestration ─────────────────────────────────────────

/** Agent schedule tracking for orchestration. */
export type AgentSchedule = {
  agentId: string;
  heartbeatMinutes: number;
  lastCheckin: string;
  nextCheckin: string;
  budgetUsed: number;
  budgetLimit: number;
};

/** Agent definition for cross-project orchestration. */
export type AgentConfig = {
  id: string;
  name: string;
  role: string;
  heartbeatMinutes: number;
  monthlyBudgetUsd: number;
  reportsTo: string | null;
  triggers: string[];
};

// ── Configuration ───────────────────────────────────────────────

/** Hermes configuration file (.athena/hermes/hermes.yaml). */
export type HermesConfig = {
  maxMemories: number;
  autoExtract: boolean;
  contextLimit: number;
  /** Operational mode: whisper, full, or off. */
  mode: HermesMode;
  /** Anthropic API key for LLM-powered extraction (optional). */
  anthropicApiKey?: string;
  sources: ExternalSource[];
  /** Agents registered in this project for orchestration. */
  agents: AgentConfig[];
};

// ── Hooks ───────────────────────────────────────────────────────

/** Claude Code hook lifecycle event names. */
export type HookEvent =
  | "session-start"
  | "stop"
  | "pre-tool-use"
  | "user-prompt";

/** Input passed to hooks via stdin from Claude Code. */
export type HookInput = {
  event: HookEvent;
  sessionId: string;
  /** For user-prompt: the user's message. */
  prompt?: string;
  /** For pre-tool-use: the tool name. */
  toolName?: string;
  /** For stop: session transcript summary. */
  transcript?: string;
  /** For stop: when the session started (ISO timestamp). */
  startedAt?: string;
};

/** Output returned from hooks to Claude Code via stdout. */
export type HookOutput = {
  /** Context to inject into the conversation. Empty string = no injection. */
  context: string;
  /** Memories that were persisted (for stop hook). */
  memoriesSaved?: number;
};

// ── Defaults ────────────────────────────────────────────────────

/** Default configuration values. */
export const DEFAULT_CONFIG: HermesConfig = {
  maxMemories: 200,
  autoExtract: true,
  contextLimit: 10,
  mode: "whisper",
  sources: [],
  agents: [],
};

/** Human-readable labels for memory block types. */
export const MEMORY_BLOCK_LABELS: Record<MemoryType, string> = {
  fact: "Facts",
  decision: "Decisions",
  preference: "Preferences",
  "project-context": "Project Context",
  pattern: "Patterns",
  pending: "Pending Items",
  guidance: "Guidance",
  "session-summary": "Session Summaries",
  "agent-heartbeat": "Agent Heartbeats",
};
