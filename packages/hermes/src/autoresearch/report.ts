/**
 * Research Reporting — human-readable summaries of autoresearch state.
 *
 * Generates markdown reports for:
 *   - Current research status (active experiment, last result)
 *   - Experiment history (like autoresearch's results.tsv)
 *   - Effectiveness trend over time
 */

import type { ResearchLog, Experiment, EffectivenessScore } from "./types";
import { loadResearchLog } from "./experiment-store";

// ── Status Report ─────────────────────────────────────────────

/**
 * Format current research status for context injection.
 *
 * Used by session-start hook to show brief research state.
 */
export function formatResearchStatus(log: ResearchLog): string {
  if (log.experiments.length === 0 && !log.currentBaseline) {
    return "";
  }

  const lines: string[] = [];

  // Active experiment
  const active = log.experiments.find((e) => e.status === "running");
  if (active) {
    const progress = `${active.observedSessions.length}/${active.sessionWindow}`;
    lines.push(
      `**AutoResearch** — Experiment #${log.experimentsRun}: "${active.hypothesis.description}" (${progress} sessions observed)`
    );
  }

  // Last completed experiment
  const completed = log.experiments.filter((e) => e.status !== "running");
  if (completed.length > 0) {
    const last = completed[completed.length - 1];
    const status = last.status === "kept" ? "KEPT" : "DISCARDED";
    const delta = last.comparison ? formatDelta(last.comparison.delta) : "n/a";
    lines.push(
      `Last experiment: [${status}] "${last.hypothesis.description}" (delta: ${delta})`
    );
  }

  // Overall stats
  if (log.experimentsRun > 0) {
    const keepRate = log.experimentsKept / log.experimentsRun;
    lines.push(
      `Research stats: ${log.experimentsRun} experiments, ${log.experimentsKept} kept (${(keepRate * 100).toFixed(0)}%), total improvement: ${formatDelta(log.totalImprovement)}`
    );
  }

  return lines.join("\n");
}

// ── Experiment History ────────────────────────────────────────

/**
 * Format experiment history as a markdown table (like results.tsv).
 */
export function formatExperimentHistory(log: ResearchLog): string {
  if (log.experiments.length === 0) {
    return "_No experiments run yet._";
  }

  const lines: string[] = [
    "## AutoResearch — Experiment History",
    "",
    "| # | Status | Hypothesis | Delta | Baseline | Result | Sessions | Source |",
    "|---|--------|------------|-------|----------|--------|----------|--------|",
  ];

  for (let i = 0; i < log.experiments.length; i++) {
    const exp = log.experiments[i];
    const status = exp.status === "kept" ? "KEPT" : exp.status === "discarded" ? "DISC" : "RUN";
    const delta = exp.comparison ? formatDelta(exp.comparison.delta) : "—";
    const baseline = exp.baselineScore.value.toFixed(3);
    const result = exp.resultScore ? exp.resultScore.value.toFixed(3) : "—";
    const sessions = `${exp.observedSessions.length}/${exp.sessionWindow}`;
    const desc = exp.hypothesis.description.slice(0, 50);
    const source = exp.hypothesis.source.replace(/-/g, " ");

    lines.push(`| ${i + 1} | ${status} | ${desc} | ${delta} | ${baseline} | ${result} | ${sessions} | ${source} |`);
  }

  // Summary row
  lines.push("");
  lines.push(`_Total: ${log.experimentsRun} experiments, ${log.experimentsKept} kept, ${log.experimentsDiscarded} discarded. Cumulative improvement: ${formatDelta(log.totalImprovement)}_`);

  return lines.join("\n");
}

// ── Effectiveness Trend ───────────────────────────────────────

/**
 * Format effectiveness scores as a text-based trend visualization.
 */
export function formatEffectivenessTrend(scores: EffectivenessScore[]): string {
  if (scores.length === 0) return "_No effectiveness data._";

  const lines: string[] = [
    "## Effectiveness Trend",
    "",
  ];

  const maxBarLen = 30;

  for (const score of scores) {
    const bar = sparkBar(score.value, maxBarLen);
    const date = score.computedAt.slice(0, 10);
    lines.push(`${date}  ${bar} ${score.value.toFixed(3)}  (corr: ${score.corrections.toFixed(1)}, rules: ${(score.rulePassRate * 100).toFixed(0)}%)`);
  }

  // Min/max/avg
  const values = scores.map((s) => s.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  lines.push("");
  lines.push(`Min: ${min.toFixed(3)} | Max: ${max.toFixed(3)} | Avg: ${avg.toFixed(3)}`);

  return lines.join("\n");
}

// ── Full Report ───────────────────────────────────────────────

/**
 * Generate a complete research report combining all sections.
 */
export async function generateFullReport(hermesDir: string): Promise<string> {
  const log = await loadResearchLog(hermesDir);

  const sections: string[] = [];

  // Status
  const status = formatResearchStatus(log);
  if (status) {
    sections.push("## Current Status\n\n" + status);
  }

  // History
  sections.push(formatExperimentHistory(log));

  // Trend from experiment baselines + results
  const scores: EffectivenessScore[] = [];
  if (log.currentBaseline) scores.push(log.currentBaseline);
  for (const exp of log.experiments) {
    if (exp.resultScore) scores.push(exp.resultScore);
  }
  if (scores.length > 0) {
    sections.push(formatEffectivenessTrend(scores));
  }

  return sections.join("\n\n---\n\n");
}

// ── Helpers ───────────────────────────────────────────────────

function formatDelta(delta: number): string {
  const sign = delta >= 0 ? "+" : "";
  return `${sign}${delta.toFixed(3)}`;
}

function sparkBar(value: number, maxLen: number): string {
  const filled = Math.round(value * maxLen);
  return "\u2588".repeat(filled) + "\u2591".repeat(maxLen - filled);
}
