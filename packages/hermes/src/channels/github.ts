/**
 * GitHub Issues/PRs channel.
 *
 * Uses the `gh` CLI to pull open issues and PRs for the current repo.
 * Boosts relevance for items matching the current branch or priority labels.
 */

import { execFileSync } from "child_process";
import type {
  ExternalChannel,
  ChannelConfig,
  ChannelFetchResult,
  ChannelMemoryCandidate,
  ChannelStatus,
} from "./channel";

/** Detect the current git branch name. */
function currentBranch(): string {
  try {
    return execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      encoding: "utf-8",
      timeout: 3000,
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch {
    return "";
  }
}

/** Auto-detect owner/repo from gh. */
function detectRepo(): string {
  try {
    const raw = execFileSync("gh", ["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"], {
      encoding: "utf-8",
      timeout: 5000,
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    return raw;
  } catch {
    return "";
  }
}

type GhIssue = {
  number: number;
  title: string;
  labels: { name: string }[];
  updatedAt: string;
  body: string;
};

type GhPR = GhIssue & {
  headRefName: string;
};

export class GitHubChannel implements ExternalChannel {
  readonly type = "github" as const;

  async check(): Promise<ChannelStatus> {
    try {
      execFileSync("gh", ["auth", "status"], {
        encoding: "utf-8",
        timeout: 5000,
        stdio: ["pipe", "pipe", "pipe"],
      });
      return "available";
    } catch (err: unknown) {
      const msg = String(err);
      if (msg.includes("ENOENT") || msg.includes("not found")) return "unavailable";
      if (msg.includes("not logged") || msg.includes("auth")) return "auth-missing";
      return "error";
    }
  }

  async fetch(config: ChannelConfig): Promise<ChannelFetchResult> {
    const errors: string[] = [];
    const memories: ChannelMemoryCandidate[] = [];
    const opts = config.options;

    const repo = (opts.repo as string) || detectRepo();
    if (!repo) {
      return { channel: this.type, memories: [], fetchedAt: new Date().toISOString(), errors: ["Could not detect repo"] };
    }

    const branch = currentBranch();
    const priorityLabels = new Set(
      (Array.isArray(opts.priority_labels) ? opts.priority_labels : []).map(String)
    );
    const maxIssues = Number(opts.max_issues) || 10;
    const maxPrs = Number(opts.max_prs) || 10;
    const mentionsOnly = Boolean(opts.mentions_only);

    // Fetch issues
    try {
      const raw = execFileSync(
        "gh",
        ["issue", "list", "-R", repo, "--state", "open", "--limit", String(maxIssues),
         "--json", "number,title,labels,updatedAt,body"],
        { encoding: "utf-8", timeout: 15000, stdio: ["pipe", "pipe", "pipe"] }
      );
      const issues: GhIssue[] = JSON.parse(raw);
      for (const issue of issues) {
        const bodySnippet = (issue.body || "").slice(0, 150).replace(/\n/g, " ");
        if (mentionsOnly && branch && !issue.title.includes(branch) && !bodySnippet.includes(branch)) continue;

        const labels = issue.labels.map((l) => l.name);
        let relevance = 0.5;
        if (labels.some((l) => priorityLabels.has(l))) relevance = 0.7;
        if (branch && (issue.title.toLowerCase().includes(branch.toLowerCase()) || bodySnippet.toLowerCase().includes(branch.toLowerCase()))) {
          relevance = 0.8;
        }

        const labelStr = labels.length > 0 ? ` — Labels: ${labels.join(", ")}` : "";
        memories.push({
          content: `[GitHub Issue #${issue.number}] ${issue.title}${labelStr}${bodySnippet ? ` — ${bodySnippet}` : ""}`,
          tags: ["github", "issue", ...labels],
          relevance,
          externalId: `gh-issue-${issue.number}`,
        });
      }
    } catch (err: unknown) {
      errors.push(`Issues: ${String(err).slice(0, 200)}`);
    }

    // Fetch PRs
    try {
      const raw = execFileSync(
        "gh",
        ["pr", "list", "-R", repo, "--state", "open", "--limit", String(maxPrs),
         "--json", "number,title,labels,updatedAt,headRefName,body"],
        { encoding: "utf-8", timeout: 15000, stdio: ["pipe", "pipe", "pipe"] }
      );
      const prs: GhPR[] = JSON.parse(raw);
      for (const pr of prs) {
        const bodySnippet = (pr.body || "").slice(0, 150).replace(/\n/g, " ");
        const labels = pr.labels.map((l) => l.name);
        let relevance = 0.5;
        if (labels.some((l) => priorityLabels.has(l))) relevance = 0.7;
        if (branch && pr.headRefName === branch) relevance = 0.85;

        const labelStr = labels.length > 0 ? ` — Labels: ${labels.join(", ")}` : "";
        memories.push({
          content: `[GitHub PR #${pr.number}] ${pr.title} (${pr.headRefName})${labelStr}${bodySnippet ? ` — ${bodySnippet}` : ""}`,
          tags: ["github", "pr", ...labels],
          relevance,
          externalId: `gh-pr-${pr.number}`,
        });
      }
    } catch (err: unknown) {
      errors.push(`PRs: ${String(err).slice(0, 200)}`);
    }

    return { channel: this.type, memories, fetchedAt: new Date().toISOString(), errors };
  }
}
