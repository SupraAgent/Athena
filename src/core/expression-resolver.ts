/**
 * Expression resolver for workflow template strings.
 *
 * Resolves expressions like `{{node_1.output.field}}`, `{{vars.myVar}}`,
 * `{{env.API_URL}}`, and `{{credential:myCredential.apiKey}}` against
 * an ExpressionContext built from the workflow execution state.
 *
 * Security: No eval, no Function constructor, no code execution.
 * All resolution is done via safe property traversal.
 */

// ── Types ────────────────────────────────────────────────────────

export interface ExpressionContext {
  /** nodeId -> output record from workflow execution */
  nodeOutputs: Record<string, Record<string, unknown>>;
  /** Workflow context variables */
  vars: Record<string, unknown>;
  /** credentialId -> field map (optional) */
  credentials?: Record<string, Record<string, string>>;
  /** The ID of the currently executing node */
  currentNodeId?: string;
  /** Environment variables */
  env?: Record<string, string>;
}

// ── Constants ────────────────────────────────────────────────────

/** Maximum depth for recursive object traversal in resolveAllValues */
const MAX_RESOLVE_DEPTH = 10;

/** Pattern matching `{{expression}}` but not `\{\{escaped\}\}` */
const TEMPLATE_PATTERN = /(?<!\\)\{\{([^}]+)\}\}/g;

/** Pattern matching escaped braces: `\{\{...\}\}` */
const ESCAPED_OPEN = /\\\{\\\{/g;
const ESCAPED_CLOSE = /\\\}\\\}/g;

