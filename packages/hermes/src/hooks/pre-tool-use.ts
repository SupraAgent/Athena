import type { Memory, HookOutput } from "../types";
import { loadMemories } from "../memory-store";
import { getHermesDir, findRepoRoot } from "../config";

/** Tools that benefit from architectural context injection. */
const CONTEXT_TOOLS = new Set([
  "Write",
  "Edit",
  "Bash",
  "NotebookEdit",
]);

// ── In-process cache (5-second TTL) ────────────────────────────
let _cachedDecisions: Memory[] | null = null;
let _cachedAt = 0;
let _cachedDir = "";
const CACHE_TTL_MS = 5000;

async function getCachedDecisions(hermesDir: string): Promise<Memory[]> {
  const now = Date.now();
  if (_cachedDecisions && _cachedDir === hermesDir && now - _cachedAt < CACHE_TTL_MS) {
    return _cachedDecisions;
  }
  const memories = await loadMemories(hermesDir);
  _cachedDecisions = memories.filter((m) => m.type === "decision");
  _cachedAt = now;
  _cachedDir = hermesDir;
  return _cachedDecisions;
}

/** Reset the cache (for testing). */
export function _resetCache(): void {
  _cachedDecisions = null;
  _cachedAt = 0;
  _cachedDir = "";
}

/** PreToolUse hook: inject relevant decisions before file-write tools. */
export async function onPreToolUse(
  toolName: string,
  sessionId: string,
  repoRoot?: string
): Promise<HookOutput> {
  // Only inject for tools that modify state
  if (!CONTEXT_TOOLS.has(toolName)) {
    return { context: "" };
  }

  const root = repoRoot ?? findRepoRoot();
  const hermesDir = getHermesDir(root);
  const decisions = await getCachedDecisions(hermesDir);

  if (decisions.length === 0) {
    return { context: "" };
  }

  // Take top 3 most relevant decisions
  const top = [...decisions]
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, 3);

  const lines = [
    "# Hermes — Active Decisions",
    ...top.map((d) => `- ${d.content}`),
  ];

  return { context: lines.join("\n") };
}
