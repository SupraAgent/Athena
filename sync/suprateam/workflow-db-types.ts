/**
 * CRM-specific workflow database types.
 * These represent Supabase row shapes, separate from the generic builder types.
 */

export interface Workflow {
  id: string;
  name: string;
  description: string | null;
  nodes: unknown[];
  edges: unknown[];
  is_active: boolean;
  trigger_type: string | null;
  last_run_at: string | null;
  run_count: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkflowRun {
  id: string;
  workflow_id: string;
  trigger_event: Record<string, unknown> | null;
  status: "running" | "completed" | "failed" | "paused";
  current_node_id: string | null;
  node_outputs: Record<string, unknown>;
  error: string | null;
  started_at: string;
  completed_at: string | null;
}

export interface WorkflowRunWithWorkflow extends WorkflowRun {
  workflow: { id: string; name: string; trigger_type: string | null };
}
