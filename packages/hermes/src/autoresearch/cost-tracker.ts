/**
 * Cost Tracker — tracks LLM token usage and cost per autoresearch experiment.
 *
 * Records each LLM call's input/output tokens, estimates cost,
 * and associates it with the current experiment. Provides budget
 * enforcement and spending reports.
 *
 * Storage: .athena/hermes/research/costs.jsonl (append-only)
 */

import * as fs from "fs/promises";
import * as path from "path";

// ── Types ─────────────────────────────────────────────────────

/** A single LLM call cost record. */
export type CostRecord = {
  timestamp: string;
  /** Associated experiment ID (null for non-experiment calls). */
  experimentId: string | null;
  /** Which LLM operation this was for. */
  operation: "hypothesis-generation" | "memory-extraction" | "consolidation" | "curation" | "other";
  /** Model used. */
  model: string;
  /** Input tokens consumed. */
  inputTokens: number;
  /** Output tokens consumed. */
  outputTokens: number;
  /** Estimated cost in USD. */
  estimatedCostUsd: number;
  /** Session ID. */
  sessionId: string;
};

/** Aggregated cost summary. */
export type CostSummary = {
  totalCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  callCount: number;
  /** Cost breakdown by operation type. */
  byOperation: Record<string, { costUsd: number; calls: number }>;
  /** Cost breakdown by experiment. */
  byExperiment: Record<string, { costUsd: number; calls: number }>;
  /** Cost per day for the last 7 days. */
  dailyCosts: Array<{ date: string; costUsd: number; calls: number }>;
};

/** Cost budget configuration. */
export type CostBudget = {
  /** Maximum USD per day for autoresearch LLM calls. */
  dailyLimitUsd: number;
  /** Maximum USD per experiment. */
  perExperimentLimitUsd: number;
  /** Maximum USD per month. */
  monthlyLimitUsd: number;
};

export const DEFAULT_COST_BUDGET: CostBudget = {
  dailyLimitUsd: 0.50,
  perExperimentLimitUsd: 0.10,
  monthlyLimitUsd: 5.00,
};

// ── Model Pricing ─────────────────────────────────────────────

/** Pricing per 1M tokens (USD) for supported models. */
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "claude-haiku-4-5-20251001": { input: 0.80, output: 4.00 },
  "claude-sonnet-4-6": { input: 3.00, output: 15.00 },
  "claude-opus-4-6": { input: 15.00, output: 75.00 },
};

/** Fallback pricing if model is unknown. Uses haiku pricing. */
const FALLBACK_PRICING = { input: 0.80, output: 4.00 };

/** Estimate cost for a given model and token count. */
export function estimateCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const pricing = MODEL_PRICING[model] ?? FALLBACK_PRICING;
  return (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
}

// ── Paths ─────────────────────────────────────────────────────

function costsFile(hermesDir: string): string {
  return path.join(hermesDir, "research", "costs.jsonl");
}

// ── Record / Load ─────────────────────────────────────────────

/** Append a cost record. */
export async function recordCost(
  hermesDir: string,
  record: CostRecord
): Promise<void> {
  const filePath = costsFile(hermesDir);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.appendFile(filePath, JSON.stringify(record) + "\n", "utf-8");
}

/** Create and record a cost record from raw LLM usage data. */
export async function trackLLMCall(
  hermesDir: string,
  opts: {
    experimentId?: string;
    operation: CostRecord["operation"];
    model: string;
    inputTokens: number;
    outputTokens: number;
    sessionId: string;
  }
): Promise<CostRecord> {
  const record: CostRecord = {
    timestamp: new Date().toISOString(),
    experimentId: opts.experimentId ?? null,
    operation: opts.operation,
    model: opts.model,
    inputTokens: opts.inputTokens,
    outputTokens: opts.outputTokens,
    estimatedCostUsd: estimateCost(opts.model, opts.inputTokens, opts.outputTokens),
    sessionId: opts.sessionId,
  };
  await recordCost(hermesDir, record);
  return record;
}

/** Load all cost records. */
export async function loadCostRecords(hermesDir: string): Promise<CostRecord[]> {
  const filePath = costsFile(hermesDir);
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return raw
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => {
        try { return JSON.parse(l) as CostRecord; }
        catch { return null; }
      })
      .filter((r): r is CostRecord => r !== null);
  } catch {
    return [];
  }
}

// ── Budget Checks ─────────────────────────────────────────────

