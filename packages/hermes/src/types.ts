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

/** Confidence lifecycle for memory graduation. */
export type MemoryConfidence = "observed" | "confirmed" | "graduated";

/** Machine-checkable verification for a memory rule. */
export type VerifyCheck = {
  /** Type of check to perform. */
  type: "grep" | "grep-zero" | "file-exists" | "file-missing";
  /** Grep pattern or file glob. */
  pattern: string;
  /** Directory/file scope for grep checks. */
  path?: string;
};

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
  /** Machine-checkable verification rule. If present, swept at session start. */
  verify?: VerifyCheck;
  /** Confidence lifecycle: observed → confirmed → graduated. */
  confidence?: MemoryConfidence;
  /** Number of times this memory has been reinforced by corrections. */
  correctionCount?: number;
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

// ── External Channels ──────────────────────────────────────────

/** Channel type identifiers for external data sources. */
export type ChannelType = "github" | "sentry" | "linear" | "jira" | "competitor" | "local-tasks";

/** Configuration for a single external channel. */
export type ChannelConfigEntry = {
  type: ChannelType;
  enabled: boolean;
  /** Channel-specific settings (org names, project keys, targets, etc.). */
  options: Record<string, unknown>;
  /** Cache TTL in milliseconds. Default: 300_000 (5 min). */
  ttlMs: number;
};

// ── Configuration ───────────────────────────────────────────────

/** Hermes configuration file (.athena/hermes/hermes.yaml). */
export type HermesConfig = {
  maxMemories: number;
  autoExtract: boolean;
  contextLimit: number;
  /** Token budget for context injection (default: 2000). Overrides contextLimit when set. */
  tokenBudget: number;
  /** Operational mode: whisper, full, or off. */
  mode: HermesMode;
  /** Anthropic API key for LLM-powered extraction (optional). */
  anthropicApiKey?: string;
  sources: ExternalSource[];
  /** Agents registered in this project for orchestration. */
  agents: AgentConfig[];
  /** External data channels for live context injection. */
  channels: ChannelConfigEntry[];
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
  tokenBudget: 2000,
  mode: "whisper",
  sources: [],
  agents: [],
  channels: [],
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
