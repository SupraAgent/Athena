"use client";

import * as React from "react";
import type {
  PartnerApplet,
  AppletSearchQuery,
} from "../core/types";
import type { AppletStore } from "../core/partner-applets";

// ── Props ───────────────────────────────────────────────────────

export interface AppletMarketplaceProps {
  store: AppletStore;
  onInstall: (applet: PartnerApplet) => void;
  onClose: () => void;
}

// ── Icons (inline SVG helpers) ──────────────────────────────────

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
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
  );
}

function StarIcon({ className, filled }: { className?: string; filled?: boolean }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  );
}

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function VerifiedIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

function ChevronIcon({ className, direction }: { className?: string; direction: "down" | "up" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {direction === "down" ? (
        <polyline points="6 9 12 15 18 9" />
      ) : (
        <polyline points="18 15 12 9 6 15" />
      )}
    </svg>
  );
}

// ── Sort options ────────────────────────────────────────────────

type SortOption = AppletSearchQuery["sortBy"] & string;

const SORT_OPTIONS: Array<{ value: SortOption; label: string }> = [
  { value: "popular", label: "Most Popular" },
  { value: "rating", label: "Highest Rated" },
  { value: "newest", label: "Newest" },
  { value: "name", label: "Name A-Z" },
];

// ── Rating stars ────────────────────────────────────────────────

function RatingStars({ rating }: { rating: number }) {
  const stars: React.ReactNode[] = [];
  const rounded = Math.round(rating * 2) / 2; // round to 0.5
  for (let i = 1; i <= 5; i++) {
    stars.push(
      <StarIcon
        key={i}
        className={`h-2.5 w-2.5 ${i <= rounded ? "text-amber-400" : "text-white/10"}`}
        filled={i <= rounded}
      />
    );
  }
  return <span className="flex items-center gap-0.5">{stars}</span>;
}

// ── Main Component ──────────────────────────────────────────────

