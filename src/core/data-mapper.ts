/**
 * Data Transformation Engine — pipeline-of-operations model.
 *
 * Takes input data and applies a sequence of TransformOperations.
 * Each operation's output feeds into the next operation's input.
 *
 * Security: NO eval, NO Function constructor. All expression evaluation
 * uses a safe mini-parser for comparisons and arithmetic, plus the
 * existing expression resolver for property access.
 */

import type {
  TransformOperation,
  TransformResult,
  AggregateOp,
} from "./types";
import {
  resolveExpression,
  type ExpressionContext,
} from "./expression-resolver";

// ── Safe Expression Evaluator ────────────────────────────────────

/**
 * Token types for the safe expression parser.
 */
type TokenType =
  | "number"
  | "string"
  | "boolean"
  | "null"
  | "identifier"
  | "dot"
  | "lbracket"
  | "rbracket"
  | "lparen"
  | "rparen"
  | "operator"
  | "logical"
  | "not"
  | "comma"
  | "eof";

interface Token {
  type: TokenType;
  value: string;
  numValue?: number;
}

/** Property names that must never be traversed (prototype pollution defense) */
const BLOCKED_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/** Maximum recursion depth for the expression parser to prevent stack overflow from deeply nested input */
const MAX_PARSE_DEPTH = 64;

/**
 * Tokenize a safe expression string.
 * Supports: identifiers, dot access, brackets, numbers, quoted strings,
 * comparison operators, logical operators, arithmetic, boolean literals.
 */
function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < expr.length) {
    // Skip whitespace
    if (/\s/.test(expr[i])) {
      i++;
      continue;
    }

    // String literals
    if (expr[i] === '"' || expr[i] === "'") {
      const quote = expr[i];
      i++;
      let str = "";
      while (i < expr.length && expr[i] !== quote) {
        if (expr[i] === "\\" && i + 1 < expr.length) {
          i++;
          str += expr[i];
        } else {
          str += expr[i];
        }
        i++;
      }
      i++; // skip closing quote
      tokens.push({ type: "string", value: str });
      continue;
    }

    // Numbers
    if (/\d/.test(expr[i]) || (expr[i] === "-" && i + 1 < expr.length && /\d/.test(expr[i + 1]) && (tokens.length === 0 || tokens[tokens.length - 1].type === "operator" || tokens[tokens.length - 1].type === "logical" || tokens[tokens.length - 1].type === "lparen" || tokens[tokens.length - 1].type === "comma"))) {
      let num = "";
      if (expr[i] === "-") {
        num += "-";
        i++;
      }
      while (i < expr.length && (/\d/.test(expr[i]) || expr[i] === ".")) {
        num += expr[i];
        i++;
      }
      tokens.push({ type: "number", value: num, numValue: parseFloat(num) });
      continue;
    }

    // Logical operators && ||
    if (expr[i] === "&" && expr[i + 1] === "&") {
      tokens.push({ type: "logical", value: "&&" });
      i += 2;
      continue;
    }
    if (expr[i] === "|" && expr[i + 1] === "|") {
      tokens.push({ type: "logical", value: "||" });
      i += 2;
      continue;
    }

    // Not operator
    if (expr[i] === "!" && expr[i + 1] !== "=") {
      tokens.push({ type: "not", value: "!" });
      i++;
      continue;
    }

    // Comparison operators
    if (expr[i] === "=" && expr[i + 1] === "=") {
      tokens.push({ type: "operator", value: "==" });
      i += 2;
      continue;
    }
    if (expr[i] === "!" && expr[i + 1] === "=") {
      tokens.push({ type: "operator", value: "!=" });
      i += 2;
      continue;
    }
    if (expr[i] === ">" && expr[i + 1] === "=") {
      tokens.push({ type: "operator", value: ">=" });
      i += 2;
      continue;
    }
    if (expr[i] === "<" && expr[i + 1] === "=") {
      tokens.push({ type: "operator", value: "<=" });
      i += 2;
      continue;
    }
    if (expr[i] === ">") {
      tokens.push({ type: "operator", value: ">" });
      i++;
      continue;
    }
    if (expr[i] === "<") {
      tokens.push({ type: "operator", value: "<" });
      i++;
      continue;
    }

    // Arithmetic operators
    if ("+-*/%".includes(expr[i])) {
      tokens.push({ type: "operator", value: expr[i] });
      i++;
      continue;
    }

    // Punctuation
    if (expr[i] === ".") {
      tokens.push({ type: "dot", value: "." });
      i++;
      continue;
    }
    if (expr[i] === "[") {
      tokens.push({ type: "lbracket", value: "[" });
      i++;
      continue;
    }
    if (expr[i] === "]") {
      tokens.push({ type: "rbracket", value: "]" });
      i++;
      continue;
    }
    if (expr[i] === "(") {
      tokens.push({ type: "lparen", value: "(" });
      i++;
      continue;
    }
    if (expr[i] === ")") {
      tokens.push({ type: "rparen", value: ")" });
      i++;
      continue;
    }
    if (expr[i] === ",") {
      tokens.push({ type: "comma", value: "," });
      i++;
      continue;
    }

    // Identifiers and keywords
    if (/[a-zA-Z_$]/.test(expr[i])) {
      let ident = "";
      while (i < expr.length && /[a-zA-Z0-9_$]/.test(expr[i])) {
        ident += expr[i];
        i++;
      }
      if (ident === "true" || ident === "false") {
        tokens.push({ type: "boolean", value: ident });
      } else if (ident === "null" || ident === "undefined") {
        tokens.push({ type: "null", value: ident });
      } else {
        tokens.push({ type: "identifier", value: ident });
      }
      continue;
    }

    // Unknown character — skip
    i++;
  }

  tokens.push({ type: "eof", value: "" });
  return tokens;
}

