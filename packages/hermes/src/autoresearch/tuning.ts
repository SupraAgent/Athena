/**
 * Retrieval Parameter Tuning — extends autoresearch to optimize retrieval config.
 *
 * Instead of just modifying memories, this module can propose changes to
 * the tunable parameters in Hermes's retrieval pipeline:
 *
 *   - BM25 parameters (K1, B)
 *   - Semantic search weights (BM25 vs keyword vs relevance)
 *   - Ranking weights (relevance vs recency vs branch context)
 *   - Recency decay half-life
 *   - Similarity thresholds
 *   - Token budget / context limit
 *   - Synonym expansion weight
 *
 * Tuning overrides are stored in .athena/hermes/research/tuning.yaml
 * and applied at runtime by patching the retrieval functions.
 */

import * as fs from "fs/promises";
import * as path from "path";
import * as YAML from "yaml";
import * as crypto from "crypto";
import type { Hypothesis, MemoryDelta } from "./types";

// ── Tunable Parameters ────────────────────────────────────────

/** All tunable retrieval parameters with their bounds. */
export type TunableParam = {
  /** Parameter identifier. */
  key: string;
  /** Human-readable label. */
  label: string;
  /** Current value. */
  value: number;
  /** Default value (factory setting). */
  defaultValue: number;
  /** Minimum allowed value. */
  min: number;
  /** Maximum allowed value. */
  max: number;
  /** Step size for perturbation. */
  step: number;
  /** Which component this belongs to. */
  group: "bm25" | "search-weights" | "ranking" | "thresholds" | "budget";
};

/** The full set of tunable parameters. */
export const TUNABLE_PARAMS: TunableParam[] = [
  // BM25 core
  { key: "bm25.k1", label: "BM25 K1 (TF saturation)", value: 1.2, defaultValue: 1.2, min: 0.5, max: 3.0, step: 0.2, group: "bm25" },
  { key: "bm25.b", label: "BM25 B (length normalization)", value: 0.75, defaultValue: 0.75, min: 0.0, max: 1.0, step: 0.1, group: "bm25" },
  { key: "bm25.synonymWeight", label: "Synonym expansion weight", value: 0.5, defaultValue: 0.5, min: 0.0, max: 1.0, step: 0.1, group: "bm25" },

  // Search scoring weights (must sum to ~1.0)
  { key: "search.bm25Weight", label: "Search: BM25 component weight", value: 0.55, defaultValue: 0.55, min: 0.2, max: 0.8, step: 0.05, group: "search-weights" },
  { key: "search.keywordWeight", label: "Search: keyword overlap weight", value: 0.25, defaultValue: 0.25, min: 0.05, max: 0.5, step: 0.05, group: "search-weights" },
  { key: "search.relevanceWeight", label: "Search: memory relevance weight", value: 0.2, defaultValue: 0.2, min: 0.05, max: 0.5, step: 0.05, group: "search-weights" },

  // Memory ranking weights (session-start)
  { key: "ranking.relevanceWeight", label: "Rank: relevance weight", value: 0.6, defaultValue: 0.6, min: 0.2, max: 0.9, step: 0.05, group: "ranking" },
  { key: "ranking.recencyWeight", label: "Rank: recency weight", value: 0.25, defaultValue: 0.25, min: 0.05, max: 0.5, step: 0.05, group: "ranking" },
  { key: "ranking.branchWeight", label: "Rank: branch context multiplier", value: 0.75, defaultValue: 0.75, min: 0.0, max: 1.5, step: 0.15, group: "ranking" },
  { key: "ranking.recencyHalfLifeDays", label: "Rank: recency half-life (days)", value: 30, defaultValue: 30, min: 7, max: 90, step: 7, group: "ranking" },

  // Thresholds
  { key: "threshold.similarity", label: "Similarity threshold", value: 0.6, defaultValue: 0.6, min: 0.3, max: 0.9, step: 0.05, group: "thresholds" },
  { key: "threshold.minBm25", label: "Min BM25 score filter", value: 0.05, defaultValue: 0.05, min: 0.0, max: 0.2, step: 0.025, group: "thresholds" },

  // Budget
  { key: "budget.tokenBudget", label: "Token budget", value: 2000, defaultValue: 2000, min: 500, max: 5000, step: 250, group: "budget" },
];

/** Snapshot of tuning overrides. */
export type TuningOverrides = Record<string, number>;

// ── Persistence ───────────────────────────────────────────────

function tuningFile(hermesDir: string): string {
  return path.join(hermesDir, "research", "tuning.yaml");
}

/** Load current tuning overrides from disk. */
export async function loadTuningOverrides(hermesDir: string): Promise<TuningOverrides> {
  try {
    const raw = await fs.readFile(tuningFile(hermesDir), "utf-8");
    return (YAML.parse(raw) as TuningOverrides) ?? {};
  } catch {
    return {};
  }
}

