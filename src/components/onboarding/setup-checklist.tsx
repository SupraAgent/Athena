"use client";

import * as React from "react";
import Link from "next/link";
import { Check, ArrowRight, Bot, Users, Kanban, Shield, Mail, X, Sparkles, Rocket } from "lucide-react";
import { cn } from "@/lib/utils";

type ChecklistItem = {
  key: string;
  label: string;
  description: string;
  href: string;
  icon: React.ElementType;
  done: boolean;
};

type SetupChecklistProps = {
  hasBotToken: boolean;
  hasGroups: boolean;
  hasDeals: boolean;
  hasContacts: boolean;
  hasEmail?: boolean;
};

export function SetupChecklist({ hasBotToken, hasGroups, hasDeals, hasContacts, hasEmail }: SetupChecklistProps) {
  const [dismissed, setDismissed] = React.useState(false);
  const [showWelcome, setShowWelcome] = React.useState(false);

  // Show welcome modal on first visit
  React.useEffect(() => {
    const seen = localStorage.getItem("athena:welcome-seen");
    if (!seen) setShowWelcome(true);
  }, []);

  function dismissWelcome() {
    setShowWelcome(false);
    localStorage.setItem("athena:welcome-seen", "1");
  }

  const items: ChecklistItem[] = [
    {
      key: "bot",
      label: "Connect Telegram Bot",
      description: "Add your bot token in Settings to enable group messaging.",
      href: "/settings/telegram",
      icon: Bot,
      done: hasBotToken,
    },
    {
      key: "groups",
      label: "Add Telegram Groups",
      description: "Add the bot as admin to your Telegram groups.",
      href: "/groups",
      icon: Users,
      done: hasGroups,
    },
    {
      key: "deals",
      label: "Create Your First Deal",
      description: "Start tracking your pipeline with BD, Marketing, or Admin deals.",
      href: "/pipeline",
      icon: Kanban,
      done: hasDeals,
    },
    {
      key: "contacts",
      label: "Add Contacts",
      description: "Import from Telegram or add contacts manually.",
      href: "/contacts",
      icon: Shield,
      done: hasContacts,
    },
    {
      key: "email",
      label: "Connect Email",
      description: "Link Gmail or Outlook for integrated email tracking.",
      href: "/settings/email",
      icon: Mail,
      done: hasEmail ?? false,
    },
  ];

  const completedCount = items.filter((i) => i.done).length;

  // Don't show if all done or dismissed
  if (completedCount === items.length || dismissed) return null;

  return (
    <>
      {/* Welcome modal for first-time users */}
      {showWelcome && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 animate-fade-in">
          <div className="relative mx-4 w-full max-w-md rounded-2xl border border-primary/20 bg-[hsl(225,32%,7%)] p-6 space-y-4 animate-dropdown-in">
            <button onClick={dismissWelcome} className="absolute top-3 right-3 text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>

            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-xl bg-primary/20 flex items-center justify-center">
                <Rocket className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground">Welcome to Athena</h2>
                <p className="text-xs text-muted-foreground">Telegram-native CRM for your team</p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-start gap-3 rounded-xl bg-white/[0.03] p-3">
                <Sparkles className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-medium text-foreground">Quick Setup (2 minutes)</p>
                  <p className="text-[10px] text-muted-foreground">Connect your Telegram bot, add groups, and you're ready to go.</p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-xl bg-white/[0.03] p-3">
                <Kanban className="h-4 w-4 text-blue-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-medium text-foreground">3 Pipeline Boards</p>
                  <p className="text-[10px] text-muted-foreground">BD, Marketing, and Admin — each with 7-stage pipelines.</p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-xl bg-white/[0.03] p-3">
                <Bot className="h-4 w-4 text-purple-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-medium text-foreground">Telegram Bot Automation</p>
                  <p className="text-[10px] text-muted-foreground">Stage changes auto-notify linked groups. Daily digests, broadcasts, and more.</p>
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <Link
                href="/settings/telegram"
                onClick={dismissWelcome}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground px-4 py-2.5 text-sm font-medium transition hover:bg-primary/90"
              >
                Start Setup <ArrowRight className="h-4 w-4" />
              </Link>
              <button
                onClick={dismissWelcome}
                className="rounded-xl border border-white/10 px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground transition"
              >
                Skip
              </button>
            </div>
          </div>
        </div>
      )}

    <div className="rounded-2xl border border-primary/20 bg-primary/[0.03] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-primary/10">
        <div>
          <h2 className="text-sm font-medium text-foreground">Get Started with Athena</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {completedCount}/{items.length} steps completed
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Progress bar */}
          <div className="w-24 h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${(completedCount / items.length) * 100}%` }}
            />
          </div>
          <button onClick={() => setDismissed(true)} className="text-muted-foreground/40 hover:text-muted-foreground ml-1">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="divide-y divide-white/5">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.key}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-4 py-3 transition hover:bg-white/[0.03]",
                item.done && "opacity-60"
              )}
            >
              <div
                className={cn(
                  "h-8 w-8 rounded-lg flex items-center justify-center shrink-0",
                  item.done ? "bg-primary/20" : "bg-white/5"
                )}
              >
                {item.done ? (
                  <Check className="h-4 w-4 text-primary" />
                ) : (
                  <Icon className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className={cn("text-sm font-medium", item.done ? "text-muted-foreground line-through" : "text-foreground")}>
                  {item.label}
                </p>
                <p className="text-xs text-muted-foreground/60 truncate">{item.description}</p>
              </div>
              {!item.done && <ArrowRight className="h-4 w-4 text-muted-foreground/30 shrink-0" />}
            </Link>
          );
        })}
      </div>
    </div>
    </>
  );
}
