import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import {
  createWorkflow,
  loadWorkflow,
  executeStep,
  findResumePoint,
} from "../checkpoint";

let tmpDir: string;
let hermesDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-cp-"));
  hermesDir = path.join(tmpDir, ".athena", "hermes");
  await fs.mkdir(hermesDir, { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("checkpointed execution", () => {
  it("creates a workflow with pending steps", async () => {
    const wf = await createWorkflow(hermesDir, "wf_1", "Test Workflow", [
      "Step A", "Step B", "Step C",
    ]);

    expect(wf.workflowId).toBe("wf_1");
    expect(wf.totalSteps).toBe(3);
    expect(wf.status).toBe("running");
    expect(wf.checkpoints).toHaveLength(3);
    expect(wf.checkpoints.every((c) => c.status === "pending")).toBe(true);
  });

  it("executes steps and saves checkpoints", async () => {
    const wf = await createWorkflow(hermesDir, "wf_2", "Pipeline", ["Extract", "Transform"]);

    const result1 = await executeStep(hermesDir, wf, 0, async () => {
      return { extracted: 5 };
    });
    expect(result1.extracted).toBe(5);
    expect(wf.checkpoints[0].status).toBe("completed");
    expect(wf.currentStep).toBe(1);

    const result2 = await executeStep(hermesDir, wf, 1, async (prev) => {
      return { transformed: (prev.extracted as number) * 2 };
    });
    expect(result2.transformed).toBe(10);
    expect(wf.status).toBe("completed");
  });

  it("skips already-completed steps (resume from checkpoint)", async () => {
    const wf = await createWorkflow(hermesDir, "wf_3", "Resumable", ["A", "B"]);

    // Complete step 0
    await executeStep(hermesDir, wf, 0, async () => ({ count: 1 }));

    // Simulate crash — reload workflow
    const loaded = await loadWorkflow(hermesDir, "wf_3");
    expect(loaded).not.toBeNull();
    expect(loaded!.currentStep).toBe(1);
    expect(loaded!.checkpoints[0].status).toBe("completed");

    // Resume point should be step 0
    const resumePoint = findResumePoint(loaded!);
    expect(resumePoint).toBe(0);
  });

  it("handles step failure gracefully", async () => {
    const wf = await createWorkflow(hermesDir, "wf_4", "Failing", ["Good", "Bad"]);

    await executeStep(hermesDir, wf, 0, async () => ({ ok: true }));

    await expect(
      executeStep(hermesDir, wf, 1, async () => {
        throw new Error("step failed");
      })
    ).rejects.toThrow("step failed");

    expect(wf.checkpoints[1].status).toBe("failed");
    expect(wf.checkpoints[1].error).toBe("step failed");
    expect(wf.status).toBe("failed");
  });

  it("returns cached state for completed steps", async () => {
    const wf = await createWorkflow(hermesDir, "wf_5", "Cached", ["Compute"]);

    let callCount = 0;
    await executeStep(hermesDir, wf, 0, async () => {
      callCount++;
      return { value: 42 };
    });

    // Call again — should return cached state without running fn
    const cached = await executeStep(hermesDir, wf, 0, async () => {
      callCount++;
      return { value: 999 };
    });

    expect(cached.value).toBe(42);
    expect(callCount).toBe(1); // fn only called once
  });
});