/**
 * Safe property access on an object, supporting nested dot paths and array indices.
 */
function safeGet(obj: unknown, path: string): unknown {
  if (obj == null) return undefined;
  const parts = path.split(".");
  let current: unknown = obj;

  for (const part of parts) {
    if (current == null) return undefined;
    if (BLOCKED_KEYS.has(part)) return undefined;

    // Handle array index notation: items[0]
    const bracketMatch = /^([^[]*)\[(\d+)\]$/.exec(part);
    if (bracketMatch) {
      const prop = bracketMatch[1];
      const idx = parseInt(bracketMatch[2], 10);
      if (prop) {
        if (typeof current !== "object") return undefined;
        current = (current as Record<string, unknown>)[prop];
      }
      if (!Array.isArray(current)) return undefined;
      current = current[idx];
      continue;
    }

    if (typeof current !== "object" && typeof current !== "string") return undefined;

    // String length property
    if (typeof current === "string" && part === "length") {
      current = current.length;
      continue;
    }

    // Array length
    if (Array.isArray(current) && part === "length") {
      current = current.length;
      continue;
    }

    if (typeof current === "object" && current !== null) {
      if (!Object.prototype.hasOwnProperty.call(current, part)) return undefined;
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }

  return current;
}

/**
 * Allowed safe string methods.
 */
const SAFE_STRING_METHODS = new Set(["includes", "startsWith", "endsWith", "toLowerCase", "toUpperCase", "trim", "slice", "indexOf"]);

/**
 * Allowed safe array methods.
 */
const SAFE_ARRAY_METHODS = new Set(["includes", "indexOf", "length"]);

/**
 * Recursive descent parser + evaluator for safe expressions.
 *
 * Grammar (simplified):
 *   expr       → logicalOr
 *   logicalOr  → logicalAnd ("||" logicalAnd)*
 *   logicalAnd → notExpr ("&&" notExpr)*
 *   notExpr    → "!" notExpr | comparison
 *   comparison → addition ((">" | "<" | ">=" | "<=" | "==" | "!=") addition)?
 *   addition   → multiply (("+" | "-") multiply)*
 *   multiply   → unary (("*" | "/" | "%") unary)*
 *   unary      → "-" unary | primary
 *   primary    → number | string | boolean | null | identifier chain | "(" expr ")"
 *   chain      → ("." identifier ("(" args ")")?)* | ("[" expr "]")*
 */
function safeEvaluate(
  expr: string,
  scope: Record<string, unknown>
): unknown {
  const tokens = tokenize(expr);
  let pos = 0;
  let depth = 0;

  function guardDepth(): void {
    if (++depth > MAX_PARSE_DEPTH) {
      throw new Error("Expression exceeds maximum nesting depth");
    }
  }

  function peek(): Token {
    return tokens[pos];
  }

  function advance(): Token {
    return tokens[pos++];
  }

  function expect(type: TokenType): Token {
    const t = advance();
    if (t.type !== type) {
      throw new Error(`Expected ${type} but got ${t.type} ("${t.value}")`);
    }
    return t;
  }

  function parseExpr(): unknown {
    guardDepth();
    try {
      return parseLogicalOr();
    } finally {
      depth--;
    }
  }

  function parseLogicalOr(): unknown {
    let left = parseLogicalAnd();
    while (peek().type === "logical" && peek().value === "||") {
      advance();
      const right = parseLogicalAnd();
      // Preserve JS-style short-circuit semantics: return the actual value, not a boolean
      left = toBool(left) ? left : right;
    }
    return left;
  }

  function parseLogicalAnd(): unknown {
    let left = parseNot();
    while (peek().type === "logical" && peek().value === "&&") {
      advance();
      const right = parseNot();
      // Preserve JS-style short-circuit semantics: return the actual value, not a boolean
      left = toBool(left) ? right : left;
    }
    return left;
  }

  function parseNot(): unknown {
    if (peek().type === "not") {
      advance();
      const val = parseNot();
      return !toBool(val);
    }
    return parseComparison();
  }

  function parseComparison(): unknown {
    let left = parseAddition();
    const t = peek();
    if (t.type === "operator" && [">", "<", ">=", "<=", "==", "!="].includes(t.value)) {
      const op = advance().value;
      const right = parseAddition();
      return compare(left, op, right);
    }
    return left;
  }

  function parseAddition(): unknown {
    let left = parseMultiply();
    while (peek().type === "operator" && (peek().value === "+" || peek().value === "-")) {
      const op = advance().value;
      const right = parseMultiply();
      if (op === "+") {
        if (typeof left === "string" || typeof right === "string") {
          left = String(left ?? "") + String(right ?? "");
        } else {
          left = toNum(left) + toNum(right);
        }
      } else {
        left = toNum(left) - toNum(right);
      }
    }
    return left;
  }

  function parseMultiply(): unknown {
    let left = parseUnary();
    while (peek().type === "operator" && (peek().value === "*" || peek().value === "/" || peek().value === "%")) {
      const op = advance().value;
      const right = parseUnary();
      if (op === "*") left = toNum(left) * toNum(right);
      else if (op === "/") {
        const d = toNum(right);
        left = d === 0 ? 0 : toNum(left) / d;
      } else {
        const d = toNum(right);
        left = d === 0 ? 0 : toNum(left) % d;
      }
    }
    return left;
  }

  function parseUnary(): unknown {
    if (peek().type === "operator" && peek().value === "-") {
      advance();
      return -toNum(parseUnary());
    }
    return parsePrimary();
  }

  function parsePrimary(): unknown {
    const t = peek();

    // Parenthesized expression
    if (t.type === "lparen") {
      advance();
      const val = parseExpr();
      expect("rparen");
      return applyChain(val);
    }

    // Number literal
    if (t.type === "number") {
      advance();
      return applyChain(t.numValue ?? parseFloat(t.value));
    }

    // String literal
    if (t.type === "string") {
      advance();
      return applyChain(t.value);
    }

    // Boolean literal
    if (t.type === "boolean") {
      advance();
      return applyChain(t.value === "true");
    }

    // Null/undefined
    if (t.type === "null") {
      advance();
      return applyChain(null);
    }

    // Identifier — variable reference
    if (t.type === "identifier") {
      const name = advance().value;
      let val: unknown;
      if (Object.prototype.hasOwnProperty.call(scope, name)) {
        val = scope[name];
      } else {
        val = undefined;
      }
      return applyChain(val);
    }

    // Unexpected token — return undefined
    advance();
    return undefined;
  }

  /**
   * Apply dot-access chains and bracket access and method calls after a primary value.
   */
  function applyChain(val: unknown): unknown {
    while (true) {
      // Dot access
      if (peek().type === "dot") {
        advance();
        const prop = expect("identifier");
        if (BLOCKED_KEYS.has(prop.value)) {
          val = undefined;
          continue;
        }

        // Check if it's a method call
        if (peek().type === "lparen") {
          advance();
          const args: unknown[] = [];
          if (peek().type !== "rparen") {
            args.push(parseExpr());
            while (peek().type === "comma") {
              advance();
              args.push(parseExpr());
            }
          }
          expect("rparen");
          val = callMethod(val, prop.value, args);
          continue;
        }

        // Property access
        if (val == null) {
          val = undefined;
          continue;
        }
        if (typeof val === "string" && prop.value === "length") {
          val = val.length;
          continue;
        }
        if (Array.isArray(val) && prop.value === "length") {
          val = val.length;
          continue;
        }
        if (typeof val === "object" && val !== null) {
          if (Object.prototype.hasOwnProperty.call(val, prop.value)) {
            val = (val as Record<string, unknown>)[prop.value];
          } else {
            val = undefined;
          }
        } else {
          val = undefined;
        }
        continue;
      }

      // Bracket access
      if (peek().type === "lbracket") {
        advance();
        const idx = parseExpr();
        expect("rbracket");
        if (val == null) {
          val = undefined;
          continue;
        }
        if (Array.isArray(val) && typeof idx === "number") {
          val = val[idx];
        } else if (typeof val === "object" && val !== null && typeof idx === "string") {
          if (BLOCKED_KEYS.has(idx)) {
            val = undefined;
          } else if (Object.prototype.hasOwnProperty.call(val, idx)) {
            val = (val as Record<string, unknown>)[idx];
          } else {
            val = undefined;
          }
        } else {
          val = undefined;
        }
        continue;
      }

      break;
    }
    return val;
  }

  /**
   * Call a safe method on a value.
   */
  function callMethod(obj: unknown, method: string, args: unknown[]): unknown {
    if (obj == null) return undefined;

    // String methods
    if (typeof obj === "string" && SAFE_STRING_METHODS.has(method)) {
      switch (method) {
        case "includes":
          return obj.includes(String(args[0] ?? ""));
        case "startsWith":
          return obj.startsWith(String(args[0] ?? ""));
        case "endsWith":
          return obj.endsWith(String(args[0] ?? ""));
        case "toLowerCase":
          return obj.toLowerCase();
        case "toUpperCase":
          return obj.toUpperCase();
        case "trim":
          return obj.trim();
        case "slice":
          return obj.slice(toNum(args[0]), args[1] !== undefined ? toNum(args[1]) : undefined);
        case "indexOf":
          return obj.indexOf(String(args[0] ?? ""));
      }
    }

    // Array methods
    if (Array.isArray(obj) && SAFE_ARRAY_METHODS.has(method)) {
      switch (method) {
        case "includes":
          return obj.includes(args[0]);
        case "indexOf":
          return obj.indexOf(args[0]);
      }
    }

    // toString — only on primitives to avoid calling custom toString overrides
    if (method === "toString" && (typeof obj === "string" || typeof obj === "number" || typeof obj === "boolean")) {
      return String(obj);
    }

    return undefined;
  }

  function compare(left: unknown, op: string, right: unknown): boolean {
    switch (op) {
      case "==":
        // Use strict equality to prevent type-coercion surprises (e.g. null == undefined, 0 == "")
        // but coerce numbers for intuitive string-to-number comparison ("5" == 5)
        if (typeof left === "number" && typeof right === "string") return left === Number(right);
        if (typeof left === "string" && typeof right === "number") return Number(left) === right;
        return left === right;
      case "!=":
        if (typeof left === "number" && typeof right === "string") return left !== Number(right);
        if (typeof left === "string" && typeof right === "number") return Number(left) !== right;
        return left !== right;
      case ">":
        return toNum(left) > toNum(right);
      case "<":
        return toNum(left) < toNum(right);
      case ">=":
        return toNum(left) >= toNum(right);
      case "<=":
        return toNum(left) <= toNum(right);
      default:
        return false;
    }
  }

  function toNum(v: unknown): number {
    if (typeof v === "number") return v;
    if (typeof v === "string") {
      const n = parseFloat(v);
      return isNaN(n) ? 0 : n;
    }
    if (typeof v === "boolean") return v ? 1 : 0;
    return 0;
  }

  function toBool(v: unknown): boolean {
    if (v == null) return false;
    if (typeof v === "boolean") return v;
    if (typeof v === "number") return v !== 0;
    if (typeof v === "string") return v.length > 0;
    return true;
  }

  const result = parseExpr();
  return result;
}

// ── Helpers ──────────────────────────────────────────────────────

/**
 * Ensure input is an array. If not, wrap it in an array.
 * null/undefined becomes empty array.
 */
function ensureArray(input: unknown): unknown[] {
  if (input == null) return [];
  if (Array.isArray(input)) return input;
  return [input];
}

/**
 * Safely pick keys from an object.
 */
function pickKeys(obj: unknown, keys: string[]): Record<string, unknown> {
  if (obj == null || typeof obj !== "object") return {};
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      result[key] = (obj as Record<string, unknown>)[key];
    }
  }
  return result;
}

