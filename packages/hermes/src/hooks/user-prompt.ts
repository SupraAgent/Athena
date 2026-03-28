import type { HookOutput } from "../types";
import { loadMemories, searchMemories } from "../memory-store";
import { loadConfig, getHermesDir, findRepoRoot } from "../config";

/** UserPromptSubmit hook: scan prompt for keywords matching stored memories. */
export async function onUserPrompt(
  prompt: string,
  sessionId: string,
  repoRoot?: string
): Promise<HookOutput> {
  if (!prompt.trim()) {
    return { context: "" };
  }

  const root = repoRoot ?? findRepoRoot();
  const hermesDir = getHermesDir(root);
  const config = await loadConfig(hermesDir);
  const allMemories = await loadMemories(hermesDir);

  if (allMemories.length === 0) {
    return { context: "" };
  }

  // Search memories matching the user's prompt
  const matches = searchMemories(allMemories, prompt, config.contextLimit);
  if (matches.length === 0) {
    return { context: "" };
  }

  const lines = [
    "# Hermes — Relevant Context",
    `_${matches.length} memories matched your prompt._`,
    "",
    ...matches.map((m) => {
      const label = m.type.charAt(0).toUpperCase() + m.type.slice(1);
      return `- **[${label}]** ${m.content}`;
    }),
  ];

  return { context: lines.join("\n") };
}
