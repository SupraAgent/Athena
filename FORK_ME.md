# Fork Guide — Lessons from SupraLoop → Athena

A checklist and reference for forking any Supra repo into a new project. Based on every issue found across 3 audit rounds during the SupraLoop → Athena migration.

---

## Pre-Fork Checklist

- [ ] Decide the canonical data directory name upfront (e.g. `.athena/`, `.hermes/`). Every file that reads, writes, or validates paths must use the same name.
- [ ] Identify nested projects that should NOT be copied (e.g. `SupraOS/`, `supracrm/`, `Persona Builder/`). Exclude them before copying.
- [ ] Preserve old code on a `legacy/*` branch before replacing content.
- [ ] Update the GitHub remote URL immediately after creating the new repo.

---

## Runtime-Critical (P0)

These will crash or silently break the app if missed.

### 1. API Route Path Validation

Any API route that enforces a directory prefix (path traversal protection) must match the new data directory.

**File:** `src/app/api/github/commit/route.ts`
```
// OLD: !normalized.startsWith(".supraloop/")
// NEW: !normalized.startsWith(".athena/")
```

**Why it breaks:** The config generator produces `.athena/` paths but the commit route rejects anything not starting with `.supraloop/`. Every commit from the improvement wizard returns 400.

### 2. Config Generator Output Paths

The file that generates YAML configs must produce paths matching the new directory.

**File:** `src/lib/athena-config.ts` (was `supraloop-config.ts`)

All `path:` values in `generateAthenaFiles()` must use the new prefix:
- `.athena/config.yaml`
- `.athena/benchmarks.yaml`
- `.athena/scores.yaml`
- `.athena/rounds/round-NNN.yaml`
- `.athena/cpos/{slug}.yaml`

### 3. Health Check Route

If the health endpoint queries a database table, make sure that table exists in the new project's migrations.

**File:** `src/app/api/health/route.ts`

The old CRM health check queried `pipeline_stages` — a table that doesn't exist in SupraLoop/Athena. Changed to `personas`.

### 4. Dead API Routes

Delete API routes that reference tables, services, or features that don't exist in the fork:
- `src/app/api/ai-agent/` (agent config, conversations, respond)
- `src/app/api/analytics/`
- `src/app/api/agents/*/tokens/`
- Any route importing from deleted libraries

---

## Data & Storage (P1)

### 5. localStorage Key Prefix

Every `localStorage.getItem()` / `setItem()` call uses a prefix. Search and replace all of them.

| Old Key | New Key |
|---------|---------|
| `supraloop_draft` | `athena_draft` |
| `supraloop_step` | `athena_step` |
| `supraloop_anthropic_key` | `athena_anthropic_key` |
| `supraloop_selected_repo` | `athena_selected_repo` |
| `supracrm:theme:v1` | `athena:theme:v1` |
| `supracrm:welcome-seen` | `athena:welcome-seen` |

**How to find them all:**
```bash
grep -rn "localStorage\.\(get\|set\|remove\)Item" src/
```

### 6. Builder Storage Prefix

The `packages/builder/` package uses a `storageKeyPrefix` prop. Update it where the builder is mounted.

**File:** `src/app/builder/page.tsx`
```
// OLD: storageKeyPrefix="supraloop"
// NEW: storageKeyPrefix="athena"
```

**Note:** The builder package itself has 50+ internal "supraloop" defaults. These are overridden by the `storageKeyPrefix` prop and `configureBuilder()` call — you do NOT need to edit inside `packages/builder/` unless you're publishing it standalone.

---

## Branding & UI (P2)

### 7. Global Text Replacement

Search for the old project name in all UI-facing files. Common locations:

| File | What to change |
|------|---------------|
| `src/app/layout.tsx` | `<title>` and metadata |
| `src/app/builder/layout.tsx` | `<title>` |
| `src/app/login/page.tsx` | Welcome text |
| `src/app/settings/page.tsx` | Description text |
| `src/components/shell/sidebar.tsx` | Logo/brand text |
| `src/components/shell/mobile-header.tsx` | Logo/brand text |
| `src/components/onboarding/setup-checklist.tsx` | Welcome modal text |
| `src/app/api/ai-chat/route.ts` | System prompts |
| `src/app/api/flow-chat/route.ts` | System prompts |