/**
 * Safely omit keys from an object.
 */
function omitKeys(obj: unknown, keys: string[]): Record<string, unknown> {
  if (obj == null || typeof obj !== "object") return {};
  const keysSet = new Set(keys);
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
    if (!keysSet.has(key)) {
      result[key] = val;
    }
  }
  return result;
}

/**
 * Rename keys in an object based on a mapping.
 */
function renameKeys(obj: unknown, mapping: Record<string, string>): Record<string, unknown> {
  if (obj == null || typeof obj !== "object") return {};
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
    const newKey = mapping[key] ?? key;
    result[newKey] = val;
  }
  return result;
}

// ── Operation Implementations ────────────────────────────────────

function applyMap(
  input: unknown[],
  expression: string,
  context: ExpressionContext,
): unknown[] {
  return input.map((item, index) => {
    // If expression contains template syntax {{...}}, use the expression resolver
    if (expression.includes("{{")) {
      const itemContext: ExpressionContext = {
        ...context,
        nodeOutputs: {
          ...context.nodeOutputs,
          _item: typeof item === "object" && item !== null ? item as Record<string, unknown> : { value: item },
        },
        vars: { ...context.vars, item, index, _item: item },
      };
      return resolveExpression(expression.replace(/\{\{/g, "").replace(/\}\}/g, ""), itemContext);
    }
    // Otherwise use the safe evaluator
    const scope: Record<string, unknown> = {
      item,
      index,
      array: input,
    };
    return safeEvaluate(expression, scope);
  });
}

