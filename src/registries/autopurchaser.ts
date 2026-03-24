/**
 * Auto-Purchaser node definitions.
 * Auto-synced from SupraAgent/Auto-Purchaser — manual edits between
 * SYNC-START / SYNC-END markers will be overwritten.
 */
import type {
  NodePaletteItem,
  NodeRegistry,
  NodeTypeRegistration,
} from "../core/types";

// ── SYNC-START: triggers ────────────────────────────────────────

export const AUTOPURCHASER_TRIGGERS: NodePaletteItem[] = [
  { type: "trigger", subType: "new_listing", label: "New Listing Found", description: "When scraper finds a new matching item", icon: "ShoppingBag", defaultConfig: {} },
  { type: "trigger", subType: "price_drop", label: "Price Drop", description: "When a tracked item's price decreases", icon: "TrendingDown", defaultConfig: {} },
  { type: "trigger", subType: "scheduled_scan", label: "Scheduled Scan", description: "Periodic scan via cron", icon: "Clock", defaultConfig: {interval_minutes: 30} },
  { type: "trigger", subType: "manual", label: "Manual Trigger", description: "Run on demand", icon: "Play", defaultConfig: {} },
];

// ── SYNC-END: triggers ──────────────────────────────────────────

// ── SYNC-START: actions ─────────────────────────────────────────

export const AUTOPURCHASER_ACTIONS: NodePaletteItem[] = [
  { type: "action", subType: "send_telegram", label: "Send Telegram Alert", description: "Send deal notification to Telegram", icon: "Send", defaultConfig: {message: ""} },
  { type: "action", subType: "save_item", label: "Save to Database", description: "Save the found deal to the database", icon: "Database", defaultConfig: {} },
];

// ── SYNC-END: actions ───────────────────────────────────────────

// ── SYNC-START: triggerConfigs ───────────────────────────────────

export const AUTOPURCHASER_TRIGGER_CONFIGS: Record<string, NodeTypeRegistration> = {
  new_listing: {
    subType: "new_listing",
    configFields: [
      { key: "source", label: "Source", type: "select", options: [{ value: "mercari_tw", label: "Mercari Taiwan" }] },
      { key: "keyword", label: "Keyword (optional)", type: "text", placeholder: "Override watch keyword" },
    ],
  },
  price_drop: {
    subType: "price_drop",
    configFields: [
      { key: "min_drop_percent", label: "Min drop %", type: "number", defaultValue: 10 },
    ],
  },
  scheduled_scan: {
    subType: "scheduled_scan",
    configFields: [
      { key: "interval_minutes", label: "Interval (minutes)", type: "number", defaultValue: 30 },
    ],
  },
  manual: {
    subType: "manual",
    configFields: [],
    infoText: 'Click "Run" to trigger this workflow manually.',
  },
};

// ── SYNC-END: triggerConfigs ────────────────────────────────────

// ── SYNC-START: actionConfigs ───────────────────────────────────

export const AUTOPURCHASER_ACTION_CONFIGS: Record<string, NodeTypeRegistration> = {
  send_telegram: {
    subType: "send_telegram",
    configFields: [
      { key: "message", label: "Message template", type: "textarea", placeholder: "Use {{title}}, {{price}}, {{item_url}}, {{keyword}}" },
      { key: "chat_id", label: "Chat ID override (optional)", type: "text", placeholder: "Default: watch's chat ID" },
    ],
  },
  save_item: {
    subType: "save_item",
    configFields: [],
    infoText: "Automatically saves the deal to the found_items table.",
  },
};

// ── SYNC-END: actionConfigs ─────────────────────────────────────

// ── SYNC-START: conditionFields ─────────────────────────────────

export const AUTOPURCHASER_CONDITION_FIELDS = [
  { value: "price", label: "Price" },
  { value: "title", label: "Title" },
  { value: "item_condition", label: "Item Condition" },
  { value: "seller_name", label: "Seller Name" },
  { value: "source", label: "Source" },
];

// ── SYNC-END: conditionFields ───────────────────────────────────

/** Full Auto-Purchaser registry — ready to pass to BuilderProvider. */
export const AUTOPURCHASER_REGISTRY: NodeRegistry = {
  triggers: AUTOPURCHASER_TRIGGERS,
  actions: AUTOPURCHASER_ACTIONS,
  triggerConfigs: AUTOPURCHASER_TRIGGER_CONFIGS,
  actionConfigs: AUTOPURCHASER_ACTION_CONFIGS,
  conditionFields: AUTOPURCHASER_CONDITION_FIELDS,
};
