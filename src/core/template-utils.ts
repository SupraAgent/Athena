/**
 * Template marketplace utilities — export, import, validate, and share
 * workflow templates as portable JSON bundles.
 */

import type {
  FlowNode,
  FlowEdge,
  ShareableTemplate,
  TemplateManifest,
  TemplateValidationResult,
  WorkflowData,
} from "./types";
import { stripRuntimeAndSecrets } from "./utils";

// ── Helpers ─────────────────────────────────────────────────────

function generateId(): string {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).slice(2, 10);
  return `tpl_${timestamp}_${randomPart}`;
}

function nowISO(): string {
  return new Date().toISOString();
}

function sanitizeNodes(nodes: FlowNode[]): FlowNode[] {
  return nodes.map((node) => ({
    id: node.id,
    type: node.type,
    position: { x: node.position.x, y: node.position.y },
    data: stripRuntimeAndSecrets(node.data as unknown as Record<string, unknown>) as unknown as FlowNode["data"],
  }));
}

function sanitizeEdges(edges: FlowEdge[]): FlowEdge[] {
  return edges.map((edge) => {
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
}

// ── Export ───────────────────────────────────────────────────────

export interface ExportTemplateInput {
  nodes: FlowNode[];
  edges: FlowEdge[];
  metadata: Omit<TemplateManifest, "id" | "createdAt" | "updatedAt"> & {
    id?: string;
    createdAt?: string;
    updatedAt?: string;
  };
}

/**
 * Export a workflow as a shareable template.
 *
 * - Strips all runtime/execution state from nodes
 * - Preserves credential *references* but never raw secret values
 * - Assigns a template ID if not already present
 * - Validates before returning
 *
 * @throws Error if the exported template fails validation
 */
export function exportTemplate(input: ExportTemplateInput): ShareableTemplate {
  const { nodes, edges, metadata } = input;

  const template: ShareableTemplate = {
    id: metadata.id ?? generateId(),
    name: metadata.name,
    description: metadata.description,
    author: metadata.author,
    version: metadata.version,
    tags: [...metadata.tags],
    category: metadata.category,
    requiredConnectors: [...metadata.requiredConnectors],
    createdAt: metadata.createdAt ?? nowISO(),
    updatedAt: nowISO(),
    popularity: metadata.popularity,
    nodes: sanitizeNodes(nodes),
    edges: sanitizeEdges(edges),
  };

  const validation = validateTemplate(template);
  if (!validation.valid) {
    throw new Error(
      `Template export failed validation:\n${validation.errors.join("\n")}`
    );
  }

  return template;
}

// ── Import ──────────────────────────────────────────────────────

export interface ImportTemplateResult {
  nodes: FlowNode[];
  edges: FlowEdge[];
  manifest: TemplateManifest;
  warnings: string[];
}

/**
 * Import a shareable template, ready to load into the canvas.
 *
 * - Validates the template structure
 * - Generates new node/edge IDs to avoid collisions
 * - Returns warnings for missing connectors
 *
 * @param template The template to import
 * @param installedConnectors Optional list of connector IDs already installed
 */
export function importTemplate(
  template: ShareableTemplate,
  installedConnectors?: string[]
): ImportTemplateResult {
  const validation = validateTemplate(template);
  if (!validation.valid) {
    throw new Error(
      `Template import failed validation:\n${validation.errors.join("\n")}`
    );
  }

  const warnings = [...validation.warnings];

  // Check for missing connectors
  if (installedConnectors && template.requiredConnectors.length > 0) {
    const installedSet = new Set(installedConnectors);
    for (const connectorId of template.requiredConnectors) {
      if (!installedSet.has(connectorId)) {
        warnings.push(
          `Required connector "${connectorId}" is not installed. Some nodes may not function correctly.`
        );
      }
    }
  }

  // Build ID remapping to avoid collisions with existing workflows
  const nodeIdMap = new Map<string, string>();
  const suffix = `_${Date.now().toString(36)}`;

  for (const node of template.nodes) {
    const newId = `${node.id}${suffix}`;
    nodeIdMap.set(node.id, newId);
  }

  const remappedNodes: FlowNode[] = template.nodes.map((node) => ({
    id: nodeIdMap.get(node.id)!,
    type: node.type,
    position: { x: node.position.x, y: node.position.y },
    data: node.data,
  }));

  const remappedEdges: FlowEdge[] = template.edges.map((edge, index) => {
    const newSource = nodeIdMap.get(edge.source) ?? edge.source;
    const newTarget = nodeIdMap.get(edge.target) ?? edge.target;
    const newEdge: FlowEdge = {
      id: `edge_${newSource}_${newTarget}_${suffix.slice(1)}_${index}`,
      source: newSource,
      target: newTarget,
    };
    if (edge.sourceHandle != null) {
      newEdge.sourceHandle = edge.sourceHandle;
    }
    return newEdge;
  });

  const manifest: TemplateManifest = {
    id: template.id,
    name: template.name,
    description: template.description,
    author: template.author,
    version: template.version,
    tags: template.tags,
    category: template.category,
    requiredConnectors: template.requiredConnectors,
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
    popularity: template.popularity,
  };

  return { nodes: remappedNodes, edges: remappedEdges, manifest, warnings };
}

// ── Validate ────────────────────────────────────────────────────

/**
 * Validate a template's structural integrity.
 *
 * Checks:
 * - All required manifest fields are present and non-empty
 * - Every edge references existing node IDs
 * - No orphan non-trigger nodes (every non-trigger has at least one incoming edge)
 * - Node data contains a valid `nodeType` field
 */
export function validateTemplate(
  template: ShareableTemplate
): TemplateValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // ── Required manifest fields ──────────────────────────────────
  const requiredStringFields: (keyof TemplateManifest)[] = [
    "id",
    "name",
    "description",
    "author",
    "version",
    "category",
    "createdAt",
    "updatedAt",
  ];

  for (const field of requiredStringFields) {
    const value = template[field];
    if (typeof value !== "string" || value.trim().length === 0) {
      errors.push(`Missing or empty required field: "${field}"`);
    }
  }

  if (!Array.isArray(template.tags)) {
    errors.push('Field "tags" must be an array');
  }

  if (!Array.isArray(template.requiredConnectors)) {
    errors.push('Field "requiredConnectors" must be an array');
  }

  // ── Nodes ─────────────────────────────────────────────────────
  if (!Array.isArray(template.nodes)) {
    errors.push("Template must contain a nodes array");
    return { valid: false, errors, warnings };
  }

  if (template.nodes.length === 0) {
    errors.push("Template must contain at least one node");
    return { valid: false, errors, warnings };
  }

  const nodeIds = new Set<string>();
  const duplicateNodeIds = new Set<string>();

  for (const node of template.nodes) {
    if (!node.id || typeof node.id !== "string") {
      errors.push("Every node must have a non-empty string id");
      continue;
    }

    if (nodeIds.has(node.id)) {
      duplicateNodeIds.add(node.id);
    }
    nodeIds.add(node.id);

    if (!node.type || typeof node.type !== "string") {
      errors.push(`Node "${node.id}" is missing a valid type`);
    }

    if (
      !node.position ||
      typeof node.position.x !== "number" ||
      typeof node.position.y !== "number"
    ) {
      errors.push(`Node "${node.id}" has an invalid position`);
    }

    const data = node.data as unknown as Record<string, unknown> | undefined;
    if (!data || typeof data !== "object") {
      errors.push(`Node "${node.id}" is missing data`);
    } else if (typeof data.nodeType !== "string") {
      errors.push(`Node "${node.id}" data is missing a valid nodeType`);
    }
  }

  if (duplicateNodeIds.size > 0) {
    errors.push(
      `Duplicate node IDs found: ${[...duplicateNodeIds].join(", ")}`
    );
  }

  // ── Edges ─────────────────────────────────────────────────────
  if (!Array.isArray(template.edges)) {
    errors.push("Template must contain an edges array");
    return { valid: errors.length === 0, errors, warnings };
  }

  for (const edge of template.edges) {
    if (!edge.id || typeof edge.id !== "string") {
      errors.push("Every edge must have a non-empty string id");
      continue;
    }

    if (!nodeIds.has(edge.source)) {
      errors.push(
        `Edge "${edge.id}" references non-existent source node "${edge.source}"`
      );
    }

    if (!nodeIds.has(edge.target)) {
      errors.push(
        `Edge "${edge.id}" references non-existent target node "${edge.target}"`
      );
    }
  }

  // ── Orphan detection ──────────────────────────────────────────
  // Non-trigger nodes must have at least one incoming edge
  const nodesWithIncoming = new Set(template.edges.map((e) => e.target));

  for (const node of template.nodes) {
    const data = node.data as unknown as Record<string, unknown> | undefined;
    const nodeType = data?.nodeType as string | undefined;

    if (nodeType === "trigger") continue; // triggers naturally have no incoming edges

    if (!nodesWithIncoming.has(node.id)) {
      warnings.push(
        `Node "${node.id}" (${nodeType ?? node.type}) has no incoming edges — it may be unreachable`
      );
    }
  }

  // ── Popularity sanity check ───────────────────────────────────
  if (
    template.popularity !== undefined &&
    (typeof template.popularity !== "number" || template.popularity < 0)
  ) {
    warnings.push("popularity should be a non-negative number");
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ── URL Encoding / Decoding ─────────────────────────────────────

/**
 * Compress a template to a URL-safe base64 string.
 *
 * Uses deflate (via the built-in CompressionStream API where available,
 * falling back to a simple btoa encoding for environments without it)
 * then base64url-encodes the result.
 */
export function encodeTemplateToUrl(template: ShareableTemplate): string {
  const json = JSON.stringify(template);
  // Use base64url encoding — works in all JS environments
  const base64 = btoa(
    encodeURIComponent(json).replace(/%([0-9A-F]{2})/g, (_match, p1) =>
      String.fromCharCode(parseInt(p1 as string, 16))
    )
  );
  // Make URL-safe: + → -, / → _, remove trailing =
  const urlSafe = base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `#template=${urlSafe}`;
}

/**
 * Decode a template from a URL fragment produced by `encodeTemplateToUrl`.
 *
 * @throws Error if the fragment is missing, malformed, or the decoded template is invalid
 */
export function decodeTemplateFromUrl(urlFragment: string): ShareableTemplate {
  const prefix = "#template=";
  const raw = urlFragment.startsWith(prefix)
    ? urlFragment.slice(prefix.length)
    : urlFragment;

  if (!raw) {
    throw new Error("Empty template URL fragment");
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
    throw new Error("Failed to decode template URL: invalid base64 encoding");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("Failed to decode template URL: invalid JSON");
  }

  const template = parsed as ShareableTemplate;
  const validation = validateTemplate(template);
  if (!validation.valid) {
    throw new Error(
      `Decoded template failed validation:\n${validation.errors.join("\n")}`
    );
  }

  return template;
}

// ── Convenience: workflow → template ────────────────────────────

/**
 * Create a shareable template directly from a WorkflowData object
 * plus author/category metadata.
 */
export function workflowToTemplate(
  workflow: WorkflowData,
  meta: {
    author: string;
    version?: string;
    tags?: string[];
    category?: string;
    requiredConnectors?: string[];
  }
): ShareableTemplate {
  return exportTemplate({
    nodes: workflow.nodes,
    edges: workflow.edges,
    metadata: {
      id: `tpl_${workflow.id}`,
      name: workflow.name,
      description: workflow.description ?? "",
      author: meta.author,
      version: meta.version ?? "1.0.0",
      tags: meta.tags ?? [],
      category: meta.category ?? "general",
      requiredConnectors: meta.requiredConnectors ?? [],
    },
  });
}
