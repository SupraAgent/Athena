import type { HookOutput } from "../types";
import { loadMemories, searchMemories } from "../memory-store";
import { getHermesDir, findRepoRoot } from "../config";

/** Tools that benefit from architectural context injection. */
const CONTEXT_TOOLS = new Set([
  "Write",
  "Edit",
  "Bash",
  "NotebookEdit",
]);

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

  const root = repoRoot ?? await findRepoRoot();
  const hermesDir = getHermesDir(root);
  const memories = await loadMemories(hermesDir);

  // Only inject decisions — facts and summaries aren't actionable here
  const decisions = memories.filter((m) => m.type === "decision");
  if (decisions.length === 0) {
    return { context: "" };
  }

  // Take top 3 most relevant decisions
  const top = decisions
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, 3);

  const lines = [
    "# Hermes — Active Decisions",
    ...top.map((d) => `- ${d.content}`),
  ];

  return { context: lines.join("\n") };
}
