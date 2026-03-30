// ── Types ────────────────────────────────────────────────────────
export type {
  Memory,
  MemoryType,
  MemoryScope,
  SessionSummary,
  HermesConfig,
  HermesMode,
  ExternalSource,
  AgentSchedule,
  AgentConfig,
  HookEvent,
  HookInput,
  HookOutput,
  ConversationMap,
  ConversationThread,
  SyncState,
} from "./types";
export { DEFAULT_CONFIG, MEMORY_BLOCK_LABELS } from "./types";

// ── Config ───────────────────────────────────────────────────────
export {
  getHermesDir,
  findRepoRoot,
  loadConfig,
  saveConfig,
  resolveMode,
  resolveAnthropicKey,
  loadConversations,
  saveConversations,
  getOrCreateThread,
  updateThreadInjection,
  loadSyncState,
  saveSyncState,
} from "./config";

// ── Memory Store ─────────────────────────────────────────────────
export {
  memoryId,
  sessionId,
  loadMemories,
  loadMemoriesByScope,
  saveMemory,
  updateMemory,
  deleteMemory,
  createMemory,
  saveSessionSummary,
  searchMemories,
  deduplicateMemories,
  pruneMemories,
  loadRemoteMemories,
  loadAllRemoteMemories,
} from "./memory-store";

// ── LLM Extraction ──────────────────────────────────────────────
export {
  extractWithLLM,
  extractWithHeuristics,
  extractMemories,
  summarizeToolCalls,
} from "./llm-extract";
export type { ExtractedMemory, ExtractionResult } from "./llm-extract";

// ── Memory Diffing ──────────────────────────────────────────────
export {
  hashMemories,
  diffMemories,
  formatDiffBlock,
  formatFullBlocks,
} from "./diff";
export type { BlockDiff } from "./diff";

// ── Semantic Search ─────────────────────────────────────────────
export {
  buildIndex,
  semanticSearch,
  findSimilar,
} from "./semantic";
export type { SemanticIndex } from "./semantic";

// ── Memory Consolidation ────────────────────────────────────────
export {
  consolidateHeuristic,
  consolidateWithLLM,
  consolidateMemories,
} from "./consolidate";
export type { ConsolidationResult, ConflictPair } from "./consolidate";

// ── Remote Cache ────────────────────────────────────────────────
export {
  loadCachedRemoteMemories,
  saveCachedRemoteMemories,
  isCacheStale,
  triggerBackgroundRefresh,
} from "./remote-cache";

// ── Git-Aware Aging ─────────────────────────────────────────────
export { ageMemories } from "./git-aging";
export type { AgingResult } from "./git-aging";

// ── Content Sanitization ────────────────────────────────────────
export { sanitizeContent, sanitizeMemories } from "./sanitize";

// ── Mem0 Smart Consolidation Pipeline ───────────────────────────
export {
  smartConsolidate,
  smartConsolidateHeuristic,
  smartConsolidateLLM,
} from "./mem0-pipeline";
export type {
  Mem0Action,
  Mem0Decision,
  Mem0PipelineResult,
} from "./mem0-pipeline";

// ── Session Observability ───────────────────────────────────────
export {
  startTrace,
  getActiveTrace,
  startSpan,
  endSpan,
  withSpan,
  flushTrace,
  loadTrace,
  listTraces,
} from "./observability";
export type { Span, SpanKind, SessionTrace } from "./observability";

// ── Vector Store Adapter ───────────────────────────────────────
export { createVectorStore } from "./vector-store";
export type { VectorStore, VectorSearchResult } from "./vector-store";

// ── Structured Event Log ───────────────────────────────────────
export {
  logEvent,
  readLog,
  listLogDates,
  queryEvents,
  pruneOldLogs,
} from "./event-log";
export type { EventType, LogEvent } from "./event-log";

// ── Checkpointed Execution ─────────────────────────────────────
export {
  createWorkflow,
  loadWorkflow,
  saveCheckpoint,
  executeStep,
  findResumePoint,
  listWorkflows,
} from "./checkpoint";
export type {
  Checkpoint,
  CheckpointStatus,
  WorkflowState,
} from "./checkpoint";

// ── Hooks ────────────────────────────────────────────────────────
export { onSessionStart } from "./hooks/session-start";
export { onStop } from "./hooks/stop";
export { onPreToolUse } from "./hooks/pre-tool-use";
export { onUserPrompt } from "./hooks/user-prompt";
