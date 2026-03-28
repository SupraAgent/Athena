import type { HookOutput, SessionSummary } from "../types";
import {
  loadMemories,
  createMemory,
  saveSessionSummary,
  deduplicateMemories,
  pruneMemories,
} from "../memory-store";
import { loadConfig, getHermesDir, findRepoRoot } from "../config";

/** Pattern sources — fresh RegExp instances created per call to avoid lastIndex state. */
const FACT_PATTERN_SOURCES = [
  "(?:this (?:project|repo|codebase) (?:uses?|has|runs?))\\s+(.+?)(?:\\.|$)",
  "(?:we (?:chose|decided|switched to|use|are using))\\s+(.+?)(?:\\.|$)",
  "(?:the (?:deploy|build|test) (?:target|command|process) is)\\s+(.+?)(?:\\.|$)",
  "(?:important|note|remember):\\s*(.+?)(?:\\.|$)",
];

const DECISION_PATTERN_SOURCES = [
  "(?:decided to|decision:|we (?:will|should|chose to))\\s+(.+?)(?:\\.|$)",
  "(?:architectural (?:decision|choice)|design decision):\\s*(.+?)(?:\\.|$)",
  "(?:going with|opted for|picking)\\s+(.+?)(?:\\s+(?:because|since|over))",
];

const FILE_PATTERN_SOURCE =
  "(?:(?:created?|modif(?:ied|y)|edit(?:ed)?|updat(?:ed)?|delet(?:ed)?|wrote?|fix(?:ed)?)\\s+)([`\"']?[\\w/.@-]+/[\\w/.@-]+\\.[a-zA-Z]{1,10}[`\"']?)";

/** Extract memories from a session transcript using heuristics. */
function extractFromTranscript(transcript: string): {
  facts: string[];
  decisions: string[];
  files: string[];
} {
  const facts: string[] = [];
  const decisions: string[] = [];
  const files: string[] = [];

  for (const src of FACT_PATTERN_SOURCES) {
    const pattern = new RegExp(src, "gi");
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(transcript)) !== null) {
      const fact = match[1].trim();
      if (fact.length > 10 && fact.length < 300) {
        facts.push(fact);
      }
    }
  }

  for (const src of DECISION_PATTERN_SOURCES) {
    const pattern = new RegExp(src, "gi");
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(transcript)) !== null) {
      const decision = match[1].trim();
      if (decision.length > 10 && decision.length < 300) {
        decisions.push(decision);
      }
    }
  }

  // File pattern requires a "/" to avoid matching method calls like Date.now()
  const filePattern = new RegExp(FILE_PATTERN_SOURCE, "gi");
  let fileMatch: RegExpExecArray | null;
  while ((fileMatch = filePattern.exec(transcript)) !== null) {
    const filePath = fileMatch[1].replace(/[`"']/g, "");
    if (filePath.includes("/")) {
      files.push(filePath);
    }
  }

  return {
    facts: [...new Set(facts)],
    decisions: [...new Set(decisions)],
    files: [...new Set(files)],
  };
}

/** Generate a brief summary from the transcript — prefers the final lines (conclusion). */
function generateSummary(transcript: string, maxLen = 200): string {
  const lines = transcript.split("\n").filter((l) => l.trim().length > 20);
  if (lines.length === 0) return "Session with no extractable summary.";
  // Take the last 5 meaningful lines (conclusion > intro)
  const tail = lines.slice(-5);
  const combined = tail.join(" ").trim();
  return combined.length > maxLen ? combined.slice(0, maxLen - 3) + "..." : combined;
}

/** Stop hook: extract and persist memories from the session. */
export async function onStop(
  sid: string,
  transcript: string,
  startedAt: string,
  repoRoot?: string
): Promise<HookOutput> {
  const root = repoRoot ?? findRepoRoot();
  const hermesDir = getHermesDir(root);
  const config = await loadConfig(hermesDir);

  if (!config.autoExtract || !transcript.trim()) {
    return { context: "", memoriesSaved: 0 };
  }

  const existing = await loadMemories(hermesDir);
  const { facts, decisions, files } = extractFromTranscript(transcript);
  let saved = 0;

  // Helper: check dedup and track newly created memories
  async function saveIfNew(type: "fact" | "decision", content: string, relevance: number) {
    const candidate = {
      id: "", type, content, tags: [] as string[],
      createdAt: "", updatedAt: "", source: sid, relevance,
    };
    if (!deduplicateMemories(existing, candidate)) {
      const created = await createMemory(hermesDir, type, content, [], sid, relevance);
      existing.push(created); // Update snapshot to prevent within-loop duplicates
      saved++;
    }
  }

  // Save extracted facts
  for (const fact of facts.slice(0, 5)) {
    await saveIfNew("fact", fact, 0.6);
  }

  // Save extracted decisions
  for (const decision of decisions.slice(0, 3)) {
    await saveIfNew("decision", decision, 0.8);
  }

  // Save session summary
  const summary: SessionSummary = {
    sessionId: sid,
    startedAt,
    endedAt: new Date().toISOString(),
    summary: generateSummary(transcript),
    filesTouched: files.slice(0, 20),
    decisionsMade: decisions.slice(0, 5),
    unfinished: [],
  };
  await saveSessionSummary(hermesDir, summary);

  // Prune if over limit
  if (config.maxMemories > 0) {
    await pruneMemories(hermesDir, config.maxMemories);
  }

  return { context: "", memoriesSaved: saved };
}
