import type { HookOutput, Memory } from "../types";
import { loadMemories, searchMemories, createMemory } from "../memory-store";
import {
  loadConfig, getHermesDir, findRepoRoot, resolveMode,
  loadSyncState, saveSyncState,
} from "../config";
import { hashMemories, diffMemories, formatDiffBlock } from "../diff";
import { loadCachedRemoteMemories } from "../remote-cache";
import { semanticSearch } from "../semantic";
import { sanitizeMemories, sanitizeContent } from "../sanitize";

/** UserPromptSubmit hook: scan prompt for keywords, inject relevant memories or diffs. */
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
  const mode = resolveMode(config);

  if (mode === "off") {
    return { context: "" };
  }

  const localMemories = await loadMemories(hermesDir);

  // Self-improvement: detect corrections and save as guidance (reuse loaded memories)
  await detectAndSaveCorrection(prompt, sessionId, hermesDir, localMemories);

  // Load remote memories from cache (never blocks on network)
  let remoteMemories: Memory[] = [];
  if (config.sources.length > 0) {
    remoteMemories = await loadCachedRemoteMemories(hermesDir, config.sources);
  }

  const allMemories = [...localMemories, ...remoteMemories];
  if (allMemories.length === 0) {
    return { context: "" };
  }

  // Semantic search first, fall back to keyword search
  let matches = semanticSearch(allMemories, prompt, config.contextLimit);
  if (matches.length === 0) {
    matches = searchMemories(allMemories, prompt, config.contextLimit);
  }

  // Sanitize before injection
  matches = sanitizeMemories(matches);

  // In full mode, check for memory changes and inject diffs
  if (mode === "full") {
    const syncState = await loadSyncState(hermesDir, sessionId);
    const currentHash = hashMemories(allMemories);

    if (syncState && syncState.lastMemoryHash === currentHash && matches.length === 0) {
      // Nothing changed, no relevant matches
      return { context: "" };
    }

    // Track previous memories for diffing
    const previousIds = new Set(syncState?.lastMemoryIds ?? []);
    const previousMemories = allMemories.filter((m) => previousIds.has(m.id));
    const diffs = diffMemories(previousMemories, allMemories);

    // Update sync state
    await saveSyncState(hermesDir, {
      sessionId,
      lastInjectedAt: new Date().toISOString(),
      lastMemoryHash: currentHash,
      lastMemoryIds: allMemories.map((m) => m.id),
      injectionCount: (syncState?.injectionCount ?? 0) + 1,
    });

    // If we have diffs, show them; otherwise show matches
    if (diffs.length > 0) {
      const diffBlock = formatDiffBlock(diffs);
      if (matches.length > 0) {
        const matchLines = matches.map((m) => {
          const label = m.type.charAt(0).toUpperCase() + m.type.slice(1);
          return `- **[${label}]** ${m.content}`;
        });
        return { context: diffBlock + "\n## Relevant to your prompt\n" + matchLines.join("\n") };
      }
      return { context: diffBlock };
    }
  }

  // Whisper mode or full mode with no diffs — just show matches
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

// ── Self-Improvement Loop ──────────────────────────────────────

/**
 * Strong correction patterns — must reference Claude/the code/previous behavior.
 * Designed to minimize false positives by requiring both a correction keyword
 * AND a reference to Claude's behavior (you, the code, that, this).
 */
const CORRECTION_PATTERNS = [
  /^no[,.]?\s+(?:don't|do not|stop|never)\s+(.{10,120})/i,
  /^(?:wrong|incorrect)[,.]?\s+(?:you|the|that|it)\s+(.{10,120})/i,
  /(?:I (?:told|asked) you (?:to|not to))\s+(.{10,120})/i,
  /(?:that's not (?:right|correct|what I (?:want|meant)))[,.]?\s*(.{10,120})/i,
  /^(?:don't|do not|stop|never)\s+(?:do|make|add|use|create|write)\s+(.{10,120})/i,
];

/** Words that indicate a reference to Claude's previous behavior. */
const BEHAVIOR_REFS = /\b(?:you|your|the code|that|this|it|again|already|just did|keep doing)\b/i;

/** Minimum prompt length to consider for correction detection. */
const MIN_CORRECTION_LENGTH = 20;

/**
 * Detect user corrections and auto-save as guidance memories.
 * This creates a self-improvement loop — corrections from one session
 * become guidance for future sessions.
 *
 * Uses strict detection: a correction keyword + a reference to Claude's behavior.
 */
async function detectAndSaveCorrection(
  prompt: string,
  sessionId: string,
  hermesDir: string,
  existingMemories?: Memory[]
): Promise<void> {
  if (prompt.length < MIN_CORRECTION_LENGTH) return;

  for (const pattern of CORRECTION_PATTERNS) {
    const match = prompt.match(pattern);
    if (!match) continue;

    // Require a reference to Claude's behavior to reduce false positives
    if (!BEHAVIOR_REFS.test(prompt)) continue;

    const correction = sanitizeContent(match[1]?.trim() ?? prompt.trim());
    if (correction.length < 10) continue;

    // Use provided memories or load once
    const existing = existingMemories ?? await loadMemories(hermesDir);
    const isDuplicate = existing.some(
      (m) => m.type === "guidance" &&
        m.tags.includes("correction") &&
        m.content.toLowerCase().includes(correction.toLowerCase().slice(0, 30))
    );
    if (isDuplicate) return;

    await createMemory(
      hermesDir, "guidance", correction,
      ["self-improvement", "correction"], sessionId, 0.65
    );
    return; // Only save one correction per prompt
  }
}
