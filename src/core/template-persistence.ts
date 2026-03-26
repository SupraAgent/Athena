/**
 * Generic localStorage-based template persistence.
 *
 * Each consuming app creates an instance with its own storage key:
 *
 *   const store = new TemplatePersistence("supraloop_custom_templates");
 *   const store = new TemplatePersistence("suprateam_custom_templates");
 *   const store = new TemplatePersistence("leejones_custom_templates");
 *
 * Works with any template shape that has { id, name, nodes, edges }.
 */

import type { ManagedTemplate } from "../components/template-manager";

/** Deep clone a template's nodes and edges to prevent shared references */
function deepCloneTemplate(template: ManagedTemplate): ManagedTemplate {
  return {
    ...template,
    nodes: JSON.parse(JSON.stringify(template.nodes)),
    edges: JSON.parse(JSON.stringify(template.edges)),
    tags: template.tags ? [...template.tags] : undefined,
  };
}

/** Validate that an object has the minimum shape of a ManagedTemplate */
function isValidTemplate(t: unknown): t is ManagedTemplate {
  if (!t || typeof t !== "object") return false;
  const obj = t as Record<string, unknown>;
  return (
    typeof obj.id === "string" && obj.id.length > 0 &&
    typeof obj.name === "string" &&
    Array.isArray(obj.nodes) &&
    Array.isArray(obj.edges)
  );
}

/** Safely write to localStorage with quota error handling */
function safeSetItem(key: string, value: string): { ok: boolean; error?: string } {
  try {
    localStorage.setItem(key, value);
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Storage quota exceeded";
    return { ok: false, error: msg };
  }
}

// ── Core CRUD ────────────────────────────────────────────────────

export class TemplatePersistence {
  private readonly storageKey: string;
  private readonly builtInTemplates: ManagedTemplate[];

  constructor(storageKey: string, builtInTemplates: ManagedTemplate[] = []) {
    this.storageKey = storageKey;
    this.builtInTemplates = builtInTemplates;
  }

  /** Get all custom (user-saved) templates from localStorage */
  getCustomTemplates(): ManagedTemplate[] {
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      // Filter out malformed entries
      return parsed.filter(isValidTemplate);
    } catch {
      return [];
    }
  }

  /** Save or update a custom template. Returns false if storage quota exceeded. */
  saveCustomTemplate(template: ManagedTemplate): boolean {
    const existing = this.getCustomTemplates();
    const idx = existing.findIndex((t) => t.id === template.id);
    if (idx >= 0) {
      existing[idx] = template;
    } else {
      existing.push(template);
    }
    return safeSetItem(this.storageKey, JSON.stringify(existing)).ok;
  }

  /** Delete a custom template by ID */
  deleteCustomTemplate(id: string): void {
    const remaining = this.getCustomTemplates().filter((t) => t.id !== id);
    safeSetItem(this.storageKey, JSON.stringify(remaining));
  }

  /** Get all templates: built-in + custom */
  getAllTemplates(): ManagedTemplate[] {
    return [...this.builtInTemplates, ...this.getCustomTemplates()];
  }

  /** Get templates filtered by category */
  getTemplatesByCategory(category: string): ManagedTemplate[] {
    return this.getAllTemplates().filter((t) => t.category === category);
  }

  /** Get all unique categories across built-in + custom templates */
  getCategories(): string[] {
    const cats = new Set<string>();
    for (const t of this.getAllTemplates()) {
      if (t.category) cats.add(t.category);
    }
    return Array.from(cats).sort();
  }

  /**
   * Create a copy of a template as a new custom template.
   * Auto-increments the name with _001, _002, etc.
   * Saves to localStorage and returns the new template.
   */
  copyTemplate(template: ManagedTemplate): ManagedTemplate {
    const allNames = this.getAllTemplates().map((t) => t.name);
    const cleanBase = template.name.replace(/_\d{3}$/, "");

    let maxNum = 0;
    for (const name of allNames) {
      const nameClean = name.replace(/_\d{3}$/, "");
      if (nameClean === cleanBase) {
        const match = name.match(/_(\d{3})$/);
        const num = match ? parseInt(match[1], 10) : 0;
        if (num > maxNum) maxNum = num;
      }
    }

    const nextSuffix = String(maxNum + 1).padStart(3, "0");
    const copy: ManagedTemplate = {
      ...deepCloneTemplate(template),
      id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: `${cleanBase}_${nextSuffix}`,
      category: "custom",
      isBuiltIn: false,
      createdAt: new Date().toISOString().split("T")[0],
    };

    this.saveCustomTemplate(copy);
    return copy;
  }

  /** Clear all custom templates (destructive) */
  clearAll(): void {
    localStorage.removeItem(this.storageKey);
  }

  /** Export all custom templates as JSON (for backup/migration) */
  exportJSON(): string {
    return JSON.stringify(this.getCustomTemplates(), null, 2);
  }

  /** Import templates from JSON string (merges with existing, skips duplicates by ID) */
  importJSON(json: string): { imported: number; skipped: number; error?: string } {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      return { imported: 0, skipped: 0, error: "Invalid JSON" };
    }

    if (!Array.isArray(parsed)) return { imported: 0, skipped: 0, error: "Expected an array" };

    const existing = this.getCustomTemplates();
    const existingIds = new Set(existing.map((t) => t.id));
    let imported = 0;
    let skipped = 0;

    for (const t of parsed) {
      if (!isValidTemplate(t) || existingIds.has(t.id)) {
        skipped++;
        continue;
      }
      existing.push({ ...deepCloneTemplate(t), isBuiltIn: false });
      existingIds.add(t.id);
      imported++;
    }

    const result = safeSetItem(this.storageKey, JSON.stringify(existing));
    if (!result.ok) {
      return { imported: 0, skipped: 0, error: result.error };
    }
    return { imported, skipped };
  }
}
