// ── Types ────────────────────────────────────────────────────────
export type {
  Memory,
  MemoryType,
  SessionSummary,
  HermesConfig,
  ExternalSource,
  HookEvent,
  HookInput,
  HookOutput,
} from "./types";
export { DEFAULT_CONFIG } from "./types";

// ── Config ───────────────────────────────────────────────────────
export { getHermesDir, findRepoRoot, loadConfig, saveConfig } from "./config";

// ── Memory Store ─────────────────────────────────────────────────
export {
  memoryId,
  sessionId,
  loadMemories,
  saveMemory,
  deleteMemory,
  createMemory,
  saveSessionSummary,
  searchMemories,
  deduplicateMemories,
  pruneMemories,
} from "./memory-store";

// ── Hooks ────────────────────────────────────────────────────────
export { onSessionStart } from "./hooks/session-start";
export { onStop } from "./hooks/stop";
export { onPreToolUse } from "./hooks/pre-tool-use";
export { onUserPrompt } from "./hooks/user-prompt";
