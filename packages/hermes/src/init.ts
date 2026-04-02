/**
 * Hermes Init — one-command project setup.
 *
 * Creates the .athena/hermes/ directory structure, generates a default
 * hermes.yaml config, and registers Claude Code hooks in .claude/settings.json.
 *
 * Usage:
 *   npx @supra/hermes init
 *   npx @supra/hermes init --mode=full
 *   npx @supra/hermes init --no-hooks
 *   npx @supra/hermes init --force
 */

import * as fs from "fs/promises";
import * as path from "path";
import { findRepoRoot, getHermesDir, saveConfig } from "./config";
import { DEFAULT_CONFIG } from "./types";
import type { HermesMode } from "./types";

// ── Types ──────────────────────────────────────────────────────

export type InitOptions = {
  /** Initial mode (default: whisper). */
  mode?: HermesMode;
  /** Skip hook registration. */
  noHooks?: boolean;
  /** Overwrite existing config. */
  force?: boolean;
};

export type InitResult = {
  hermesDir: string;
  configCreated: boolean;
  hooksRegistered: boolean;
  gitignoreCreated: boolean;
  alreadyExists: boolean;
};

// ── Hook Registration ──────────────────────────────────────────

type HookEntry = {
  type: "command";
  command: string;
  timeout: number;
};

type HookGroup = {
  hooks: HookEntry[];
};

type ClaudeSettings = {
  hooks?: Record<string, HookGroup[]>;
  [key: string]: unknown;
};

/** Determine the best command prefix for invoking hermes. */
function resolveHermesCommand(projectRoot: string): string {
  // Check if hermes is available as a local workspace dep
  const localBin = path.join(projectRoot, "node_modules", ".bin", "hermes");
  try {
    // Use sync check since we're in init (not a hot path)
    const { accessSync } = require("fs") as typeof import("fs");
    accessSync(localBin);
    return "node_modules/.bin/hermes";
  } catch {
    // Fall back to npx for standalone installs
    return "npx @supra/hermes";
  }
}

const HOOK_DEFINITIONS: { event: string; command: string; timeout: number }[] = [
  { event: "SessionStart", command: "session-start", timeout: 10 },
  { event: "Stop", command: "stop", timeout: 15 },
  { event: "UserPromptSubmit", command: "user-prompt", timeout: 5 },
  { event: "PreToolUse", command: "pre-tool-use", timeout: 5 },
];

/** Register hermes hooks into .claude/settings.json, merging with existing hooks. */
export async function registerHooks(projectRoot: string): Promise<boolean> {
  const settingsDir = path.join(projectRoot, ".claude");
  const settingsPath = path.join(settingsDir, "settings.json");
  const commandPrefix = resolveHermesCommand(projectRoot);

  // Load existing settings or start fresh
  let settings: ClaudeSettings = {};
  try {
    const raw = await fs.readFile(settingsPath, "utf-8");
    settings = JSON.parse(raw);
  } catch {
    // File doesn't exist — will create
  }

  if (!settings.hooks) {
    settings.hooks = {};
  }

  let changed = false;

  for (const def of HOOK_DEFINITIONS) {
    const fullCommand = `${commandPrefix} ${def.command}`;
    const groups = settings.hooks[def.event] ?? [];

    // Check if a hermes hook already exists in any group
    const hasHermes = groups.some((g) =>
      g.hooks.some((h) => h.command.includes("hermes"))
    );

    if (!hasHermes) {
      // Add a new group with the hermes hook
      groups.push({
        hooks: [
          {
            type: "command",
            command: fullCommand,
            timeout: def.timeout,
          },
        ],
      });
      settings.hooks[def.event] = groups;
      changed = true;
    }
  }

  if (changed) {
    await fs.mkdir(settingsDir, { recursive: true });
    await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2) + "\n", "utf-8");
  }

  return changed;
}

// ── Gitignore ──────────────────────────────────────────────────

const HERMES_GITIGNORE = `# Hermes transient files (not committed)
sync/
conversations.json
embeddings.json
chroma/
cache/
*.tmp
logs/
`;

async function createHermesGitignore(hermesDir: string): Promise<boolean> {
  const gitignorePath = path.join(hermesDir, ".gitignore");
  try {
    await fs.access(gitignorePath);
    return false; // Already exists
  } catch {
    await fs.writeFile(gitignorePath, HERMES_GITIGNORE, "utf-8");
    return true;
  }
}

// ── Main Init ──────────────────────────────────────────────────

/** Initialize Hermes in the current project. */
export async function initHermes(options: InitOptions = {}): Promise<InitResult> {
  const projectRoot = findRepoRoot();
  const hermesDir = getHermesDir(projectRoot);

  // Check if already initialized
  let alreadyExists = false;
  try {
    await fs.access(path.join(hermesDir, "hermes.yaml"));
    alreadyExists = true;
    if (!options.force) {
      return {
        hermesDir,
        configCreated: false,
        hooksRegistered: false,
        gitignoreCreated: false,
        alreadyExists: true,
      };
    }
  } catch {
    // Not initialized yet — proceed
  }

  // Create directory structure
  await fs.mkdir(path.join(hermesDir, "memories"), { recursive: true });
  await fs.mkdir(path.join(hermesDir, "sessions"), { recursive: true });

  // Generate default config with user-specified mode
  const config = {
    ...DEFAULT_CONFIG,
    mode: options.mode ?? DEFAULT_CONFIG.mode,
  };
  await saveConfig(hermesDir, config);

  // Create .gitignore for transient files
  const gitignoreCreated = await createHermesGitignore(hermesDir);

  // Register hooks
  let hooksRegistered = false;
  if (!options.noHooks) {
    hooksRegistered = await registerHooks(projectRoot);
  }

  return {
    hermesDir,
    configCreated: true,
    hooksRegistered,
    gitignoreCreated,
    alreadyExists: alreadyExists && !!options.force,
  };
}

// ── CLI Handler ────────────────────────────────────────────────

/** Parse CLI args and run init. */
export async function handleInit(args: string[]): Promise<void> {
  const options: InitOptions = {};

  for (const arg of args) {
    if (arg.startsWith("--mode=")) {
      const mode = arg.split("=")[1];
      if (["whisper", "full", "off"].includes(mode)) {
        options.mode = mode as HermesMode;
      } else {
        console.error(`Invalid mode: ${mode}. Must be: whisper, full, or off`);
        process.exit(1);
      }
    } else if (arg === "--no-hooks") {
      options.noHooks = true;
    } else if (arg === "--force") {
      options.force = true;
    }
  }

  const result = await initHermes(options);

  if (result.alreadyExists && !result.configCreated) {
    console.log("Hermes is already initialized in this project.");
    console.log(`  Directory: ${result.hermesDir}`);
    console.log("\nUse --force to reinitialize.");
    return;
  }

  console.log("Hermes initialized successfully!\n");
  console.log(`  Directory:  ${result.hermesDir}`);
  console.log(`  Config:     ${result.hermesDir}/hermes.yaml`);
  console.log(`  Mode:       ${options.mode ?? "whisper"}`);
  console.log(`  Hooks:      ${result.hooksRegistered ? "registered in .claude/settings.json" : "skipped (--no-hooks)"}`);
  if (result.gitignoreCreated) {
    console.log(`  Gitignore:  created for transient files`);
  }

  console.log("\nNext steps:");
  console.log(`  hermes remember "Your first memory here"`);
  console.log(`  hermes status`);
  console.log(`  hermes search "keyword"`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log(`\n  Optional: export ANTHROPIC_API_KEY=... for LLM-powered extraction`);
  }
}
