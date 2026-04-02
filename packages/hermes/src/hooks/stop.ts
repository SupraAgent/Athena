import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { spawn } from "child_process";
import type { HookOutput } from "../types";
import { loadConfig, getHermesDir, findRepoRoot, resolveMode } from "../config";

/**
 * Stop hook: dispatch transcript processing to a detached background worker.
 *
 * Writes the payload to a temp file and spawns a detached worker process
 * that handles LLM extraction and memory persistence. The hook itself
 * exits immediately so Claude Code is never blocked.
 */
export async function onStop(
  sid: string,
  transcript: string,
  startedAt: string,
  repoRoot?: string
): Promise<HookOutput> {
  const root = repoRoot ?? findRepoRoot();
  const hermesDir = getHermesDir(root);
  const config = await loadConfig(hermesDir);
  const mode = resolveMode(config);

  if (mode === "off" || !config.autoExtract || !transcript.trim()) {
    return { context: "", memoriesSaved: 0 };
  }

  // Write payload to a temp file for the worker
  const tmpDir = path.join(os.tmpdir(), `hermes-${process.getuid?.() ?? "0"}`);
  await fs.mkdir(tmpDir, { recursive: true });
  const payloadPath = path.join(tmpDir, `stop-${sid}-${Date.now()}.json`);

  const payload = {
    sessionId: sid,
    transcript,
    startedAt,
    repoRoot: root,
  };

  await fs.writeFile(payloadPath, JSON.stringify(payload), { encoding: "utf-8", mode: 0o600 });

  // Spawn detached background worker
  const workerPath = path.join(__dirname, "stop-worker.js");

  try {
    const child = spawn("node", [workerPath, payloadPath], {
      detached: true,
      stdio: "ignore",
      env: { ...process.env },
    });
    child.unref();
  } catch {
    // If spawn fails, fall back to inline processing
    const { resolveAnthropicKey } = await import("../config");
    const { saveSessionSummary, pruneMemories } = await import("../memory-store");

    const apiKey = resolveAnthropicKey(config);
    let saved = 0;
    let summaryText = "";
    let filesTouched: string[] = [];
    let unfinished: string[] = [];
    let decisionsMade: string[] = [];

    // Try agentic curator first
    if (apiKey) {
      try {
        const { agentCurateMemories } = await import("../agent-curator");
        const agentResult = await agentCurateMemories(hermesDir, transcript, sid, apiKey);
        saved = agentResult.added + agentResult.updated;
        summaryText = agentResult.summary;
        filesTouched = agentResult.filesTouched;
        unfinished = agentResult.unfinished;
      } catch {
        // Fall through to legacy pipeline
      }
    }

    // Fallback: extract+consolidate
    if (saved === 0) {
      const { extractMemories } = await import("../llm-extract");
      const { smartConsolidate } = await import("../mem0-pipeline");
      const result = await extractMemories(transcript, apiKey);
      const pipeline = await smartConsolidate(hermesDir, result.memories, sid, apiKey);
      saved = pipeline.added + pipeline.updated;
      summaryText = result.summary;
      filesTouched = result.filesTouched.slice(0, 20);
      unfinished = result.unfinished;
      decisionsMade = result.memories.filter((m) => m.type === "decision").map((m) => m.content);
    }

    await saveSessionSummary(hermesDir, {
      sessionId: sid,
      startedAt,
      endedAt: new Date().toISOString(),
      summary: summaryText,
      filesTouched,
      decisionsMade,
      unfinished,
    });

    if (config.maxMemories > 0) {
      await pruneMemories(hermesDir, config.maxMemories);
    }

    return { context: "", memoriesSaved: saved };
  }

  // Worker spawned successfully — exit immediately
  return { context: "", memoriesSaved: 0 };
}
