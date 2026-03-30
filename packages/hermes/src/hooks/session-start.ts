import type { Memory, HermesConfig, HookOutput } from "../types";
import { loadMemories, loadAllRemoteMemories } from "../memory-store";
import { loadConfig, getHermesDir, findRepoRoot, resolveMode, getOrCreateThread } from "../config";
import { hashMemories, formatFullBlocks } from "../diff";
import { loadCachedRemoteMemories, isCacheStale, triggerBackgroundRefresh } from "../remote-cache";
import { sanitizeMemories } from "../sanitize";

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

  // Sanitize all memories before injection
  const allMemories = sanitizeMemories([...localMemories, ...remoteMemories]);
  if (allMemories.length === 0) {
    return { context: "" };
  }

  // Rank by relevance and recency, take top N
  const ranked = rankMemories(allMemories, config.contextLimit);

  // Store the hash for future diffing
  const hash = hashMemories(ranked);

  // In whisper mode, only inject decisions and guidance (lightweight)
  if (mode === "whisper") {
    const whisperTypes = new Set(["decision", "guidance", "pending"]);
    const whisperMemories = ranked.filter((m) => whisperTypes.has(m.type));
    if (whisperMemories.length === 0) return { context: "" };

    const lines = [
      "# Hermes",
      `_${whisperMemories.length} active items._`,
      "",
      ...whisperMemories.map((m) => {
        const label = m.type.charAt(0).toUpperCase() + m.type.slice(1);
        return `- **[${label}]** ${m.content}`;
      }),
    ];
    return { context: lines.join("\n") };
  }

  // Full mode — inject all memory blocks
  const context = formatFullBlocks(ranked);
  return { context };
}

/** Rank memories by relevance * recency. */
function rankMemories(memories: Memory[], limit: number): Memory[] {
  const now = Date.now();
  return [...memories]
    .map((m) => {
      const ageMs = now - new Date(m.updatedAt).getTime();
      const ageDays = ageMs / (1000 * 60 * 60 * 24);
      // Decay: halve score every 30 days
      const recencyBoost = Math.pow(0.5, ageDays / 30);
      const score = m.relevance * 0.7 + recencyBoost * 0.3;
      return { memory: m, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.memory);
}
