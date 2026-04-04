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

// Retrieval Parameter Tuning
export {
  TUNABLE_PARAMS,
  loadTuningOverrides,
  saveTuningOverrides,
  getEffectiveValue,
  getAllEffectiveValues,
  generateTuningHypothesis,
  applyTuningChange,
  revertTuningChange,
  formatTuningStatus,
} from "./tuning";
export type { TunableParam, TuningOverrides } from "./tuning";

// Cost Tracking
export {
  estimateCost,
  recordCost,
  trackLLMCall,
  loadCostRecords,
  checkBudget,
  getCostSummary,
  formatCostSummary,
  DEFAULT_COST_BUDGET,
} from "./cost-tracker";
export type { CostRecord, CostSummary, CostBudget } from "./cost-tracker";

// A/B Testing
export {
  assignGroup,
  createABExperiment,
  recordABObservation,
  evaluateAB,
  formatABResult,
} from "./ab-testing";
export type { ABGroup, ABExperiment, ABResult } from "./ab-testing";
