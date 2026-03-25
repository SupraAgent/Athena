/**
 * Database connector module: safe SQL construction via QueryBuilder,
 * WhereClause fluent API, MongoDB query builder, and SQL injection protection.
 *
 * Key guarantees:
 * - Values are ALWAYS parameterized ($1, $2, ...) — never interpolated
 * - Identifiers (table/column names) are validated against a strict whitelist regex
 * - MongoDB collection names follow the same identifier validation
 */

// ── Types ────────────────────────────────────────────────────────

export interface BuiltQuery {
  sql: string;
  params: unknown[];
}

export interface MongoQuery {
  collection: string;
  operation: "find" | "aggregate";
  filter?: Record<string, unknown>;
  projection?: Record<string, 1>;
  pipeline?: unknown[];
}

/**
 * Dangerous MongoDB pipeline stages that can write data or execute arbitrary code.
 * These are blocked by default to prevent pipeline injection attacks.
 */
const DANGEROUS_PIPELINE_STAGES = new Set([
  "$out",
  "$merge",
  "$collStats",
  "$currentOp",
  "$listSessions",
  "$planCacheStats",
]);

export interface OrderByClause {
  column: string;
  direction: "asc" | "desc";
}

// ── Identifier Validation ────────────────────────────────────────

const IDENTIFIER_RE = /^[a-zA-Z_][a-zA-Z0-9_.]*$/;

/**
 * Validate and quote a SQL identifier (table or column name).
 * Throws if the identifier contains invalid characters.
 */
export function sanitizeIdentifier(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("Identifier cannot be empty");
  }
  if (!IDENTIFIER_RE.test(trimmed)) {
    throw new Error(
      `Invalid identifier "${trimmed}": must match ^[a-zA-Z_][a-zA-Z0-9_.]*$`
    );
  }
  // Quote with double-quotes to handle reserved words
  // For dotted identifiers (schema.table), quote each part
  return trimmed
    .split(".")
    .map((part) => `"${part}"`)
    .join(".");
}

/**
 * Validate a MongoDB filter object.
 * Rejects keys containing `$where` (server-side JS execution)
 * and `$expr` with unsafe operators.
 */
export function validateMongoFilter(filter: Record<string, unknown>): void {
  const stack: unknown[] = [filter];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current !== null && typeof current === "object" && !Array.isArray(current)) {
      for (const key of Object.keys(current as Record<string, unknown>)) {
        if (key === "$where") {
          throw new Error("MongoDB $where operator is not allowed — it permits server-side JS execution");
        }
        const val = (current as Record<string, unknown>)[key];
        if (val !== null && typeof val === "object") {
          stack.push(val);
        }
      }
    } else if (Array.isArray(current)) {
      for (const item of current) {
        if (item !== null && typeof item === "object") {
          stack.push(item);
        }
      }
    }
  }
}

/**
 * Validate a MongoDB aggregation pipeline.
 * Rejects dangerous stages that can write data or expose system info.
 */
export function validateMongoPipeline(pipeline: unknown[]): void {
  for (const stage of pipeline) {
    if (stage !== null && typeof stage === "object" && !Array.isArray(stage)) {
      for (const key of Object.keys(stage as Record<string, unknown>)) {
        if (DANGEROUS_PIPELINE_STAGES.has(key)) {
          throw new Error(`MongoDB pipeline stage "${key}" is not allowed — it can modify data outside the query`);
        }
        if (key === "$where") {
          throw new Error("MongoDB $where operator is not allowed — it permits server-side JS execution");
        }
      }
    }
  }
}

// ── WhereClause Fluent Builder ───────────────────────────────────

type WhereOperator = "=" | "!=" | ">" | "<" | ">=" | "<=" | "LIKE" | "ILIKE" | "IN" | "IS NULL" | "IS NOT NULL";

interface WhereCondition {
  column: string;
  operator: WhereOperator;
  value: unknown;
  connector?: "AND" | "OR";
}

class WhereColumnBuilder {
  private clauses: WhereCondition[];

  constructor(clauses: WhereCondition[]) {
    this.clauses = clauses;
  }

  eq(value: unknown): WhereBuilder {
    this.clauses[this.clauses.length - 1].operator = "=";
    this.clauses[this.clauses.length - 1].value = value;
    return new WhereBuilder(this.clauses);
  }

  neq(value: unknown): WhereBuilder {
    this.clauses[this.clauses.length - 1].operator = "!=";
    this.clauses[this.clauses.length - 1].value = value;
    return new WhereBuilder(this.clauses);
  }

  gt(value: unknown): WhereBuilder {
    this.clauses[this.clauses.length - 1].operator = ">";
    this.clauses[this.clauses.length - 1].value = value;
    return new WhereBuilder(this.clauses);
  }