export function AppletMarketplace({
  store,
  onInstall,
  onClose,
}: AppletMarketplaceProps) {
  // Subscribe to store
  const subscribeFn = React.useCallback(
    (cb: () => void) => store.subscribe(cb),
    [store]
  );
  const snapshotFn = React.useCallback(() => store.getSnapshot(), [store]);
  const storeVersion = React.useSyncExternalStore(subscribeFn, snapshotFn, snapshotFn);

  const [searchText, setSearchText] = React.useState("");
  const [activeCategory, setActiveCategory] = React.useState<string | null>(null);
  const [sortBy, setSortBy] = React.useState<SortOption>("popular");
  const [verifiedOnly, setVerifiedOnly] = React.useState(false);
  const [partnerFilter, setPartnerFilter] = React.useState<string | null>(null);
  const [selectedApplet, setSelectedApplet] = React.useState<PartnerApplet | null>(null);
  const [sortOpen, setSortOpen] = React.useState(false);

  // Build query
  const query: AppletSearchQuery = React.useMemo(
    () => ({
      text: searchText || undefined,
      category: activeCategory ?? undefined,
      partnerId: partnerFilter ?? undefined,
      verified: verifiedOnly || undefined,
      sortBy: sortBy as AppletSearchQuery["sortBy"],
      limit: 100,
    }),
    [searchText, activeCategory, partnerFilter, verifiedOnly, sortBy]
  );

  const result = React.useMemo(() => store.search(query), [store, query, storeVersion]);

  const allCategories = React.useMemo(() => store.getCategories(), [store, storeVersion]);
  const partners = React.useMemo(() => store.getPartners(), [store, storeVersion]);

  // Close sort dropdown on outside click
  const sortRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!sortOpen) return;
    function handleClick(e: MouseEvent) {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) {
        setSortOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [sortOpen]);

  // If an applet is selected, show detail view
  if (selectedApplet) {
    return (
      <AppletDetail
        applet={selectedApplet}
        onBack={() => setSelectedApplet(null)}
        onInstall={onInstall}
        onClose={onClose}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative flex w-full max-w-5xl max-h-[85vh] rounded-2xl border border-white/10 bg-[#0a0a0f] shadow-2xl overflow-hidden">
        {/* ── Category Sidebar ──────────────────────────────── */}
        <div className="hidden md:flex flex-col w-52 shrink-0 border-r border-white/10 py-4">
          <p className="px-4 text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider mb-2">
            Categories
          </p>
          <button
            onClick={() => setActiveCategory(null)}
            className={`px-4 py-1.5 text-left text-[11px] transition-colors ${
              activeCategory === null
                ? "text-blue-400 bg-blue-500/10"
                : "text-muted-foreground/70 hover:text-foreground hover:bg-white/[0.03]"
            }`}
          >
            All Applets
          </button>
          {allCategories.map((cat) => (
            <button
              key={cat.name}
              onClick={() =>
                setActiveCategory((prev) =>
                  prev === cat.name ? null : cat.name
                )
              }
              className={`flex items-center justify-between px-4 py-1.5 text-left text-[11px] transition-colors ${
                activeCategory === cat.name
                  ? "text-blue-400 bg-blue-500/10"
                  : "text-muted-foreground/70 hover:text-foreground hover:bg-white/[0.03]"
              }`}
            >
              <span>{cat.name}</span>
              <span className="text-[9px] text-muted-foreground/40">
                {cat.count}
              </span>
            </button>
          ))}

          {/* Partner filter */}
          {partners.length > 0 && (
            <>
              <div className="my-3 mx-4 border-t border-white/5" />
              <p className="px-4 text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider mb-2">
                Partners
              </p>
              {partners.map((p) => (
                <button
                  key={p.id}
                  onClick={() =>
                    setPartnerFilter((prev) =>
                      prev === p.id ? null : p.id
                    )
                  }
                  className={`flex items-center gap-2 px-4 py-1.5 text-left text-[11px] transition-colors ${
                    partnerFilter === p.id
                      ? "text-blue-400 bg-blue-500/10"
                      : "text-muted-foreground/70 hover:text-foreground hover:bg-white/[0.03]"
                  }`}
                >
                  {p.logo ? (
                    <img
                      src={p.logo}
                      alt=""
                      className="h-3.5 w-3.5 rounded-sm object-contain"
                    />
                  ) : (
                    <span className="flex h-3.5 w-3.5 items-center justify-center rounded-sm bg-white/10 text-[8px] font-bold">
                      {p.name.charAt(0)}
                    </span>
                  )}
                  <span>{p.name}</span>
                  {p.verified && (
                    <VerifiedIcon className="h-2.5 w-2.5 text-blue-400 shrink-0" />
                  )}
                </button>
              ))}
            </>
          )}
        </div>

        {/* ── Main content ─────────────────────────────────── */}
        <div className="flex flex-col flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center justify-between shrink-0 border-b border-white/10 px-6 py-4">
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                Applet Marketplace
              </h2>
              <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                {result.total} applet{result.total !== 1 ? "s" : ""} available
              </p>
            </div>
            <button
              onClick={onClose}
              className="flex items-center justify-center h-7 w-7 rounded-lg border border-white/10 text-muted-foreground hover:text-foreground hover:bg-white/[0.05] transition-colors"
              aria-label="Close marketplace"
            >
              <CloseIcon className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Search + filters bar */}
          <div className="shrink-0 border-b border-white/10 px-6 py-3 space-y-2">
            <div className="flex items-center gap-2">
              {/* Search input */}
              <div className="relative flex-1">
                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/40" />
                <input
                  type="text"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  placeholder="Search applets by name, tag, or description..."
                  className="w-full rounded-lg border border-white/10 bg-white/[0.02] pl-9 pr-3 py-2 text-xs outline-none placeholder:text-muted-foreground/40 focus:border-white/20 transition-colors"
                />
              </div>

              {/* Sort dropdown */}
              <div className="relative" ref={sortRef}>
                <button
                  onClick={() => setSortOpen(!sortOpen)}
                  className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-[11px] text-muted-foreground/70 hover:text-foreground transition-colors"
                >
                  <span>
                    {SORT_OPTIONS.find((o) => o.value === sortBy)?.label}
                  </span>
                  <ChevronIcon
                    className="h-3 w-3"
                    direction={sortOpen ? "up" : "down"}
                  />
                </button>
                {sortOpen && (
                  <div className="absolute right-0 top-full mt-1 z-10 w-40 rounded-lg border border-white/10 bg-[#0f0f15] shadow-xl overflow-hidden">
                    {SORT_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => {
                          setSortBy(opt.value);
                          setSortOpen(false);
                        }}
                        className={`block w-full text-left px-3 py-2 text-[11px] transition-colors ${
                          sortBy === opt.value
                            ? "text-blue-400 bg-blue-500/10"
                            : "text-muted-foreground/70 hover:bg-white/[0.04] hover:text-foreground"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Filter chips */}
            <div className="flex flex-wrap items-center gap-1.5">
              <FilterChip
                label="Verified Only"
                active={verifiedOnly}
                onClick={() => setVerifiedOnly((v) => !v)}
              />
              {/* Mobile category chips */}
              <div className="flex md:hidden flex-wrap gap-1.5">
                {allCategories.map((cat) => (
                  <FilterChip
                    key={cat.name}
                    label={cat.name}
                    active={activeCategory === cat.name}
                    onClick={() =>
                      setActiveCategory((prev) =>
                        prev === cat.name ? null : cat.name
                      )
                    }
                  />
                ))}
              </div>
              {/* Active filter indicators */}
              {(activeCategory || partnerFilter) && (
                <button
                  onClick={() => {
                    setActiveCategory(null);
                    setPartnerFilter(null);
                    setVerifiedOnly(false);
                    setSearchText("");
                  }}
                  className="text-[10px] text-blue-400 hover:text-blue-300 transition-colors ml-1"
                >
                  Clear all filters
                </button>
              )}
            </div>
          </div>

          {/* ── Applet Grid ──────────────────────────────────── */}
          <div className="flex-1 overflow-y-auto p-6">
            {result.applets.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground/50">
                <SearchIcon className="h-10 w-10 mb-3" />
                <p className="text-xs">No applets match your search</p>
                <button
                  onClick={() => {
                    setSearchText("");
                    setActiveCategory(null);
                    setPartnerFilter(null);
                    setVerifiedOnly(false);
                  }}
                  className="mt-2 text-[10px] text-blue-400 hover:text-blue-300 transition-colors"
                >
                  Clear filters
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {result.applets.map((applet) => (
                  <AppletCard
                    key={applet.id}
                    applet={applet}
                    onSelect={() => setSelectedApplet(applet)}
                    onInstall={() => onInstall(applet)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Subcomponents ───────────────────────────────────────────────

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-[10px] font-medium transition-colors ${
        active
          ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
          : "bg-white/[0.03] text-muted-foreground/60 border border-white/5 hover:bg-white/[0.06] hover:text-muted-foreground"
      }`}
    >
      {label}
    </button>
  );
}

function AppletCard({
  applet,
  onSelect,
  onInstall,
}: {
  applet: PartnerApplet;
  onSelect: () => void;
  onInstall: () => void;
}) {
  return (
    <div className="flex flex-col rounded-xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/10 transition-colors">
      {/* Clickable body */}
      <button
        onClick={onSelect}
        className="flex-1 p-4 space-y-2.5 text-left"
      >
        {/* Partner + Title row */}
        <div className="flex items-start gap-2.5">
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
          <div className="flex-1 min-w-0">
            <h3 className="text-xs font-semibold text-foreground leading-tight line-clamp-1">
              {applet.name}
            </h3>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[9px] text-muted-foreground/50">
                {applet.partnerName}
              </span>
              {applet.verified && (
                <VerifiedIcon className="h-2.5 w-2.5 text-blue-400" />
              )}
            </div>
          </div>
        </div>

        {/* Description */}
        <p className="text-[10px] text-muted-foreground/70 leading-relaxed line-clamp-2">
          {applet.description}
        </p>

        {/* Stats row */}
        <div className="flex items-center gap-3">
          {applet.rating !== undefined && (
            <div className="flex items-center gap-1">
              <RatingStars rating={applet.rating} />
              <span className="text-[9px] text-muted-foreground/50">
                {applet.rating.toFixed(1)}
              </span>
            </div>
          )}
          {applet.installs !== undefined && applet.installs > 0 && (
            <span className="flex items-center gap-0.5 text-[9px] text-muted-foreground/50">
              <DownloadIcon className="h-2.5 w-2.5" />
              {applet.installs.toLocaleString()}
            </span>
          )}
        </div>

        {/* Tags */}
        {applet.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {applet.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-white/[0.04] border border-white/[0.06] px-2 py-0.5 text-[9px] text-muted-foreground/60"
              >
                {tag}
              </span>
            ))}
            {applet.tags.length > 3 && (
              <span className="text-[9px] text-muted-foreground/40 py-0.5">
                +{applet.tags.length - 3}
              </span>
            )}
          </div>
        )}
      </button>

      {/* Footer */}
      <div className="shrink-0 border-t border-white/[0.06] px-4 py-3">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onInstall();
          }}
          className="w-full rounded-lg px-3 py-1.5 text-[11px] font-medium transition-colors bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 border border-blue-500/20"
        >
          Install
        </button>
      </div>
    </div>
  );
}

