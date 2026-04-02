import type { HookOutput, Memory } from "../types";
import { loadMemories, searchMemories, createMemory, updateMemory } from "../memory-store";
import {
  loadConfig, getHermesDir, findRepoRoot, resolveMode,
  loadSyncState, saveSyncState,
} from "../config";
import { hashMemories, diffMemories, formatDiffBlock } from "../diff";
import { loadCachedRemoteMemories } from "../remote-cache";
import { semanticSearch } from "../semantic";
import { sanitizeMemories, sanitizeContent } from "../sanitize";
import { inferVerifyCheck } from "../verification";
import { logEvent } from "../event-log";
import { createVectorStore } from "../vector-store";

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

  // Try vector store search first (embedding-based), fall back to BM25/keyword
  let matches: Memory[] = [];
  try {
    const vectorStore = await createVectorStore(hermesDir);
    if (vectorStore.backend !== "tfidf") {
      await vectorStore.upsert(allMemories);
      const results = await vectorStore.query(prompt, config.contextLimit);
      matches = results.map((r) => r.memory);
    }
  } catch {
    // Vector store unavailable — fall through to BM25
  }

  if (matches.length === 0) {
    matches = semanticSearch(allMemories, prompt, config.contextLimit);
  }
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
 *
 * Auto-promotion: if the same correction pattern appears a second time,
 * the existing memory gets boosted to relevance 1.0, tagged as "verified-rule",
 * and a verify check is auto-generated if possible.
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

    // Check for existing correction on the same topic
    const similar = existing.find(
      (m) => m.type === "guidance" &&
        m.tags.includes("correction") &&
        m.content.toLowerCase().includes(correction.toLowerCase().slice(0, 30))
    );

    if (similar) {
      // Repeat correction — auto-promote to verified rule
      const count = (similar.correctionCount ?? 1) + 1;
      const updates: Partial<Memory> = {
        relevance: 1.0,
        correctionCount: count,
        confidence: "confirmed",
      };

      // Add verified-rule tag if not already present
      if (!similar.tags.includes("verified-rule")) {
        updates.tags = [...similar.tags, "verified-rule"];
      }

      // Auto-generate verify check if none exists
      if (!similar.verify) {
        const check = inferVerifyCheck(similar.content);
        if (check) updates.verify = check;
      }

      await updateMemory(hermesDir, similar.id, updates);

      await logEvent(hermesDir, "correction.promoted", sessionId, {
        memoryId: similar.id,
        correctionCount: count,
        content: similar.content.slice(0, 100),
      });
      return;
    }

    // First-time correction — create new guidance memory
    const verifyCheck = inferVerifyCheck(correction);
    const newMemory = await createMemory(
      hermesDir, "guidance", correction,
      ["self-improvement", "correction"], sessionId, 0.65
    );

    // Attach verify check and initial confidence if we could infer one
    if (newMemory && (verifyCheck || true)) {
      const updates: Partial<Memory> = {
        correctionCount: 1,
        confidence: "observed" as const,
      };
      if (verifyCheck) updates.verify = verifyCheck;
      await updateMemory(hermesDir, newMemory.id, updates);
    }

    await logEvent(hermesDir, "correction.detected", sessionId, {
      correction: correction.slice(0, 100),
      hasVerify: !!verifyCheck,
    });

    return; // Only save one correction per prompt
  }
}
