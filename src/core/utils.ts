import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ── Shared runtime/secret stripping for template and portability exports ────

/** Fields that carry runtime state and must be stripped on export. */
const RUNTIME_KEYS = new Set([
  "runId",
  "executionState",
  "lastRunAt",
  "lastRunStatus",
  "lastRunError",
  "lastRunDuration",
  "_executionOutput",
  "_retryCount",
]);

/** Keys whose values may contain resolved secrets and must be redacted on export. */
const SECRET_KEY_PATTERN = /token|key|secret|password|authorization/i;

/** Credential reference pattern — safe to keep in exports. */
const CREDENTIAL_REF_PATTERN = /^credential:.+/;

/**
 * Deep-clone an object while stripping runtime keys and redacting
 * resolved credential values. Keeps credential references intact.
 * Used by both template-utils and portability modules.
 */
export function stripRuntimeAndSecrets(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (RUNTIME_KEYS.has(key)) continue;

    if (typeof value === "string" && CREDENTIAL_REF_PATTERN.test(value)) {
      result[key] = value;
    } else if (typeof value === "string" && SECRET_KEY_PATTERN.test(key)) {
      result[key] = "";
    } else if (Array.isArray(value)) {
      result[key] = value.map((item) =>
        typeof item === "object" && item !== null
          ? stripRuntimeAndSecrets(item as Record<string, unknown>)
          : item
      );
    } else if (typeof value === "object" && value !== null) {
      result[key] = stripRuntimeAndSecrets(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result;
}
