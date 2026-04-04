// ── Types ────────────────────────────────────────────────────────
export type {
  Memory,
  MemoryType,
  MemoryScope,
  MemoryConfidence,
  VerifyCheck,
  SessionSummary,
  HermesConfig,
  HermesMode,
  ResearchConfig,
  ExternalSource,
  AgentSchedule,
  AgentConfig,
  ChannelType,
  ChannelConfigEntry,
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
  truncateTranscript,
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
  bm25Score,
} from "./semantic";
export type { SemanticIndex } from "./semantic";

// ── Query Expansion (Synonyms) ──────────────────────────────────
export { expandQuery } from "./synonyms";

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
export { ageMemories, getCurrentBranch, getBranchFiles, branchBoost } from "./git-aging";
export type { AgingResult } from "./git-aging";

// ── Encryption at Rest ─────────────────────────────────────────
export {
  deriveKey,
  encryptContent,
  decryptContent,
  isEncrypted,
  getOrCreateSalt,
  resolveEncryptionKey,
} from "./encryption";

// ── Memory Version History ─────────────────────────────────────
export {
  versionMemory,
  getMemoryHistory,
  getVersion,
} from "./versioning";
export type { MemoryVersion } from "./versioning";

// ── Content Sanitization ────────────────────────────────────────
export {
  sanitizeContent,
  sanitizeMemories,
  shannonEntropy,
  detectBase64Injection,
  stripZeroWidthChars,
  normalizeHomoglyphs,
} from "./sanitize";

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

// ── Embedding Cache ──────────────────────────────────────────
export {
  cacheKey,
  loadEmbeddingCache,
  saveEmbeddingCache,
  pruneStaleEntries,
  cosineSimilarity as embeddingCosineSimilarity,
} from "./embedding-cache";
export type { EmbeddingCacheEntry, EmbeddingCacheData } from "./embedding-cache";

// ── Init (one-command setup) ──────────────────────────────────
export { initHermes, registerHooks } from "./init";
export type { InitOptions, InitResult } from "./init";

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

// ── Bidirectional Relay Sync ──────────────────────────────────
export {
  detectConflicts,
  resolveConflict,
  pullRemoteMemories,
  pushLocalMemories,
  syncBidirectional,
  loadRelayManifest,
  saveRelayManifest,
} from "./relay-sync";
export type {
  RelayConflict,
  RelaySyncResult,
  RelayManifest,
} from "./relay-sync";

// ── Access Control ────────────────────────────────────────────
export {
  loadPolicy,
  savePolicy,
  defaultPolicy,
  checkAccess,
  filterAccessible,
  resolvePrincipal,
} from "./access-control";
export type {
  AccessLevel,
  AccessRule,
  AccessPolicy,
} from "./access-control";

// ── Feedback Loop ─────────────────────────────────────────────
export {
  recordFeedback,
  loadFeedbackSignals,
  computeScores,
  getMemoryScore,
  applyFeedbackToRelevance,
  getFeedbackSummary,
  detectImplicitFeedback,
} from "./feedback-loop";
export type {
  FeedbackSignal,
  FeedbackScore,
  FeedbackSummary,
} from "./feedback-loop";

// ── Metrics Aggregation ───────────────────────────────────────
export {
  collectMemoryMetrics,
  collectSessionMetrics,
  collectEventMetrics,
  aggregate,
  buildTimeSeries,
  getDashboardMetrics,
  captureSnapshot,
  loadSnapshot,
  listSnapshots,
} from "./metrics";
export type {
  MetricPoint,
  MetricSeries,
  MetricsSnapshot,
  DashboardMetrics,
} from "./metrics";

// ── Cross-Repo Discovery ──────────────────────────────────────
export {
  loadManifest,
  saveManifest,
  initManifest,
  scanSiblingRepos,
  discoverAndRegister,
  isPeerActive,
  filterActivePeers,
} from "./discovery";
export type {
  DiscoveryManifest,
  DiscoveryCapability,
  DiscoveryScanResult,
} from "./discovery";

// ── Verification Sweep ────────────────────────────────────────
export {
  runVerificationSweep,
  formatSweepResults,
  inferVerifyCheck,
} from "./verification";
export type { VerifyResult, SweepResult } from "./verification";

// ── Session Scoring ──────────────────────────────────────────
export {
  saveScorecard,
  loadScorecards,
  analyzeTrend,
  formatTrend,
} from "./session-scoring";
export type { SessionScorecard, SessionTrend } from "./session-scoring";

// ── Rule Graduation ──────────────────────────────────────────
export {
  findGraduationCandidates,
  graduateMemory,
  rejectGraduation,
  loadGraduationLog,
  formatCandidates,
} from "./graduation";
export type { GraduationCandidate, GraduationResult } from "./graduation";

// ── JSON Extraction ───────────────────────────────────────────
export { extractBalancedJson } from "./json-extract";

// ── External Channels ────────────────────────────────────────
export {
  GitHubChannel,
  SentryChannel,
  LinearChannel,
  JiraChannel,
  CompetitorChannel,
  LocalTasksChannel,
  getDefaultRegistry,
  checkAll as checkAllChannels,
  fetchAll as fetchAllChannels,
  candidateToMemory,
  loadCachedChannelMemories,
  isChannelCacheStale,
  triggerChannelRefresh,
} from "./channels";
export type {
  ChannelStatus,
  ChannelConfig,
  ChannelMemoryCandidate,
  ChannelFetchResult,
  ChannelCacheEntry,
  ChannelCacheFile,
  ExternalChannel,
} from "./channels";

// ── Global Cross-Project Memory ──────────────────────────────────
export {
  getGlobalHermesDir,
  ensureGlobalDir,
  loadGlobalMemories,
  saveGlobalMemory,
  createGlobalMemory,
  deleteGlobalMemory,
  promoteToGlobal,
  mergeGlobalWithLocal,
  getGlobalStatus,
  loadGlobalConfig,
  saveGlobalConfig,
} from "./global-store";
export type { GlobalStatus } from "./global-store";
export type { GlobalHermesConfig, GlobalSectionConfig } from "./types";

// ── Agentic Memory Curator ───────────────────────────────────────
export { agentCurateMemories } from "./agent-curator";
export type { CurationResult } from "./agent-curator";

// ── Hooks ────────────────────────────────────────────────────────
export { onSessionStart } from "./hooks/session-start";
export { onStop } from "./hooks/stop";
export { onPreToolUse } from "./hooks/pre-tool-use";
export { onUserPrompt } from "./hooks/user-prompt";

// ── AutoResearch — Self-Improving Agent Loop ───────────────────
export {
  computeEffectiveness,
  compareScores,
  loadResearchLog,
  saveResearchLog,
  createExperiment,
  recordSessionObservation,
  completeExperiment,
  updateBaseline,
  getActiveExperiment,
  generateHypotheses,
  generateHypothesesHeuristic,
  prioritizeHypotheses,
  onSessionComplete as onResearchSessionComplete,
  applyExperiment,
  revertExperiment,
  formatResearchStatus,
  formatExperimentHistory,
  formatEffectivenessTrend,
  generateFullReport,
  DEFAULT_RESEARCH_CONFIG,
} from "./autoresearch";
export type {
  EffectivenessScore,
  ScoreComparison,
  MemoryDelta,
  Hypothesis,
  Experiment,
  ResearchLog,
  ResearchEventType,
  LoopResult,
} from "./autoresearch";
