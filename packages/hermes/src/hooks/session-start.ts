import type { Memory, HermesConfig, HookOutput } from "../types";
import { loadMemories, loadAllRemoteMemories } from "../memory-store";
import { loadConfig, getHermesDir, findRepoRoot, resolveMode, getOrCreateThread } from "../config";
import { hashMemories, formatFullBlocks } from "../diff";
import { loadCachedRemoteMemories, isCacheStale, triggerBackgroundRefresh } from "../remote-cache";
import { loadCachedChannelMemories, isChannelCacheStale, triggerChannelRefresh } from "../channels/manager";
import { sanitizeMemories } from "../sanitize";
import { getBranchFiles, branchBoost } from "../git-aging";
import { runVerificationSweep, formatSweepResults } from "../verification";

/** SessionStart hook: load and rank memories, initialize thread, return context. */
export async function onSessionStart(
  sessionId: string,
  repoRoot?: string
): Promise<HookOutput> {
  const root = repoRoot ?? findRepoRoot();
  const hermesDir = getHermesDir(root);
  const config = await loadConfig(hermesDir);
  const mode = resolveMode(config);

  // Off mode — do nothing
  if (mode === "off") {
    return { context: "" };
  }

  // Initialize or resume conversation thread
  await getOrCreateThread(hermesDir, sessionId);

  // Load all memories and filter out session-scoped memories from other sessions
  const localMemories = (await loadMemories(hermesDir)).filter(
    (m) => m.scope !== "session" || m.source === sessionId
  );

  // Load remote memories from cache (never blocks on network)
  let remoteMemories: Memory[] = [];
  if (config.sources.length > 0) {
    remoteMemories = await loadCachedRemoteMemories(hermesDir, config.sources);
    // Trigger background refresh if cache is stale
    if (await isCacheStale(hermesDir, config.sources)) {
      triggerBackgroundRefresh(hermesDir, config.sources);
    }
  }

  // Load channel data from cache (never blocks on network)
  let channelMemories: Memory[] = [];
  if (config.channels && config.channels.length > 0) {
    channelMemories = await loadCachedChannelMemories(hermesDir, config.channels, sessionId);
    if (await isChannelCacheStale(hermesDir, config.channels)) {
      triggerChannelRefresh(hermesDir, config.channels);
    }
  }

  // Sanitize all memories before injection
  const allMemories = sanitizeMemories([...localMemories, ...remoteMemories, ...channelMemories]);
  if (allMemories.length === 0) {
    return { context: "" };
  }

  // Run verification sweep on memories with verify checks
  const sweepResult = await runVerificationSweep(allMemories, root, hermesDir, sessionId);
  const violationBlock = formatSweepResults(sweepResult);

  // Get branch context for relevance boosting
  const branchFiles = getBranchFiles(root);

  // Rank by relevance and recency, respecting token budget
  const ranked = rankMemories(allMemories, config.contextLimit, config.tokenBudget, branchFiles);

  // Store the hash for future diffing
  const hash = hashMemories(ranked);

  // In whisper mode, only inject decisions and guidance (lightweight)
  if (mode === "whisper") {
    const whisperTypes = new Set(["decision", "guidance", "pending"]);
    const whisperMemories = ranked.filter((m) => whisperTypes.has(m.type));
    if (whisperMemories.length === 0) {
      return { context: violationBlock };
    }

    const lines = [
      "# Hermes",
      `_${whisperMemories.length} active items._`,
      "",
      ...whisperMemories.map((m) => {
        const label = m.type.charAt(0).toUpperCase() + m.type.slice(1);
        return `- **[${label}]** ${m.content}`;
      }),
    ];
    // Prepend violations if any
    const memoryContext = lines.join("\n");
    return { context: violationBlock ? violationBlock + "\n\n" + memoryContext : memoryContext };
  }

  // Full mode — inject all memory blocks
  const context = formatFullBlocks(ranked);
  return { context: violationBlock ? violationBlock + "\n\n" + context : context };
}

/** Estimate token count for a string (~3.5 chars per token). */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

/** Rank memories by relevance * recency * branch context, respecting token budget. */
function rankMemories(memories: Memory[], limit: number, tokenBudget = 2000, branchFiles: string[] = []): Memory[] {
  const now = Date.now();
  const scored = [...memories]
    .map((m) => {
      const ageMs = now - new Date(m.updatedAt).getTime();
      const ageDays = ageMs / (1000 * 60 * 60 * 24);
      const recencyBoost = Math.pow(0.5, ageDays / 30);
      const branchScore = branchBoost(m, branchFiles);
      // Weights: 60% relevance, 25% recency, 15% branch context (branchScore is 0-0.2)
      const score = m.relevance * 0.6 + recencyBoost * 0.25 + branchScore * 0.75;
      return { memory: m, score };
    })
    .sort((a, b) => b.score - a.score);

  // Greedily select memories until token budget or count limit is exhausted
  const selected: Memory[] = [];
  let tokensUsed = 0;
  for (const { memory } of scored) {
    if (selected.length >= limit) break;
    const tokens = estimateTokens(memory.content);
    if (tokensUsed + tokens > tokenBudget && selected.length > 0) break;
    selected.push(memory);
    tokensUsed += tokens;
  }
  return selected;
}