/** Check if we're within budget for a new LLM call. */
export async function checkBudget(
  hermesDir: string,
  budget: CostBudget = DEFAULT_COST_BUDGET,
  experimentId?: string
): Promise<{ allowed: boolean; reason?: string }> {
  const records = await loadCostRecords(hermesDir);

  // Daily limit
  const todayPrefix = new Date().toISOString().slice(0, 10);
  const todayRecords = records.filter((r) => r.timestamp.startsWith(todayPrefix));
  const todayCost = todayRecords.reduce((sum, r) => sum + r.estimatedCostUsd, 0);
  if (todayCost >= budget.dailyLimitUsd) {
    return { allowed: false, reason: `Daily budget exhausted: $${todayCost.toFixed(3)} / $${budget.dailyLimitUsd.toFixed(2)}` };
  }

  // Per-experiment limit
  if (experimentId) {
    const expRecords = records.filter((r) => r.experimentId === experimentId);
    const expCost = expRecords.reduce((sum, r) => sum + r.estimatedCostUsd, 0);
    if (expCost >= budget.perExperimentLimitUsd) {
      return { allowed: false, reason: `Experiment budget exhausted: $${expCost.toFixed(3)} / $${budget.perExperimentLimitUsd.toFixed(2)}` };
    }
  }

  // Monthly limit
  const monthPrefix = new Date().toISOString().slice(0, 7);
  const monthRecords = records.filter((r) => r.timestamp.startsWith(monthPrefix));
  const monthCost = monthRecords.reduce((sum, r) => sum + r.estimatedCostUsd, 0);
  if (monthCost >= budget.monthlyLimitUsd) {
    return { allowed: false, reason: `Monthly budget exhausted: $${monthCost.toFixed(3)} / $${budget.monthlyLimitUsd.toFixed(2)}` };
  }

  return { allowed: true };
}

// ── Summary ───────────────────────────────────────────────────

/** Generate a cost summary from all records. */
export async function getCostSummary(hermesDir: string): Promise<CostSummary> {
  const records = await loadCostRecords(hermesDir);

  const summary: CostSummary = {
    totalCostUsd: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    callCount: records.length,
    byOperation: {},
    byExperiment: {},
    dailyCosts: [],
  };

  const dailyMap = new Map<string, { costUsd: number; calls: number }>();

  for (const r of records) {
    summary.totalCostUsd += r.estimatedCostUsd;
    summary.totalInputTokens += r.inputTokens;
    summary.totalOutputTokens += r.outputTokens;

    // By operation
    const op = summary.byOperation[r.operation] ?? { costUsd: 0, calls: 0 };
    op.costUsd += r.estimatedCostUsd;
    op.calls++;
    summary.byOperation[r.operation] = op;

    // By experiment
    if (r.experimentId) {
      const exp = summary.byExperiment[r.experimentId] ?? { costUsd: 0, calls: 0 };
      exp.costUsd += r.estimatedCostUsd;
      exp.calls++;
      summary.byExperiment[r.experimentId] = exp;
    }

    // Daily
    const day = r.timestamp.slice(0, 10);
    const daily = dailyMap.get(day) ?? { costUsd: 0, calls: 0 };
    daily.costUsd += r.estimatedCostUsd;
    daily.calls++;
    dailyMap.set(day, daily);
  }

  // Last 7 days
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const daily = dailyMap.get(dateStr) ?? { costUsd: 0, calls: 0 };
    summary.dailyCosts.push({ date: dateStr, ...daily });
  }

  return summary;
}

/** Format cost summary for display. */
export function formatCostSummary(summary: CostSummary): string {
  const lines: string[] = ["## AutoResearch — Cost Report", ""];

  lines.push(`**Total:** $${summary.totalCostUsd.toFixed(4)} (${summary.callCount} LLM calls)`);
  lines.push(`**Tokens:** ${summary.totalInputTokens.toLocaleString()} input / ${summary.totalOutputTokens.toLocaleString()} output`);
  lines.push("");

  // By operation
  if (Object.keys(summary.byOperation).length > 0) {
    lines.push("**By Operation:**");
    for (const [op, data] of Object.entries(summary.byOperation)) {
      lines.push(`  - ${op}: $${data.costUsd.toFixed(4)} (${data.calls} calls)`);
    }
    lines.push("");
  }

  // Daily trend (last 7 days)
  if (summary.dailyCosts.some((d) => d.calls > 0)) {
    lines.push("**Daily (last 7 days):**");
    for (const d of summary.dailyCosts) {
      const bar = "\u2588".repeat(Math.ceil(d.costUsd * 200)); // scale bar
      lines.push(`  ${d.date}  ${bar || "\u2591"} $${d.costUsd.toFixed(4)} (${d.calls} calls)`);
    }
  }

  return lines.join("\n");
}
