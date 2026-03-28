/** Memory types supported by Hermes. */
export type MemoryType = "fact" | "decision" | "session-summary";

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
  /** Relevance score 0–1 for retrieval ranking. */
  relevance: number;
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

/** External memory source (cross-repo relay). */
export type ExternalSource = {
  repo: string;
  branch: string;
  path: string;
};

/** Hermes configuration file (.athena/hermes/hermes.yaml). */
export type HermesConfig = {
  maxMemories: number;
  autoExtract: boolean;
  contextLimit: number;
  sources: ExternalSource[];
};

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
};

/** Output returned from hooks to Claude Code via stdout. */
export type HookOutput = {
  /** Context to inject into the conversation. Empty string = no injection. */
  context: string;
  /** Memories that were persisted (for stop hook). */
  memoriesSaved?: number;
};

/** Default configuration values. */
export const DEFAULT_CONFIG: HermesConfig = {
  maxMemories: 200,
  autoExtract: true,
  contextLimit: 10,
  sources: [],
};
