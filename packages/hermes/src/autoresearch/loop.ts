/**
 * AutoResearch Loop — the core incremental research loop.
 *
 * Unlike karpathy/autoresearch which runs overnight in a tight loop,
 * Hermes runs incrementally: each session contributes one data point.
 * The loop is driven by the stop hook's background worker.
 *
 * Flow per session:
 *   1. Compute current effectiveness score
 *   2. If active experiment → record observation, check if window reached
 *      → If yes: evaluate → keep or discard → revert if needed
 *   3. If no active experiment → check if ready for next
 *      → If yes: generate hypotheses → pick top → apply → start experiment
 *      → If no: just record baseline
 */

import type { Memory } from "../types";
import type { ResearchConfig, EffectivenessScore, Experiment, Hypothesis, MemoryDelta } from "./types";
import { DEFAULT_RESEARCH_CONFIG } from "./types";
import { computeEffectiveness } from "./effectiveness";
import {
  loadResearchLog,
  getActiveExperiment,
  recordSessionObservation,
  completeExperiment,
  createExperiment,
  updateBaseline,
  countExperimentsToday,
  getLastCompletedExperiment,
} from "./experiment-store";
import { generateHypotheses } from "./hypotheses";
import { loadScorecards } from "../session-scoring";
import { loadFeedbackSignals, computeScores } from "../feedback-loop";
import { loadMemories, saveMemory, updateMemory, deleteMemory } from "../memory-store";
import { logEvent } from "../event-log";

// ── Result Type ───────────────────────────────────────────────

export type LoopResult = {
  /** What action the loop took. */
  action:
    | "disabled"
    | "baseline_recorded"
    | "observation_recorded"
    | "experiment_evaluated_kept"
    | "experiment_evaluated_discarded"
    | "experiment_started"
    | "cooldown"
    | "rate_limited"
    | "insufficient_data"
    | "no_hypotheses";
  /** Human-readable description. */
  summary: string;
  /** The active or just-completed experiment, if any. */
  experiment?: Experiment;
  /** Current effectiveness score. */
  score?: EffectivenessScore;
};

// ── Main Entry Point ──────────────────────────────────────────

/**
 * Run one iteration of the autoresearch loop.
 *
 * Called from the stop hook after each session ends.
 * This is the main orchestrator that decides what to do.
 */
export async function onSessionComplete(
  hermesDir: string,
  sessionId: string,
  config: ResearchConfig = DEFAULT_RESEARCH_CONFIG,
  apiKey?: string
): Promise<LoopResult> {
  if (!config.enabled) {
    return { action: "disabled", summary: "AutoResearch is disabled." };
  }

  // Compute current effectiveness score
  const scorecards = await loadScorecards(hermesDir);
  const feedbackSignals = await loadFeedbackSignals(hermesDir);
  const feedbackScores = computeScores(feedbackSignals);
  const score = computeEffectiveness(scorecards, feedbackScores);

  if (!score) {
    return { action: "insufficient_data", summary: "Not enough session data to compute effectiveness." };
  }

  // Check for active experiment
  const activeExp = await getActiveExperiment(hermesDir);

  if (activeExp) {
    return handleActiveExperiment(hermesDir, activeExp, sessionId, score, config);
  }

  return handleNoExperiment(hermesDir, sessionId, score, config, apiKey);
}

// ── Active Experiment Handling ────────────────────────────────

async function handleActiveExperiment(
  hermesDir: string,
  experiment: Experiment,
  sessionId: string,
  score: EffectivenessScore,
  config: ResearchConfig
): Promise<LoopResult> {
  // Record this session as an observation
  const updated = await recordSessionObservation(hermesDir, experiment.id, sessionId);
  if (!updated) {
    return { action: "observation_recorded", summary: "Failed to record observation.", score };
  }

  // Check if we have enough observations
  if (updated.observedSessions.length < experiment.sessionWindow) {
    const remaining = experiment.sessionWindow - updated.observedSessions.length;
    return {
      action: "observation_recorded",
      summary: `Experiment "${experiment.hypothesis.description}" — ${updated.observedSessions.length}/${experiment.sessionWindow} sessions observed (${remaining} remaining).`,
      experiment: updated,
      score,
    };
  }

  // Window complete — evaluate
  // Compute effectiveness only from sessions in the experiment window
  const windowCards = (await loadScorecards(hermesDir)).slice(-experiment.sessionWindow);
  const windowFeedback = computeScores(await loadFeedbackSignals(hermesDir));
  const windowScore = computeEffectiveness(windowCards, windowFeedback) ?? score;

  const result = await completeExperiment(
    hermesDir,
    experiment.id,
    windowScore,
    config.minImprovement,
    sessionId
  );

  if (!result) {
    return { action: "observation_recorded", summary: "Failed to complete experiment.", score };
  }

  if (result.decision === "kept") {
    return {
      action: "experiment_evaluated_kept",
      summary: `Experiment KEPT: "${experiment.hypothesis.description}" — delta: +${result.experiment.comparison!.delta.toFixed(3)} (${windowScore.value.toFixed(3)} vs baseline ${experiment.baselineScore.value.toFixed(3)}).`,
      experiment: result.experiment,
      score: windowScore,
    };
  }

  // Discard — revert memory changes
  await revertExperiment(hermesDir, experiment);

  return {
    action: "experiment_evaluated_discarded",
    summary: `Experiment DISCARDED: "${experiment.hypothesis.description}" — delta: ${result.experiment.comparison!.delta.toFixed(3)} (below threshold ${config.minImprovement}). Changes reverted.`,
    experiment: result.experiment,
    score: windowScore,
  };
}

