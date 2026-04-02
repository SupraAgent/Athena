import * as fs from "fs/promises";
import * as path from "path";
import * as crypto from "crypto";
import * as YAML from "yaml";
import type { HermesConfig, HermesMode, ChannelType, ConversationMap, ConversationThread, SyncState } from "./types";
import { DEFAULT_CONFIG } from "./types";

/** Atomic write: temp file + rename to prevent corruption from concurrent writes. */
async function atomicWriteFile(filePath: string, content: string): Promise<void> {
  const tmpPath = `${filePath}.${crypto.randomBytes(4).toString("hex")}.tmp`;
  await fs.writeFile(tmpPath, content, "utf-8");
  await fs.rename(tmpPath, filePath);
}

// ── Paths ───────────────────────────────────────────────────────

/** Resolve the .athena/hermes/ directory from a repo root. */
export function getHermesDir(repoRoot: string): string {
  return path.join(repoRoot, ".athena", "hermes");
}

/** Discover repo root via `git rev-parse --show-toplevel`, fallback to cwd. */
export function findRepoRoot(): string {
  try {
    const { execFileSync } = require("child_process") as typeof import("child_process");
    return execFileSync("git", ["rev-parse", "--show-toplevel"], {
      encoding: "utf-8",
      timeout: 3000,
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch {
    return process.cwd();
  }
}

// ── Mode Resolution ─────────────────────────────────────────────

const VALID_MODES = new Set<string>(["whisper", "full", "off"]);

/** Resolve operational mode: env var > config file > default. */
export function resolveMode(config: HermesConfig): HermesMode {
  const envMode = process.env.HERMES_MODE?.toLowerCase();
  if (envMode && VALID_MODES.has(envMode)) return envMode as HermesMode;
  return config.mode ?? "whisper";
}

/** Resolve Anthropic API key: env var > config file. */
export function resolveAnthropicKey(config: HermesConfig): string | undefined {
  return process.env.ANTHROPIC_API_KEY ?? config.anthropicApiKey;
}

// ── Config CRUD ─────────────────────────────────────────────────

/** Load hermes.yaml config, returning defaults if not found. */
export async function loadConfig(hermesDir: string): Promise<HermesConfig> {
  const configPath = path.join(hermesDir, "hermes.yaml");
  try {
    const raw = await fs.readFile(configPath, "utf-8");
    const parsed = YAML.parse(raw);
    return {
      maxMemories: parsed?.max_memories ?? DEFAULT_CONFIG.maxMemories,
      autoExtract: parsed?.auto_extract ?? DEFAULT_CONFIG.autoExtract,
      contextLimit: parsed?.context_limit ?? DEFAULT_CONFIG.contextLimit,
      mode: (VALID_MODES.has(parsed?.mode) ? parsed.mode : DEFAULT_CONFIG.mode) as HermesMode,
      anthropicApiKey: parsed?.anthropic_api_key,
      sources: (parsed?.sources ?? []).map((s: Record<string, string>) => ({
        repo: s.repo ?? "",
        branch: s.branch ?? "main",
        path: s.path ?? ".athena/hermes/",
      })),
      tokenBudget: parsed?.token_budget ?? DEFAULT_CONFIG.tokenBudget,
      agents: (parsed?.agents ?? []).map((a: Record<string, unknown>) => ({
        id: String(a.id ?? ""),
        name: String(a.name ?? ""),
        role: String(a.role ?? ""),
        heartbeatMinutes: Number(a.heartbeat_minutes) || 60,
        monthlyBudgetUsd: Number(a.monthly_budget_usd) || 50,
        reportsTo: a.reports_to ? String(a.reports_to) : null,
        triggers: Array.isArray(a.triggers) ? a.triggers.map(String) : [],
      })),
      channels: (parsed?.channels ?? []).map((c: Record<string, unknown>) => ({
        type: String(c.type ?? "") as ChannelType,
        enabled: c.enabled !== false,
        options: (c.options as Record<string, unknown>) ?? {},
        ttlMs: Number(c.ttl_ms) || 300000,
      })),
      global: parsed?.global ? {
        enabled: parsed.global.enabled !== false,
        conflictStrategy: ["local-priority", "global-priority", "last-write-wins"].includes(parsed.global.conflict_strategy)
          ? parsed.global.conflict_strategy
          : undefined,
        importTags: Array.isArray(parsed.global.import_tags) ? parsed.global.import_tags.map(String) : undefined,
        exportTags: Array.isArray(parsed.global.export_tags) ? parsed.global.export_tags.map(String) : undefined,
      } : DEFAULT_CONFIG.global,
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

/** Save hermes.yaml config. Creates directory if needed. */
export async function saveConfig(hermesDir: string, config: HermesConfig): Promise<void> {
  await fs.mkdir(hermesDir, { recursive: true });
  const doc: Record<string, unknown> = {
    max_memories: config.maxMemories,
    auto_extract: config.autoExtract,
    context_limit: config.contextLimit,
    mode: config.mode,
    sources: config.sources.map((s) => ({
      repo: s.repo,
      branch: s.branch,
      path: s.path,
    })),
    agents: config.agents.map((a) => ({
      id: a.id,
      name: a.name,
      role: a.role,
      heartbeat_minutes: a.heartbeatMinutes,
      monthly_budget_usd: a.monthlyBudgetUsd,
      reports_to: a.reportsTo,
      triggers: a.triggers,
    })),
    channels: config.channels.map((c) => ({
      type: c.type,
      enabled: c.enabled,
      // SECURITY: Strip any keys/tokens from channel options
      options: Object.fromEntries(
        Object.entries(c.options).filter(([k]) => !k.includes("token") && !k.includes("key") && !k.includes("secret"))
      ),
      ttl_ms: c.ttlMs,
    })),
  };
  if (config.global) {
    const g: Record<string, unknown> = { enabled: config.global.enabled };
    if (config.global.conflictStrategy) g.conflict_strategy = config.global.conflictStrategy;
    if (config.global.importTags?.length) g.import_tags = config.global.importTags;
    if (config.global.exportTags?.length) g.export_tags = config.global.exportTags;
    doc.global = g;
  }
  // SECURITY: Never write API keys to config files (could be committed to git).
  // API keys should be set via ANTHROPIC_API_KEY environment variable only.
  const content = `# Hermes Configuration\n${YAML.stringify(doc)}`;
  await atomicWriteFile(path.join(hermesDir, "hermes.yaml"), content);
}

// ── Conversation Threading ──────────────────────────────────────

function conversationsPath(hermesDir: string): string {
  return path.join(hermesDir, "conversations.json");
}

/** Load conversation map from disk. */
export async function loadConversations(hermesDir: string): Promise<ConversationMap> {
  try {
    const raw = await fs.readFile(conversationsPath(hermesDir), "utf-8");
    return JSON.parse(raw) as ConversationMap;
  } catch {
    return {};
  }
}

/** Save conversation map to disk. */
export async function saveConversations(hermesDir: string, map: ConversationMap): Promise<void> {
  await fs.mkdir(hermesDir, { recursive: true });
  await atomicWriteFile(conversationsPath(hermesDir), JSON.stringify(map, null, 2));
}

/** Get or create a conversation thread for a session. */
export async function getOrCreateThread(
  hermesDir: string,
  sessionId: string
): Promise<ConversationThread> {
  const map = await loadConversations(hermesDir);

  // Check if this session already has a thread
  if (map[sessionId]) {
    map[sessionId].lastActiveAt = new Date().toISOString();
    await saveConversations(hermesDir, map);
    return map[sessionId];
  }

  // Create a new thread
  const now = new Date().toISOString();
  const thread: ConversationThread = {
    threadId: `thread_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    sessionIds: [sessionId],
    createdAt: now,
    lastActiveAt: now,
    lastInjectedMemoryIds: [],
    lastInjectedHash: "",
  };

  map[sessionId] = thread;
  await saveConversations(hermesDir, map);
  return thread;
}

/** Update the injection state for a thread (for memory diffing). */
export async function updateThreadInjection(
  hermesDir: string,
  sessionId: string,
  memoryIds: string[],
  contentHash: string
): Promise<void> {
  const map = await loadConversations(hermesDir);
  if (map[sessionId]) {
    map[sessionId].lastInjectedMemoryIds = memoryIds;
    map[sessionId].lastInjectedHash = contentHash;
    map[sessionId].lastActiveAt = new Date().toISOString();
    await saveConversations(hermesDir, map);
  }
}

// ── Sync State ──────────────────────────────────────────────────

function syncStatePath(hermesDir: string, sessionId: string): string {
  return path.join(hermesDir, "sync", `${sessionId}.json`);
}

/** Load sync state for a session. */
export async function loadSyncState(hermesDir: string, sessionId: string): Promise<SyncState | null> {
  try {
    const raw = await fs.readFile(syncStatePath(hermesDir, sessionId), "utf-8");
    return JSON.parse(raw) as SyncState;
  } catch {
    return null;
  }
}

/** Save sync state for a session. */
export async function saveSyncState(hermesDir: string, state: SyncState): Promise<void> {
  const dir = path.join(hermesDir, "sync");
  await fs.mkdir(dir, { recursive: true });
  await atomicWriteFile(syncStatePath(hermesDir, state.sessionId), JSON.stringify(state, null, 2));
}