function applyFilter(
  input: unknown[],
  expression: string,
  context: ExpressionContext,
): unknown[] {
  return input.filter((item, index) => {
    if (expression.includes("{{")) {
      const itemContext: ExpressionContext = {
        ...context,
        nodeOutputs: {
          ...context.nodeOutputs,
          _item: typeof item === "object" && item !== null ? item as Record<string, unknown> : { value: item },
        },
        vars: { ...context.vars, item, index, _item: item },
      };
      const result = resolveExpression(expression.replace(/\{\{/g, "").replace(/\}\}/g, ""), itemContext);
      return !!result;
    }
    const scope: Record<string, unknown> = {
      item,
      index,
      array: input,
    };
    const result = safeEvaluate(expression, scope);
    return !!result;
  });
}

function applySort(
  input: unknown[],
  key: string,
  direction: "asc" | "desc",
): unknown[] {
  const sorted = [...input].sort((a, b) => {
    const aVal = safeGet(a, key);
    const bVal = safeGet(b, key);

    if (aVal == null && bVal == null) return 0;
    if (aVal == null) return direction === "asc" ? -1 : 1;
    if (bVal == null) return direction === "asc" ? 1 : -1;

    if (typeof aVal === "string" && typeof bVal === "string") {
      return direction === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    }

    const aNum = Number(aVal);
    const bNum = Number(bVal);
    if (!isNaN(aNum) && !isNaN(bNum)) {
      return direction === "asc" ? aNum - bNum : bNum - aNum;
    }

    const aStr = String(aVal);
    const bStr = String(bVal);
    return direction === "asc" ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr);
  });
  return sorted;
}

