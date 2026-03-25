/**
 * Supabase persistence adapter for the automation builder engine.
 * Implements PersistenceAdapter from @supra/automation-builder.
 */
import type { PersistenceAdapter, WorkflowEvent } from "../packages/automation-builder/dist/index";
import { createSupabaseAdmin } from "@/lib/supabase";
import { checkWorkflowAlerts } from "@/lib/workflow-alerts";

export function createSupabasePersistence(): PersistenceAdapter {
  return {
    async createRun(workflowId: string, event: WorkflowEvent): Promise<string> {
      const supabase = createSupabaseAdmin();
      if (!supabase) throw new Error("Supabase not configured");

      // Capture workflow snapshot and version at run time
      const { data: wf } = await supabase
        .from("crm_workflows")
        .select("version, nodes, edges, trigger_type")
        .eq("id", workflowId)
        .single();

      const { data: run } = await supabase
        .from("crm_workflow_runs")
        .insert({
          workflow_id: workflowId,
          trigger_event: event,
          status: "running",
          workflow_version: wf?.version ?? 1,
          workflow_snapshot: wf ? { nodes: wf.nodes, edges: wf.edges, trigger_type: wf.trigger_type } : null,
        })
        .select("id")
        .single();

      return run?.id ?? "";
    },

    async updateRun(
      runId: string,
      status: string,
      nodeOutputs: Record<string, unknown>,
      error?: string,
      currentNodeId?: string
    ): Promise<void> {
      if (!runId) return;
      const supabase = createSupabaseAdmin();
      if (!supabase) return;

      const update: Record<string, unknown> = {
        status,
        node_outputs: nodeOutputs,
        error: error ?? null,
      };

      if (currentNodeId) {
        update.current_node_id = currentNodeId;
      }

      if (status === "completed" || status === "failed") {
        update.completed_at = new Date().toISOString();

        // Compute and store duration_ms
        const { data: run } = await supabase
          .from("crm_workflow_runs")
          .select("started_at")
          .eq("id", runId)
          .single();

        if (run?.started_at) {
          update.duration_ms = Date.now() - new Date(run.started_at).getTime();
        }

        // Classify failure type
        if (status === "failed" && error) {
          update.failure_type = classifyFailure(error);
        }
      }

      await supabase
        .from("crm_workflow_runs")
        .update(update)
        .eq("id", runId);

      // Upsert per-node execution records from nodeOutputs
      await upsertNodeExecutions(supabase, runId, nodeOutputs);

      // Fire alerts on completion/failure (best effort, don't block)
      if (status === "completed" || status === "failed") {
        const { data: runRow } = await supabase
          .from("crm_workflow_runs")
          .select("workflow_id, duration_ms")
          .eq("id", runId)
          .single();
        if (runRow) {
          checkWorkflowAlerts(
            runRow.workflow_id,
            status,
            runRow.duration_ms ?? (update.duration_ms as number | null) ?? null,
            error ?? null
          ).catch(() => {}); // fire-and-forget
        }
      }
    },

    async scheduleResume(
      runId: string,
      workflowId: string,
      resumeAt: string,
      event: WorkflowEvent
    ): Promise<void> {
      const supabase = createSupabaseAdmin();
      if (!supabase) return;

      const dealId = (event as unknown as Record<string, unknown>).dealId as string | undefined;

      await supabase.from("crm_scheduled_messages").insert({
        deal_id: dealId || null,
        tg_chat_id: 0, // sentinel — not a real TG message
        message_text: JSON.stringify({
          _workflow_resume: true,
          run_id: runId,
          workflow_id: workflowId,
        }),
        send_at: resumeAt,
        status: "pending",
      });
    },

    async onWorkflowComplete(workflowId: string): Promise<void> {
      const supabase = createSupabaseAdmin();
      if (!supabase) return;

      // Increment run count and update last_run_at
      const { data: wf } = await supabase
        .from("crm_workflows")
        .select("run_count")
        .eq("id", workflowId)
        .single();

      await supabase
        .from("crm_workflows")
        .update({
          last_run_at: new Date().toISOString(),
          run_count: (wf?.run_count ?? 0) + 1,
        })
        .eq("id", workflowId);
    },
  };
}

/**
 * Upsert per-node execution records from the nodeOutputs map.
 */
async function upsertNodeExecutions(
  supabase: NonNullable<ReturnType<typeof createSupabaseAdmin>>,
  runId: string,
  nodeOutputs: Record<string, unknown>
) {
  const entries = Object.entries(nodeOutputs).filter(([k]) => !k.startsWith("_"));
  if (entries.length === 0) return;

  const rows = entries.map(([nodeId, output]) => {
    const data = output as Record<string, unknown>;
    const hasError = data.success === false || !!data.error;
    return {
      run_id: runId,
      node_id: nodeId,
      node_type: (data.type as string) ?? null,
      node_label: (data.label as string) ?? null,
      output_data: data,
      error_message: (data.error as string) ?? null,
      status: hasError ? "failed" : "completed",
      completed_at: new Date().toISOString(),
    };
  });

  // Use upsert with run_id + node_id as conflict target
  // Since there's no unique constraint on (run_id, node_id), delete and re-insert
  await supabase.from("crm_workflow_node_executions").delete().eq("run_id", runId);
  await supabase.from("crm_workflow_node_executions").insert(rows);
}

function classifyFailure(error: string): string {
  const e = error.toLowerCase();
  if (e.includes("timeout") || e.includes("etimedout") || e.includes("timed out")) return "timeout";
  if (e.includes("429") || e.includes("rate limit") || e.includes("too many")) return "rate_limit";
  if (e.includes("401") || e.includes("403") || e.includes("unauthorized") || e.includes("forbidden")) return "auth";
  if (e.includes("not connected") || e.includes("add token") || e.includes("not configured")) return "config";
  if (e.includes("500") || e.includes("503") || e.includes("server error")) return "server";
  if (e.includes("invalid") || e.includes("required") || e.includes("missing")) return "validation";
  return "unknown";
}
