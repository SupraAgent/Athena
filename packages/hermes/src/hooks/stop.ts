import type { HookOutput, SessionSummary } from "../types";
import {
  loadMemories,
  createMemory,
  saveSessionSummary,
  deduplicateMemories,
  pruneMemories,
} from "../memory-store";
import { loadConfig, getHermesDir, findRepoRoot } from "../config";

/** Patterns for extracting facts from a transcript. */
const FACT_PATTERNS = [
  /(?:this (?:project|repo|codebase) (?:uses?|has|runs?))\s+(.+?)(?:\.|$)/gi,
  /(?:we (?:chose|decided|switched to|use|are using))\s+(.+?)(?:\.|$)/gi,
  /(?:the (?:deploy|build|test) (?:target|command|process) is)\s+(.+?)(?:\.|$)/gi,
  /(?:important|note|remember):\s*(.+?)(?:\.|$)/gi,
];

/** Patterns for extracting decisions. */
const DECISION_PATTERNS = [
  /(?:decided to|decision:|we (?:will|should|chose to))\s+(.+?)(?:\.|$)/gi,
  /(?:architectural (?:decision|choice)|design decision):\s*(.+?)(?:\.|$)/gi,
  /(?:going with|opted for|picking)\s+(.+?)(?:\s+(?:because|since|over))/gi,
];

/** Patterns for file paths. */
const FILE_PATTERN = /(?:(?:created?|modif(?:ied|y)|edit(?:ed)?|updat(?:ed)?|delet(?:ed)?|wrote?|fix(?:ed)?)\s+)([`"']?[\w/.@-]+\.\w{1,10}[`"']?)/gi;

/** Extract memories from a session transcript using heuristics. */
function extractFromTranscript(transcript: string): {
  facts: string[];
  decisions: string[];
  files: string[];
} {
  const facts: string[] = [];
  const decisions: string[] = [];
  const files: string[] = [];

  for (const pattern of FACT_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(transcript)) !== null) {
      const fact = match[1].trim();
      if (fact.length > 10 && fact.length < 300) {
        facts.push(fact);
      }
    }
  }

  for (const pattern of DECISION_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(transcript)) !== null) {
      const decision = match[1].trim();
      if (decision.length > 10 && decision.length < 300) {
        decisions.push(decision);
      }
    }
  }

  FILE_PATTERN.lastIndex = 0;
  let fileMatch: RegExpExecArray | null;
  while ((fileMatch = FILE_PATTERN.exec(transcript)) !== null) {
    const filePath = fileMatch[1].replace(/[`"']/g, "");
    if (filePath.includes("/") || filePath.includes(".")) {
      files.push(filePath);
    }
  }

  return {
    facts: [...new Set(facts)],
    decisions: [...new Set(decisions)],
    files: [...new Set(files)],
  };
}

/** Generate a brief summary from the transcript. */
function generateSummary(transcript: string, maxLen = 200): string {
  // Take first meaningful paragraph
  const lines = transcript.split("\n").filter((l) => l.trim().length > 20);
  if (lines.length === 0) return "Session with no extractable summary.";
  const combined = lines.slice(0, 5).join(" ").trim();
  return combined.length > maxLen ? combined.slice(0, maxLen - 3) + "..." : combined;
}

/** Stop hook: extract and persist memories from the session. */
export async function onStop(
  sid: string,
  transcript: string,
  startedAt: string,
  repoRoot?: string
): Promise<HookOutput> {
  const root = repoRoot ?? await findRepoRoot();
  const hermesDir = getHermesDir(root);
  const config = await loadConfig(hermesDir);

  if (!config.autoExtract || !transcript.trim()) {
    return { context: "", memoriesSaved: 0 };
  }

  const existing = await loadMemories(hermesDir);
  const { facts, decisions, files } = extractFromTranscript(transcript);
  let saved = 0;

  // Save extracted facts
  for (const fact of facts.slice(0, 5)) {
    const mem = {
      id: "", type: "fact" as const, content: fact, tags: [],
      createdAt: "", updatedAt: "", source: sid, relevance: 0.6,
    };
    if (!deduplicateMemories(existing, mem)) {
      await createMemory(hermesDir, "fact", fact, [], sid, 0.6);
      saved++;
    }
  }

  // Save extracted decisions
  for (const decision of decisions.slice(0, 3)) {
    const mem = {
      id: "", type: "decision" as const, content: decision, tags: [],
      createdAt: "", updatedAt: "", source: sid, relevance: 0.8,
    };
    if (!deduplicateMemories(existing, mem)) {
      await createMemory(hermesDir, "decision", decision, [], sid, 0.8);
      saved++;
    }
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
