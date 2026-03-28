"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { NAV_GROUPS } from "./nav-config";

export function Sidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { signOut } = useAuth();

  return (
    <aside className="hidden md:flex fixed left-0 top-0 bottom-0 w-60 bg-card border-r border-white/10 flex-col z-30">
      {/* Header */}
      <div className="px-5 py-5 border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <div className="h-2.5 w-2.5 rounded-full bg-primary" />
          <span className="text-foreground font-semibold text-sm tracking-tight">
            Athena
          </span>
        </div>
        <p className="mt-1 text-[10px] text-muted-foreground pl-5">
          Iterative Improvement Engine
        </p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        {NAV_GROUPS.map((group) => (
          <div key={group.title}>
            <h3 className="px-2 mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {group.title}
            </h3>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const [itemPath, itemQuery] = item.href.split("?");
                const isActive = itemQuery
                  ? pathname === itemPath && searchParams.get(itemQuery.split("=")[0]) === itemQuery.split("=")[1]
                  : (pathname === item.href && !searchParams.get("tab")) || pathname.startsWith(item.href + "/");
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        "flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors",
                        isActive
                          ? "border border-primary/30 bg-primary/5 text-foreground"
                          : "text-muted-foreground hover:text-foreground hover:bg-white/[0.03] border border-transparent"
                      )}
                    >
                      <span className="text-base leading-none">{item.icon}</span>
                      <span>{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Account section */}
      <div className="px-3 py-4 border-t border-white/10">
        <h3 className="px-2 mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          ACCOUNT
        </h3>
        <button
          onClick={signOut}
          className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-white/[0.03] transition-colors w-full"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9"
            />
          </svg>
          <span>Sign out</span>
        </button>
      </div>
    </aside>
  );
}
