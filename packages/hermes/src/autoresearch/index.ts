// ── AutoResearch — Self-Improving Agent Loop ───────────────────
//
// Inspired by karpathy/autoresearch: an autonomous loop of
// hypothesis → modify → evaluate → decide (keep/discard) cycles.

// Types
export type {
  EffectivenessScore,
  ScoreComparison,
  MemoryDelta,
  Hypothesis,
  Experiment,
  ResearchLog,
  ResearchConfig,
  ResearchEventType,
} from "./types";
export { DEFAULT_RESEARCH_CONFIG } from "./types";

// Effectiveness Scoring
export { computeEffectiveness, compareScores } from "./effectiveness";

// Experiment Store
export {
  loadResearchLog,
  saveResearchLog,
  loadExperiment,
  createExperiment,
  recordSessionObservation,
  completeExperiment,
  updateBaseline,
  getActiveExperiment,
  countExperimentsToday,
  getLastCompletedExperiment,
} from "./experiment-store";

// Hypothesis Generation
export {
  generateHypothesesHeuristic,
  generateHypothesesLLM,
  generateHypotheses,
  prioritizeHypotheses,
} from "./hypotheses";

// Research Loop
export {
  onSessionComplete,
  applyExperiment,
  revertExperiment,
} from "./loop";
export type { LoopResult } from "./loop";

// Reporting
export {
  formatResearchStatus,
  formatExperimentHistory,
  formatEffectivenessTrend,
  generateFullReport,
} from "./report";
