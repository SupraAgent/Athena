"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  return (
    <React.Suspense fallback={<div className="flex min-h-dvh items-center justify-center"><div className="text-muted-foreground">Loading...</div></div>}>
      <LoginForm />
    </React.Suspense>
  );
}

function LoginForm() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = React.useState(false);
  const [devPassword, setDevPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(
    searchParams.get("error") ? "Authentication failed. Please try again." : null
  );

  const next = searchParams.get("next") ?? "/";

  async function handleLogin() {
    setLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      if (!supabase) {
        setError("Supabase is not configured. Set environment variables first.");
        setLoading(false);
        return;
      }
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "github",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        },
      });

      if (error) {
        setError(error.message);
        setLoading(false);
      }
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  function handleDevLogin(e: React.FormEvent) {
    e.preventDefault();
    if (devPassword === "dev") {
      document.cookie = "athena-dev-auth=authenticated; path=/; max-age=86400; SameSite=Lax";
      window.location.href = next;
    } else {
      setError("Invalid dev password.");
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-8 text-center">
        <div>
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
            <div className="h-4 w-4 rounded-full bg-primary shadow-[0_0_20px_rgba(12,206,107,0.5)]" />
          </div>
          <h1 className="mt-4 text-xl font-semibold text-foreground">
            Athena
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Benchmark, score, and iteratively improve your app
          </p>
        </div>

        {error && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        <Button
          onClick={handleLogin}
          disabled={loading}
          className="w-full gap-2"
        >
          <svg viewBox="0 0 24 24" width={18} height={18} fill="currentColor">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
          </svg>
          {loading ? "Redirecting..." : "Sign in with GitHub"}
        </Button>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-white/10" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-background px-2 text-muted-foreground">or</span>
          </div>
        </div>

        <form onSubmit={handleDevLogin} className="space-y-3">
          <input
            type="password"
            value={devPassword}
            onChange={(e) => setDevPassword(e.target.value)}
            placeholder="Dev password"
            className="h-10 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-foreground placeholder:text-muted-foreground outline-none transition hover:border-white/15 focus:border-primary/40 focus:ring-2 focus:ring-primary/15 text-center"
          />
          <Button type="submit" variant="secondary" className="w-full">
            Dev Login
          </Button>
        </form>

        <p className="text-xs text-muted-foreground">
          Sign in with GitHub to connect your repos and start improving.
        </p>
      </div>
    </div>
  );
}
