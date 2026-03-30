/**
 * Query expansion via developer-term synonym map.
 *
 * Appends known synonyms to search tokens so that a query for "deploy"
 * also matches memories mentioning "ship" or "release". Synonyms are
 * bidirectional — every term in a group maps to every other term.
 */

// ── Synonym Groups ─────────────────────────────────────────────
// Each inner array is a group of interchangeable terms.
// All terms should be lowercase and already stemmed where appropriate.

const SYNONYM_GROUPS: string[][] = [
  // Deployment & release
  ["deploy", "ship", "release", "publish", "push"],
  ["rollback", "revert", "undo"],
  ["ci", "pipeline", "workflow", "github-actions", "actions"],
  ["cd", "continuous-delivery", "continuous-deployment"],

  // Testing
  ["test", "spec", "jest", "vitest", "mocha", "pytest"],
  ["e2e", "end-to-end", "playwright", "cypress", "selenium"],
  ["unit", "unit-test"],
  ["integration", "integration-test"],
  ["coverage", "cov", "istanbul", "nyc", "c8"],
  ["mock", "stub", "fake", "spy"],
  ["assert", "expect", "should"],

  // Databases
  ["db", "database", "postgres", "postgresql", "mysql", "sqlite", "mongo", "mongodb"],
  ["query", "sql", "select"],
  ["migration", "migrate", "schema-change"],
  ["orm", "prisma", "drizzle", "typeorm", "sequelize", "knex"],
  ["cache", "redis", "memcached"],

  // Auth & identity
  ["auth", "login", "oauth", "signin", "sign-in", "authenticate"],
  ["logout", "signout", "sign-out"],
  ["token", "jwt", "session-token", "bearer"],
  ["permission", "rbac", "role", "acl"],
  ["password", "credential", "secret"],

  // Frontend
  ["component", "widget", "element"],
  ["style", "css", "tailwind", "scss", "sass", "styled"],
  ["responsive", "mobile", "breakpoint", "media-query"],
  ["state", "store", "redux", "zustand", "context", "signal"],
  ["route", "page", "navigation", "router", "next-router"],
  ["render", "ssr", "csr", "hydrate", "hydration"],
  ["hook", "use-effect", "use-state", "use-memo"],

  // Backend & APIs
  ["api", "endpoint", "rest", "graphql", "grpc", "rpc"],
  ["server", "backend", "express", "fastify", "koa", "hono"],
  ["middleware", "interceptor", "guard"],
  ["request", "req", "fetch", "axios", "http"],
  ["response", "res", "reply"],
  ["websocket", "ws", "socket", "realtime", "real-time"],

  // Infrastructure
  ["docker", "container", "pod", "k8s", "kubernetes"],
  ["cloud", "aws", "gcp", "azure", "vercel", "netlify"],
  ["lambda", "serverless", "edge-function", "cloud-function"],
  ["env", "environment", "dotenv", "env-var"],
  ["log", "logging", "logger", "winston", "pino"],
  ["monitor", "observability", "metrics", "apm", "datadog", "sentry"],

  // Package management
  ["package", "dependency", "dep", "module"],
  ["npm", "yarn", "pnpm", "bun"],
  ["install", "add"],
  ["upgrade", "update", "bump"],

  // Version control
  ["git", "vcs", "version-control"],
  ["branch", "feature-branch"],
  ["merge", "rebase", "squash"],
  ["pr", "pull-request", "mr", "merge-request"],
  ["commit", "changeset"],
  ["conflict", "merge-conflict"],

  // Code quality
  ["lint", "eslint", "biome", "prettier", "format"],
  ["type", "typescript", "ts", "typecheck", "tsc"],
  ["refactor", "restructure", "reorganize", "clean-up"],
  ["perf", "performance", "optimize", "speed", "fast", "slow"],
  ["bug", "issue", "defect", "error", "fix"],
  ["debug", "inspect", "breakpoint", "devtools"],

  // Documentation
  ["doc", "documentation", "readme", "jsdoc", "tsdoc"],
  ["comment", "annotation", "docstring"],

  // Architecture
  ["config", "configuration", "setting", "option"],
  ["plugin", "extension", "addon", "add-on"],
  ["event", "emit", "listener", "subscribe", "pubsub"],
  ["queue", "job", "worker", "background-task", "cron"],
];

// ── Build the bidirectional lookup ─────────────────────────────

const SYNONYM_MAP: Map<string, string[]> = new Map();

for (const group of SYNONYM_GROUPS) {
  for (const term of group) {
    const others = group.filter((t) => t !== term);
    const existing = SYNONYM_MAP.get(term);
    if (existing) {
      // Merge without duplicates
      const merged = new Set([...existing, ...others]);
      SYNONYM_MAP.set(term, [...merged]);
    } else {
      SYNONYM_MAP.set(term, others);
    }
  }
}

/**
 * Expand query tokens with known synonyms.
 *
 * For each input token that appears in the synonym map, its synonyms
 * are appended to the result. Duplicates are removed.
 *
 * @param tokens — already-tokenized (and possibly stemmed) query terms
 * @returns the original tokens plus any synonym expansions (deduped)
 */
export function expandQuery(tokens: string[]): string[] {
  const expanded = new Set<string>(tokens);
  for (const token of tokens) {
    const synonyms = SYNONYM_MAP.get(token);
    if (synonyms) {
      for (const syn of synonyms) {
        expanded.add(syn);
      }
    }
  }
  return [...expanded];
}

/** Exported for testing / introspection. */
export { SYNONYM_MAP };