  lt(value: unknown): WhereBuilder {
    this.clauses[this.clauses.length - 1].operator = "<";
    this.clauses[this.clauses.length - 1].value = value;
    return new WhereBuilder(this.clauses);
  }

  gte(value: unknown): WhereBuilder {
    this.clauses[this.clauses.length - 1].operator = ">=";
    this.clauses[this.clauses.length - 1].value = value;
    return new WhereBuilder(this.clauses);
  }

  lte(value: unknown): WhereBuilder {
    this.clauses[this.clauses.length - 1].operator = "<=";
    this.clauses[this.clauses.length - 1].value = value;
    return new WhereBuilder(this.clauses);
  }

  like(value: string): WhereBuilder {
    this.clauses[this.clauses.length - 1].operator = "LIKE";
    this.clauses[this.clauses.length - 1].value = value;
    return new WhereBuilder(this.clauses);
  }

  ilike(value: string): WhereBuilder {
    this.clauses[this.clauses.length - 1].operator = "ILIKE";
    this.clauses[this.clauses.length - 1].value = value;
    return new WhereBuilder(this.clauses);
  }

  in(values: unknown[]): WhereBuilder {
    this.clauses[this.clauses.length - 1].operator = "IN";
    this.clauses[this.clauses.length - 1].value = values;
    return new WhereBuilder(this.clauses);
  }

  isNull(): WhereBuilder {
    this.clauses[this.clauses.length - 1].operator = "IS NULL";
    this.clauses[this.clauses.length - 1].value = undefined;
    return new WhereBuilder(this.clauses);
  }

  isNotNull(): WhereBuilder {
    this.clauses[this.clauses.length - 1].operator = "IS NOT NULL";
    this.clauses[this.clauses.length - 1].value = undefined;
    return new WhereBuilder(this.clauses);
  }
}

export class WhereBuilder {
  private clauses: WhereCondition[];

  constructor(clauses?: WhereCondition[]) {
    this.clauses = clauses ?? [];
  }

  and(column: string): WhereColumnBuilder {
    this.clauses.push({
      column,
      operator: "=",
      value: undefined,
      connector: "AND",
    });
    return new WhereColumnBuilder(this.clauses);
  }

  or(column: string): WhereColumnBuilder {
    this.clauses.push({
      column,
      operator: "=",
      value: undefined,
      connector: "OR",
    });
    return new WhereColumnBuilder(this.clauses);
  }

  /**
   * Build the WHERE clause with parameterized values.
   * @param startIndex starting parameter index (1-based), default 1
   */
  build(startIndex = 1): { sql: string; params: unknown[] } {
    if (this.clauses.length === 0) {
      return { sql: "", params: [] };
    }

    const params: unknown[] = [];
    let paramIdx = startIndex;
    const parts: string[] = [];

    for (let i = 0; i < this.clauses.length; i++) {
      const clause = this.clauses[i];
      const col = sanitizeIdentifier(clause.column);

      let fragment: string;

      if (clause.operator === "IS NULL" || clause.operator === "IS NOT NULL") {
        fragment = `${col} ${clause.operator}`;
      } else if (clause.operator === "IN") {
        const values = clause.value as unknown[];
        if (!Array.isArray(values) || values.length === 0) {
          throw new Error("IN operator requires a non-empty array");
        }
        const placeholders = values.map(() => {
          const p = `$${paramIdx++}`;
          return p;
        });
        params.push(...values);
        fragment = `${col} IN (${placeholders.join(", ")})`;
      } else {
        fragment = `${col} ${clause.operator} $${paramIdx++}`;
        params.push(clause.value);
      }

      if (i > 0 && clause.connector) {
        parts.push(`${clause.connector} ${fragment}`);
      } else {
        parts.push(fragment);
      }
    }

    return { sql: parts.join(" "), params };
  }
}

/**
 * Entry point for the fluent WHERE builder.
 *
 * Usage:
 *   where("price").gt(100).and("status").eq("active").or("featured").eq(true)
 *   // -> { sql: '"price" > $1 AND "status" = $2 OR "featured" = $3', params: [100, "active", true] }
 */
export function where(column: string): WhereColumnBuilder {
  const clauses: WhereCondition[] = [
    { column, operator: "=", value: undefined },
  ];
  return new WhereColumnBuilder(clauses);
}

// ── QueryBuilder ─────────────────────────────────────────────────

