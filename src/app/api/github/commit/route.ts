import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { Octokit } from "octokit";

type FileToCommit = {
  path: string;
  content: string;
};

export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  // Use getUser() for auth verification (getSession() reads unverified cookies)
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Session needed for provider_token (GitHub OAuth token)
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.provider_token) {
    return NextResponse.json({ error: "No GitHub token. Re-authenticate with GitHub." }, { status: 401 });
  }

  const body = await request.json();
  const {
    owner,
    repo,
    branch,
    message,
    files,
  }: {
    owner: string;
    repo: string;
    branch: string;
    message: string;
    files: FileToCommit[];
  } = body;

  if (!owner || !repo || !files?.length) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  // Input validation: owner, repo, branch must be safe strings
  const safeNamePattern = /^[a-zA-Z0-9._-]+$/;
  if (!safeNamePattern.test(owner) || !safeNamePattern.test(repo)) {
    return NextResponse.json({ error: "Invalid owner or repo name" }, { status: 400 });
  }
  if (branch && !safeNamePattern.test(branch)) {
    return NextResponse.json({ error: "Invalid branch name" }, { status: 400 });
  }
  if (!branch || !message) {
    return NextResponse.json({ error: "Missing branch or message" }, { status: 400 });
  }

  // Path traversal protection: all file paths must be under .athena/
  for (const file of files) {
    if (typeof file.path !== "string" || typeof file.content !== "string") {
      return NextResponse.json({ error: "Each file must have a string path and content" }, { status: 400 });
    }
    const normalized = file.path.replace(/\\/g, "/");
    if (normalized.includes("..") || !normalized.startsWith(".athena/")) {
      return NextResponse.json(
        { error: `File path "${file.path}" is not allowed. All paths must be under .athena/` },
        { status: 400 }
      );
    }
  }

  try {
    const octokit = new Octokit({ auth: session.provider_token });

    // Get the current commit SHA for the branch
    const { data: ref } = await octokit.rest.git.getRef({
      owner,
      repo,
      ref: `heads/${branch}`,
    });
    const latestCommitSha = ref.object.sha;

    // Get the tree of the current commit
    const { data: commit } = await octokit.rest.git.getCommit({
      owner,
      repo,
      commit_sha: latestCommitSha,
    });

    // Create blobs for each file
    const blobs = await Promise.all(
      files.map(async (file) => {
        const { data: blob } = await octokit.rest.git.createBlob({
          owner,
          repo,
          content: Buffer.from(file.content).toString("base64"),
          encoding: "base64",
        });
        return { path: file.path, sha: blob.sha };
      })
    );

    // Create a new tree with the files
    const { data: tree } = await octokit.rest.git.createTree({
      owner,
      repo,
      base_tree: commit.tree.sha,
      tree: blobs.map((b) => ({
        path: b.path,
        mode: "100644" as const,
        type: "blob" as const,
        sha: b.sha,
      })),
    });

    // Create the commit
    const { data: newCommit } = await octokit.rest.git.createCommit({
      owner,
      repo,
      message,
      tree: tree.sha,
      parents: [latestCommitSha],
    });

    // Update the branch reference
    await octokit.rest.git.updateRef({
      owner,
      repo,
      ref: `heads/${branch}`,
      sha: newCommit.sha,
    });

    return NextResponse.json({
      sha: newCommit.sha,
      url: newCommit.html_url,
      message: `Committed ${files.length} files to ${owner}/${repo}`,
    });
  } catch (err) {
    const rawMsg = err instanceof Error ? err.message : "GitHub commit failed";
    // Sanitize error to prevent leaking tokens or internal URLs
    const safeMsg = rawMsg
      .replace(/ghs_[a-zA-Z0-9]+/g, "[REDACTED]")
      .replace(/ghp_[a-zA-Z0-9]+/g, "[REDACTED]")
      .replace(/github_pat_[a-zA-Z0-9_]+/g, "[REDACTED]");
    return NextResponse.json({ error: safeMsg }, { status: 500 });
  }
}
