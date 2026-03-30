/**
 * LLM-powered memory extraction from session transcripts.
 * Uses Anthropic API (Claude) to intelligently extract memories
 * instead of brittle regex patterns. Falls back to heuristics
 * if no API key is available.
 */

import type { MemoryType } from "./types";
import { extractBalancedJson } from "./json-extract";

/** Extracted memory from a transcript. */
export type ExtractedMemory = {
  type: MemoryType;
  content: string;
  relevance: number;
};

/** Result of transcript extraction. */
export type ExtractionResult = {
  memories: ExtractedMemory[];
  summary: string;
  filesTouched: string[];
  unfinished: string[];
  method: "llm" | "heuristic";
};

/** Truncate a transcript to fit within token limits. Keep last N chars (conclusion matters more). */
function truncateTranscript(transcript: string, maxChars = 12000): string {
  if (transcript.length <= maxChars) return transcript;
  // Keep the first 2000 chars (intro context) and the last 10000 chars (conclusion)
  return (
    transcript.slice(0, 2000) +
    "\n\n[...transcript truncated...]\n\n" +
    transcript.slice(-10000)
  );
}

/** Smart per-tool transcript summarization (inspired by claude-subconscious). */
export function summarizeToolCalls(transcript: string): string {
  const lines = transcript.split("\n");
  const summarized: string[] = [];

  for (const line of lines) {
    // Compress tool results — keep just the tool name and key info
    if (line.includes("tool_result") || line.includes("Tool output")) {
      // Truncate large tool outputs
      if (line.length > 500) {
        summarized.push(line.slice(0, 500) + "...[truncated]");
        continue;
      }
    }
    summarized.push(line);
  }

  return summarized.join("\n");
}

const EXTRACTION_PROMPT = `You are a memory extraction system. Analyze this Claude Code session transcript and extract important memories that would be useful in future sessions.

Extract memories into these categories:
- **fact**: Technical facts about the project (stack, architecture, conventions)
- **decision**: Architectural or implementation decisions made during the session
- **preference**: User preferences for code style, tools, communication
- **project-context**: Current project state, known issues, gotchas
- **pattern**: Recurring behaviors, common workflows, frequently used patterns
- **pending**: Unfinished work, explicit TODOs, items to follow up on
- **guidance**: Lessons learned, things to remember for next time

Rules:
- Extract 3-10 memories total, prioritizing high-value information
- Each memory should be a single, concise sentence (under 200 chars)
- Assign relevance 0.0-1.0 (decisions and preferences are highest)
- Skip trivial observations and focus on what would help a NEW session
- Include a brief summary of what happened in this session
- List files that were touched/modified
- List any unfinished work or TODOs

Respond with ONLY valid JSON in this exact format:
{
  "memories": [
    {"type": "decision", "content": "...", "relevance": 0.9},
    {"type": "fact", "content": "...", "relevance": 0.7}
  ],
  "summary": "Brief 1-2 sentence summary of the session",
  "filesTouched": ["path/to/file.ts"],
  "unfinished": ["Description of unfinished work"]
}`;

