import * as fs from "fs/promises";
import * as path from "path";
import * as YAML from "yaml";
import type { Memory, MemoryType, MemoryScope } from "./types";

// ── Types ──────────────────────────────────────────────────────

/** Hierarchical access level: admin > write > read. */
export type AccessLevel = "read" | "write" | "admin";

/** A single access control rule binding a principal to a level. */
export type AccessRule = {
  principal: string;
  level: AccessLevel;
  /** If set, this rule only applies to memories of these types. */
  memoryTypes?: MemoryType[];
  /** If set, this rule only applies to memories with these scopes. */
  scopes?: MemoryScope[];
};

/** Full access policy with rules, a default level, and timestamps. */
export type AccessPolicy = {
  rules: AccessRule[];
  defaultLevel: AccessLevel;
  createdAt: string;
  updatedAt: string;
};

// ── Level Hierarchy ────────────────────────────────────────────

const LEVEL_RANK: Record<AccessLevel, number> = {
  read: 0,
  write: 1,
  admin: 2,
};

/** Returns true if `granted` is at least as high as `required`. */
function meetsLevel(granted: AccessLevel, required: AccessLevel): boolean {
  return LEVEL_RANK[granted] >= LEVEL_RANK[required];
}

// ── Policy File Path ───────────────────────────────────────────

function policyFilePath(hermesDir: string): string {
  return path.join(hermesDir, "access-policy.yaml");
}

// ── Default Policy ─────────────────────────────────────────────

/** Returns a permissive default policy (admin for everyone, no rules). */
export function defaultPolicy(): AccessPolicy {
  const now = new Date().toISOString();
  return {
    rules: [],
    defaultLevel: "admin",
    createdAt: now,
    updatedAt: now,
  };
}

// ── Policy Management ──────────────────────────────────────────

/**
 * Load the access policy from `.athena/hermes/access-policy.yaml`.
 * Returns the default policy if the file is missing or unparseable.
 */
export async function loadPolicy(hermesDir: string): Promise<AccessPolicy> {
  try {
    const raw = await fs.readFile(policyFilePath(hermesDir), "utf-8");
    const parsed = YAML.parse(raw);
    if (!parsed || typeof parsed !== "object") return defaultPolicy();

    return {
      rules: Array.isArray(parsed.rules)
        ? parsed.rules.map((r: Record<string, unknown>) => ({
            principal: String(r.principal ?? ""),
            level: validateLevel(r.level) ?? "read",
            memoryTypes: Array.isArray(r.memory_types) ? r.memory_types : undefined,
            scopes: Array.isArray(r.scopes) ? r.scopes : undefined,
          }))
        : [],
      defaultLevel: validateLevel(parsed.default_level) ?? "admin",
      createdAt: String(parsed.created_at ?? new Date().toISOString()),
      updatedAt: String(parsed.updated_at ?? new Date().toISOString()),
    };
  } catch {
    return defaultPolicy();
  }
}

/** Persist the access policy to `.athena/hermes/access-policy.yaml`. */
export async function savePolicy(
  hermesDir: string,
  policy: AccessPolicy
): Promise<void> {
  await fs.mkdir(hermesDir, { recursive: true });

  const doc = {
    default_level: policy.defaultLevel,
    created_at: policy.createdAt,
    updated_at: policy.updatedAt,
    rules: policy.rules.map((r) => ({
      principal: r.principal,
      level: r.level,
      ...(r.memoryTypes ? { memory_types: r.memoryTypes } : {}),
      ...(r.scopes ? { scopes: r.scopes } : {}),
    })),
  };

  const content = `# Hermes Access Policy\n${YAML.stringify(doc)}`;
  await fs.writeFile(policyFilePath(hermesDir), content, "utf-8");
}

// ── Access Checks ──────────────────────────────────────────────

/**
 * Check whether `principal` has at least `requiredLevel` access to `memory`.
 *
 * Evaluation order:
 * 1. Find all rules matching the principal.
 * 2. Among those, keep only rules whose optional memoryTypes/scopes filters
 *    match the memory (rules without filters always match).
 * 3. If any matching rule grants sufficient access, return true.
 * 4. Otherwise fall back to the policy's defaultLevel.
 */
export function checkAccess(
  policy: AccessPolicy,
  principal: string,
  memory: Memory,
  requiredLevel: AccessLevel
): boolean {
  const matching = policy.rules.filter((rule) => {
    if (rule.principal !== principal) return false;
    if (rule.memoryTypes && !rule.memoryTypes.includes(memory.type)) return false;
    if (rule.scopes && !rule.scopes.includes(memory.scope)) return false;
    return true;
  });

  if (matching.length > 0) {
    // Grant access if any matching rule is sufficient
    return matching.some((rule) => meetsLevel(rule.level, requiredLevel));
  }

  // No specific rules matched — fall back to default
  return meetsLevel(policy.defaultLevel, requiredLevel);
}

/**
 * Filter a list of memories to only those the principal can access
 * at the given level.
 */
export function filterAccessible(
  policy: AccessPolicy,
  principal: string,
  memories: Memory[],
  level: AccessLevel
): Memory[] {
  return memories.filter((m) => checkAccess(policy, principal, m, level));
}

// ── Principal Resolution ───────────────────────────────────────

/**
 * Resolve a principal identifier from session and optional agent context.
 * Returns `agent:{agentId}` when an agent is acting, otherwise `session:{sessionId}`.
 */
export function resolvePrincipal(
  sessionId: string,
  agentId?: string
): string {
  if (agentId) return `agent:${agentId}`;
  return `session:${sessionId}`;
}

// ── Helpers ────────────────────────────────────────────────────

const VALID_LEVELS = new Set<string>(["read", "write", "admin"]);

function validateLevel(value: unknown): AccessLevel | undefined {
  if (typeof value === "string" && VALID_LEVELS.has(value)) {
    return value as AccessLevel;
  }
  return undefined;
}