function applyGroupBy(
  input: unknown[],
  key: string,
): Record<string, unknown[]> {
  const groups: Record<string, unknown[]> = {};
  for (const item of input) {
    const groupKey = String(safeGet(item, key) ?? "undefined");
    if (!groups[groupKey]) groups[groupKey] = [];
    groups[groupKey].push(item);
  }
  return groups;
}

function applyAggregate(
  input: unknown[],
  operations: AggregateOp[],
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const op of operations) {
    const values = input
      .map((item) => safeGet(item, op.field))
      .filter((v) => v != null);

    const nums = values.map((v) => Number(v)).filter((n) => !isNaN(n));

    switch (op.operation) {
      case "count":
        result[op.alias] = values.length;
        break;
      case "sum":
        result[op.alias] = nums.reduce((a, b) => a + b, 0);
        break;
      case "avg":
        result[op.alias] = nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
        break;
      case "min":
        result[op.alias] = nums.length > 0 ? Math.min(...nums) : null;
        break;
      case "max":
        result[op.alias] = nums.length > 0 ? Math.max(...nums) : null;
        break;
    }
  }
  return result;
}

function applyTemplate(
  input: unknown[],
  template: string,
  context: ExpressionContext,
): unknown[] {
  return input.map((item) => {
    // Replace {{item.xxx}} with values from the current item
    return template.replace(/\{\{([^}]+)\}\}/g, (_match, expr: string) => {
      const trimmed = expr.trim();
      if (trimmed.startsWith("item")) {
        const path = trimmed.slice(4);
        if (path === "" || path === ".") return String(item ?? "");
        if (path.startsWith(".")) {
          const val = safeGet(item, path.slice(1));
          return val == null ? "" : String(val);
        }
      }
      // Fall back to expression resolver
      const resolved = resolveExpression(trimmed, context);
      return resolved == null ? "" : String(resolved);
    });
  });
}