// ── Applet Detail View ──────────────────────────────────────────

function AppletDetail({
  applet,
  onBack,
  onInstall,
  onClose,
}: {
  applet: PartnerApplet;
  onBack: () => void;
  onInstall: (applet: PartnerApplet) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative flex flex-col w-full max-w-2xl max-h-[85vh] rounded-2xl border border-white/10 bg-[#0a0a0f] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between shrink-0 border-b border-white/10 px-6 py-4">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-[11px] text-muted-foreground/70 hover:text-foreground transition-colors"
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
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Back to Marketplace
          </button>
          <button
            onClick={onClose}
            className="flex items-center justify-center h-7 w-7 rounded-lg border border-white/10 text-muted-foreground hover:text-foreground hover:bg-white/[0.05] transition-colors"
            aria-label="Close"
          >
            <CloseIcon className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Title section */}
          <div className="flex items-start gap-4">
            {applet.partnerLogo ? (
              <img
                src={applet.partnerLogo}
                alt=""
                className="h-12 w-12 rounded-xl object-contain border border-white/[0.06]"
              />
            ) : (
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/[0.06] border border-white/[0.06] text-lg font-bold text-muted-foreground/60">
                {applet.partnerName.charAt(0)}
              </span>
            )}
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-semibold text-foreground">
                {applet.name}
              </h2>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[11px] text-muted-foreground/60">
                  by {applet.partnerName}
                </span>
                {applet.verified && (
                  <span className="flex items-center gap-0.5 text-[10px] text-blue-400">
                    <VerifiedIcon className="h-3 w-3" />
                    Verified
                  </span>
                )}
              </div>
              <div className="flex items-center gap-4 mt-2">
                {applet.rating !== undefined && (
                  <div className="flex items-center gap-1.5">
                    <RatingStars rating={applet.rating} />
                    <span className="text-[10px] text-muted-foreground/50">
                      {applet.rating.toFixed(1)}
                    </span>
                  </div>
                )}
                {applet.installs !== undefined && (
                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground/50">
                    <DownloadIcon className="h-3 w-3" />
                    {applet.installs.toLocaleString()} installs
                  </span>
                )}
                <span className="text-[10px] text-muted-foreground/40">
                  {applet.category}
                </span>
              </div>
            </div>
          </div>

          {/* Summary */}
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
            <p className="text-[11px] text-muted-foreground/80 leading-relaxed">
              {applet.summary}
            </p>
          </div>

          {/* Description */}
          <div>
            <h3 className="text-[11px] font-semibold text-foreground mb-2">
              Description
            </h3>
            <p className="text-[11px] text-muted-foreground/70 leading-relaxed">
              {applet.description}
            </p>
          </div>

          {/* Examples */}
          {applet.examples && applet.examples.length > 0 && (
            <div>
              <h3 className="text-[11px] font-semibold text-foreground mb-2">
                Use Cases
              </h3>
              <ul className="space-y-1.5">
                {applet.examples.map((ex, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-[11px] text-muted-foreground/70"
                  >
                    <span className="text-blue-400/60 mt-0.5 shrink-0">
                      &bull;
                    </span>
                    {ex}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Required config preview */}
          {applet.requiredConfig.length > 0 && (
            <div>
              <h3 className="text-[11px] font-semibold text-foreground mb-2">
                Configuration Required
              </h3>
              <div className="space-y-1.5">
                {applet.requiredConfig.map((field) => (
                  <div
                    key={field.key}
                    className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2"
                  >
                    <div>
                      <span className="text-[11px] text-foreground/80">
                        {field.label}
                      </span>
                      {field.required && (
                        <span className="text-[9px] text-red-400 ml-1">*</span>
                      )}
                      {field.helpText && (
                        <p className="text-[9px] text-muted-foreground/50 mt-0.5">
                          {field.helpText}
                        </p>
                      )}
                    </div>
                    <span className="text-[9px] text-muted-foreground/40 rounded-full bg-white/[0.04] px-2 py-0.5 border border-white/[0.06]">
                      {field.type}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Template preview */}
          <div>
            <h3 className="text-[11px] font-semibold text-foreground mb-2">
              Workflow Template
            </h3>
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 space-y-1.5">
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground/60">
                <span>
                  {applet.template.nodes.length} node
                  {applet.template.nodes.length !== 1 ? "s" : ""}
                </span>
                <span className="h-0.5 w-0.5 rounded-full bg-muted-foreground/30" />
                <span>
                  {applet.template.edges.length} connection
                  {applet.template.edges.length !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {applet.template.nodes.map((node) => (
                  <span
                    key={node.id}
                    className="rounded-md bg-white/[0.04] border border-white/[0.06] px-2 py-1 text-[9px] text-muted-foreground/70"
                  >
                    {node.data.label}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Tags */}
          {applet.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {applet.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-white/[0.04] border border-white/[0.06] px-2 py-0.5 text-[9px] text-muted-foreground/60"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-white/10 px-6 py-4">
          <button
            onClick={() => onInstall(applet)}
            className="w-full rounded-lg px-4 py-2.5 text-xs font-medium transition-colors bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 border border-blue-500/20"
          >
            Install Applet
          </button>
        </div>
      </div>
    </div>
  );
}
