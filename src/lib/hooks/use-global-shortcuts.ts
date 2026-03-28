"use client";

import { useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";

type ShortcutHandlers = {
  openCommandPalette: () => void;
  openShortcutHelp: () => void;
};

/**
 * Global keyboard shortcut system for Athena.
 *
 * Single-key shortcuts:
 *   /         Open command palette (focus search)
 *   ?         Open shortcut help overlay
 *
 * Two-key "go to" chords (press G, then a second key within 1.5s):
 *   G H       Go to Home
 *   G P       Go to Pipeline
 *   G C       Go to Contacts
 *   G G       Go to Groups
 *   G B       Go to Broadcasts
 *   G E       Go to Email
 *   G S       Go to Settings
 */
export function useGlobalShortcuts(handlers: ShortcutHandlers) {
  const router = useRouter();
  const pendingG = useRef(false);
  const gTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearG = useCallback(() => {
    pendingG.current = false;
    if (gTimer.current) {
      clearTimeout(gTimer.current);
      gTimer.current = null;
    }
  }, []);

  useEffect(() => {
    function isTyping(e: KeyboardEvent): boolean {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
      if ((e.target as HTMLElement)?.isContentEditable) return true;
      return false;
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTyping(e)) return;

      // Handle second key of G chord
      if (pendingG.current) {
        clearG();
        const routes: Record<string, string> = {
          h: "/",
          p: "/pipeline",
          c: "/contacts",
          g: "/groups",
          b: "/broadcasts",
          e: "/email",
          s: "/settings",
        };
        const dest = routes[e.key.toLowerCase()];
        if (dest) {
          e.preventDefault();
          router.push(dest);
        }
        return;
      }

      // Single-key shortcuts
      switch (e.key) {
        case "/":
          e.preventDefault();
          handlers.openCommandPalette();
          break;
        case "?":
          e.preventDefault();
          handlers.openShortcutHelp();
          break;
        case "g":
        case "G":
          pendingG.current = true;
          gTimer.current = setTimeout(clearG, 1500);
          break;
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      clearG();
    };
  }, [handlers, router, clearG]);
}
