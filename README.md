# Athena

The coordinating intelligence layer for the Supra ecosystem. Combines the SupraLoop improvement engine, a shared workflow builder, and cross-project coordination.

---

## How It Works

### SupraLoop (Improvement Engine)
```
1. TEAM       → 5 AI personas with weighted voting
2. APP        → Define what you're building
3. BENCHMARK  → Score 3 reference apps → auto-generate competitor CPO personas
4. SCORE      → CPOs rate your app honestly → gap analysis
5. IMPROVE    → Press the button. One change per round. Repeat until competitive.
```

### Builder (Workflow Automation)
Self-contained drag-and-drop workflow builder in `packages/builder/`.

---

## Setup

```bash
git clone https://github.com/SupraAgent/Athena.git
cd Athena
npm install
cp .env.example .env.local
# Add your Supabase keys to .env.local
npm run dev
```

---

## Stack

Next.js 15 · React 19 · TypeScript · Tailwind CSS 4 · Supabase · Anthropic API

---

## Architecture

- **Frontend:** Handles benchmarking, scoring, CPO generation, workflow building
- **AI:** User's Anthropic API key (stored in browser, never on server)
- **Data:** `.athena/` directory committed to user's GitHub repo
- **Builder:** `packages/builder/` — reusable across Supra apps
- **No vendor lock-in:** Config, scores, CPOs, and round logs are all in your repo

---

## Legacy

The old automation-builder code is preserved on the `legacy/automation-builder` branch. See `FORK_ME.md` for the complete fork checklist.
