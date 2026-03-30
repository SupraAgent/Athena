import type { Memory, HookOutput } from "../types";
import { loadMemories } from "../memory-store";
import { getHermesDir, findRepoRoot, loadConfig, resolveMode } from "../config";
import { sanitizeMemories } from "../sanitize";

/** Tools that benefit from architectural context injection. */
const CONTEXT_TOOLS = new Set([
  "Write",
  "Edit",
  "Bash",
  "NotebookEdit",
]);

// ── In-process cache (5-second TTL) ────────────────────────────
let _cachedMemories: Memory[] | null = null;
let _cachedAt = 0;
let _cachedDir = "";
const CACHE_TTL_MS = 5000;

async function getCachedMemories(hermesDir: string): Promise<Memory[]> {
  const now = Date.now();
  if (_cachedMemories && _cachedDir === hermesDir && now - _cachedAt < CACHE_TTL_MS) {
    return _cachedMemories;
  }
  _cachedMemories = await loadMemories(hermesDir);
  _cachedAt = now;
  _cachedDir = hermesDir;
  return _cachedMemories;
}

/** Reset the cache (for testing). */
export function _resetCache(): void {
  _cachedMemories = null;
  _cachedAt = 0;
  _cachedDir = "";
}

/** PreToolUse hook: inject relevant decisions and guidance before file-write tools. */
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
  const config = await loadConfig(hermesDir);
  const mode = resolveMode(config);

  if (mode === "off") {
    return { context: "" };
  }

  const memories = await getCachedMemories(hermesDir);

  // Inject decisions, guidance, and active pending items
  const relevant = memories.filter(
    (m) => m.type === "decision" || m.type === "guidance" || m.type === "pending"
  );

  if (relevant.length === 0) {
    return { context: "" };
  }

  // Take top 5 most relevant, sanitized
  const top = sanitizeMemories(
    [...relevant]
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, 5)
  );

  const lines = [
    "# Hermes — Active Context",
    ...top.map((d) => {
      const label = d.type === "decision" ? "Decision" : d.type === "guidance" ? "Guidance" : "Pending";
      return `- [${label}] ${d.content}`;
    }),
  ];

  return { context: lines.join("\n") };
}
