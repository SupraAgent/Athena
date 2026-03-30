/**
 * Balanced JSON extraction from LLM responses.
 *
 * Finds the first top-level JSON object in a string by counting
 * balanced braces, instead of greedily matching first `{` to last `}`.
 */

/**
 * Extract the first balanced JSON object from text.
 * Handles nested braces, strings with escaped quotes, and
 * surrounding markdown/explanation text.
 *
 * @returns The extracted JSON string, or null if none found.
 */
export function extractBalancedJson(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (ch === "\\") {
      escape = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        const candidate = text.slice(start, i + 1);
        // Validate it actually parses
        try {
          JSON.parse(candidate);
          return candidate;
        } catch {
          // Malformed — continue scanning for next candidate
          return null;
        }
      }
    }
  }

  return null;
}
