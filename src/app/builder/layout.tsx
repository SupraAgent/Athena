import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Athena Builder",
  description: "Visual automation builder — drag, connect, and orchestrate workflows with AI",
};

/**
 * Builder layout — provides the standalone viewport for the self-contained
 * builder app. AppShell bypasses sidebar/nav for routes listed in
 * src/lib/standalone-routes.ts; this layout owns the builder's viewport.
 */
export default function BuilderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="h-[100dvh] w-screen overflow-hidden bg-background">
      {children}
    </div>
  );
}
