/**
 * Experiment Store — YAML-backed persistence for autoresearch experiments.
 *
 * Analogous to autoresearch's results.tsv + git branches.
 * Tracks what was tried, what changed, and outcomes.
 *
 * Storage:
 *   .athena/hermes/research/research-log.yaml  — full research log
 *   .athena/hermes/research/experiments/        — individual experiment files
 */

import * as fs from "fs/promises";
import * as path from "path";
import * as YAML from "yaml";
import * as crypto from "crypto";
import type {
  Experiment,
  Hypothesis,
  EffectivenessScore,
  ResearchLog,
  ScoreComparison,
} from "./types";
import { compareScores } from "./effectiveness";
import { logEvent } from "../event-log";

// ── Paths ─────────────────────────────────────────────────────

function researchDir(hermesDir: string): string {
  return path.join(hermesDir, "research");
}

function researchLogFile(hermesDir: string): string {
  return path.join(researchDir(hermesDir), "research-log.yaml");
}

function experimentsDir(hermesDir: string): string {
  return path.join(researchDir(hermesDir), "experiments");
}

function experimentFile(hermesDir: string, id: string): string {
  return path.join(experimentsDir(hermesDir), `${id}.yaml`);
}

// ── ID Generation ─────────────────────────────────────────────

function experimentId(): string {
  const ts = Date.now().toString(36);
  const rand = crypto.randomBytes(3).toString("hex");
  return `exp_${ts}_${rand}`;
}

// ── Atomic Write ──────────────────────────────────────────────

async function atomicWrite(filePath: string, content: string): Promise<void> {
  const tmpPath = `${filePath}.${crypto.randomBytes(4).toString("hex")}.tmp`;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(tmpPath, content, "utf-8");
  await fs.rename(tmpPath, filePath);
}

// ── Research Log CRUD ─────────────────────────────────────────

/** Create an empty research log. */
function emptyResearchLog(): ResearchLog {
  return {
    experiments: [],
    currentBaseline: null,
    totalImprovement: 0,
    startedAt: new Date().toISOString(),
    experimentsRun: 0,
    experimentsKept: 0,
    experimentsDiscarded: 0,
  };
}

/** Load the research log from disk. Creates a new one if none exists. */
export async function loadResearchLog(hermesDir: string): Promise<ResearchLog> {
  const filePath = researchLogFile(hermesDir);
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = YAML.parse(raw) as ResearchLog;
    return { ...emptyResearchLog(), ...parsed };
  } catch {
    return emptyResearchLog();
  }
}

/** Persist the research log to disk. */
export async function saveResearchLog(
  hermesDir: string,
  log: ResearchLog
): Promise<void> {
  const content = YAML.stringify(log, { lineWidth: 120 });
  await atomicWrite(researchLogFile(hermesDir), content);
}

// ── Experiment CRUD ───────────────────────────────────────────

/** Save an individual experiment to its own file. */
async function saveExperiment(hermesDir: string, exp: Experiment): Promise<void> {
  const content = YAML.stringify(exp, { lineWidth: 120 });
  await atomicWrite(experimentFile(hermesDir, exp.id), content);
}

/** Load an individual experiment by ID. */
export async function loadExperiment(
  hermesDir: string,
  id: string
): Promise<Experiment | null> {
  try {
    const raw = await fs.readFile(experimentFile(hermesDir, id), "utf-8");
    return YAML.parse(raw) as Experiment;
  } catch {
    return null;
  }
}

/**
 * Create a new experiment and persist it.
 *
 * @param hermesDir - Hermes data directory
 * @param hypothesis - The hypothesis to test
 * @param baseline - Current effectiveness score
 * @param sessionWindow - Sessions to observe before evaluating
 * @param sessionId - Current session ID (for event logging)
 */
export async function createExperiment(
  hermesDir: string,
  hypothesis: Hypothesis,
  baseline: EffectivenessScore,
  sessionWindow: number,
  sessionId: string
): Promise<Experiment> {
  const exp: Experiment = {
    id: experimentId(),
    hypothesis,
    baselineScore: baseline,
    resultScore: null,
    status: "running",
    sessionWindow,
    observedSessions: [],
    startedAt: new Date().toISOString(),
    completedAt: null,
    comparison: null,
  };

  await saveExperiment(hermesDir, exp);

  // Update research log
  const log = await loadResearchLog(hermesDir);
  log.experiments.push(exp);
  log.experimentsRun++;
  await saveResearchLog(hermesDir, log);

  await logEvent(hermesDir, "research.experiment_started" as never, sessionId, {
    experimentId: exp.id,
    hypothesis: hypothesis.description,
    expectedImpact: hypothesis.expectedImpact,
    sessionWindow,
  });

  return exp;
}

