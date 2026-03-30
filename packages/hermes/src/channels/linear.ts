/**
 * Linear issue tracking channel.
 *
 * Pulls active issues from Linear via GraphQL API.
 * Boosts relevance for urgent/high priority and assigned items.
 * Auth token via LINEAR_API_KEY env var.
 */

import type {
  ExternalChannel,
  ChannelConfig,
  ChannelFetchResult,
  ChannelMemoryCandidate,
  ChannelStatus,
} from "./channel";

/** Linear priority levels (0 = no priority, 1 = urgent, 4 = low). */
const PRIORITY_LABELS: Record<number, string> = {
  0: "None",
  1: "Urgent",
  2: "High",
  3: "Medium",
  4: "Low",
};

type LinearIssue = {
  identifier: string;
  title: string;
  priority: number;
  state: { name: string };
  assignee: { name: string } | null;
  updatedAt: string;
  labels: { nodes: { name: string }[] };
};

/** POST to Linear GraphQL API. */
async function linearQuery(query: string, token: string): Promise<unknown> {
  const { request } = await import("https");
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query });
    const req = request("https://api.linear.app/graphql", {
      method: "POST",
      headers: {
        Authorization: token,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
      timeout: 10000,
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString("utf-8")));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
    req.write(body);
    req.end();
  });
}

export class LinearChannel implements ExternalChannel {
  readonly type = "linear" as const;

  async check(): Promise<ChannelStatus> {
    const token = process.env.LINEAR_API_KEY;
    if (!token) return "auth-missing";
    try {
      const result = await linearQuery("{ viewer { id } }", token) as { data?: unknown; errors?: unknown[] };
      if (result.errors) return "auth-missing";
      return "available";
    } catch {
      return "error";
    }
  }

  async fetch(config: ChannelConfig): Promise<ChannelFetchResult> {
    const errors: string[] = [];
    const memories: ChannelMemoryCandidate[] = [];
    const opts = config.options;

    const token = process.env.LINEAR_API_KEY;
    if (!token) {
      return { channel: this.type, memories: [], fetchedAt: new Date().toISOString(), errors: ["LINEAR_API_KEY not set"] };
    }

    const maxItems = Number(opts.max_items) || 15;
    const teamKey = opts.team_key as string | undefined;
    const assigneeFilter = opts.assignee as string | undefined;

    // Build filter
    const filters: string[] = ['state: { type: { in: ["started", "unstarted", "backlog"] } }'];
    if (teamKey) {
      filters.push(`team: { key: { eq: "${teamKey}" } }`);
    }

    const query = `{
      issues(
        filter: { ${filters.join(", ")} }
        first: ${maxItems}
        orderBy: updatedAt
      ) {
        nodes {
          identifier
          title
          priority
          state { name }
          assignee { name }
          updatedAt
          labels { nodes { name } }
        }
      }
    }`;

    try {
      const result = await linearQuery(query, token) as {
        data?: { issues: { nodes: LinearIssue[] } };
        errors?: { message: string }[];
      };

      if (result.errors) {
        errors.push(result.errors.map((e) => e.message).join("; "));
        return { channel: this.type, memories, fetchedAt: new Date().toISOString(), errors };
      }

      const issues = result.data?.issues?.nodes ?? [];

      for (const issue of issues) {
        // Filter by assignee if requested
        if (assigneeFilter === "me" && !issue.assignee) continue;

        const priorityLabel = PRIORITY_LABELS[issue.priority] ?? "None";
        const labels = issue.labels.nodes.map((l) => l.name);

        // Relevance: urgent/high = 0.75, medium = 0.6, low/none = 0.5
        let relevance = 0.5;
        if (issue.priority === 1) relevance = 0.8;
        else if (issue.priority === 2) relevance = 0.7;
        else if (issue.priority === 3) relevance = 0.6;

        // Boost if assigned
        if (issue.assignee) relevance = Math.min(relevance + 0.05, 1);

        const assigneeStr = issue.assignee ? ` — Assignee: ${issue.assignee.name}` : "";
        const labelStr = labels.length > 0 ? ` — Tags: ${labels.join(", ")}` : "";

        memories.push({
          content: `[Linear ${issue.identifier}] ${issue.title} — Priority: ${priorityLabel} — Status: ${issue.state.name}${assigneeStr}${labelStr}`,
          tags: ["linear", "task", ...labels],
          relevance,
          externalId: `linear-${issue.identifier}`,
        });
      }
    } catch (err: unknown) {
      errors.push(String(err).slice(0, 200));
    }

    return { channel: this.type, memories, fetchedAt: new Date().toISOString(), errors };
  }
}
