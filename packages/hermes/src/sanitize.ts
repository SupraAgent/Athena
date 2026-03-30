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

// ── Zero-width and invisible characters ────────────────────────

/** Unicode zero-width / invisible characters to strip. */
const ZERO_WIDTH_RE = /[\u200B\u200C\u200D\uFEFF\u00AD]/g;

// ── Homoglyph normalization ────────────────────────────────────

/** Map of Cyrillic/Greek lookalike code points to their Latin equivalents. */
const HOMOGLYPH_MAP: Record<string, string> = {
  "\u0410": "A", "\u0430": "a", // Cyrillic А/а
  "\u0412": "B", "\u0432": "v", // Cyrillic В/в (В looks like B)
  "\u0421": "C", "\u0441": "c", // Cyrillic С/с
  "\u0415": "E", "\u0435": "e", // Cyrillic Е/е
  "\u041D": "H", "\u043D": "h", // Cyrillic Н/н
  "\u041A": "K", "\u043A": "k", // Cyrillic К/к
  "\u041C": "M", "\u043C": "m", // Cyrillic М/м
  "\u041E": "O", "\u043E": "o", // Cyrillic О/о
  "\u0420": "P", "\u0440": "p", // Cyrillic Р/р
  "\u0422": "T", "\u0442": "t", // Cyrillic Т/т
  "\u0425": "X", "\u0445": "x", // Cyrillic Х/х
  "\u0423": "Y", "\u0443": "y", // Cyrillic У/у
  "\u0392": "B",                 // Greek Β
  "\u0395": "E",                 // Greek Ε
  "\u0397": "H",                 // Greek Η
  "\u039A": "K",                 // Greek Κ
  "\u039C": "M",                 // Greek Μ
  "\u039D": "N",                 // Greek Ν
  "\u039F": "O", "\u03BF": "o", // Greek Ο/ο
  "\u03A1": "P", "\u03C1": "p", // Greek Ρ/ρ
  "\u03A4": "T", "\u03C4": "t", // Greek Τ/τ
  "\u03A7": "X",                 // Greek Χ
  "\u0396": "Z",                 // Greek Ζ
};

const HOMOGLYPH_RE = new RegExp(
  `[${Object.keys(HOMOGLYPH_MAP).join("")}]`,
  "g"
);

// ── Content-Aware Helpers ──────────────────────────────────────

/**
 * Compute Shannon entropy (bits per character) over a string.
 * High entropy (> 4.5) suggests encoded / obfuscated content.
 */
export function shannonEntropy(text: string): number {
  if (text.length === 0) return 0;
  const freq = new Map<string, number>();
  for (const ch of text) {
    freq.set(ch, (freq.get(ch) ?? 0) + 1);
  }
  let entropy = 0;
  const len = text.length;
  for (const count of freq.values()) {
    const p = count / len;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

/**
 * Detect base64-encoded injection payloads.
 * Finds base64 substrings longer than 20 characters, decodes them,
 * and checks whether the decoded content matches injection patterns.
 */
export function detectBase64Injection(text: string): boolean {
  // Match base64-like substrings (at least 21 chars, valid base64 alphabet + padding)
  const b64Regex = /[A-Za-z0-9+/=]{21,}/g;
  let match: RegExpExecArray | null;
  while ((match = b64Regex.exec(text)) !== null) {
    try {
      const decoded = Buffer.from(match[0], "base64").toString("utf-8");
      // Check if decoded content has valid text (not garbage)
      if (/[\x00-\x08\x0E-\x1F]/.test(decoded)) continue;
      // Check decoded against injection patterns
      for (const pattern of INJECTION_PATTERNS) {
        // Reset lastIndex since these are global regexes
        pattern.lastIndex = 0;
        if (pattern.test(decoded)) return true;
      }
    } catch {
      // Not valid base64 — skip
    }
  }
  return false;
}

/**
 * Strip zero-width and invisible Unicode characters.
 * Removes U+200B (zero-width space), U+200C (ZWNJ), U+200D (ZWJ),
 * U+FEFF (BOM / zero-width no-break space), and U+00AD (soft hyphen).
 */
export function stripZeroWidthChars(text: string): string {
  return text.replace(ZERO_WIDTH_RE, "");
}

/**
 * Normalize Cyrillic/Greek homoglyphs to their Latin equivalents.
 * Prevents attackers from bypassing pattern matching with lookalike characters.
 */
export function normalizeHomoglyphs(text: string): string {
  return text.replace(HOMOGLYPH_RE, (ch) => HOMOGLYPH_MAP[ch] ?? ch);
}

/**
 * Sanitize memory content for safe injection into Claude's context.
 *
 * Strips:
 * - Zero-width / invisible characters
 * - XML-like tags that could impersonate system boundaries
 * - Explicit prompt injection patterns (also after homoglyph normalization)
 * - Base64-encoded injection payloads
 * - Angle brackets (replaced with Unicode equivalents)
 * - High-entropy suspicious strings (flagged as [suspicious-entropy])
 *
 * Preserves:
 * - Normal technical content (file paths, code references)
 * - Markdown formatting (bold, italic, lists, code blocks)
 */
export function sanitizeContent(content: string): string {
  // 1. Strip zero-width characters first
  let cleaned = stripZeroWidthChars(content);

  // 2. Normalize homoglyphs so injection patterns match lookalikes
  cleaned = normalizeHomoglyphs(cleaned);

  // 3. Strip injection patterns
  for (const pattern of INJECTION_PATTERNS) {
    pattern.lastIndex = 0;
    cleaned = cleaned.replace(pattern, "[filtered]");
  }

  // 4. Detect base64-encoded injections
  if (detectBase64Injection(cleaned)) {
    // Replace base64 blobs with a marker
    cleaned = cleaned.replace(/[A-Za-z0-9+/=]{21,}/g, "[filtered-b64]");
  }

  // 5. Flag high-entropy segments (likely obfuscated payloads)
  // Split into words, flag any single token > 20 chars with high entropy
  cleaned = cleaned.replace(/\S{20,}/g, (token) => {
    if (shannonEntropy(token) > 4.5) return "[suspicious-entropy]";
    return token;
  });

  // 6. Replace angle brackets with safe Unicode equivalents
  cleaned = cleaned.replace(BOUNDARY_CHARS, (char) =>
    char === "<" ? "\u2039" : "\u203A"
  );

  // 7. Truncate to prevent context stuffing
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
