/**
 * Checkpointed Execution — LangGraph-style state snapshots.
 *
 * Saves and restores workflow state at each step, enabling:
 * - Resume from last successful step after crash/timeout
 * - Replay specific steps for debugging
 * - Audit trail of state transitions
 *
 * Stores checkpoints in .athena/hermes/checkpoints/{workflowId}/
 */

import * as fs from "fs/promises";
import * as path from "path";
import * as YAML from "yaml";

// ── Types ──────────────────────────────────────────────────────

export type CheckpointStatus = "pending" | "running" | "completed" | "failed" | "skipped";

export type Checkpoint = {
  workflowId: string;
  stepIndex: number;
  stepName: string;
  status: CheckpointStatus;
  state: Record<string, unknown>;
  createdAt: string;
  completedAt: string | null;
  error: string | null;
};

export type WorkflowState = {
  workflowId: string;
  name: string;
  currentStep: number;
  totalSteps: number;
  status: "running" | "completed" | "failed" | "paused";
  checkpoints: Checkpoint[];
  createdAt: string;
  updatedAt: string;
};

// ── Paths ──────────────────────────────────────────────────────

function checkpointsDir(hermesDir: string, workflowId: string): string {
  return path.join(hermesDir, "checkpoints", workflowId);
}

function workflowFile(hermesDir: string, workflowId: string): string {
  return path.join(checkpointsDir(hermesDir, workflowId), "workflow.yaml");
}

function checkpointFile(hermesDir: string, workflowId: string, stepIndex: number): string {
  return path.join(checkpointsDir(hermesDir, workflowId), `step-${stepIndex}.yaml`);
}

// ── Workflow Lifecycle ─────────────────────────────────────────

/** Create a new workflow with defined steps. */
export async function createWorkflow(
  hermesDir: string,
  workflowId: string,
  name: string,
  stepNames: string[]
): Promise<WorkflowState> {
  const dir = checkpointsDir(hermesDir, workflowId);
  await fs.mkdir(dir, { recursive: true });

  const now = new Date().toISOString();
  const workflow: WorkflowState = {
    workflowId,
    name,
    currentStep: 0,
    totalSteps: stepNames.length,
    status: "running",
    checkpoints: stepNames.map((stepName, i) => ({
      workflowId,
      stepIndex: i,
      stepName,
      status: "pending",
      state: {},
      createdAt: now,
      completedAt: null,
      error: null,
    })),
    createdAt: now,
    updatedAt: now,
  };

  await saveWorkflow(hermesDir, workflow);
  return workflow;
}

/** Save a workflow state to disk. */
async function saveWorkflow(hermesDir: string, workflow: WorkflowState): Promise<void> {
  const doc = {
    workflow_id: workflow.workflowId,
    name: workflow.name,
    current_step: workflow.currentStep,
    total_steps: workflow.totalSteps,
    status: workflow.status,
    created_at: workflow.createdAt,
    updated_at: workflow.updatedAt,
  };
  await fs.writeFile(
    workflowFile(hermesDir, workflow.workflowId),
    `# Hermes Workflow Checkpoint\n${YAML.stringify(doc)}`,
    "utf-8"
  );
}

/** Load a workflow state from disk. */
export async function loadWorkflow(
  hermesDir: string,
  workflowId: string
): Promise<WorkflowState | null> {
  try {
    const raw = await fs.readFile(workflowFile(hermesDir, workflowId), "utf-8");
    const parsed = YAML.parse(raw);
    if (!parsed?.workflow_id) return null;

    // Load all step checkpoints
    const checkpoints: Checkpoint[] = [];
    for (let i = 0; i < (parsed.total_steps ?? 0); i++) {
      const cp = await loadCheckpoint(hermesDir, workflowId, i);
      if (cp) checkpoints.push(cp);
    }

    return {
      workflowId: parsed.workflow_id,
      name: parsed.name ?? "",
      currentStep: parsed.current_step ?? 0,
      totalSteps: parsed.total_steps ?? 0,
      status: parsed.status ?? "running",
      checkpoints,
      createdAt: parsed.created_at ?? "",
      updatedAt: parsed.updated_at ?? "",
    };
  } catch {
    return null;
  }
}

// ── Step Execution ─────────────────────────────────────────────

