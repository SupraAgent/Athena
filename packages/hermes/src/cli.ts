/**
 * Hermes CLI — Claude Code Hook Entry Point + Memory Management
 *
 * Hook commands (read JSON from stdin, write HookOutput to stdout):
 *   hermes session-start
 *   hermes stop
 *   hermes pre-tool-use
 *   hermes user-prompt
 *
 * Memory management commands (human-readable output):
 *   hermes remember <content>          — save a fact memory
 *   hermes decide <content>            — save a decision memory
 *   hermes prefer <content>            — save a preference memory
 *   hermes context <content>           — save project context
 *   hermes todo <content>              — save a pending item
 *   hermes guide <content>             — save guidance
 *   hermes search <query>              — search memories by keyword
 *   hermes list [--type=X]             — list all memories
 *   hermes forget <id>                 — delete a memory by ID
 *   hermes status                      — show Hermes status and stats
 *   hermes mode <whisper|full|off>     — set operational mode
 */

import { onSessionStart } from "./hooks/session-start";
import { onStop } from "./hooks/stop";
import { onPreToolUse } from "./hooks/pre-tool-use";
import { onUserPrompt } from "./hooks/user-prompt";
import {
  sessionId,
  createMemory,
  loadMemories,
  searchMemories,
  deleteMemory,
} from "./memory-store";
import { loadConfig, saveConfig, getHermesDir, findRepoRoot, resolveMode } from "./config";
import type { HookInput, HookOutput, MemoryType, HermesMode } from "./types";
import { MEMORY_BLOCK_LABELS } from "./types";

// Record process start time for stop hook fallback
const PROCESS_START = new Date().toISOString();

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
    const data = JSON.parse(raw);
    // Map Claude Code's snake_case fields to Hermes's camelCase
    return {
      sessionId: data.sessionId ?? data.session_id,
      prompt: data.prompt ?? data.message,
      toolName: data.toolName ?? data.tool_name,
      transcript: data.transcript,
      startedAt: data.startedAt ?? data.started_at,
    };
  } catch {
    return {};
  }
}

// ── Memory type mapping ────────────────────────────────────────

const COMMAND_TO_TYPE: Record<string, MemoryType> = {
  remember: "fact",
  decide: "decision",
  prefer: "preference",
  context: "project-context",
  todo: "pending",
  guide: "guidance",
};

const TYPE_RELEVANCE: Record<MemoryType, number> = {
  fact: 0.6,
  decision: 0.8,
  preference: 0.7,
  "project-context": 0.7,
  pattern: 0.6,
  pending: 0.9,
  guidance: 0.8,
  "session-summary": 0.3,
  "agent-heartbeat": 0.2,
};

// ── Memory Management Commands ──────────────────────────────────

async function handleSaveMemory(args: string[], command: string): Promise<void> {
  const type = COMMAND_TO_TYPE[command];
  if (!type) {
    console.error(`Unknown memory command: ${command}`);
    process.exit(1);
  }

  const content = args.join(" ").trim();
  if (!content) {
    console.error(`Usage: hermes ${command} <content>`);
    process.exit(1);
  }

  const root = findRepoRoot();
  const hermesDir = getHermesDir(root);
  const relevance = TYPE_RELEVANCE[type] ?? 0.7;
  const mem = await createMemory(hermesDir, type, content, [], "cli", relevance);
  const label = MEMORY_BLOCK_LABELS[type] ?? type;
  console.log(`Saved ${label}: ${mem.id}`);
  console.log(`  "${content}"`);
}

async function handleSearch(args: string[]): Promise<void> {
  const query = args.join(" ").trim();
  if (!query) {
    console.error("Usage: hermes search <query>");
    process.exit(1);
  }

  const root = findRepoRoot();
  const hermesDir = getHermesDir(root);
  const all = await loadMemories(hermesDir);
  const results = searchMemories(all, query, 10);

  if (results.length === 0) {
    console.log("No matching memories found.");
    return;
  }

  console.log(`Found ${results.length} matching memories:\n`);
  for (const m of results) {
    const age = timeAgo(m.updatedAt);
    const label = MEMORY_BLOCK_LABELS[m.type] ?? m.type;
    console.log(`  [${label}] ${m.content}`);
    console.log(`    id: ${m.id}  |  relevance: ${m.relevance}  |  ${age}`);
    console.log();
  }
}

async function handleList(args: string[]): Promise<void> {
  const root = findRepoRoot();
  const hermesDir = getHermesDir(root);
  let all = await loadMemories(hermesDir);

  // Parse --type filter
  const typeArg = args.find((a) => a.startsWith("--type="));
  if (typeArg) {
    const filterType = typeArg.split("=")[1];
    all = all.filter((m) => m.type === filterType);
  }

  if (all.length === 0) {
    console.log("No memories stored.");
    return;
  }

  // Sort by most recent first
  all.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  // Group by type
  const grouped: Record<string, typeof all> = {};
  for (const m of all) {
    (grouped[m.type] ??= []).push(m);
  }

  console.log(`${all.length} memories:\n`);
  for (const [type, mems] of Object.entries(grouped)) {
    const label = MEMORY_BLOCK_LABELS[type as MemoryType] ?? type;
    console.log(`  ${label} (${mems.length})`);
    for (const m of mems) {
      const age = timeAgo(m.updatedAt);
      console.log(`    - ${m.content}`);
      console.log(`      id: ${m.id}  |  ${age}`);
    }
    console.log();
  }
}

