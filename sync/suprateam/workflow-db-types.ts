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

export interface WorkflowNodeExecution {
  id: string;
  run_id: string;
  node_id: string;
  node_type: string | null;
  node_label: string | null;
  input_data: Record<string, unknown> | null;
  output_data: Record<string, unknown> | null;
  error_message: string | null;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
}

export interface WorkflowAlert {
  id: string;
  workflow_id: string;
  alert_type: "failure" | "slow_run" | "consecutive_failures";
  channel: "telegram" | "slack" | "in_app";
  config: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
