/**
 * Hermes CLI — Claude Code Hook Entry Point
 *
 * Usage:
 *   hermes session-start
 *   hermes stop
 *   hermes pre-tool-use
 *   hermes user-prompt
 *
 * Reads JSON from stdin (Claude Code hook protocol).
 * Writes HookOutput JSON to stdout.
 * Errors go to stderr (non-blocking — hooks should never crash Claude Code).
 */

import { onSessionStart } from "./hooks/session-start";
import { onStop } from "./hooks/stop";
import { onPreToolUse } from "./hooks/pre-tool-use";
import { onUserPrompt } from "./hooks/user-prompt";
import { sessionId } from "./memory-store";
import type { HookInput, HookOutput } from "./types";

async function readStdin(): Promise<string> {
  // If stdin is a TTY (no piped input), return empty
  if (process.stdin.isTTY) return "{}";

  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf-8");
}

function parseInput(raw: string): Partial<HookInput> {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function main(): Promise<void> {
  const command = process.argv[2] as HookInput["event"] | undefined;
  if (!command) {
    process.stderr.write("Usage: hermes <session-start|stop|pre-tool-use|user-prompt>\n");
    process.exit(1);
  }

  const raw = await readStdin();
  const input = parseInput(raw);
  const sid = input.sessionId ?? sessionId();

  let output: HookOutput;

  switch (command) {
    case "session-start":
      output = await onSessionStart(sid);
      break;

    case "stop":
      output = await onStop(
        sid,
        input.transcript ?? "",
        input.prompt ?? new Date().toISOString()
      );
      break;

    case "pre-tool-use":
      output = await onPreToolUse(input.toolName ?? "", sid);
      break;

    case "user-prompt":
      output = await onUserPrompt(input.prompt ?? "", sid);
      break;

    default:
      process.stderr.write(`Unknown command: ${command}\n`);
      output = { context: "" };
  }

  process.stdout.write(JSON.stringify(output) + "\n");
}

main().catch((err) => {
  process.stderr.write(`[hermes] Error: ${err instanceof Error ? err.message : String(err)}\n`);
  // Always output valid JSON so Claude Code doesn't break
  process.stdout.write(JSON.stringify({ context: "" }) + "\n");
  process.exit(0); // Exit cleanly — hooks must not block
});
