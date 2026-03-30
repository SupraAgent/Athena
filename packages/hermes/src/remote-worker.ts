/**
 * Background worker for async remote memory fetching.
 *
 * Spawned by triggerBackgroundRefresh(). Fetches memories from
 * all configured external sources and updates the local cache.
 *
 * Usage: node remote-worker.js '<json-payload>'
 */

import type { ExternalSource } from "./types";
import { loadRemoteMemories } from "./memory-store";
import { saveCachedRemoteMemories } from "./remote-cache";

interface WorkerPayload {
  hermesDir: string;
  sources: ExternalSource[];
}

async function main(): Promise<void> {
  const payloadStr = process.argv[2];
  if (!payloadStr) {
    process.stderr.write("[hermes-remote-worker] No payload\n");
    process.exit(1);
  }

  let payload: WorkerPayload;
  try {
    payload = JSON.parse(payloadStr) as WorkerPayload;
  } catch {
    process.stderr.write("[hermes-remote-worker] Invalid payload JSON\n");
    process.exit(1);
  }

  const { hermesDir, sources } = payload;

  for (const source of sources) {
    try {
      const memories = await loadRemoteMemories(source);
      await saveCachedRemoteMemories(hermesDir, source, memories);
      process.stderr.write(
        `[hermes-remote-worker] Cached ${memories.length} memories from ${source.repo}\n`
      );
    } catch (err) {
      process.stderr.write(
        `[hermes-remote-worker] Failed to fetch ${source.repo}: ${err}\n`
      );
    }
  }
}

main().catch((err) => {
  process.stderr.write(`[hermes-remote-worker] Error: ${err}\n`);
  process.exit(0);
});
