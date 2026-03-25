"use client";

import * as React from "react";
import type { AppletInstance, PartnerApplet } from "../core/types";
import type { AppletStore } from "../core/partner-applets";

// ── Props ───────────────────────────────────────────────────────

export interface AppletInstancesProps {
  store: AppletStore;
  userId?: string;
  onConfigure: (instance: AppletInstance, applet: PartnerApplet) => void;
  onClose?: () => void;
}

// ── Component ───────────────────────────────────────────────────

export function AppletInstances({
  store,
  userId,
  onConfigure,
  onClose,
}: AppletInstancesProps) {
  // Subscribe to store
  const subscribeFn = React.useCallback(
    (cb: () => void) => store.subscribe(cb),
    [store]
  );
  const snapshotFn = React.useCallback(() => store.getSnapshot(), [store]);
  const storeVersion = React.useSyncExternalStore(subscribeFn, snapshotFn, snapshotFn);

  const instances = React.useMemo(
    () => store.getInstances(userId),
    [store, userId, storeVersion]
  );

  const [confirmUninstall, setConfirmUninstall] = React.useState<string | null>(
    null
  );

  function handleToggle(instanceId: string, enabled: boolean) {
    store.toggleInstance(instanceId, enabled);
  }

  function handleUninstall(instanceId: string) {
    store.uninstall(instanceId);
    setConfirmUninstall(null);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0 border-b border-white/10 px-6 py-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">My Applets</h2>
          <p className="text-[10px] text-muted-foreground/60 mt-0.5">
            {instances.length} installed applet
            {instances.length !== 1 ? "s" : ""}
          </p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="flex items-center justify-center h-7 w-7 rounded-lg border border-white/10 text-muted-foreground hover:text-foreground hover:bg-white/[0.05] transition-colors"
            aria-label="Close"
          >
            <svg
              className="h-3.5 w-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>

      {/* Instance list */}
      <div className="flex-1 overflow-y-auto p-6 space-y-2">
        {instances.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground/50">
            <svg
              className="h-10 w-10 mb-3"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
              <line x1="8" y1="21" x2="16" y2="21" />
              <line x1="12" y1="17" x2="12" y2="21" />
            </svg>
            <p className="text-xs">No applets installed yet</p>
            <p className="text-[10px] text-muted-foreground/40 mt-1">
              Browse the marketplace to install applets
            </p>
          </div>
        ) : (
          instances.map((instance) => {
            const applet = store.getApplet(instance.appletId);
            if (!applet) return null;
            return (
              <InstanceCard
                key={instance.id}
                instance={instance}
                applet={applet}
                onToggle={(enabled) => handleToggle(instance.id, enabled)}
                onConfigure={() => onConfigure(instance, applet)}
                onUninstall={() => {
                  if (confirmUninstall === instance.id) {
                    handleUninstall(instance.id);
                  } else {
                    setConfirmUninstall(instance.id);
                  }
                }}
                confirmingUninstall={confirmUninstall === instance.id}
                onCancelUninstall={() => setConfirmUninstall(null)}
              />
            );
          })
        )}
      </div>
    </div>
  );
}

// ── Instance Card ───────────────────────────────────────────────

function InstanceCard({
  instance,
  applet,
  onToggle,
  onConfigure,
  onUninstall,
  confirmingUninstall,
  onCancelUninstall,
}: {
  instance: AppletInstance;
  applet: PartnerApplet;
  onToggle: (enabled: boolean) => void;
  onConfigure: () => void;
  onUninstall: () => void;
  confirmingUninstall: boolean;
  onCancelUninstall: () => void;
}) {
  const installedDate = React.useMemo(() => {
    try {
      return new Date(instance.installedAt).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return instance.installedAt;
    }
  }, [instance.installedAt]);

  const lastRunDate = React.useMemo(() => {
    if (!instance.lastRunAt) return null;
    try {
      return new Date(instance.lastRunAt).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return instance.lastRunAt;
    }
  }, [instance.lastRunAt]);

  return (
    <div
      className={`rounded-xl border bg-white/[0.02] transition-colors ${
        instance.enabled
          ? "border-white/[0.06] hover:border-white/10"
          : "border-white/[0.04] opacity-60"
      }`}
    >
      <div className="flex items-start gap-3 p-4">
        {/* Partner logo */}
        {applet.partnerLogo ? (
          <img
            src={applet.partnerLogo}
            alt=""
            className="h-8 w-8 rounded-lg object-contain shrink-0 border border-white/[0.06]"
          />
        ) : (
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.06] border border-white/[0.06] text-[11px] font-bold text-muted-foreground/60 shrink-0">
            {applet.partnerName.charAt(0)}
          </span>
        )}

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold text-foreground leading-tight">
              {applet.name}
            </h3>
            {/* Toggle */}
            <button
              role="switch"
              aria-checked={instance.enabled}
              onClick={() => onToggle(!instance.enabled)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0 ${
                instance.enabled ? "bg-emerald-500/40" : "bg-white/10"
              }`}
            >
              <span
                className="inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform"
                style={{
                  transform: instance.enabled
                    ? "translateX(18px)"
                    : "translateX(2px)",
                }}
              />
            </button>
          </div>

          <p className="text-[10px] text-muted-foreground/60 mt-0.5">
            by {applet.partnerName}
          </p>

          {/* Status indicators */}
          <div className="flex items-center gap-3 mt-2">
            {/* Status badge */}
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] border ${
                instance.enabled
                  ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                  : "bg-white/[0.04] border-white/[0.06] text-muted-foreground/50"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  instance.enabled ? "bg-emerald-400" : "bg-muted-foreground/30"
                }`}
              />
              {instance.enabled ? "Active" : "Disabled"}
            </span>

            {/* Installed date */}
            <span className="text-[9px] text-muted-foreground/40">
              Installed {installedDate}
            </span>

            {/* Last run */}
            {lastRunDate && (
              <span className="text-[9px] text-muted-foreground/40">
                Last run {lastRunDate}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 border-t border-white/[0.04] px-4 py-2.5">
        <button
          onClick={onConfigure}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[10px] text-muted-foreground/70 hover:text-foreground hover:bg-white/[0.04] border border-white/[0.06] transition-colors"
        >
          <svg
            className="h-3 w-3"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          Configure
        </button>
        {confirmingUninstall ? (
          <div className="flex items-center gap-1.5 ml-auto">
            <span className="text-[10px] text-red-400">Confirm?</span>
            <button
              onClick={onUninstall}
              className="rounded-lg px-3 py-1.5 text-[10px] bg-red-500/15 text-red-400 hover:bg-red-500/25 border border-red-500/20 transition-colors"
            >
              Uninstall
            </button>
            <button
              onClick={onCancelUninstall}
              className="rounded-lg px-3 py-1.5 text-[10px] text-muted-foreground/60 hover:text-foreground border border-white/[0.06] transition-colors"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={onUninstall}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[10px] text-red-400/60 hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-colors ml-auto"
          >
            <svg
              className="h-3 w-3"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
            Uninstall
          </button>
        )}
      </div>
    </div>
  );
}
