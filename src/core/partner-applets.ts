/**
 * Partner / Embedded Applets — in-memory store for discovering,
 * installing, and managing pre-built workflow applets from partners.
 */

import type {
  PartnerApplet,
  AppletInstance,
  AppletSearchQuery,
  AppletSearchResult,
  SerializedAppletStore,
  PartnerRegistry,
  FlowNode,
  FlowEdge,
} from "./types";

// ── Helpers ─────────────────────────────────────────────────────

function generateId(prefix: string): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${ts}_${rand}`;
}

function nowISO(): string {
  return new Date().toISOString();
}

/** Deep-clone nodes and edges so installed instances share no references with the template. */
function deepCloneTemplate(template: { nodes: FlowNode[]; edges: FlowEdge[] }): {
  nodes: FlowNode[];
  edges: FlowEdge[];
} {
  // structuredClone handles undefined, Date, RegExp, nested objects, and
  // circular references — safer than JSON.parse(JSON.stringify) which
  // silently drops undefined values and cannot handle non-JSON types.
  return structuredClone(template);
}

// ── AppletStore ─────────────────────────────────────────────────

export class AppletStore {
  private applets = new Map<string, PartnerApplet>();
  private instances = new Map<string, AppletInstance>();
  private listeners = new Set<() => void>();
  private snapshotVersion = 0;

  // ── Registration ────────────────────────────────────────────

  registerApplet(applet: PartnerApplet): void {
    this.applets.set(applet.id, applet);
    this.notify();
  }

  registerBulk(applets: PartnerApplet[]): void {
    for (const applet of applets) {
      this.applets.set(applet.id, applet);
    }
    this.notify();
  }

  getApplet(id: string): PartnerApplet | undefined {
    return this.applets.get(id);
  }

  // ── Search ──────────────────────────────────────────────────

  search(query: AppletSearchQuery): AppletSearchResult {
    let results = Array.from(this.applets.values());

    // Filter by text
    if (query.text) {
      const q = query.text.toLowerCase().trim();
      results = results.filter((a) => {
        const haystack = [
          a.name,
          a.description,
          a.summary,
          a.partnerName,
          a.category,
          ...a.tags,
          ...(a.examples ?? []),
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(q);
      });
    }

    // Filter by category
    if (query.category) {
      results = results.filter((a) => a.category === query.category);
    }

    // Filter by partner
    if (query.partnerId) {
      results = results.filter((a) => a.partnerId === query.partnerId);
    }

    // Filter by tags
    if (query.tags && query.tags.length > 0) {
      const tagSet = new Set(query.tags.map((t) => t.toLowerCase()));
      results = results.filter((a) =>
        a.tags.some((t) => tagSet.has(t.toLowerCase()))
      );
    }

    // Filter by verified
    if (query.verified !== undefined) {
      results = results.filter((a) => a.verified === query.verified);
    }

    // Compute categories from full (pre-pagination) result set
    const catMap = new Map<string, number>();
    for (const a of results) {
      catMap.set(a.category, (catMap.get(a.category) ?? 0) + 1);
    }
    const categories = Array.from(catMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    const total = results.length;

    // Sort
    const sortBy = query.sortBy ?? "popular";
    switch (sortBy) {
      case "popular":
        results.sort((a, b) => (b.installs ?? 0) - (a.installs ?? 0));
        break;
      case "rating":
        results.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
        break;
      case "newest":
        results.sort(
          (a, b) =>
            new Date(b.publishedAt).getTime() -
            new Date(a.publishedAt).getTime()
        );
        break;
      case "name":
        results.sort((a, b) => a.name.localeCompare(b.name));
        break;
    }

    // Pagination
    const offset = query.offset ?? 0;
    const limit = query.limit ?? 50;
    results = results.slice(offset, offset + limit);

    return { applets: results, total, categories };
  }

  // ── Install / Uninstall ─────────────────────────────────────

  install(
    appletId: string,
    userConfig: Record<string, unknown>,
    userId?: string
  ): AppletInstance {
    const applet = this.applets.get(appletId);
    if (!applet) {
      throw new Error(`Applet "${appletId}" not found`);
    }

    // Validate required config fields
    const errors: string[] = [];
    for (const field of applet.requiredConfig) {
      if (!field.required) continue;
      const value = userConfig[field.key];
      if (value === undefined || value === null || value === "") {
        errors.push(`Required field "${field.label}" is missing`);
      }
      // Type-specific validation
      if (value !== undefined && value !== null && value !== "") {
        switch (field.type) {
          case "number":
            if (typeof value !== "number" && isNaN(Number(value))) {
              errors.push(`Field "${field.label}" must be a number`);
            }
            break;
          case "boolean":
            if (typeof value !== "boolean") {
              errors.push(`Field "${field.label}" must be a boolean`);
            }
            break;
          case "select":
            if (
              field.options &&
              !field.options.some((o) => o.value === String(value))
            ) {
              errors.push(
                `Field "${field.label}" must be one of: ${field.options.map((o) => o.label).join(", ")}`
              );
            }
            break;
        }
      }
    }

    if (errors.length > 0) {
      throw new Error(
        `Invalid applet configuration:\n${errors.join("\n")}`
      );
    }

    // Deep-clone template so instances share no references
    const clonedTemplate = deepCloneTemplate(applet.template);

    // Merge user config into template node configs:
    // Replace any string values containing {{key}} placeholders with the
    // corresponding user-provided config value.
    for (const node of clonedTemplate.nodes) {
      const data = node.data as { config?: Record<string, unknown> };
      if (data.config && typeof data.config === "object") {
        for (const configKey of Object.keys(data.config)) {
          let current = data.config[configKey];
          if (typeof current !== "string") continue;

          for (const [userKey, userValue] of Object.entries(userConfig)) {
            if (typeof current !== "string") break; // already replaced with non-string
            const placeholder = `{{${userKey}}}`;
            if (current === placeholder) {
              // Full placeholder replacement — preserve the typed value
              data.config[configKey] = userValue;
              current = userValue;
            } else if (current.includes(placeholder)) {
              // Partial placeholder within a larger string — substitute as string
              const replaced = current.replace(placeholder, String(userValue));
              data.config[configKey] = replaced;
              current = replaced;
            }
          }
        }
      }
    }

    // Increment install count on the applet
    if (applet.installs !== undefined) {
      applet.installs += 1;
    } else {
      applet.installs = 1;
    }

    const instance: AppletInstance = {
      id: generateId("inst"),
      appletId,
      userId,
      config: { ...userConfig },
      enabled: true,
      installedAt: nowISO(),
    };

    this.instances.set(instance.id, instance);
    this.notify();
    return instance;
  }

  uninstall(instanceId: string): void {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new Error(`Instance "${instanceId}" not found`);
    }

    // Decrement install count on the parent applet (floor at 0)
    const applet = this.applets.get(instance.appletId);
    if (applet && applet.installs !== undefined && applet.installs > 0) {
      applet.installs -= 1;
    }

    this.instances.delete(instanceId);
    this.notify();
  }

  getInstances(userId?: string): AppletInstance[] {
    const all = Array.from(this.instances.values());
    if (userId === undefined) return all;
    return all.filter((i) => i.userId === userId);
  }

  toggleInstance(instanceId: string, enabled: boolean): void {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new Error(`Instance "${instanceId}" not found`);
    }
    instance.enabled = enabled;
    this.notify();
  }

  // ── Aggregations ────────────────────────────────────────────

  getCategories(): Array<{ name: string; count: number }> {
    const catMap = new Map<string, number>();
    for (const applet of this.applets.values()) {
      catMap.set(applet.category, (catMap.get(applet.category) ?? 0) + 1);
    }
    return Array.from(catMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }

  getPartners(): PartnerRegistry["partners"] {
    const partnerMap = new Map<
      string,
      {
        id: string;
        name: string;
        logo?: string;
        website?: string;
        appletCount: number;
        verified: boolean;
      }
    >();

    for (const applet of this.applets.values()) {
      const existing = partnerMap.get(applet.partnerId);
      if (existing) {
        existing.appletCount += 1;
        if (applet.verified) existing.verified = true;
      } else {
        partnerMap.set(applet.partnerId, {
          id: applet.partnerId,
          name: applet.partnerName,
          logo: applet.partnerLogo,
          appletCount: 1,
          verified: applet.verified,
        });
      }
    }

    return Array.from(partnerMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  }

  // ── Persistence ─────────────────────────────────────────────

  export(): SerializedAppletStore {
    return {
      version: 1,
      applets: Array.from(this.applets.values()),
      instances: Array.from(this.instances.values()),
      exportedAt: nowISO(),
    };
  }

  static fromSnapshot(data: SerializedAppletStore): AppletStore {
    const store = new AppletStore();
    for (const applet of data.applets) {
      store.applets.set(applet.id, applet);
    }
    for (const instance of data.instances) {
      store.instances.set(instance.id, instance);
    }
    return store;
  }

  // ── React subscription (useSyncExternalStore) ───────────────

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getSnapshot(): number {
    return this.snapshotVersion;
  }

  private notify(): void {
    this.snapshotVersion += 1;
    for (const listener of this.listeners) {
      listener();
    }
  }
}
