"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useShell } from "./shell-context";
import { NAV_GROUPS } from "./nav-config";

export function MobileHeader() {
  const pathname = usePathname();
  const { mobileNavOpen, setMobileNavOpen } = useShell();

  return (
    <div className="md:hidden">
      {/* Top bar */}
      <div className="flex h-12 items-center justify-between border-b border-white/10 bg-card px-4">
        <div className="flex items-center gap-2">
          <div className="h-2.5 w-2.5 rounded-full bg-primary" />
          <span className="text-sm font-semibold text-foreground tracking-tight">
            Athena
          </span>
        </div>
        <div className="flex items-center gap-1">
          {/* Search button */}
          <button
            onClick={() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }))}
            className="rounded-lg p-2 text-muted-foreground hover:text-foreground hover:bg-white/5 transition"
            aria-label="Search"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          </button>
          {/* Hamburger */}
          <button
            onClick={() => setMobileNavOpen(!mobileNavOpen)}
            className="rounded-lg p-2 text-muted-foreground hover:text-foreground hover:bg-white/5 transition"
            aria-label={mobileNavOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileNavOpen}
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
              {mobileNavOpen ? (
                <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
              ) : (
                <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" strokeLinejoin="round" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile nav overlay */}
      {mobileNavOpen && (
        <>
          <div
            className="fixed inset-0 top-12 z-40 bg-black/40"
            onClick={() => setMobileNavOpen(false)}
          />
          <nav className="fixed left-0 right-0 top-12 z-50 max-h-[calc(100vh-3rem)] overflow-y-auto border-b border-white/10 bg-background px-4 py-3 space-y-4 animate-fade-in">
            {NAV_GROUPS.map((group) => (
              <div key={group.title}>
                <h3 className="px-3 mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  {group.title}
                </h3>
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setMobileNavOpen(false)}
                        className={cn(
                          "flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                          active
                            ? "bg-primary/10 text-foreground border border-primary/30"
                            : "text-muted-foreground hover:bg-white/5 hover:text-foreground border border-transparent"
                        )}
                      >
                        <span className="text-base leading-none">{item.icon}</span>
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
        </>
      )}
    </div>
  );
}
