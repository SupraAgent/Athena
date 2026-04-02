import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { initHermes, registerHooks } from "../init";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-init-test-"));
  // Create .athena structure so getHermesDir resolves correctly
  await fs.mkdir(path.join(tmpDir, ".athena", "hermes"), { recursive: true });
  // Mock findRepoRoot to return tmpDir
  vi.mock("../config", async (importOriginal) => {
    const actual = (await importOriginal()) as Record<string, unknown>;
    return {
      ...actual,
      findRepoRoot: () => tmpDir,
    };
  });
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("initHermes", () => {
  it("creates directory structure and config", async () => {
    const result = await initHermes({ noHooks: true });

    expect(result.configCreated).toBe(true);
    expect(result.alreadyExists).toBe(false);

    // Check directories were created
    const memoriesDir = path.join(result.hermesDir, "memories");
    const sessionsDir = path.join(result.hermesDir, "sessions");
    await expect(fs.access(memoriesDir)).resolves.toBeUndefined();
    await expect(fs.access(sessionsDir)).resolves.toBeUndefined();

    // Check config was created
    const configPath = path.join(result.hermesDir, "hermes.yaml");
    const config = await fs.readFile(configPath, "utf-8");
    expect(config).toContain("max_memories: 200");
    expect(config).toContain("mode: whisper");
  });

  it("creates .gitignore for transient files", async () => {
    const result = await initHermes({ noHooks: true });

    expect(result.gitignoreCreated).toBe(true);
    const gitignore = await fs.readFile(
      path.join(result.hermesDir, ".gitignore"),
      "utf-8"
    );
    expect(gitignore).toContain("embeddings.json");
    expect(gitignore).toContain("conversations.json");
    expect(gitignore).toContain("sync/");
    expect(gitignore).toContain("logs/");
  });

  it("respects --mode flag", async () => {
    const result = await initHermes({ mode: "full", noHooks: true });

    expect(result.configCreated).toBe(true);
    const config = await fs.readFile(
      path.join(result.hermesDir, "hermes.yaml"),
      "utf-8"
    );
    expect(config).toContain("mode: full");
  });

  it("refuses to reinitialize without --force", async () => {
    // First init
    await initHermes({ noHooks: true });

    // Second init without force
    const result = await initHermes({ noHooks: true });
    expect(result.alreadyExists).toBe(true);
    expect(result.configCreated).toBe(false);
  });

  it("reinitializes with --force", async () => {
    await initHermes({ noHooks: true });

    const result = await initHermes({ force: true, noHooks: true });
    expect(result.configCreated).toBe(true);
  });

  it("does not create .gitignore if it already exists", async () => {
    await initHermes({ noHooks: true });

    // Second init with force
    const result = await initHermes({ force: true, noHooks: true });
    expect(result.gitignoreCreated).toBe(false);
  });
});

describe("registerHooks", () => {
  it("creates .claude/settings.json with hooks when none exists", async () => {
    const changed = await registerHooks(tmpDir);

    expect(changed).toBe(true);
    const settingsPath = path.join(tmpDir, ".claude", "settings.json");
    const raw = await fs.readFile(settingsPath, "utf-8");
    const settings = JSON.parse(raw);

    expect(settings.hooks.SessionStart).toBeDefined();
    expect(settings.hooks.Stop).toBeDefined();
    expect(settings.hooks.UserPromptSubmit).toBeDefined();
    expect(settings.hooks.PreToolUse).toBeDefined();

    // Check hook format
    const sessionStartHook = settings.hooks.SessionStart[0].hooks[0];
    expect(sessionStartHook.type).toBe("command");
    expect(sessionStartHook.command).toContain("hermes");
    expect(sessionStartHook.command).toContain("session-start");
    expect(sessionStartHook.timeout).toBe(10);
  });

  it("merges with existing hooks without duplicating", async () => {
    // Create existing settings with a non-hermes hook
    const settingsDir = path.join(tmpDir, ".claude");
    await fs.mkdir(settingsDir, { recursive: true });
    await fs.writeFile(
      path.join(settingsDir, "settings.json"),
      JSON.stringify({
        hooks: {
          SessionStart: [
            { hooks: [{ type: "command", command: "echo hello", timeout: 5 }] },
          ],
        },
        someOtherSetting: true,
      }),
      "utf-8"
    );

    await registerHooks(tmpDir);
    const settings = JSON.parse(
      await fs.readFile(path.join(settingsDir, "settings.json"), "utf-8")
    );

    // Existing hook preserved
    expect(settings.hooks.SessionStart.length).toBe(2);
    expect(settings.hooks.SessionStart[0].hooks[0].command).toBe("echo hello");

    // Hermes hook added
    expect(settings.hooks.SessionStart[1].hooks[0].command).toContain("hermes");

    // Other settings preserved
    expect(settings.someOtherSetting).toBe(true);
  });

  it("does not duplicate hermes hooks on repeated calls", async () => {
    await registerHooks(tmpDir);
    const changed = await registerHooks(tmpDir);

    expect(changed).toBe(false);

    const settings = JSON.parse(
      await fs.readFile(
        path.join(tmpDir, ".claude", "settings.json"),
        "utf-8"
      )
    );

    // Each event should only have one hook group
    expect(settings.hooks.SessionStart.length).toBe(1);
    expect(settings.hooks.Stop.length).toBe(1);
  });
});