/** Save tuning overrides to disk. */
export async function saveTuningOverrides(
  hermesDir: string,
  overrides: TuningOverrides
): Promise<void> {
  const filePath = tuningFile(hermesDir);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${crypto.randomBytes(4).toString("hex")}.tmp`;
  await fs.writeFile(tmpPath, YAML.stringify(overrides), "utf-8");
  await fs.rename(tmpPath, filePath);
}

/** Get the effective value of a tunable parameter (override or default). */
export function getEffectiveValue(key: string, overrides: TuningOverrides): number {
  if (key in overrides) return overrides[key];
  const param = TUNABLE_PARAMS.find((p) => p.key === key);
  return param?.defaultValue ?? 0;
}

/** Get all effective parameter values. */
export function getAllEffectiveValues(overrides: TuningOverrides): Record<string, number> {
  const result: Record<string, number> = {};
  for (const param of TUNABLE_PARAMS) {
    result[param.key] = overrides[param.key] ?? param.defaultValue;
  }
  return result;
}

// ── Tuning Hypothesis Generation ──────────────────────────────

/**
 * Generate a hypothesis that perturbs a retrieval parameter.
 *
 * Strategy: pick a random parameter and nudge it by one step in a
 * direction that hasn't been tried recently.
 */
export function generateTuningHypothesis(
  overrides: TuningOverrides,
  triedParams: Set<string>
): Hypothesis | null {
  // Filter to params we haven't tried recently
  const candidates = TUNABLE_PARAMS.filter((p) => !triedParams.has(p.key));
  if (candidates.length === 0) return null;

  // Pick one at random
  const param = candidates[Math.floor(Math.random() * candidates.length)];
  const currentValue = overrides[param.key] ?? param.defaultValue;

  // Decide direction: if above default, try going lower; if below, try going higher
  // If at default, randomly pick
  let direction: number;
  if (currentValue > param.defaultValue) {
    direction = -1;
  } else if (currentValue < param.defaultValue) {
    direction = 1;
  } else {
    direction = Math.random() > 0.5 ? 1 : -1;
  }

  const newValue = Math.max(param.min, Math.min(param.max, currentValue + param.step * direction));
  if (newValue === currentValue) {
    // Try the other direction
    const altValue = Math.max(param.min, Math.min(param.max, currentValue - param.step * direction));
    if (altValue === currentValue) return null; // Already at bounds
    return buildTuningHypothesis(param, currentValue, altValue);
  }

  return buildTuningHypothesis(param, currentValue, newValue);
}

function buildTuningHypothesis(
  param: TunableParam,
  currentValue: number,
  newValue: number
): Hypothesis {
  const direction = newValue > currentValue ? "increase" : "decrease";
  const ts = Date.now().toString(36);
  const rand = crypto.randomBytes(3).toString("hex");

  return {
    id: `hyp_tune_${ts}_${rand}`,
    description: `Tune ${param.label}: ${currentValue} → ${newValue}`,
    expectedImpact: "medium",
    changes: [], // Tuning doesn't use MemoryDeltas — uses TuningOverrides instead
    rationale: `${direction === "increase" ? "Increasing" : "Decreasing"} ${param.label} from ${currentValue} to ${newValue} (group: ${param.group}). Testing if this improves retrieval quality.`,
    source: "retrieval-miss",
  };
}

/**
 * Apply a tuning hypothesis by updating the overrides file.
 *
 * Returns the old and new values so they can be reverted.
 */
export async function applyTuningChange(
  hermesDir: string,
  paramKey: string,
  newValue: number
): Promise<{ oldValue: number; newValue: number }> {
  const overrides = await loadTuningOverrides(hermesDir);
  const param = TUNABLE_PARAMS.find((p) => p.key === paramKey);
  const oldValue = overrides[paramKey] ?? param?.defaultValue ?? 0;
  overrides[paramKey] = newValue;
  await saveTuningOverrides(hermesDir, overrides);
  return { oldValue, newValue };
}

/**
 * Revert a tuning change by restoring the old value.
 */
export async function revertTuningChange(
  hermesDir: string,
  paramKey: string,
  oldValue: number
): Promise<void> {
  const overrides = await loadTuningOverrides(hermesDir);
  const param = TUNABLE_PARAMS.find((p) => p.key === paramKey);
  if (param && oldValue === param.defaultValue) {
    delete overrides[paramKey]; // Remove override to restore default
  } else {
    overrides[paramKey] = oldValue;
  }
  await saveTuningOverrides(hermesDir, overrides);
}

/** Format current tuning state for display. */
export function formatTuningStatus(overrides: TuningOverrides): string {
  const modified = TUNABLE_PARAMS.filter((p) => p.key in overrides);
  if (modified.length === 0) return "_All retrieval parameters at defaults._";

  const lines = ["**Tuning Overrides:**"];
  for (const param of modified) {
    const val = overrides[param.key];
    const diff = val - param.defaultValue;
    const sign = diff >= 0 ? "+" : "";
    lines.push(`  - ${param.label}: ${val} (${sign}${diff.toFixed(2)} from default ${param.defaultValue})`);
  }
  return lines.join("\n");
}