### 8. Repos Page Directory Tree

The repos page shows a visual directory tree of what gets committed. Update it to match the actual output of the config generator.

**File:** `src/app/repos/page.tsx`

The tree must show the real files: `config.yaml`, `benchmarks.yaml`, `scores.yaml`, `rounds/`, `cpos/` — not placeholder names like `config.json` or `benchmarks/`.

### 9. File Renames

Rename files that carry the old project name:
- `src/lib/supraloop-config.ts` → `src/lib/athena-config.ts`
- Update all imports: `grep -rn "supraloop-config" src/`

### 10. Commit Message Templates

The config generator produces git commit messages. Update the prefixes:
```
// OLD: chore(supraloop): initialise .supraloop/
// NEW: chore(athena): initialise .athena/
```

---

## Infrastructure (P2)

### 11. package.json

- Update `"name"` field
- Remove stale metadata blocks from old projects (e.g. `automationBuilder` config)
- Keep workspace dependency `"@supra/builder": "*"` if using the builder

### 12. GitHub Actions

Delete or update any workflow files that:
- Watch paths that don't exist in the new repo
- Target the old repo name in push/sync actions
- Require secrets that aren't configured in the new repo

**Deleted:** `.github/workflows/sync-to-builder.yml`

### 13. Claude Code Settings

**File:** `.claude/settings.local.json`

Remove hardcoded paths, rsync commands, and `--dangerously-skip-permissions` entries from the old project. Replace with safe, minimal permissions.

### 14. tsconfig.json

Remove `exclude` entries for nested projects that weren't copied (e.g. `SupraOS`, `supracrm`).

### 15. package-lock.json

If `package-lock.json` references the old repo path (e.g. `../Supra-Automation-Builder`), delete it and regenerate:
```bash
rm package-lock.json
npm install
```

---

## Documentation (P3)

### 16. CLAUDE.md

Update:
- Project description and name
- Data directory path (`.supraloop/` → `.athena/`)
- Key files table
- Remove references to files that don't exist (e.g. `FORK_ME.md` if not created yet)

### 17. README.md

Update:
- Title, description, clone URL
- Architecture section (data directory)
- Remove references to nonexistent docs

### 18. Stale Research/Docs

These files reference the old project name but are historical records. They do NOT need updating — they describe the state at the time they were written:
- `PLAN.md`
- `MOBILE_UX_REVIEW.md`
- `docs/MOBILE_UX_CPO_REVIEW.md`
- `docs/automation-builder.md`
- `research/*.md`

---

## Delete Checklist

Libraries and directories to remove if the fork doesn't use them:

- [ ] `src/lib/email/` (10 files — only needed if the app has email integration)
- [ ] `src/app/api/ai-agent/` (old agent system)
- [ ] `src/app/api/analytics/` (old analytics)
- [ ] `.supraloop/cpo-reviews/` (old review data)
- [ ] Any GitHub Actions that sync to the old repo

---

## Verification

After completing all changes, run these checks:

```bash
# 1. No remaining old-name references in runtime code
grep -rn "supraloop" src/ --include="*.ts" --include="*.tsx"

# 2. No broken imports
npx tsc --noEmit

# 3. No stale localStorage keys
grep -rn "localStorage" src/ | grep -i "oldname"

# 4. Config generator paths match commit route validation
# Compare: generateAthenaFiles() output paths vs commit route startsWith() check

# 5. Dev server starts
npm run dev
```

---

## Common Mistakes

1. **Using `replace_all` too aggressively** — Replacing "supraloop" globally in a file can change directory paths, function names, and comments all at once. Review each file individually.

2. **Forgetting the commit route** — The config generator and commit route are in different files. Changing one without the other creates a silent 400 error on every commit.

3. **Not checking the builder package** — `packages/builder/` has its own hardcoded defaults. They're overridden at mount time via props, but if you forget to pass the new prefix, the builder writes to old localStorage keys.

4. **Leaving ghost references in docs** — CLAUDE.md referencing a nonexistent `FORK_ME.md` or a `.supraloop/` directory that was renamed to `.athena/` creates confusion for both humans and AI agents.

5. **Not preserving the old branch** — Always create a `legacy/*` branch before replacing content. You'll need it to cherry-pick features or reference old implementations.