/** Save a checkpoint for a specific step. */
export async function saveCheckpoint(
  hermesDir: string,
  checkpoint: Checkpoint
): Promise<void> {
  const doc = {
    workflow_id: checkpoint.workflowId,
    step_index: checkpoint.stepIndex,
    step_name: checkpoint.stepName,
    status: checkpoint.status,
    state: checkpoint.state,
    created_at: checkpoint.createdAt,
    completed_at: checkpoint.completedAt,
    error: checkpoint.error,
  };
  await fs.writeFile(
    checkpointFile(hermesDir, checkpoint.workflowId, checkpoint.stepIndex),
    `# Hermes Step Checkpoint\n${YAML.stringify(doc)}`,
    "utf-8"
  );
}

/** Load a checkpoint for a specific step. */
async function loadCheckpoint(
  hermesDir: string,
  workflowId: string,
  stepIndex: number
): Promise<Checkpoint | null> {
  try {
    const raw = await fs.readFile(checkpointFile(hermesDir, workflowId, stepIndex), "utf-8");
    const parsed = YAML.parse(raw);
    if (!parsed) return null;

    return {
      workflowId: parsed.workflow_id ?? workflowId,
      stepIndex: parsed.step_index ?? stepIndex,
      stepName: parsed.step_name ?? "",
      status: parsed.status ?? "pending",
      state: parsed.state ?? {},
      createdAt: parsed.created_at ?? "",
      completedAt: parsed.completed_at ?? null,
      error: parsed.error ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Execute a workflow step with automatic checkpointing.
 * If the step was already completed (from a previous run), returns the cached state.
 * If the step failed previously, re-executes it.
 */
export async function executeStep<T extends Record<string, unknown>>(
  hermesDir: string,
  workflow: WorkflowState,
  stepIndex: number,
  fn: (previousState: Record<string, unknown>) => Promise<T>
): Promise<T> {
  const checkpoint = workflow.checkpoints[stepIndex];
  if (!checkpoint) {
    throw new Error(`Step ${stepIndex} does not exist in workflow ${workflow.workflowId}`);
  }

  // If already completed, return cached state
  if (checkpoint.status === "completed") {
    return checkpoint.state as T;
  }

  // If retrying after failure, reset workflow status
  if (workflow.status === "failed") {
    workflow.status = "running";
  }

  // Get state from the previous step (or empty for first step)
  const previousState = stepIndex > 0
    ? workflow.checkpoints[stepIndex - 1]?.state ?? {}
    : {};

  // Mark as running
  checkpoint.status = "running";
  checkpoint.createdAt = new Date().toISOString();
  await saveCheckpoint(hermesDir, checkpoint);

  try {
    const result = await fn(previousState);
    checkpoint.status = "completed";
    checkpoint.state = result;
    checkpoint.completedAt = new Date().toISOString();
    checkpoint.error = null;
    await saveCheckpoint(hermesDir, checkpoint);

    // Advance workflow
    workflow.currentStep = stepIndex + 1;
    if (workflow.currentStep >= workflow.totalSteps) {
      workflow.status = "completed";
    }
    workflow.updatedAt = new Date().toISOString();
    await saveWorkflow(hermesDir, workflow);

    return result;
  } catch (err) {
    checkpoint.status = "failed";
    checkpoint.error = err instanceof Error ? err.message : String(err);
    checkpoint.completedAt = new Date().toISOString();
    await saveCheckpoint(hermesDir, checkpoint);

    workflow.status = "failed";
    workflow.updatedAt = new Date().toISOString();
    await saveWorkflow(hermesDir, workflow);

    throw err;
  }
}

/** Find the last completed step index (for resume). Returns -1 if no steps completed. */
export function findResumePoint(workflow: WorkflowState): number {
  for (let i = workflow.checkpoints.length - 1; i >= 0; i--) {
    if (workflow.checkpoints[i].status === "completed") return i;
  }
  return -1;
}

/** List all workflows. */
export async function listWorkflows(hermesDir: string): Promise<string[]> {
  const dir = path.join(hermesDir, "checkpoints");
  try {
    const entries = await fs.readdir(dir);
    const isDir = await Promise.all(
      entries.map((e) => fs.stat(path.join(dir, e)).then((s) => s.isDirectory()).catch(() => false))
    );
    return entries.filter((_, i) => isDir[i]);
  } catch {
    return [];
  }
}
