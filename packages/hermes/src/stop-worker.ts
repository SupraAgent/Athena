/**
 * Detached background worker for Stop hook.
 *
 * Spawned by the Stop hook CLI handler. Reads a payload from a temp file,
 * processes the transcript (LLM or heuristic), saves memories, and cleans up.
 *
 * Usage: node stop-worker.js <payload-file>
 *
 * This runs completely independently — the Stop hook exits immediately
 * after spawning this worker, so Claude Code is never blocked.
 */

import * as fs from "fs/promises";
import { extractMemories } from "./llm-extract";
import {
  saveSessionSummary,
  pruneMemories,
} from "./memory-store";
import { smartConsolidate } from "./mem0-pipeline";
import { loadConfig, getHermesDir, findRepoRoot, resolveAnthropicKey } from "./config";
import { queryEvents, listLogDates } from "./event-log";
import { saveScorecard } from "./session-scoring";
import type { SessionSummary } from "./types";

interface WorkerPayload {
  sessionId: string;
  transcript: string;
  startedAt: string;
  repoRoot?: string;
}

async function main(): Promise<void> {
  const payloadPath = process.argv[2];
  if (!payloadPath) {
    process.stderr.write("[hermes-worker] No payload file specified\n");
    process.exit(1);
  }

  // Read and parse the payload
  let payload: WorkerPayload;
  try {
    const raw = await fs.readFile(payloadPath, "utf-8");
    payload = JSON.parse(raw) as WorkerPayload;
  } catch (err) {
    process.stderr.write(`[hermes-worker] Failed to read payload: ${err}\n`);
    process.exit(1);
  }

  // Clean up the temp file immediately
  try {
    await fs.unlink(payloadPath);
  } catch {
    // Non-critical — temp file will be cleaned up eventually
  }

  const { sessionId, transcript, startedAt } = payload;
  if (!transcript.trim()) return;

  const root = payload.repoRoot ?? findRepoRoot();
  const hermesDir = getHermesDir(root);
  const config = await loadConfig(hermesDir);

  if (!config.autoExtract) return;

  // Extract memories (LLM or heuristic)
  const apiKey = resolveAnthropicKey(config);
  const result = await extractMemories(transcript, apiKey);

  // Smart consolidation — Mem0-style ADD/UPDATE/DELETE/NOOP per candidate
  const pipeline = await smartConsolidate(
    hermesDir, result.memories, sessionId, apiKey
  );
  const saved = pipeline.added + pipeline.updated;

  // Save session summary
  const summary: SessionSummary = {
    sessionId,
    startedAt,
    endedAt: new Date().toISOString(),
    summary: result.summary,
    filesTouched: result.filesTouched.slice(0, 20),
    decisionsMade: result.memories.filter((m) => m.type === "decision").map((m) => m.content),
    unfinished: result.unfinished,
  };
  await saveSessionSummary(hermesDir, summary);

  // Prune if over limit
  if (config.maxMemories > 0) {
    await pruneMemories(hermesDir, config.maxMemories);
  }

  // Session scoring — count events from today's log for this session
  try {
    const today = new Date().toISOString().slice(0, 10);
    const todayEvents = await queryEvents(hermesDir, { date: today, sessionId });

    const correctionsReceived = todayEvents.filter(
      (e) => e.event === "correction.detected" || e.event === "correction.promoted"
    ).length;
    const memoriesPromoted = todayEvents.filter((e) => e.event === "correction.promoted").length;
    const sweepEvents = todayEvents.filter((e) => e.event === "verification.sweep");
    const lastSweep = sweepEvents[sweepEvents.length - 1];
    const rulesChecked = (lastSweep?.payload?.checked as number) ?? 0;
    const rulesPassed = (lastSweep?.payload?.passed as number) ?? 0;
    const rulesFailed = (lastSweep?.payload?.failed as number) ?? 0;
    const violations = todayEvents
      .filter((e) => e.event === "verification.failed")
      .map((e) => String(e.payload?.detail ?? "").slice(0, 80));
    const memoriesCreated = todayEvents.filter((e) => e.event === "memory.created").length;

    await saveScorecard(hermesDir, {
      date: today,
      sessionId,
      correctionsReceived,
      memoriesSurfaced: 0, // Not tracked in worker (happens in session-start hook)
      rulesChecked,
      rulesPassed,
      rulesFailed,
      violations,
      memoriesCreated: memoriesCreated + saved,
      memoriesPromoted,
    });
  } catch {
    // Scoring is non-critical — don't fail the worker
  }

  process.stderr.write(
    `[hermes-worker] Extracted ${saved} memories (${result.method}) from session ${sessionId}\n`
  );
}

main().catch((err) => {
  process.stderr.write(`[hermes-worker] Error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(0); // Exit cleanly — don't leave orphan processes
});
