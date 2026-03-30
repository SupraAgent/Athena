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
    const { extractMemories } = await import("../llm-extract");
    const { resolveAnthropicKey } = await import("../config");
    const { saveSessionSummary, pruneMemories } = await import("../memory-store");
    const { smartConsolidate } = await import("../mem0-pipeline");

    const apiKey = resolveAnthropicKey(config);
    const result = await extractMemories(transcript, apiKey);
    const pipeline = await smartConsolidate(hermesDir, result.memories, sid, apiKey);
    const saved = pipeline.added + pipeline.updated;

    await saveSessionSummary(hermesDir, {
      sessionId: sid,
      startedAt,
      endedAt: new Date().toISOString(),
      summary: result.summary,
      filesTouched: result.filesTouched.slice(0, 20),
      decisionsMade: result.memories.filter((m) => m.type === "decision").map((m) => m.content),
      unfinished: result.unfinished,
    });

    if (config.maxMemories > 0) {
      await pruneMemories(hermesDir, config.maxMemories);
    }

    return { context: "", memoriesSaved: saved };
  }

  // Worker spawned successfully — exit immediately
  return { context: "", memoriesSaved: 0 };
}
