/**
 * AutoResearch Types — core data structures for the self-improving research loop.
 *
 * Inspired by karpathy/autoresearch: an agent autonomously runs
 * hypothesis → modify → evaluate → decide (keep/discard) cycles
 * to improve its own effectiveness over time.
 *
 * Unlike autoresearch's single-shot overnight loop, Hermes runs
 * incrementally across sessions — each session contributes data
 * to the current experiment.
 */

import type { Memory } from "../types";

// ── Effectiveness Metric ──────────────────────────────────────

/** Composite effectiveness score — the single metric we optimize. */
export type EffectivenessScore = {
  /** Overall composite score (0-1, higher is better). */
  value: number;
  /** Average corrections per session in the window. */
  corrections: number;
  /** Fraction of verification rules that passed (0-1). */
  rulePassRate: number;
  /** Normalized feedback score (-1 to 1). */
  feedbackNet: number;
  /** Ratio of surfaced memories that were useful (0-1). */
  memoryPrecision: number;
  /** Number of sessions used to compute this score. */
  sessionCount: number;
  /** ISO timestamp when computed. */
  computedAt: string;
};

/** Comparison between two effectiveness scores. */
export type ScoreComparison = {
  /** Absolute delta (result - baseline). */
  delta: number;
  /** Whether the result improved over baseline. */
  improved: boolean;
  /** Whether the improvement exceeds minImprovement threshold. */
  significant: boolean;
  /** Per-component deltas for debugging. */
  components: {
    corrections: number;
    rulePassRate: number;
    feedbackNet: number;
    memoryPrecision: number;
  };
};

// ── Experiments ───────────────────────────────────────────────

/** A snapshot of a memory before/after a change. */
export type MemoryDelta = {
  action: "add" | "update" | "delete";
  memoryId: string;
  /** Snapshot before the change (null for "add"). */
  before: Memory | null;
  /** Snapshot after the change (null for "delete"). */
  after: Memory | null;
};

/** A hypothesis to test — what we think will improve effectiveness. */
export type Hypothesis = {
  id: string;
  /** Human-readable description of what we're testing. */
  description: string;
  /** Expected impact level. */
  expectedImpact: "high" | "medium" | "low";
  /** The memory changes to apply. */
  changes: MemoryDelta[];
  /** Why we think this will help. */
  rationale: string;
  /** Source of the hypothesis. */
  source: "recurring-violation" | "negative-feedback" | "correction-pattern" | "retrieval-miss" | "llm-suggested";
};

/** An experiment — one cycle of the research loop. */
export type Experiment = {
  id: string;
  /** The hypothesis being tested. */
  hypothesis: Hypothesis;
  /** Effectiveness score before the experiment. */
  baselineScore: EffectivenessScore;
  /** Effectiveness score after the experiment (set when complete). */
  resultScore: EffectivenessScore | null;
  /** Current status. */
  status: "running" | "kept" | "discarded";
  /** How many sessions to observe before evaluating. */
  sessionWindow: number;
  /** Session IDs observed during this experiment. */
  observedSessions: string[];
  /** ISO timestamp when started. */
  startedAt: string;
  /** ISO timestamp when completed (null if running). */
  completedAt: string | null;
  /** Score comparison (set when complete). */
  comparison: ScoreComparison | null;
};

// ── Research Log ──────────────────────────────────────────────

/** The full research log — tracks all experiments and overall progress. */
export type ResearchLog = {
  /** All experiments, chronologically. */
  experiments: Experiment[];
  /** Current baseline effectiveness score. */
  currentBaseline: EffectivenessScore | null;
  /** Cumulative improvement from the first baseline. */
  totalImprovement: number;
  /** ISO timestamp when research started. */
  startedAt: string;
  /** Total experiments run. */
  experimentsRun: number;
  /** Total experiments kept. */
  experimentsKept: number;
  /** Total experiments discarded. */
  experimentsDiscarded: number;
};

// ── Configuration ─────────────────────────────────────────────

/** AutoResearch configuration (nested under HermesConfig.research). */
export type ResearchConfig = {
  /** Whether autoresearch is enabled. Default: false. */
  enabled: boolean;
  /** Number of sessions to observe per experiment. Default: 5. */
  sessionWindow: number;
  /** Minimum improvement delta to keep an experiment. Default: 0.02. */
  minImprovement: number;
  /** Max experiments per day (prevents runaway). Default: 3. */
  maxExperimentsPerDay: number;
  /** Minimum sessions of baseline data before first experiment. Default: 5. */
  minBaselineSessions: number;
  /** Cooldown sessions between experiments. Default: 1. */
  cooldownSessions: number;
};

/** Default research configuration. */
export const DEFAULT_RESEARCH_CONFIG: ResearchConfig = {
  enabled: false,
  sessionWindow: 5,
  minImprovement: 0.02,
  maxExperimentsPerDay: 3,
  minBaselineSessions: 5,
  cooldownSessions: 1,
};

// ── Research Events (for event-log integration) ───────────────

/** Event types specific to autoresearch. */
export type ResearchEventType =
  | "research.baseline_recorded"
  | "research.experiment_started"
  | "research.experiment_evaluated"
  | "research.experiment_kept"
  | "research.experiment_discarded"
  | "research.experiment_reverted"
  | "research.hypothesis_generated";