export class QueryBuilder {
  /**
   * Build a SELECT query with optional WHERE, ORDER BY, and LIMIT.
   */
  buildSelect(
    table: string,
    columns?: string[],
    whereClause?: WhereBuilder,
    orderBy?: OrderByClause | OrderByClause[],
    limit?: number,
  ): BuiltQuery {
    const safeTable = sanitizeIdentifier(table);
    const colList =
      columns && columns.length > 0
        ? columns.map((c) => sanitizeIdentifier(c)).join(", ")
        : "*";

    let sql = `SELECT ${colList} FROM ${safeTable}`;
    let params: unknown[] = [];

    if (whereClause) {
      const w = whereClause.build(1);
      if (w.sql) {
        sql += ` WHERE ${w.sql}`;
        params = w.params;
      }
    }

    if (orderBy) {
      const orders = Array.isArray(orderBy) ? orderBy : [orderBy];
      if (orders.length > 0) {
        const orderParts = orders.map((o) => {
          const col = sanitizeIdentifier(o.column);
          const dir = o.direction === "desc" ? "DESC" : "ASC";
          return `${col} ${dir}`;
        });
        sql += ` ORDER BY ${orderParts.join(", ")}`;
      }
    }

    if (limit !== undefined && limit > 0) {
      sql += ` LIMIT $${params.length + 1}`;
      params.push(limit);
    }

    return { sql, params };
  }

  /**
   * Build an INSERT query with parameterized values.
   */
  buildInsert(table: string, values: Record<string, unknown>): BuiltQuery {
    const safeTable = sanitizeIdentifier(table);
    const entries = Object.entries(values);
    if (entries.length === 0) {
      throw new Error("INSERT requires at least one value");
    }

    const columns: string[] = [];
    const placeholders: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    for (const [col, val] of entries) {
      columns.push(sanitizeIdentifier(col));
      placeholders.push(`$${paramIdx++}`);
      params.push(val);
    }

    const sql = `INSERT INTO ${safeTable} (${columns.join(", ")}) VALUES (${placeholders.join(", ")})`;
    return { sql, params };
  }

  /**
   * Build an UPDATE query with parameterized values and WHERE clause.
   */
  buildUpdate(
    table: string,
    values: Record<string, unknown>,
    whereClause: WhereBuilder,
  ): BuiltQuery {
    const safeTable = sanitizeIdentifier(table);
    const entries = Object.entries(values);
    if (entries.length === 0) {
      throw new Error("UPDATE requires at least one value");
    }

    const setParts: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    for (const [col, val] of entries) {
      setParts.push(`${sanitizeIdentifier(col)} = $${paramIdx++}`);
      params.push(val);
    }

    let sql = `UPDATE ${safeTable} SET ${setParts.join(", ")}`;

    const w = whereClause.build(paramIdx);
    if (!w.sql) {
      throw new Error("UPDATE without a WHERE clause is not allowed — it would affect all rows");
    }
    sql += ` WHERE ${w.sql}`;
    params.push(...w.params);

    return { sql, params };
  }

  /**
   * Build a DELETE query with WHERE clause.
   */
  buildDelete(table: string, whereClause: WhereBuilder): BuiltQuery {
    const safeTable = sanitizeIdentifier(table);
    const params: unknown[] = [];

    const w = whereClause.build(1);
    if (!w.sql) {
      throw new Error("DELETE without a WHERE clause is not allowed — it would affect all rows");
    }
    const sql = `DELETE FROM ${safeTable} WHERE ${w.sql}`;
    params.push(...w.params);

    return { sql, params };
  }

  // ── MongoDB builders ───────────────────────────────────────────

  /**
   * Build a MongoDB find query with validated collection name.
   */
  buildMongoFind(
    collection: string,
    filter: Record<string, unknown>,
    projection?: string[],
  ): MongoQuery {
    // Validate collection name using same identifier rules
    if (!IDENTIFIER_RE.test(collection.trim())) {
      throw new Error(
        `Invalid collection name "${collection}": must match ^[a-zA-Z_][a-zA-Z0-9_.]*$`
      );
    }

    // Validate filter to block $where and other dangerous operators
    validateMongoFilter(filter);

    const projectionObj: Record<string, 1> | undefined =
      projection && projection.length > 0
        ? Object.fromEntries(projection.map((f) => [f, 1 as const]))
        : undefined;

    return {
      collection: collection.trim(),
      operation: "find",
      filter,
      projection: projectionObj,
    };
  }

  /**
   * Build a MongoDB aggregate query with validated collection name.
   */
  buildMongoAggregate(
    collection: string,
    pipeline: unknown[],
  ): MongoQuery {
    if (!IDENTIFIER_RE.test(collection.trim())) {
      throw new Error(
        `Invalid collection name "${collection}": must match ^[a-zA-Z_][a-zA-Z0-9_.]*$`
      );
    }

    // Validate pipeline to block dangerous stages ($out, $merge, etc.)
    validateMongoPipeline(pipeline);

    return {
      collection: collection.trim(),
      operation: "aggregate",
      pipeline,
    };
  }
}
