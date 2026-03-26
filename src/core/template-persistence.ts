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
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  /** Save or update a custom template */
  saveCustomTemplate(template: ManagedTemplate): void {
    const existing = this.getCustomTemplates();
    const idx = existing.findIndex((t) => t.id === template.id);
    if (idx >= 0) {
      existing[idx] = template;
    } else {
      existing.push(template);
    }
    localStorage.setItem(this.storageKey, JSON.stringify(existing));
  }

  /** Delete a custom template by ID */
  deleteCustomTemplate(id: string): void {
    const remaining = this.getCustomTemplates().filter((t) => t.id !== id);
    localStorage.setItem(this.storageKey, JSON.stringify(remaining));
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
      id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: `${cleanBase}_${nextSuffix}`,
      description: template.description,
      category: "custom",
      nodes: template.nodes.map((n) => ({ ...n, data: { ...n.data } })),
      edges: template.edges.map((e) => ({
        ...e,
        ...(e.style ? { style: { ...e.style } } : {}),
      })),
      isBuiltIn: false,
      tags: template.tags ? [...template.tags] : undefined,
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
  importJSON(json: string): { imported: number; skipped: number } {
    let templates: ManagedTemplate[];
    try {
      templates = JSON.parse(json);
    } catch {
      return { imported: 0, skipped: 0 };
    }

    if (!Array.isArray(templates)) return { imported: 0, skipped: 0 };

    const existing = this.getCustomTemplates();
    const existingIds = new Set(existing.map((t) => t.id));
    let imported = 0;
    let skipped = 0;

    for (const t of templates) {
      if (!t.id || existingIds.has(t.id)) {
        skipped++;
        continue;
      }
      existing.push({ ...t, isBuiltIn: false });
      existingIds.add(t.id);
      imported++;
    }

    localStorage.setItem(this.storageKey, JSON.stringify(existing));
    return { imported, skipped };
  }
}
