/**
 * Validation utilities for sub-workflows.
 * Used at activation time to ensure a workflow is safe to use as a sub-workflow.
 */
import type { WorkflowData, SubWorkflowNodeData } from "./types";

export interface SubWorkflowValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate that a workflow is safe to use as a sub-workflow.
 *
 * Checks:
 * - No delay nodes (delays are banned in sub-workflows)
 * - No self-referencing sub_workflow nodes
 * - All nodes have required config fields
 */
export function validateSubWorkflow(
  workflow: WorkflowData,
  parentWorkflowId?: string,
): SubWorkflowValidationResult {
  const errors: string[] = [];
  const nodes = workflow.nodes ?? [];

  for (const node of nodes) {
    const data = node.data;

    // Ban delay nodes inside sub-workflows
    if (data.nodeType === "delay") {
      errors.push(
        `Delay nodes are not supported in sub-workflows (node "${node.id}"${data.label ? `: "${data.label}"` : ""})`
      );
    }

    // Check for self-referencing sub_workflow nodes
    if (data.nodeType === "sub_workflow") {
      const subData = data as SubWorkflowNodeData;
      if (subData.config.workflowId === workflow.id) {
        errors.push(
          `Sub-workflow node "${node.id}" references itself (workflow "${workflow.id}")`
        );
      }
      if (parentWorkflowId && subData.config.workflowId === parentWorkflowId) {
        errors.push(
          `Sub-workflow node "${node.id}" references its parent workflow ("${parentWorkflowId}"), creating a cycle`
        );
      }
      // Validate required config
      if (!subData.config.workflowId) {
        errors.push(
          `Sub-workflow node "${node.id}" is missing a workflowId`
        );
      }
    }

    // Validate that all nodes have a nodeType
    if (!data.nodeType) {
      errors.push(`Node "${node.id}" is missing nodeType`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