async function handleForget(args: string[]): Promise<void> {
  const id = args[0]?.trim();
  if (!id) {
    console.error("Usage: hermes forget <memory-id>");
    process.exit(1);
  }

  const root = findRepoRoot();
  const hermesDir = getHermesDir(root);
  const deleted = await deleteMemory(hermesDir, id);

  if (deleted) {
    console.log(`Deleted memory: ${id}`);
  } else {
    console.error(`Memory not found: ${id}`);
    process.exit(1);
  }
}

async function handleMode(args: string[]): Promise<void> {
  const root = findRepoRoot();
  const hermesDir = getHermesDir(root);
  const config = await loadConfig(hermesDir);

  const newMode = args[0]?.trim();
  if (!newMode) {
    const currentMode = resolveMode(config);
    console.log(`Current mode: ${currentMode}`);
    console.log(`\nModes:`);
    console.log(`  whisper  — inject only decisions, guidance, and pending items`);
    console.log(`  full     — inject all memory blocks with change diffs`);
    console.log(`  off      — disable all hooks`);
    console.log(`\nSet via: hermes mode <whisper|full|off>`);
    console.log(`Or env:  HERMES_MODE=whisper`);
    return;
  }

  if (!["whisper", "full", "off"].includes(newMode)) {
    console.error(`Invalid mode: ${newMode}. Must be: whisper, full, or off`);
    process.exit(1);
  }

  config.mode = newMode as HermesMode;
  await saveConfig(hermesDir, config);
  console.log(`Mode set to: ${newMode}`);
}

async function handleStatus(): Promise<void> {
  const root = findRepoRoot();
  const hermesDir = getHermesDir(root);
  const config = await loadConfig(hermesDir);
  const mode = resolveMode(config);
  const all = await loadMemories(hermesDir);

  const byType: Record<string, number> = {};
  for (const m of all) {
    byType[m.type] = (byType[m.type] ?? 0) + 1;
  }

  const hasApiKey = !!(process.env.ANTHROPIC_API_KEY ?? config.anthropicApiKey);

  console.log("Hermes Status");
  console.log("\u2500".repeat(40));
  console.log(`  Directory:      ${hermesDir}`);
  console.log(`  Mode:           ${mode}`);
  console.log(`  Memories:       ${all.length} / ${config.maxMemories} max`);
  for (const [type, count] of Object.entries(byType)) {
    const label = MEMORY_BLOCK_LABELS[type as MemoryType] ?? type;
    console.log(`    ${label}: ${count}`);
  }
  console.log(`  Auto-extract:   ${config.autoExtract ? "on" : "off"}`);
  console.log(`  LLM extraction: ${hasApiKey ? "on (API key found)" : "off (no API key)"}`);
  console.log(`  Context limit:  ${config.contextLimit}`);
  console.log(`  Sources:        ${config.sources.length} external`);
  console.log(`  Agents:         ${config.agents.length} configured`);
}

async function handleConsolidate(): Promise<void> {
  const root = findRepoRoot();
  const hermesDir = getHermesDir(root);
  const { consolidateMemories } = await import("./consolidate");
  const { resolveAnthropicKey } = await import("./config");
  const config = await loadConfig(hermesDir);
  const apiKey = resolveAnthropicKey(config);

  console.log("Consolidating memories...\n");
  const result = await consolidateMemories(hermesDir, apiKey);

  console.log(`Method:    ${result.method}`);
  console.log(`Merged:    ${result.merged}`);
  console.log(`Removed:   ${result.removed}`);
  if (result.conflicts.length > 0) {
    console.log(`\nConflicts detected:`);
    for (const c of result.conflicts) {
      console.log(`  - ${c.reason}`);
      console.log(`    A: "${c.a.content}"`);
      console.log(`    B: "${c.b.content}"`);
    }
  }
}

async function handleAge(): Promise<void> {
  const root = findRepoRoot();
  const hermesDir = getHermesDir(root);
  const { ageMemories } = await import("./git-aging");

  console.log("Running git-aware memory aging...\n");
  const result = await ageMemories(hermesDir, root);

  console.log(`Processed: ${result.processed} memories`);
  console.log(`Decayed:   ${result.decayed}`);
  console.log(`Boosted:   ${result.boosted}`);
  if (result.staleFiles.length > 0) {
    console.log(`\nStale files (deleted from repo):`);
    for (const f of result.staleFiles) {
      console.log(`  - ${f}`);
    }
  }
}