/** Extract memories using the Anthropic API. */
export async function extractWithLLM(
  transcript: string,
  apiKey: string
): Promise<ExtractionResult> {
  const truncated = truncateTranscript(summarizeToolCalls(transcript));

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `${EXTRACTION_PROMPT}\n\n<transcript>\n${truncated}\n</transcript>`,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Anthropic API error: ${response.status}`);
  }

  const data = await response.json() as {
    content: Array<{ type: string; text?: string }>;
  };
  const text = data.content?.[0]?.text ?? "";

  // Parse the JSON response — handle markdown code fences
  const jsonStr = extractBalancedJson(text);
  if (!jsonStr) {
    throw new Error("No JSON found in LLM response");
  }

  const parsed = JSON.parse(jsonStr) as {
    memories?: Array<{ type: string; content: string; relevance: number }>;
    summary?: string;
    filesTouched?: string[];
    unfinished?: string[];
  };

  const validTypes = new Set([
    "fact", "decision", "preference", "project-context",
    "pattern", "pending", "guidance",
  ]);

  const memories: ExtractedMemory[] = (parsed.memories ?? [])
    .filter((m) => validTypes.has(m.type) && m.content?.length > 5)
    .map((m) => ({
      type: m.type as MemoryType,
      content: m.content.slice(0, 300),
      relevance: Math.max(0, Math.min(1, m.relevance ?? 0.5)),
    }));

  return {
    memories,
    summary: parsed.summary ?? "Session completed.",
    filesTouched: parsed.filesTouched ?? [],
    unfinished: parsed.unfinished ?? [],
    method: "llm",
  };
}

// ── Heuristic Fallback (existing regex approach, improved) ──────

const FACT_PATTERNS = [
  /(?:this (?:project|repo|codebase) (?:uses?|has|runs?))\s+(.+?)(?:\.|$)/gi,
  /(?:we (?:chose|decided|switched to|use|are using))\s+(.+?)(?:\.|$)/gi,
  /(?:the (?:deploy|build|test) (?:target|command|process) is)\s+(.+?)(?:\.|$)/gi,
  /(?:important|note|remember):\s*(.+?)(?:\.|$)/gi,
];

const DECISION_PATTERNS = [
  /(?:decided to|decision:|we (?:will|should|chose to))\s+(.+?)(?:\.|$)/gi,
  /(?:architectural (?:decision|choice)|design decision):\s*(.+?)(?:\.|$)/gi,
  /(?:going with|opted for|picking)\s+(.+?)(?:\s+(?:because|since|over))/gi,
];

const PREFERENCE_PATTERNS = [
  /(?:prefer|always use|never use|style:)\s+(.+?)(?:\.|$)/gi,
  /(?:don't|do not|stop)\s+(.{10,80})(?:\.|$)/gi,
];

const FILE_PATTERN =
  /(?:(?:created?|modif(?:ied|y)|edit(?:ed)?|updat(?:ed)?|delet(?:ed)?|wrote?|fix(?:ed)?)\s+)([`"']?[\w/.@-]+\/[\w/.@-]+\.[a-zA-Z]{1,10}[`"']?)/gi;

function extractPatterns(transcript: string, patterns: RegExp[]): string[] {
  const results: string[] = [];
  for (const pattern of patterns) {
    // Create fresh regex to avoid lastIndex issues
    const fresh = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = fresh.exec(transcript)) !== null) {
      const text = match[1].trim();
      if (text.length > 10 && text.length < 300) {
        results.push(text);
      }
    }
  }
  return [...new Set(results)];
}

/** Heuristic extraction fallback when no API key is available. */
export function extractWithHeuristics(transcript: string): ExtractionResult {
  const facts = extractPatterns(transcript, FACT_PATTERNS).slice(0, 5);
  const decisions = extractPatterns(transcript, DECISION_PATTERNS).slice(0, 3);
  const preferences = extractPatterns(transcript, PREFERENCE_PATTERNS).slice(0, 3);

  const filePattern = new RegExp(FILE_PATTERN.source, FILE_PATTERN.flags);
  const files: string[] = [];
  let fileMatch: RegExpExecArray | null;
  while ((fileMatch = filePattern.exec(transcript)) !== null) {
    const filePath = fileMatch[1].replace(/[`"']/g, "");
    if (filePath.includes("/")) files.push(filePath);
  }

  const memories: ExtractedMemory[] = [
    ...facts.map((c) => ({ type: "fact" as MemoryType, content: c, relevance: 0.6 })),
    ...decisions.map((c) => ({ type: "decision" as MemoryType, content: c, relevance: 0.8 })),
    ...preferences.map((c) => ({ type: "preference" as MemoryType, content: c, relevance: 0.7 })),
  ];

  // Generate summary from last meaningful lines
  const lines = transcript.split("\n").filter((l) => l.trim().length > 20);
  const tail = lines.slice(-5);
  const combined = tail.join(" ").trim();
  const summary = combined.length > 200 ? combined.slice(0, 197) + "..." : combined || "Session completed.";

  return {
    memories,
    summary,
    filesTouched: [...new Set(files)].slice(0, 20),
    unfinished: [],
    method: "heuristic",
  };
}

/** Extract memories — tries LLM first, falls back to heuristics. */
export async function extractMemories(
  transcript: string,
  apiKey?: string
): Promise<ExtractionResult> {
  if (apiKey && transcript.trim().length > 50) {
    try {
      return await extractWithLLM(transcript, apiKey);
    } catch {
      // LLM failed — fall back silently
    }
  }
  return extractWithHeuristics(transcript);
}
