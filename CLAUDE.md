# Athena — Agent Instructions

You are operating within **Athena**, the coordinating intelligence layer for the Supra ecosystem. Athena combines the SupraLoop improvement engine with a shared workflow builder and cross-project coordination.

## What Athena Does

### SupraLoop (Improvement Engine)
A 5-step loop that makes any app competitive with industry leaders:

1. **TEAM** — 5 AI personas (Product, Eng, Design, Growth, QA) with weighted voting
2. **APP** — Define what you're building (name, stack, users, state)
3. **BENCHMARK** — Score 3 reference apps on real features → auto-generate CPO personas per competitor
4. **CPO REVIEW** — Each CPO rates your app honestly → gap analysis with priorities
5. **IMPROVE** — Press the button → team picks highest-impact change → CPOs react → re-score → repeat until gap < 10

### Builder (Workflow Automation)
A self-contained drag-and-drop workflow builder in `packages/builder/`. Used across multiple Supra apps.

### Hermes (Session Memory)
`packages/hermes/` (`@supra/hermes`) — persistent memory across Claude Code sessions. Uses `.athena/hermes/` for file-based storage (memories, sessions, config). Integrates via Claude Code hooks (SessionStart, Stop).

## Architecture

- **Frontend:** Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS 4, Framer Motion
- **Auth:** Supabase (GitHub OAuth)
- **AI:** Anthropic API (user provides their own key, stored in localStorage)
- **Data:** `.athena/` directory committed to user's GitHub repo (config, scores, CPOs, round logs)
- **Builder:** `packages/builder/` — self-contained workflow builder package
- **No vendor lock-in:** All data lives in the user's repo

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/improvement.ts` | Types, scoring constants, CPO generation, gap analysis, round simulation |
| `src/lib/llm-client.ts` | Anthropic API + Ollama client abstraction |
| `src/components/improvement-wizard/` | The 5-step wizard (team, app, benchmark, self-score, improve) |
| `src/components/shell/` | Layout shell and sidebar |
| `src/lib/supabase/` | Auth and session management |
| `packages/builder/` | Self-contained workflow builder (ReactFlow-based) |
| `packages/hermes/` | Session memory & context relay (Claude Code hooks) |

## Tech Stack

```
Next.js 15 + React 19 + TypeScript
Tailwind CSS 4 + Framer Motion
Supabase (auth only)
Anthropic API (user's key)
GitHub API / Octokit (repo integration)
```

## Workflow Rules

### Before Starting Work
- **Plan first.** For any task touching 3+ files, use `/project:plan` or enter plan mode before writing code.
- **Read before editing.** Never modify a file you haven't read in this session.

### Before Committing
- Run `npx tsc --noEmit` — no type errors allowed.
- Run `npm run lint` — no lint warnings in changed files.
- Run `npm run build` — all packages must build cleanly.
- Run tests in changed packages: `npm run -w @supra/hermes test` and/or `npm run -w @supra/builder test`.
- Or just run `/project:check` which does all of the above.

### Cross-Package Rules
- After changing `packages/builder/` types or exports, verify the main app still imports correctly.
- After changing `packages/hermes/`, rebuild (`npm run -w @supra/hermes build`) before testing hooks.
- Never modify `packages/builder/` public API without updating `packages/builder/INTEGRATION.md`.

### Commit Style
- One logical change per commit. Don't bundle unrelated fixes.
- Use conventional commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`.
- Audit fixes should be done in a single pass, not iterated across multiple commits.

## Custom Commands

| Command | Purpose |
|---------|---------|
| `/project:check` | Full quality gate — types, lint, build, tests |
| `/project:audit` | P0-P3 prioritized codebase audit |
| `/project:plan` | Structured implementation planning |
| `/project:improve-round` | Run one SupraLoop improvement cycle |

## Legacy
- Old automation-builder code is preserved on the `legacy/automation-builder` branch
- See `FORK_ME.md` for the complete fork checklist (based on lessons from SupraLoop → Athena)
