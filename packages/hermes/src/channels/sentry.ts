/**
 * Sentry error tracking channel.
 *
 * Pulls recent unresolved issues from Sentry via REST API.
 * Higher event counts = higher relevance.
 * Auth token via SENTRY_AUTH_TOKEN env var (never stored in config).
 */

import type {
  ExternalChannel,
  ChannelConfig,
  ChannelFetchResult,
  ChannelMemoryCandidate,
  ChannelStatus,
} from "./channel";

/** Minimal Sentry issue shape from the API. */
type SentryIssue = {
  id: string;
  title: string;
  culprit: string;
  count: string;
  firstSeen: string;
  lastSeen: string;
  level: string;
  metadata: { type?: string; value?: string; filename?: string };
  shortId: string;
  status: string;
};

/** Make an HTTP GET request using Node built-ins. */
async function httpGet(url: string, token: string, timeout = 10000): Promise<string> {
  const { request } = await import("https");
  return new Promise((resolve, reject) => {
    const req = request(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      timeout,
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
    req.end();
  });
}

export class SentryChannel implements ExternalChannel {
  readonly type = "sentry" as const;

  async check(): Promise<ChannelStatus> {
    const token = process.env.SENTRY_AUTH_TOKEN;
    if (!token) return "auth-missing";
    try {
      const body = await httpGet("https://sentry.io/api/0/", token, 5000);
      // A 200 response means auth works
      if (body.includes("Authentication credentials were not provided")) return "auth-missing";
      return "available";
    } catch {
      return "error";
    }
  }

  async fetch(config: ChannelConfig): Promise<ChannelFetchResult> {
    const errors: string[] = [];
    const memories: ChannelMemoryCandidate[] = [];
    const opts = config.options;

    const token = process.env.SENTRY_AUTH_TOKEN;
    if (!token) {
      return { channel: this.type, memories: [], fetchedAt: new Date().toISOString(), errors: ["SENTRY_AUTH_TOKEN not set"] };
    }

    const org = opts.org as string;
    const project = opts.project as string;
    if (!org || !project) {
      return { channel: this.type, memories: [], fetchedAt: new Date().toISOString(), errors: ["Sentry org/project not configured"] };
    }

    const baseUrl = (opts.base_url as string) || "https://sentry.io";
    const limit = Number(opts.max_issues) || 10;

    try {
      const url = `${baseUrl}/api/0/projects/${encodeURIComponent(org)}/${encodeURIComponent(project)}/issues/?query=is%3Aunresolved&sort=date&limit=${limit}`;
      const raw = await httpGet(url, token);
      const issues: SentryIssue[] = JSON.parse(raw);

      if (!Array.isArray(issues)) {
        errors.push("Unexpected Sentry response format");
        return { channel: this.type, memories, fetchedAt: new Date().toISOString(), errors };
      }

      for (const issue of issues) {
        const count = parseInt(issue.count, 10) || 0;
        // Scale relevance by event count: 1-10 → 0.5, 10-100 → 0.6, 100+ → 0.7, 1000+ → 0.8
        let relevance = 0.5;
        if (count >= 1000) relevance = 0.8;
        else if (count >= 100) relevance = 0.7;
        else if (count >= 10) relevance = 0.6;

        const filename = issue.metadata?.filename || issue.culprit || "";
        const firstSeen = timeSince(issue.firstSeen);
        const lastSeen = timeSince(issue.lastSeen);

        memories.push({
          content: `[Sentry ${issue.level.toUpperCase()}] ${issue.title} — ${count} events, first seen ${firstSeen}, last seen ${lastSeen}${filename ? ` — ${filename}` : ""}`,
          tags: ["sentry", "error", issue.level, ...(filename ? [filename] : [])],
          relevance,
          externalId: `sentry-${issue.id}`,
        });
      }
    } catch (err: unknown) {
      errors.push(String(err).slice(0, 200));
    }

    return { channel: this.type, memories, fetchedAt: new Date().toISOString(), errors };
  }
}

/** Human-readable time-since string. */
function timeSince(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
