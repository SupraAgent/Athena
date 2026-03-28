"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";

const STORAGE_KEY = "athena_selected_repo";

type Repo = {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  private: boolean;
  default_branch: string;
  updated_at: string | null;
  language: string | null;
  html_url: string;
};

type SelectedRepo = {
  id: number;
  name: string;
  full_name: string;
  default_branch: string;
  html_url: string;
};

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

export default function ReposPage() {
  const { user, loading: authLoading } = useAuth();

  const [repos, setRepos] = React.useState<Repo[]>([]);
  const [fetchState, setFetchState] = React.useState<
    "idle" | "loading" | "done" | "error"
  >("idle");
  const [fetchError, setFetchError] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<SelectedRepo | null>(null);
  const [choosing, setChoosing] = React.useState(false);
  const [search, setSearch] = React.useState("");

  // Load persisted selection on mount
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setSelected(JSON.parse(raw) as SelectedRepo);
    } catch {
      // ignore corrupt storage
    }
  }, []);

  // Auto-fetch repos when user is authenticated and panel is opened
  React.useEffect(() => {
    if (choosing && user && fetchState === "idle") {
      loadRepos();
    }
  }, [choosing, user]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadRepos() {
    setFetchState("loading");
    setFetchError(null);
    try {
      const res = await fetch("/api/github/repos");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Error ${res.status}`);
      }
      const data = await res.json();
      setRepos(data.repos ?? []);
      setFetchState("done");
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Failed to load repos");
      setFetchState("error");
    }
  }

  function selectRepo(repo: Repo) {
    const value: SelectedRepo = {
      id: repo.id,
      name: repo.name,
      full_name: repo.full_name,
      default_branch: repo.default_branch,
      html_url: repo.html_url,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    setSelected(value);
    setChoosing(false);
    setSearch("");
  }

  function clearRepo() {
    localStorage.removeItem(STORAGE_KEY);
    setSelected(null);
  }

  const filtered = search.trim()
    ? repos.filter(
        (r) =>
          r.name.toLowerCase().includes(search.toLowerCase()) ||
          r.full_name.toLowerCase().includes(search.toLowerCase())
      )
    : repos;

  // --- Auth gate ---
  if (authLoading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="h-6 w-48 rounded-md bg-white/5 animate-pulse" />
        <div className="mt-2 h-4 w-72 rounded-md bg-white/5 animate-pulse" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="text-2xl font-bold text-foreground">GitHub Repos</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect a repository to store your Athena config, scores, and round
          logs directly in your codebase.
        </p>

        <div className="mt-8 rounded-xl border border-dashed border-white/10 bg-white/[0.01] p-8 text-center">
          <div className="mb-3 text-3xl">🔒</div>
          <p className="text-sm text-foreground font-medium">
            Sign in to connect a repository
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Athena needs your GitHub identity to list and connect repos.
          </p>
          <div className="mt-5">
            <Link
              href="/login?next=/repos"
              className="inline-flex items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground hover:brightness-110 shadow-[0_0_0_1px_rgba(12,206,107,0.2),0_4px_12px_rgba(12,206,107,0.15)] h-10 px-4 text-sm font-medium transition-all duration-150 active:scale-[0.97]"
            >
              <svg viewBox="0 0 24 24" width={16} height={16} fill="currentColor">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
              </svg>
              Sign in with GitHub
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // --- Authenticated view ---
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-bold text-foreground">GitHub Repos</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Connect a repository to store your Athena config, scores, and round
        logs directly in your codebase.
      </p>

      {/* Selected repo card */}
      {selected && !choosing ? (
        <div className="mt-8 rounded-xl border border-white/10 bg-white/[0.02] p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <svg
                  className="shrink-0 text-primary"
                  viewBox="0 0 16 16"
                  width={16}
                  height={16}
                  fill="currentColor"
                >
                  <path d="M2 2.5A2.5 2.5 0 014.5 0h8.75a.75.75 0 01.75.75v12.5a.75.75 0 01-.75.75h-2.5a.75.75 0 010-1.5h1.75v-2h-8a1 1 0 00-.714 1.7.75.75 0 01-1.072 1.05A2.495 2.495 0 012 11.5v-9zm10.5-1V9h-8c-.356 0-.694.074-1 .208V2.5a1 1 0 011-1h8zM5 12.25v3.25a.25.25 0 00.4.2l1.45-1.087a.25.25 0 01.3 0L8.6 15.7a.25.25 0 00.4-.2v-3.25a.25.25 0 00-.25-.25h-3.5a.25.25 0 00-.25.25z" />
                </svg>
                <span className="font-medium text-foreground truncate">
                  {selected.full_name}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Default branch:{" "}
                <code className="text-primary">{selected.default_branch}</code>
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                <a
                  href={selected.html_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-foreground transition-colors"
                >
                  {selected.html_url}
                </a>
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setChoosing(true);
                if (fetchState === "idle") loadRepos();
              }}
              className="shrink-0"
            >
              Change
            </Button>
          </div>

          {/* .athena/ directory concept */}
          <div className="mt-5 rounded-lg border border-white/10 bg-white/[0.02] px-4 py-3">
            <p className="text-xs font-medium text-foreground mb-2">
              What gets committed to your repo
            </p>
            <div className="space-y-1 font-mono text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <span className="text-primary">📁</span>
                <span className="text-foreground">.athena/</span>
              </div>
              <div className="flex items-center gap-2 pl-4">
                <span className="text-white/30">├─</span>
                <span>config.yaml</span>
                <span className="text-white/30 ml-1">— project settings &amp; personas</span>
              </div>
              <div className="flex items-center gap-2 pl-4">
                <span className="text-white/30">├─</span>
                <span>benchmarks.yaml</span>
                <span className="text-white/30 ml-1">— reference app scores</span>
              </div>
              <div className="flex items-center gap-2 pl-4">
                <span className="text-white/30">├─</span>
                <span>scores.yaml</span>
                <span className="text-white/30 ml-1">— consensus &amp; gap analysis</span>
              </div>
              <div className="flex items-center gap-2 pl-4">
                <span className="text-white/30">├─</span>
                <span>rounds/</span>
                <span className="text-white/30 ml-1">— improvement round logs</span>
              </div>
              <div className="flex items-center gap-2 pl-4">
                <span className="text-white/30">└─</span>
                <span>cpos/</span>
                <span className="text-white/30 ml-1">— competitor CPO personas</span>
              </div>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <div className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_6px_rgba(12,206,107,0.6)]" />
            <p className="text-xs text-muted-foreground">
              Repo connected. Athena will read and write to{" "}
              <code className="text-primary">.athena/</code> on your{" "}
              <code className="text-primary">{selected.default_branch}</code> branch.
            </p>
          </div>

          <div className="mt-4 border-t border-white/5 pt-4">
            <button
              onClick={clearRepo}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Disconnect repo
            </button>
          </div>
        </div>
      ) : null}

      {/* No selection + not choosing */}
      {!selected && !choosing ? (
        <div className="mt-8 rounded-xl border border-dashed border-white/10 bg-white/[0.01] p-8 text-center">
          <div className="mb-3 text-3xl">📂</div>
          <p className="text-sm font-medium text-foreground">
            No repository connected
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Athena will commit a{" "}
            <code className="text-primary">.athena/</code> directory to your
            repo with config, benchmarks, scores, and round logs.
          </p>
          <div className="mt-5">
            <Button
              onClick={() => {
                setChoosing(true);
                if (fetchState === "idle") loadRepos();
              }}
            >
              Choose a repository
            </Button>
          </div>
        </div>
      ) : null}

      {/* Repo picker panel */}
      {choosing ? (
        <div className="mt-8 rounded-xl border border-white/10 bg-white/[0.02]">
          <div className="flex items-center justify-between gap-4 border-b border-white/10 px-5 py-4">
            <p className="text-sm font-medium text-foreground">
              Choose a repository
            </p>
            <button
              onClick={() => {
                setChoosing(false);
                setSearch("");
              }}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
          </div>

          <div className="px-5 py-3 border-b border-white/10">
            <Input
              placeholder="Search repos..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>

          {/* States */}
          {fetchState === "loading" && (
            <div className="px-5 py-10 text-center">
              <div className="mx-auto h-5 w-5 animate-spin rounded-full border-2 border-white/10 border-t-primary" />
              <p className="mt-3 text-xs text-muted-foreground">
                Loading your repositories...
              </p>
            </div>
          )}

          {fetchState === "error" && (
            <div className="px-5 py-6">
              <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3">
                <p className="text-sm text-red-400">{fetchError}</p>
                <button
                  onClick={loadRepos}
                  className="mt-2 text-xs text-red-400/70 hover:text-red-400 transition-colors"
                >
                  Try again
                </button>
              </div>
            </div>
          )}

          {fetchState === "done" && filtered.length === 0 && (
            <div className="px-5 py-10 text-center">
              <p className="text-sm text-muted-foreground">
                {search.trim()
                  ? `No repos matching "${search}"`
                  : "No repositories found"}
              </p>
            </div>
          )}

          {fetchState === "done" && filtered.length > 0 && (
            <ul className="max-h-96 overflow-y-auto divide-y divide-white/5">
              {filtered.map((repo) => (
                <li key={repo.id}>
                  <button
                    onClick={() => selectRepo(repo)}
                    className="w-full px-5 py-3.5 text-left hover:bg-white/[0.03] transition-colors group"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors truncate">
                            {repo.full_name}
                          </span>
                          {repo.private && (
                            <Badge className="shrink-0">Private</Badge>
                          )}
                        </div>
                        {repo.description && (
                          <p className="mt-0.5 text-xs text-muted-foreground truncate">
                            {repo.description}
                          </p>
                        )}
                        <div className="mt-1 flex items-center gap-3">
                          {repo.language && (
                            <span className="text-xs text-muted-foreground">
                              {repo.language}
                            </span>
                          )}
                          {repo.updated_at && (
                            <span className="text-xs text-muted-foreground">
                              Updated {timeAgo(repo.updated_at)}
                            </span>
                          )}
                        </div>
                      </div>
                      <svg
                        className="shrink-0 text-white/20 group-hover:text-primary/60 transition-colors"
                        viewBox="0 0 16 16"
                        width={14}
                        height={14}
                        fill="currentColor"
                      >
                        <path
                          fillRule="evenodd"
                          d="M6.22 3.22a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 010-1.06z"
                        />
                      </svg>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