/**
 * Record a session observation for the active experiment.
 */
export async function recordSessionObservation(
  hermesDir: string,
  experimentId: string,
  sessionId: string
): Promise<Experiment | null> {
  const exp = await loadExperiment(hermesDir, experimentId);
  if (!exp || exp.status !== "running") return null;

  exp.observedSessions.push(sessionId);
  await saveExperiment(hermesDir, exp);

  // Update in research log
  const log = await loadResearchLog(hermesDir);
  const idx = log.experiments.findIndex((e) => e.id === experimentId);
  if (idx >= 0) {
    log.experiments[idx] = exp;
    await saveResearchLog(hermesDir, log);
  }

  return exp;
}

/**
 * Complete an experiment with a result score and keep/discard decision.
 *
 * @param hermesDir - Hermes data directory
 * @param expId - Experiment ID
 * @param resultScore - Effectiveness score after the experiment
 * @param minImprovement - Minimum delta for "significant" improvement
 * @param sessionId - Current session ID (for event logging)
 * @returns The completed experiment and the decision
 */
export async function completeExperiment(
  hermesDir: string,
  expId: string,
  resultScore: EffectivenessScore,
  minImprovement: number,
  sessionId: string
): Promise<{ experiment: Experiment; decision: "kept" | "discarded" } | null> {
  const exp = await loadExperiment(hermesDir, expId);
  if (!exp || exp.status !== "running") return null;

  const comparison = compareScores(exp.baselineScore, resultScore, minImprovement);
  const decision = comparison.significant ? "kept" : "discarded";

  exp.resultScore = resultScore;
  exp.status = decision;
  exp.completedAt = new Date().toISOString();
  exp.comparison = comparison;

  await saveExperiment(hermesDir, exp);

  // Update research log
  const log = await loadResearchLog(hermesDir);
  const idx = log.experiments.findIndex((e) => e.id === expId);
  if (idx >= 0) {
    log.experiments[idx] = exp;
  }

  if (decision === "kept") {
    log.experimentsKept++;
    log.currentBaseline = resultScore;
    log.totalImprovement += comparison.delta;
  } else {
    log.experimentsDiscarded++;
  }

  await saveResearchLog(hermesDir, log);

  const eventType = decision === "kept"
    ? "research.experiment_kept"
    : "research.experiment_discarded";

  await logEvent(hermesDir, eventType as never, sessionId, {
    experimentId: exp.id,
    hypothesis: exp.hypothesis.description,
    delta: comparison.delta,
    improved: comparison.improved,
    significant: comparison.significant,
  });

  return { experiment: exp, decision };
}

/**
 * Update the baseline score in the research log.
 */
export async function updateBaseline(
  hermesDir: string,
  baseline: EffectivenessScore,
  sessionId: string
): Promise<void> {
  const log = await loadResearchLog(hermesDir);
  log.currentBaseline = baseline;
  await saveResearchLog(hermesDir, log);

  await logEvent(hermesDir, "research.baseline_recorded" as never, sessionId, {
    value: baseline.value,
    corrections: baseline.corrections,
    rulePassRate: baseline.rulePassRate,
  });
}

/**
 * Get the currently running experiment, if any.
 */
export async function getActiveExperiment(
  hermesDir: string
): Promise<Experiment | null> {
  const log = await loadResearchLog(hermesDir);
  return log.experiments.find((e) => e.status === "running") ?? null;
}

/**
 * Count experiments started today (for rate limiting).
 */
export async function countExperimentsToday(hermesDir: string): Promise<number> {
  const log = await loadResearchLog(hermesDir);
  const todayPrefix = new Date().toISOString().slice(0, 10);
  return log.experiments.filter((e) => e.startedAt.startsWith(todayPrefix)).length;
}

/**
 * Get the most recently completed experiment.
 */
export async function getLastCompletedExperiment(
  hermesDir: string
): Promise<Experiment | null> {
  const log = await loadResearchLog(hermesDir);
  const completed = log.experiments.filter((e) => e.status !== "running");
  return completed.length > 0 ? completed[completed.length - 1] : null;
}