async function handleEvolve(): Promise<void> {
  const root = findRepoRoot();
  const hermesDir = getHermesDir(root);
  const sid = sessionId();

  // 1. Session trend
  const { loadScorecards, analyzeTrend, formatTrend } = await import("./session-scoring");
  const scorecards = await loadScorecards(hermesDir);
  const trend = analyzeTrend(scorecards);
  console.log("## Session Trend\n");
  if (trend) {
    console.log(formatTrend(trend));
  } else {
    console.log(`Only ${scorecards.length} session(s) recorded. Need 3+ for trend analysis.`);
  }

  // 2. Graduation candidates
  const { findGraduationCandidates, formatCandidates } = await import("./graduation");
  const gradResult = await findGraduationCandidates(hermesDir, sid);
  console.log("\n## Graduation Review\n");
  const candidateBlock = formatCandidates(gradResult);
  if (candidateBlock) {
    console.log(candidateBlock);
  } else {
    console.log("No graduation candidates at this time.");
  }

  // 3. Verification summary
  const memories = await loadMemories(hermesDir);
  const withVerify = memories.filter((m) => m.verify);
  const withoutVerify = memories.filter(
    (m) => ["guidance", "decision", "pattern"].includes(m.type) && !m.verify
  );
  console.log("\n## Verification Coverage\n");
  console.log(`Memories with verify checks: ${withVerify.length}`);
  console.log(`Rule-type memories without verify: ${withoutVerify.length}`);
  if (withoutVerify.length > 0) {
    console.log("\nMemories that could benefit from a verify check:");
    for (const m of withoutVerify.slice(0, 5)) {
      console.log(`  - [${m.id}] ${m.content.slice(0, 80)}`);
    }
    if (withoutVerify.length > 5) {
      console.log(`  ... and ${withoutVerify.length - 5} more`);
    }
  }

  // 4. Correction patterns
  const corrections = memories.filter(
    (m) => m.type === "guidance" && m.tags.includes("correction")
  );
  const confirmed = corrections.filter((m) => m.confidence === "confirmed");
  const observed = corrections.filter((m) => m.confidence === "observed" || !m.confidence);
  console.log("\n## Correction Patterns\n");
  console.log(`Total corrections: ${corrections.length} (${confirmed.length} confirmed, ${observed.length} observed)`);
  if (corrections.length > 0) {
    console.log("\nRecent corrections:");
    for (const m of corrections.slice(-5)) {
      const badge = m.confidence === "confirmed" ? "✓" : "○";
      const count = m.correctionCount ?? 0;
      console.log(`  ${badge} [${count}x] ${m.content.slice(0, 80)}`);
    }
  }

  // 5. Feedback summary
  const { getFeedbackSummary } = await import("./feedback-loop");
  const fb = await getFeedbackSummary(hermesDir);
  if (fb.totalSignals > 0) {
    console.log("\n## Feedback Summary\n");
    console.log(`Total signals: ${fb.totalSignals}, avg score: ${fb.averageScore.toFixed(1)}`);
  }

  console.log("\n---");
  console.log("To graduate a candidate: update its confidence to 'graduated' and add the rule to CLAUDE.md or .claude/rules/.");
  console.log("To reject a candidate: run `hermes forget <id>` or use /hermes-forget.");
}

function timeAgo(timestamp: string): string {
  const seconds = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ── Main ────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const command = process.argv[2];
  if (!command) {
    console.error(
      "Usage: hermes <command>\n\n" +
      "Hook commands:\n" +
      "  session-start    Load memories for session context\n" +
      "  stop             Extract and save session memories\n" +
      "  pre-tool-use     Track tool usage\n" +
      "  user-prompt      Surface relevant memories\n\n" +
      "Memory commands:\n" +
      "  remember <text>  Save a fact\n" +
      "  decide <text>    Save a decision\n" +
      "  prefer <text>    Save a preference\n" +
      "  context <text>   Save project context\n" +
      "  todo <text>      Save a pending item\n" +
      "  guide <text>     Save guidance\n" +
      "  search <query>   Search memories\n" +
      "  list [--type=X]  List all memories\n" +
      "  forget <id>      Delete a memory\n" +
      "  mode [mode]      Get/set operational mode\n" +
      "  consolidate      Merge redundant memories\n" +
      "  age              Run git-aware memory aging\n" +
      "  evolve           Review trends, corrections, graduation candidates\n" +
      "  status           Show Hermes status\n"
    );
    process.exit(1);
  }

  const args = process.argv.slice(3);

  // Memory management commands (human-readable output, no stdin)
  if (command in COMMAND_TO_TYPE) {
    return handleSaveMemory(args, command);
  }

  switch (command) {
    case "search":
      return handleSearch(args);
    case "list":
      return handleList(args);
    case "forget":
      return handleForget(args);
    case "mode":
      return handleMode(args);
    case "consolidate":
      return handleConsolidate();
    case "age":
      return handleAge();
    case "evolve":
      return handleEvolve();
    case "status":
      return handleStatus();
  }

  // Hook commands (JSON stdin/stdout protocol)
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
        input.startedAt ?? PROCESS_START
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