function applyUnique(
  input: unknown[],
  key?: string,
): unknown[] {
  if (!key) {
    // Deduplicate by value (using sorted-key JSON.stringify for objects to be key-order independent)
    const seen = new Set<string>();
    return input.filter((item) => {
      let serialized: string;
      if (item != null && typeof item === "object") {
        // Sort keys for consistent serialization regardless of insertion order
        serialized = JSON.stringify(item, Object.keys(item as Record<string, unknown>).sort());
      } else {
        serialized = String(item);
      }
      if (seen.has(serialized)) return false;
      seen.add(serialized);
      return true;
    });
  }

  // Deduplicate by key
  const seen = new Set<unknown>();
  return input.filter((item) => {
    const val = safeGet(item, key);
    if (seen.has(val)) return false;
    seen.add(val);
    return true;
  });
}

// ── Main Pipeline ────────────────────────────────────────────────

/**
 * Apply a pipeline of transform operations to input data.
 *
 * Each operation's output feeds into the next operation.
 * Returns a TransformResult with the final output and metadata.
 */
export function applyTransformPipeline(
  input: unknown,
  operations: TransformOperation[],
  context: ExpressionContext,
): TransformResult {
  if (!operations || operations.length === 0) {
    return { success: true, output: input, operationsApplied: 0 };
  }

  let current: unknown = input;
  let applied = 0;

  for (const op of operations) {
    try {
      switch (op.type) {
        case "map": {
          const arr = ensureArray(current);
          current = applyMap(arr, op.expression, context);
          break;
        }

        case "filter": {
          const arr = ensureArray(current);
          current = applyFilter(arr, op.expression, context);
          break;
        }

        case "sort": {
          const arr = ensureArray(current);
          current = applySort(arr, op.key, op.direction);
          break;
        }

        case "pick": {
          if (Array.isArray(current)) {
            current = current.map((item) => pickKeys(item, op.keys));
          } else {
            current = pickKeys(current, op.keys);
          }
          break;
        }

        case "omit": {
          if (Array.isArray(current)) {
            current = current.map((item) => omitKeys(item, op.keys));
          } else {
            current = omitKeys(current, op.keys);
          }
          break;
        }

        case "rename": {
          if (Array.isArray(current)) {
            current = current.map((item) => renameKeys(item, op.mapping));
          } else {
            current = renameKeys(current, op.mapping);
          }
          break;
        }

        case "flatten": {
          const arr = ensureArray(current);
          current = arr.flat(op.depth ?? 1);
          break;
        }

        case "group_by": {
          const arr = ensureArray(current);
          current = applyGroupBy(arr, op.key);
          break;
        }

        case "aggregate": {
          const arr = ensureArray(current);
          current = applyAggregate(arr, op.operations);
          break;
        }

        case "template": {
          const arr = ensureArray(current);
          current = applyTemplate(arr, op.template, context);
          break;
        }

        case "json_parse": {
          if (typeof current === "string") {
            try {
              current = JSON.parse(current);
            } catch (e) {
              return {
                success: false,
                output: current,
                error: `json_parse failed at operation ${applied + 1}: ${e instanceof Error ? e.message : String(e)}`,
                operationsApplied: applied,
              };
            }
          } else if (Array.isArray(current)) {
            current = current.map((item) => {
              if (typeof item === "string") {
                try {
                  return JSON.parse(item);
                } catch {
                  return item;
                }
              }
              return item;
            });
          }
          break;
        }

        case "json_stringify": {
          if (Array.isArray(current)) {
            current = current.map((item) =>
              typeof item === "string" ? item : JSON.stringify(item, null, op.pretty ? 2 : undefined)
            );
          } else {
            current = JSON.stringify(current, null, op.pretty ? 2 : undefined);
          }
          break;
        }

        case "unique": {
          const arr = ensureArray(current);
          current = applyUnique(arr, op.key);
          break;
        }

        case "take": {
          const arr = ensureArray(current);
          current = arr.slice(0, Math.max(0, op.count));
          break;
        }

        case "skip": {
          const arr = ensureArray(current);
          current = arr.slice(Math.max(0, op.count));
          break;
        }

        default:
          return {
            success: false,
            output: current,
            error: `Unknown operation type: ${(op as { type: string }).type} at operation ${applied + 1}`,
            operationsApplied: applied,
          };
      }

      applied++;
    } catch (err) {
      return {
        success: false,
        output: current,
        error: `Operation "${op.type}" failed at step ${applied + 1}: ${err instanceof Error ? err.message : String(err)}`,
        operationsApplied: applied,
      };
    }
  }

  return { success: true, output: current, operationsApplied: applied };
}