// ── No Active Experiment ──────────────────────────────────────

async function handleNoExperiment(
  hermesDir: string,
  sessionId: string,
  score: EffectivenessScore,
  config: ResearchConfig,
  apiKey?: string
): Promise<LoopResult> {
  const researchLog = await loadResearchLog(hermesDir);

  // Check if we have enough baseline data
  if (!researchLog.currentBaseline && score.sessionCount < config.minBaselineSessions) {
    await updateBaseline(hermesDir, score, sessionId);
    return {
      action: "baseline_recorded",
      summary: `Baseline recorded: ${score.value.toFixed(3)} (${score.sessionCount}/${config.minBaselineSessions} sessions for first experiment).`,
      score,
    };
  }

  // Update baseline if none set
  if (!researchLog.currentBaseline) {
    await updateBaseline(hermesDir, score, sessionId);
  }

  // Cooldown check — wait N sessions after last experiment
  const lastCompleted = await getLastCompletedExperiment(hermesDir);
  if (lastCompleted?.completedAt) {
    const scorecards = await loadScorecards(hermesDir);
    const lastCompletedIdx = scorecards.findIndex(
      (s) => s.sessionId === lastCompleted.observedSessions[lastCompleted.observedSessions.length - 1]
    );
    const sessionsSince = lastCompletedIdx >= 0 ? scorecards.length - lastCompletedIdx - 1 : config.cooldownSessions;
    if (sessionsSince < config.cooldownSessions) {
      return {
        action: "cooldown",
        summary: `Cooldown: ${config.cooldownSessions - sessionsSince} session(s) remaining before next experiment.`,
        score,
      };
    }
  }

  // Rate limit check
  const todayCount = await countExperimentsToday(hermesDir);
  if (todayCount >= config.maxExperimentsPerDay) {
    return {
      action: "rate_limited",
      summary: `Rate limited: ${todayCount}/${config.maxExperimentsPerDay} experiments today. Try again tomorrow.`,
      score,
    };
  }

  // Generate hypotheses and start the best one
  const hypotheses = await generateHypotheses(hermesDir, apiKey);
  if (hypotheses.length === 0) {
    await updateBaseline(hermesDir, score, sessionId);
    return {
      action: "no_hypotheses",
      summary: "No improvement hypotheses generated. Baseline updated.",
      score,
    };
  }

  const best = hypotheses[0];
  const baseline = researchLog.currentBaseline ?? score;

  // Apply the hypothesis changes
  await applyExperiment(hermesDir, best);

  // Create the experiment
  const experiment = await createExperiment(
    hermesDir,
    best,
    baseline,
    config.sessionWindow,
    sessionId
  );

  await logEvent(hermesDir, "research.hypothesis_generated" as never, sessionId, {
    totalGenerated: hypotheses.length,
    selected: best.description,
    source: best.source,
  });

  return {
    action: "experiment_started",
    summary: `Experiment started: "${best.description}" (${best.source}, ${best.expectedImpact} impact). Observing for ${config.sessionWindow} sessions.`,
    experiment,
    score,
  };
}

// ── Experiment Application & Revert ───────────────────────────

/**
 * Apply a hypothesis's memory changes.
 */
export async function applyExperiment(
  hermesDir: string,
  hypothesis: Hypothesis
): Promise<void> {
  for (const delta of hypothesis.changes) {
    switch (delta.action) {
      case "add":
        if (delta.after) {
          await saveMemory(hermesDir, delta.after);
        }
        break;
      case "update":
        if (delta.after) {
          const { id, ...updates } = delta.after;
          await updateMemory(hermesDir, delta.memoryId, {
            content: updates.content,
            relevance: updates.relevance,
            tags: updates.tags,
          });
        }
        break;
      case "delete":
        await deleteMemory(hermesDir, delta.memoryId);
        break;
    }
  }
}

/**
 * Revert an experiment's memory changes by restoring the "before" snapshots.
 */
export async function revertExperiment(
  hermesDir: string,
  experiment: Experiment
): Promise<void> {
  for (const delta of experiment.hypothesis.changes) {
    switch (delta.action) {
      case "add":
        // Was added — delete it
        await deleteMemory(hermesDir, delta.memoryId);
        break;
      case "update":
        // Was updated — restore the before state
        if (delta.before) {
          await updateMemory(hermesDir, delta.memoryId, {
            content: delta.before.content,
            relevance: delta.before.relevance,
            tags: delta.before.tags,
          });
        }
        break;
      case "delete":
        // Was deleted — re-add it
        if (delta.before) {
          await saveMemory(hermesDir, delta.before);
        }
        break;
    }
  }

  await logEvent(hermesDir, "research.experiment_reverted" as never, experiment.observedSessions[0] ?? "unknown", {
    experimentId: experiment.id,
    changesReverted: experiment.hypothesis.changes.length,
  });
}