/** Pattern matching array index notation: `items[0]` -> `items`, `0` */
const ARRAY_INDEX_PATTERN = /^([^[]*)\[(\d+)\]$/;

/** Property names that must never be traversed (prototype pollution defense) */
const BLOCKED_KEYS = new Set(["__proto__", "constructor", "prototype"]);

// ── Core resolver ────────────────────────────────────────────────

/**
 * Parse a single path segment that may include array index notation.
 * E.g. `items[2]` yields `["items", "2"]`, `name` yields `["name"]`.
 */
function parseSegment(segment: string): string[] {
  const match = ARRAY_INDEX_PATTERN.exec(segment);
  if (match) {
    const parts: string[] = [];
    if (match[1]) parts.push(match[1]);
    parts.push(match[2]);
    return parts;
  }
  return [segment];
}

/**
 * Safely traverse an object by a dot-notation path, supporting array indices.
 * Returns `undefined` for any missing intermediate value.
 */
function traversePath(root: unknown, pathParts: string[]): unknown {
  let current: unknown = root;

  for (const part of pathParts) {
    if (current == null) return undefined;
    if (typeof current !== "object" && !Array.isArray(current)) return undefined;

    const segments = parseSegment(part);
    for (const seg of segments) {
      if (current == null) return undefined;

      // Block prototype pollution vectors
      if (BLOCKED_KEYS.has(seg)) return undefined;

      if (Array.isArray(current)) {
        const idx = Number(seg);
        if (Number.isNaN(idx) || idx < 0 || idx >= current.length) return undefined;
        current = current[idx];
      } else if (typeof current === "object") {
        // Only traverse own properties
        if (!Object.prototype.hasOwnProperty.call(current, seg)) return undefined;
        current = (current as Record<string, unknown>)[seg];
      } else {
        return undefined;
      }
    }
  }

  return current;
}

/**
 * Resolve a single expression (without `{{` `}}` delimiters) against the context.
 *
 * Expression syntax:
 * - `vars.myVar` — context variable
 * - `env.API_URL` — environment variable
 * - `credential:myCredential.apiKey` — credential field
 * - `node_abc.fieldName` — node output field (shorthand for nodeOutputs lookup)
 * - `node_abc.nested.path.to.value` — deep nested access
 * - `node_abc.items[0].name` — array indexing
 * - `myVar` — backward-compatible plain variable (maps to vars.myVar)
 *
 * Returns the raw value (string, number, boolean, object, array, or undefined).
 */
export function resolveExpression(expression: string, context: ExpressionContext): unknown {
  const trimmed = expression.trim();
  if (!trimmed) return undefined;

  // ── credential:id.field ──
  if (trimmed.startsWith("credential:")) {
    const credPath = trimmed.slice("credential:".length);
    const dotIndex = credPath.indexOf(".");
    if (dotIndex === -1) {
      // Just `credential:myId` — return entire credential record
      return context.credentials?.[credPath];
    }
    const credId = credPath.slice(0, dotIndex);
    const fieldPath = credPath.slice(dotIndex + 1);
    const credRecord = context.credentials?.[credId];
    if (!credRecord) return undefined;
    return traversePath(credRecord, fieldPath.split("."));
  }

  const parts = trimmed.split(".");

  // ── vars.* ──
  if (parts[0] === "vars" && parts.length > 1) {
    return traversePath(context.vars, parts.slice(1));
  }

  // ── env.* ──
  if (parts[0] === "env" && parts.length > 1) {
    if (!context.env) return undefined;
    return traversePath(context.env, parts.slice(1));
  }

  // ── nodeId.* — lookup in nodeOutputs ──
  const nodeId = parts[0];
  if (nodeId && context.nodeOutputs[nodeId] !== undefined) {
    if (parts.length === 1) {
      return context.nodeOutputs[nodeId];
    }
    return traversePath(context.nodeOutputs[nodeId], parts.slice(1));
  }

  // ── Backward compatibility: plain variable name maps to vars ──
  // Only for single-segment expressions or when the first segment
  // does not match a known nodeId.
  if (parts.length === 1) {
    const varVal = context.vars[trimmed];
    if (varVal !== undefined) return varVal;
  }

  // Multi-segment expression that didn't match any namespace: try vars as nested path
  const varResult = traversePath(context.vars, parts);
  if (varResult !== undefined) return varResult;

  return undefined;
}

/**
 * Stringify a resolved value for template interpolation.
 */
function stringifyValue(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * Resolve all `{{expr}}` patterns in a template string.
 *
 * - For each match, calls `resolveExpression` and stringifies the result.
 * - Objects/arrays are JSON.stringified.
 * - `undefined` becomes empty string `""`.
 * - Escaped braces `\{\{literal\}\}` are not resolved; the backslashes are stripped.
 */
export function resolveTemplate(template: string, context: ExpressionContext): string {
  if (typeof template !== "string") return String(template ?? "");

  // Replace unescaped {{expr}} patterns
  let result = template.replace(TEMPLATE_PATTERN, (_match, expr: string) => {
    const resolved = resolveExpression(expr, context);
    return stringifyValue(resolved);
  });

  // Unescape literal braces: \{\{ -> {{ and \}\} -> }}
  result = result.replace(ESCAPED_OPEN, "{{");
  result = result.replace(ESCAPED_CLOSE, "}}");

  return result;
}

/**
 * Deep-resolve all string values in a config object.
 *
 * - Recursively traverses objects and arrays up to MAX_RESOLVE_DEPTH.
 * - Non-string values pass through unchanged.
 * - String values are run through `resolveTemplate`.
 * - Circular references are handled via a seen-set (returned as-is).
 */
export function resolveAllValues(
  config: Record<string, unknown>,
  context: ExpressionContext
): Record<string, unknown> {
  const seen = new WeakSet<object>();
  return deepResolve(config, context, seen, 0) as Record<string, unknown>;
}

/**
 * Internal recursive resolver with depth tracking and circular reference protection.
 */
function deepResolve(
  value: unknown,
  context: ExpressionContext,
  seen: WeakSet<object>,
  depth: number
): unknown {
  // Depth guard
  if (depth > MAX_RESOLVE_DEPTH) return value;

  if (typeof value === "string") {
    // Only process strings that contain template patterns
    if (value.includes("{{")) {
      return resolveTemplate(value, context);
    }
    return value;
  }

  if (value === null || value === undefined) return value;
  if (typeof value !== "object") return value;

  // Circular reference guard
  const obj = value as object;
  if (seen.has(obj)) return value;
  seen.add(obj);

  if (Array.isArray(value)) {
    return value.map((item) => deepResolve(item, context, seen, depth + 1));
  }

  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    result[key] = deepResolve(val, context, seen, depth + 1);
  }
  return result;
}
