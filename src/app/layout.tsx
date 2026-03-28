import type { Metadata } from "next";
import { AuthProvider } from "@/lib/auth";
import { AppShell } from "@/components/shell/app-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "Athena",
  description: "Benchmark, score, and iteratively improve your app with AI-generated competitor CPO personas",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body style={{ fontFamily: "Inter, system-ui, -apple-system, sans-serif" }}>
        <AuthProvider>
          <AppShell>{children}</AppShell>
        </AuthProvider>
      </body>
    </html>
  );
}
