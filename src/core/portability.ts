/**
 * Workflow portability — schema-versioned export/import, shareable link
 * generation, and clipboard support for workflow definitions.
 *
 * Complements the template-utils module: templates carry marketplace metadata
 * (author, tags, connectors); portability carries raw workflow data with
 * schema versioning for cross-instance exchange.
 */

import type { FlowNode, FlowEdge } from "./types";
import { stripRuntimeAndSecrets } from "./utils";

// ── Schema version ──────────────────────────────────────────────

export const WORKFLOW_SCHEMA_VERSION = "1.0.0";

/** Maximum encoded URL length before we reject (most browsers cap ~2000 chars for URLs). */
const MAX_URL_FRAGMENT_LENGTH = 8000;

// ── Types ───────────────────────────────────────────────────────

export interface WorkflowPortabilityMetadata {
  name?: string;
  description?: string;
  [key: string]: unknown;
}

export interface ExportedWorkflow {
  schemaVersion: string;
  exportedAt: string;
  metadata: WorkflowPortabilityMetadata;
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export interface ImportWorkflowResult {
  nodes: FlowNode[];
  edges: FlowEdge[];
  metadata: WorkflowPortabilityMetadata;
  warnings: string[];
}

export interface SchemaValidationResult {
  valid: boolean;
  errors: string[];
}

// ── Runtime key stripping (uses shared utility from utils.ts) ───

// ── Export ───────────────────────────────────────────────────────

/**
 * Export workflow nodes and edges as a portable, schema-versioned JSON object.
 * Strips all runtime/execution state from node data.
 */
export function exportWorkflow(
  nodes: FlowNode[],
  edges: FlowEdge[],
  metadata?: WorkflowPortabilityMetadata
): ExportedWorkflow {
  const cleanNodes: FlowNode[] = nodes.map((node) => ({
    id: node.id,
    type: node.type,
    position: { x: node.position.x, y: node.position.y },
    data: stripRuntimeAndSecrets(
      node.data as unknown as Record<string, unknown>
    ) as unknown as FlowNode["data"],
  }));

  const cleanEdges: FlowEdge[] = edges.map((edge) => {
    const clean: FlowEdge = {
      id: edge.id,
      source: edge.source,
      target: edge.target,
    };
    if (edge.sourceHandle != null) {
      clean.sourceHandle = edge.sourceHandle;
    }
    return clean;
  });

  return {
    schemaVersion: WORKFLOW_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    metadata: metadata ?? {},
    nodes: cleanNodes,
    edges: cleanEdges,
  };
}

// ── Validate ────────────────────────────────────────────────────

/**
 * Type-guard validation for imported workflow data.
 * Checks structural shape without throwing.
 */
export function validateWorkflowSchema(data: unknown): SchemaValidationResult {
  const errors: string[] = [];

  if (data == null || typeof data !== "object") {
    return { valid: false, errors: ["Data must be a non-null object"] };
  }

  const obj = data as Record<string, unknown>;

  // Schema version
  if (typeof obj.schemaVersion !== "string" || obj.schemaVersion.trim().length === 0) {
    errors.push("Missing or invalid schemaVersion");
  }

  // Exported timestamp
  if (typeof obj.exportedAt !== "string" || obj.exportedAt.trim().length === 0) {
    errors.push("Missing or invalid exportedAt timestamp");
  }

  // Metadata
  if (obj.metadata !== undefined && (typeof obj.metadata !== "object" || obj.metadata === null)) {
    errors.push("metadata must be an object if present");
  }

  // Nodes
  if (!Array.isArray(obj.nodes)) {
    errors.push("nodes must be an array");
  } else {
    for (let i = 0; i < obj.nodes.length; i++) {
      const node = obj.nodes[i] as Record<string, unknown> | undefined;
      if (!node || typeof node !== "object") {
        errors.push(`nodes[${i}] must be an object`);
        continue;
      }
      if (typeof node.id !== "string" || node.id.trim().length === 0) {
        errors.push(`nodes[${i}] must have a non-empty string id`);
      }
      if (typeof node.type !== "string") {
        errors.push(`nodes[${i}] must have a string type`);
      }
      if (
        !node.position ||
        typeof node.position !== "object" ||
        typeof (node.position as Record<string, unknown>).x !== "number" ||
        typeof (node.position as Record<string, unknown>).y !== "number"
      ) {
        errors.push(`nodes[${i}] must have a valid position {x, y}`);
      }
      if (!node.data || typeof node.data !== "object") {
        errors.push(`nodes[${i}] must have a data object`);
      } else {
        const nodeData = node.data as Record<string, unknown>;
        if (typeof nodeData.nodeType !== "string") {
          errors.push(`nodes[${i}].data must have a string nodeType`);
        }
      }
    }
  }

  // Edges
  if (!Array.isArray(obj.edges)) {
    errors.push("edges must be an array");
  } else {
    const nodeIds = new Set(
      Array.isArray(obj.nodes)
        ? (obj.nodes as Array<Record<string, unknown>>)
            .filter((n) => n && typeof n.id === "string")
            .map((n) => n.id as string)
        : []
    );

    for (let i = 0; i < obj.edges.length; i++) {
      const edge = obj.edges[i] as Record<string, unknown> | undefined;
      if (!edge || typeof edge !== "object") {
        errors.push(`edges[${i}] must be an object`);
        continue;
      }
      if (typeof edge.id !== "string" || edge.id.trim().length === 0) {
        errors.push(`edges[${i}] must have a non-empty string id`);
      }
      if (typeof edge.source !== "string") {
        errors.push(`edges[${i}] must have a string source`);
      } else if (nodeIds.size > 0 && !nodeIds.has(edge.source)) {
        errors.push(`edges[${i}] references non-existent source node "${edge.source}"`);
      }
      if (typeof edge.target !== "string") {
        errors.push(`edges[${i}] must have a string target`);
      } else if (nodeIds.size > 0 && !nodeIds.has(edge.target)) {
        errors.push(`edges[${i}] references non-existent target node "${edge.target}"`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

// ── Schema migration ────────────────────────────────────────────

/**
 * Migrate an exported workflow from an older schema version to the current one.
 * Returns the migrated data and any warnings.
 * Currently v1.0.0 is the only version, so this is a pass-through with
 * forward-compatible handling for unknown future versions.
 */
function migrateSchema(
  data: Record<string, unknown>
): { data: Record<string, unknown>; warnings: string[] } {
  const warnings: string[] = [];
  const version = data.schemaVersion as string;

  // Parse semver major.minor.patch
  const parts = version.split(".").map(Number);
  const major = parts[0] ?? 0;

  if (major > 1) {
    warnings.push(
      `Workflow was exported with schema version ${version} which is newer than the current version ${WORKFLOW_SCHEMA_VERSION}. Some features may not be preserved.`
    );
  }

  // v1.x.x: current version, no migration needed
  // Future migrations would go here as chained if/else blocks:
  // if (major === 1 && minor < 1) { migrate from 1.0 to 1.1 }

  // Ensure metadata exists (forward compatibility)
  if (!data.metadata || typeof data.metadata !== "object") {
    data.metadata = {};
  }

  return { data, warnings };
}

// ── Import ──────────────────────────────────────────────────────

/**
 * Import a workflow from unknown data (e.g., parsed JSON).
 * Validates schema, handles migration, generates new IDs to avoid collisions.
 */
export function importWorkflow(data: unknown): ImportWorkflowResult {
  const validation = validateWorkflowSchema(data);
  if (!validation.valid) {
    throw new Error(
      `Invalid workflow data:\n${validation.errors.join("\n")}`
    );
  }

  const obj = data as Record<string, unknown>;
  const { data: migrated, warnings } = migrateSchema({ ...obj });

  const sourceNodes = migrated.nodes as Array<Record<string, unknown>>;
  const sourceEdges = migrated.edges as Array<Record<string, unknown>>;
  const metadata = (migrated.metadata ?? {}) as WorkflowPortabilityMetadata;

  // Generate new IDs to avoid collisions with existing workflow.
  // Uses both timestamp and two random segments so rapid double-imports
  // are virtually guaranteed to produce distinct IDs.
  const suffix = `_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}_${Math.random().toString(36).slice(2, 6)}`;
  const idMap = new Map<string, string>();

  for (const node of sourceNodes) {
    const oldId = node.id as string;
    const newId = `${oldId}${suffix}`;
    idMap.set(oldId, newId);
  }

  const nodes: FlowNode[] = sourceNodes.map((node) => ({
    id: idMap.get(node.id as string)!,
    type: node.type as string,
    position: {
      x: (node.position as Record<string, number>).x,
      y: (node.position as Record<string, number>).y,
    },
    data: node.data as FlowNode["data"],
  }));

  const edges: FlowEdge[] = sourceEdges.map((edge, index) => {
    const oldSource = edge.source as string;
    const oldTarget = edge.target as string;
    const newSource = idMap.get(oldSource) ?? oldSource;
    const newTarget = idMap.get(oldTarget) ?? oldTarget;
    const newEdge: FlowEdge = {
      id: `edge_${newSource}_${newTarget}_${index}`,
      source: newSource,
      target: newTarget,
    };
    if (edge.sourceHandle != null) {
      newEdge.sourceHandle = edge.sourceHandle as string;
    }
    return newEdge;
  });

  return { nodes, edges, metadata, warnings };
}

// ── URL encoding / decoding ─────────────────────────────────────

/**
 * Encode a workflow to a URL-safe base64 string suitable for use as a URL fragment.
 * Uses TextEncoder + btoa with URL-safe base64 encoding.
 * Handles Unicode correctly by encoding to UTF-8 bytes first.
 *
 * @throws Error if the encoded result is too large for a URL
 */
export function encodeWorkflowToLink(workflow: ExportedWorkflow): string {
  const json = JSON.stringify(workflow);

  if (json.length === 0) {
    throw new Error("Cannot encode empty workflow");
  }

  // Encode to UTF-8 bytes, then to base64 (handles Unicode correctly)
  const base64 = btoa(
    encodeURIComponent(json).replace(/%([0-9A-F]{2})/g, (_match, p1) =>
      String.fromCharCode(parseInt(p1 as string, 16))
    )
  );

  // Make URL-safe: + -> -, / -> _, strip trailing =
  const urlSafe = base64
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const fragment = `#workflow=${urlSafe}`;

  if (fragment.length > MAX_URL_FRAGMENT_LENGTH) {
    throw new Error(
      `Encoded workflow is too large for a URL (${fragment.length} chars, max ${MAX_URL_FRAGMENT_LENGTH}). ` +
      `Consider using clipboard or file export instead.`
    );
  }

  return fragment;
}

/**
 * Decode a workflow from a URL fragment produced by `encodeWorkflowToLink`.
 *
 * @throws Error if the fragment is malformed or the decoded data is invalid
 */
export function decodeWorkflowFromLink(encoded: string): ExportedWorkflow {
  const prefix = "#workflow=";
  const raw = encoded.startsWith(prefix) ? encoded.slice(prefix.length) : encoded;

  if (!raw || raw.trim().length === 0) {
    throw new Error("Empty workflow URL fragment");
  }

  // Reverse URL-safe base64
  let base64 = raw.replace(/-/g, "+").replace(/_/g, "/");
  // Restore padding
  const padLength = (4 - (base64.length % 4)) % 4;
  base64 += "=".repeat(padLength);

  let json: string;
  try {
    json = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
  } catch {
    throw new Error("Failed to decode workflow URL: invalid base64 encoding");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("Failed to decode workflow URL: invalid JSON");
  }

  const validation = validateWorkflowSchema(parsed);
  if (!validation.valid) {
    throw new Error(
      `Decoded workflow failed validation:\n${validation.errors.join("\n")}`
    );
  }

  return parsed as ExportedWorkflow;
}

// ── Clipboard support ───────────────────────────────────────────

/**
 * Copy an exported workflow to the system clipboard as JSON.
 *
 * @throws Error if the clipboard API is unavailable
 */
export async function copyWorkflowToClipboard(workflow: ExportedWorkflow): Promise<void> {
  if (typeof navigator === "undefined" || !navigator.clipboard) {
    throw new Error("Clipboard API is not available in this environment");
  }
  const json = JSON.stringify(workflow, null, 2);
  await navigator.clipboard.writeText(json);
}

/**
 * Read a workflow from the system clipboard, parse and validate it.
 *
 * @throws Error if clipboard is unavailable, empty, or contains invalid data
 */
export async function pasteWorkflowFromClipboard(): Promise<ExportedWorkflow> {
  if (typeof navigator === "undefined" || !navigator.clipboard) {
    throw new Error("Clipboard API is not available in this environment");
  }

  const text = await navigator.clipboard.readText();
  if (!text || text.trim().length === 0) {
    throw new Error("Clipboard is empty");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Clipboard content is not valid JSON");
  }

  const validation = validateWorkflowSchema(parsed);
  if (!validation.valid) {
    throw new Error(
      `Clipboard workflow failed validation:\n${validation.errors.join("\n")}`
    );
  }

  return parsed as ExportedWorkflow;
}
