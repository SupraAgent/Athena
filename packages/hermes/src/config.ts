import * as fs from "fs/promises";
import * as path from "path";
import * as YAML from "yaml";
import type { HermesConfig } from "./types";
import { DEFAULT_CONFIG } from "./types";

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
      sources: (parsed?.sources ?? []).map((s: Record<string, string>) => ({
        repo: s.repo ?? "",
        branch: s.branch ?? "main",
        path: s.path ?? ".athena/hermes/",
      })),
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

/** Save hermes.yaml config. Creates directory if needed. */
export async function saveConfig(hermesDir: string, config: HermesConfig): Promise<void> {
  await fs.mkdir(hermesDir, { recursive: true });
  const doc = {
    max_memories: config.maxMemories,
    auto_extract: config.autoExtract,
    context_limit: config.contextLimit,
    sources: config.sources.map((s) => ({
      repo: s.repo,
      branch: s.branch,
      path: s.path,
    })),
  };
  const content = `# Hermes Configuration\n${YAML.stringify(doc)}`;
  await fs.writeFile(path.join(hermesDir, "hermes.yaml"), content, "utf-8");
}
