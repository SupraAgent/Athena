/**
 * Background worker for channel cache refresh.
 *
 * Spawned as a detached process by the manager.
 * Receives payload via process.argv[2], fetches all channels, saves cache, exits.
 */

import type { ChannelConfig } from "./channel";
import { fetchAll, saveChannelCache } from "./manager";

async function main(): Promise<void> {
  const raw = process.argv[2];
  if (!raw) {
    process.exit(1);
  }

  try {
    const { hermesDir, configs } = JSON.parse(raw) as {
      hermesDir: string;
      configs: ChannelConfig[];
    };

    const results = await fetchAll(configs);
    await saveChannelCache(hermesDir, results, configs);
  } catch {
    // Silent failure — best-effort refresh
  }

  process.exit(0);
}

main();
