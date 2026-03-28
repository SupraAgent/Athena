import type { Memory, HermesConfig, HookOutput } from "../types";
import { loadMemories, searchMemories } from "../memory-store";
import { loadConfig, getHermesDir, findRepoRoot } from "../config";

/** Format memories into a markdown context block for Claude Code. */
function formatContextBlock(memories: Memory[]): string {
  if (memories.length === 0) return "";

  const lines = [
    "# Hermes — Persistent Memory",
    `_${memories.length} relevant memories loaded._`,
    "",
  ];

  const grouped: Record<string, Memory[]> = {};
  for (const m of memories) {
    (grouped[m.type] ??= []).push(m);
  }

  for (const [type, mems] of Object.entries(grouped)) {
    lines.push(`## ${type.charAt(0).toUpperCase() + type.slice(1)}s`);
    for (const m of mems) {
      const tags = m.tags.length > 0 ? ` [${m.tags.join(", ")}]` : "";
      lines.push(`- ${m.content}${tags}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/** SessionStart hook: load and rank memories, return context for injection. */
export async function onSessionStart(
  sessionId: string,
  repoRoot?: string
): Promise<HookOutput> {
  const root = repoRoot ?? await findRepoRoot();
  const hermesDir = getHermesDir(root);
  const config = await loadConfig(hermesDir);

  const allMemories = await loadMemories(hermesDir);
  if (allMemories.length === 0) {
    return { context: "" };
  }

  // Rank by relevance and recency, take top N
  const ranked = rankMemories(allMemories, config.contextLimit);
  const context = formatContextBlock(ranked);
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
