/**
 * Content sanitization for Hermes memory injection.
 *
 * Prevents prompt injection by stripping dangerous patterns
 * from memory content before it's injected into Claude's context.
 */

/** Patterns that could be used for prompt injection. */
const INJECTION_PATTERNS = [
  // XML/HTML-like tags that could break context boundaries
  /<\/?(?:system|user|assistant|human|context|instructions|prompt|letta|hermes)[^>]*>/gi,
  // System prompt boundary markers
  /(?:^|\n)\s*(?:system|instructions|rules|ignore previous|disregard|override):/gi,
  // Explicit injection attempts
  /ignore (?:all )?(?:previous|above|prior) (?:instructions|context|rules)/gi,
  /you (?:are|must|should) now/gi,
  /new (?:instructions|rules|system prompt):/gi,
  // Markdown heading injection (could create fake sections)
  /^#{1,2}\s+(?:System|Instructions|Rules)/gim,
];

/** Characters that could break XML/markdown context boundaries. */
const BOUNDARY_CHARS = /[<>]/g;

/**
 * Sanitize memory content for safe injection into Claude's context.
 *
 * Strips:
 * - XML-like tags that could impersonate system boundaries
 * - Explicit prompt injection patterns
 * - Angle brackets (replaced with Unicode equivalents)
 *
 * Preserves:
 * - Normal technical content (file paths, code references)
 * - Markdown formatting (bold, italic, lists, code blocks)
 */
export function sanitizeContent(content: string): string {
  let cleaned = content;

  // Strip injection patterns
  for (const pattern of INJECTION_PATTERNS) {
    cleaned = cleaned.replace(pattern, "[filtered]");
  }

  // Replace angle brackets with safe Unicode equivalents
  cleaned = cleaned.replace(BOUNDARY_CHARS, (char) =>
    char === "<" ? "\u2039" : "\u203A"
  );

  // Truncate to prevent context stuffing
  if (cleaned.length > 500) {
    cleaned = cleaned.slice(0, 497) + "...";
  }

  return cleaned.trim();
}

/**
 * Sanitize an array of memories for injection.
 * Returns new memory objects with sanitized content (does not mutate originals).
 */
export function sanitizeMemories<T extends { content: string }>(memories: T[]): T[] {
  return memories.map((m) => ({
    ...m,
    content: sanitizeContent(m.content),
  }));
}
