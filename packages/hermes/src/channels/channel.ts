/**
 * External channel interface for Hermes.
 *
 * Channels are pluggable data sources that fetch live context from
 * external services (GitHub, Sentry, Linear, etc.) and convert it
 * into Hermes memory candidates for session injection.
 */

// ── Channel Types ──────────────────────────────────────────────

export type ChannelType = "github" | "sentry" | "linear" | "jira" | "competitor" | "local-tasks";

export type ChannelStatus = "available" | "unavailable" | "auth-missing" | "error";

export type ChannelConfig = {
  type: ChannelType;
  enabled: boolean;
  /** Channel-specific settings (org names, project keys, targets, etc.). */
  options: Record<string, unknown>;
  /** Cache TTL in milliseconds. Default: 300_000 (5 min). */
  ttlMs: number;
};

export type ChannelMemoryCandidate = {
  content: string;
  tags: string[];
  relevance: number;
  /** Stable external ID for dedup (e.g. "gh-issue-123"). */
  externalId?: string;
};

export type ChannelFetchResult = {
  channel: ChannelType;
  memories: ChannelMemoryCandidate[];
  fetchedAt: string;
  errors: string[];
};

// ── Channel Interface ──────────────────────────────────────────

export interface ExternalChannel {
  /** Channel identifier. */
  readonly type: ChannelType;

  /**
   * Check if the channel is available (CLI tool exists, API key set, etc.).
   * Must be fast and never throw.
   */
  check(): Promise<ChannelStatus>;

  /**
   * Fetch data from the external source.
   * Must handle its own timeouts and errors gracefully.
   */
  fetch(config: ChannelConfig): Promise<ChannelFetchResult>;
}

// ── Channel Cache Types ────────────────────────────────────────

export type ChannelCacheEntry = {
  channel: ChannelType;
  memories: ChannelMemoryCandidate[];
  fetchedAt: string;
  ttlMs: number;
};

export type ChannelCacheFile = {
  entries: ChannelCacheEntry[];
  lastRefreshAt: string;
};
