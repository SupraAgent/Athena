/**
 * Jira issue tracking channel.
 *
 * Pulls active issues from Jira via REST API.
 * Auth via JIRA_API_TOKEN + JIRA_USER_EMAIL env vars.
 * Base URL via JIRA_BASE_URL env var.
 */

import type {
  ExternalChannel,
  ChannelConfig,
  ChannelFetchResult,
  ChannelMemoryCandidate,
  ChannelStatus,
} from "./channel";

type JiraIssue = {
  key: string;
  fields: {
    summary: string;
    status: { name: string };
    priority: { name: string } | null;
    assignee: { displayName: string } | null;
    labels: string[];
    updated: string;
    issuetype: { name: string };
  };
};

type JiraSearchResponse = {
  issues: JiraIssue[];
  total: number;
  errorMessages?: string[];
};

/** Make an authenticated Jira API request. */
async function jiraGet(url: string, email: string, token: string, timeout = 10000): Promise<string> {
  const { request } = await import("https");
  const auth = Buffer.from(`${email}:${token}`).toString("base64");
  return new Promise((resolve, reject) => {
    const req = request(url, {
      method: "GET",
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: "application/json",
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

/** Map Jira priority names to relevance scores. */
function priorityRelevance(name: string | undefined): number {
  switch (name?.toLowerCase()) {
    case "highest":
    case "blocker":
      return 0.8;
    case "high":
    case "critical":
      return 0.7;
    case "medium":
      return 0.6;
    case "low":
    case "lowest":
      return 0.5;
    default:
      return 0.5;
  }
}

export class JiraChannel implements ExternalChannel {
  readonly type = "jira" as const;

  async check(): Promise<ChannelStatus> {
    const token = process.env.JIRA_API_TOKEN;
    const email = process.env.JIRA_USER_EMAIL;
    const baseUrl = process.env.JIRA_BASE_URL;
    if (!token || !email || !baseUrl) return "auth-missing";
    try {
      const body = await jiraGet(`${baseUrl}/rest/api/3/myself`, email, token, 5000);
      const parsed = JSON.parse(body);
      if (parsed.accountId) return "available";
      return "auth-missing";
    } catch {
      return "error";
    }
  }

  async fetch(config: ChannelConfig): Promise<ChannelFetchResult> {
    const errors: string[] = [];
    const memories: ChannelMemoryCandidate[] = [];
    const opts = config.options;

    const token = process.env.JIRA_API_TOKEN;
    const email = process.env.JIRA_USER_EMAIL;
    const baseUrl = (opts.base_url as string) || process.env.JIRA_BASE_URL;

    if (!token || !email || !baseUrl) {
      return { channel: this.type, memories: [], fetchedAt: new Date().toISOString(), errors: ["JIRA_API_TOKEN, JIRA_USER_EMAIL, or JIRA_BASE_URL not set"] };
    }

    const project = opts.project as string;
    if (!project) {
      return { channel: this.type, memories: [], fetchedAt: new Date().toISOString(), errors: ["Jira project not configured"] };
    }

    const maxItems = Number(opts.max_items) || 15;
    const assignee = opts.assignee as string | undefined;

    let jql = `project=${project} AND status!=Done ORDER BY updated DESC`;
    if (assignee === "me") {
      jql = `project=${project} AND status!=Done AND assignee=currentUser() ORDER BY updated DESC`;
    }

    try {
      const url = `${baseUrl}/rest/api/3/search?jql=${encodeURIComponent(jql)}&maxResults=${maxItems}&fields=summary,status,priority,assignee,labels,updated,issuetype`;
      const raw = await jiraGet(url, email, token);
      const response: JiraSearchResponse = JSON.parse(raw);

      if (response.errorMessages?.length) {
        errors.push(response.errorMessages.join("; "));
        return { channel: this.type, memories, fetchedAt: new Date().toISOString(), errors };
      }

      for (const issue of response.issues ?? []) {
        const f = issue.fields;
        const relevance = priorityRelevance(f.priority?.name);
        const assigneeStr = f.assignee ? ` — Assignee: ${f.assignee.displayName}` : "";
        const labelStr = f.labels.length > 0 ? ` — Labels: ${f.labels.join(", ")}` : "";

        memories.push({
          content: `[Jira ${issue.key}] ${f.summary} — ${f.issuetype.name} — Priority: ${f.priority?.name ?? "None"} — Status: ${f.status.name}${assigneeStr}${labelStr}`,
          tags: ["jira", "task", f.issuetype.name.toLowerCase(), ...f.labels],
          relevance,
          externalId: `jira-${issue.key}`,
        });
      }
    } catch (err: unknown) {
      errors.push(String(err).slice(0, 200));
    }

    return { channel: this.type, memories, fetchedAt: new Date().toISOString(), errors };
  }
}
