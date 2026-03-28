# SupraLoop — Focus & Feature Improvement Plan

## Overview

Narrow each wizard step to its essential purpose and add high-impact features that reduce friction and increase user agency. Changes are ordered by step, with cross-cutting improvements at the end.

---

## Step 1: TEAM — Compact by default, customizable on demand

### Current problem
5 expandable cards × 6 fields each = 30 inputs. Most users skip customization entirely but still face the wall of accordions.

### Changes

**1a. Compact roster view (default)**
- File: `src/components/improvement-wizard/step-team.tsx`
- Replace the accordion card layout with a compact table/roster showing: emoji, name, role, vote weight
- Add a single "Customize Team" toggle button that reveals the full editor
- Default state: collapsed roster, no accordions open

**1b. Team presets**
- File: `src/components/improvement-wizard/step-team.tsx`
- File: `src/lib/improvement.ts`
- Add 3 preset team configurations:
  - **Balanced** (current default)
  - **Design-led** (Design weight 1.3, Product 1.0, others 0.8)
  - **Eng-heavy** (Eng weight 1.3, QA 1.1, Product 1.0, others 0.8)
- Show as 3 radio buttons above the roster
- Selecting a preset updates vote weights and persona personalities accordingly

**1c. Remove low-value fields**
- File: `src/components/improvement-wizard/step-team.tsx`
- Remove "Modeled After" field (unclear purpose, rarely useful)
- Remove "Reviews" tag input (duplicates Expertise conceptually)
- Keep: Name, Role, Expertise, Personality, Vote Weight

---

## Step 2: APP — Add strategic signal

### Current problem
5 generic text fields don't capture what matters most to the user. No signal about priorities or competitive context.

### Changes

**2a. Add "Primary Metric" selector**
- File: `src/components/improvement-wizard/step-app.tsx`
- File: `src/lib/improvement.ts` (update `AppBrief` type)
- Add a 4-option toggle: Retention | Conversion | Engagement | Revenue
- This feeds into Step 5 to prioritize improvements aligned with the user's north star metric

**2b. Add "Top Competitors" field**
- File: `src/components/improvement-wizard/step-app.tsx`
- File: `src/lib/improvement.ts` (update `AppBrief` type)
- Add a TagInput for competitor names (1-5 tags)
- Pre-populates Step 3's reference app name fields, creating narrative flow

**2c. Convert Tech Stack to TagInput**
- File: `src/components/improvement-wizard/step-app.tsx`
- Replace free text input with TagInput component (already available in ui/)
- Better structured data for AI prompts

**2d. Add description guidance**
- File: `src/components/improvement-wizard/step-app.tsx`
- Add placeholder text: "What does your app do, who is it for, and what problem does it solve? (2-3 sentences)"
- Helps users calibrate appropriate detail level

---

## Step 3: BENCHMARK — Reduce scoring burden by 80%

### Current problem
40 number inputs per app × 3 apps = 120 data points. Users guess or score uniformly. Sub-criteria have no definitions.

### Changes

**3a. Category-level scoring (8 inputs per app, not 40)**
- File: `src/components/improvement-wizard/scoring-grid.tsx`
- File: `src/components/improvement-wizard/step-benchmark.tsx`
- Add a `compact` prop to ScoringGrid
- In compact mode: show only 8 category-level sliders (0-100), hide sub-criteria
- Sub-criteria scores are auto-distributed from the category score (even spread with small variance)
- Users can still expand a category to override individual sub-criteria if they want precision
- Add helper function `expandCategoryScore(categoryScore: number): SubCriterion[]` to `improvement.ts`

**3b. Scoring tooltips**
- File: `src/components/improvement-wizard/scoring-grid.tsx`
- Add hover tooltips on each category name explaining what it measures
- Tooltip content: one-line description stored in SCORING_CATEGORIES (add `description` field)
- Example: "Core Features — Does the app cover all expected use cases with depth and reliability?"

**3c. Flexible reference app count (1-5)**
- File: `src/components/improvement-wizard/step-benchmark.tsx`
- File: `src/components/improvement-wizard/improvement-shell.tsx` (update validation)
- Replace hardcoded 3-slot array with dynamic list
- Add "+" button to add reference app (max 5)
- Add "×" button to remove (min 1)
- Update `canProceed` validation: at least 1 reference app with name + scores

**3d. Pre-populate from Step 2 competitors**
- File: `src/components/improvement-wizard/step-benchmark.tsx`
- If `draft.app.competitors` has entries, auto-fill reference app name fields
- User can still edit/add/remove

---

## Step 4: SELF-SCORE — Show context, reduce inputs

### Current problem
Users score their app on 40 criteria with no visibility into how reference apps scored. No anchor for decisions.

### Changes

**4a. Category-level scoring (same compact mode as Step 3)**
- File: `src/components/improvement-wizard/step-self-score.tsx`
- Use ScoringGrid with `compact` prop (from 3a)
- 8 category inputs instead of 40

**4b. Reference context during scoring**
- File: `src/components/improvement-wizard/scoring-grid.tsx`
- Add optional `referenceScores` prop to ScoringGrid
- When provided, show a small "Best ref: 85" label next to each category input
- Gives users an anchor for calibrating their scores

**4c. Live gap preview**
- File: `src/components/improvement-wizard/step-self-score.tsx`
- As user scores each category, show inline gap badge (e.g., "-23" in orange)
- Computed live from `score - bestRefScore` per category
- Replaces the need to scroll down to the gap table to understand impact

**4d. Configurable category weights**
- File: `src/components/improvement-wizard/step-self-score.tsx`
- File: `src/lib/improvement.ts`
- Add a "Customize Weights" expandable section at the top of Step 4
- Shows 8 sliders (one per category) that must sum to 1.0
- Auto-normalizes when user adjusts
- Defaults to current weights but can be overridden (e.g., design-heavy app weights UI/UX at 0.25)

---

## Step 5: IMPROVE — Give users agency

### Current problem
User presses a button and watches. No control over what gets improved, no ability to approve/reject, CPO reactions feel templated.

### Changes

**5a. Category selection before each round**
- File: `src/components/improvement-wizard/step-improve.tsx`
- Before running a round, show the top 3 gaps as clickable cards
- AI suggests the highest-gap category (highlighted with "Recommended" badge)
- User clicks to select which gap to address, then presses "Run Round"
- Update `simulateRound` and `runRound` to accept an optional `targetCategory` parameter

**5b. Approve/reject proposals**
- File: `src/components/improvement-wizard/step-improve.tsx`
- After AI/simulation generates a proposal, show it in a pending state:
  - Decision text, implementation steps, proposed score impact
  - Two buttons: "Accept & Apply" or "Try Another"
  - "Try Another" re-runs the round for same category with different suggestion
- This turns the loop from passive watching to active decision-making

**5c. Collapsible round cards**
- File: `src/components/improvement-wizard/step-improve.tsx`
- Default rounds to collapsed: show only "Round N: +X [Category]" one-liner
- Click to expand full details (decision, steps, votes, CPO reactions)
- Most recent round starts expanded

**5d. Prominent GitHub save**
- File: `src/components/improvement-wizard/step-improve.tsx`
- Move "Save to GitHub" section above the round log
- Show as a sticky/prominent card when rounds > 0
- Add "last saved at round N" indicator

**5e. Configurable round limits and termination**
- File: `src/components/improvement-wizard/step-improve.tsx`
- File: `src/lib/improvement.ts`
- Add settings at top of Step 5:
  - Max rounds slider (5-50, default 20)
  - Gap threshold slider (1-25, default 10)
- Update termination logic to use these values instead of hardcoded 20/10

---

## Cross-Cutting: Wizard Shell Improvements

**6a. Step descriptions in nav**
- File: `src/components/improvement-wizard/improvement-shell.tsx`
- Update STEPS constant to include subtitle:
  - "Team" → "Team — Define your AI panel"
  - "App" → "App — Describe what you're building"
  - "Benchmark" → "Benchmark — Score the competition"
  - "Self-Score" → "Self-Score — Rate your own app"
  - "Improve" → "Improve — Close the gap"
- Show subtitle below step name in the progress bar (smaller text, muted color)

**6b. Auto-save draft to localStorage**
- File: `src/components/improvement-wizard/improvement-shell.tsx`
- Save `draft` to `localStorage` on every `patchDraft` call (debounced 1s)
- On mount, restore from localStorage if present
- Add "Clear saved progress" button in header
- Key: `supraloop_draft`

**6c. Back-navigation preserves data**
- File: `src/components/improvement-wizard/improvement-shell.tsx`
- Currently clicking back works but downstream data (persona scores, gap analysis, rounds) may become stale
- Add a `stale` flag: when user changes Step 2/3 data after visiting Step 4/5, show a yellow banner: "Benchmark data changed — recalculate scores?"
- Auto-recalculate on confirmation

---

## Phase 10: Visual Automation Builder (React Flow)

### Concept
Give users an optional drag-and-drop canvas for visually composing their team, workflow, or project pipeline — instead of filling out forms step-by-step. This is an alternative entry point to the wizard, not a replacement.

### Library: [React Flow](https://reactflow.dev) (`@xyflow/react`)
- **License:** MIT
- **Why:** Most popular node-based UI library for React (25k+ GitHub stars), built-in drag-and-drop, dark mode support, works with React 19 / Next.js 15, Zustand-based state, lightweight
- **Package:** `@xyflow/react`

### Changes

**10a. Install React Flow**
- `npm install @xyflow/react`
- Add React Flow CSS import to layout or the builder component

**10b. Create visual builder component**
- New file: `src/components/visual-builder/flow-canvas.tsx`
- A full-screen canvas with a sidebar of draggable node types:
  - **Persona Node** — drag to add a team member, click to edit name/role/weight
  - **App Node** — central node representing the user's app (name, description, metric)
  - **Competitor Node** — drag to add reference apps, click to set name and scores
  - **Category Node** — scoring categories that connect personas to apps
- Edges represent relationships: "Persona → reviews → Category", "App → competes with → Competitor"
- Node data maps directly to `ImprovementDraft` types (TeamMember, AppBrief, ReferenceApp)

**10c. Custom node types**
- New file: `src/components/visual-builder/nodes/persona-node.tsx`
  - Shows avatar emoji, name, role, vote weight
  - Click to open inline edit popover (same fields as compact team editor)
  - Color-coded by role (product=blue, eng=green, design=purple, growth=orange, qa=red)
- New file: `src/components/visual-builder/nodes/app-node.tsx`
  - Central hub node, larger than others
  - Shows app name, state badge (MVP/Beta/Production), primary metric
  - Click to edit app brief fields
- New file: `src/components/visual-builder/nodes/competitor-node.tsx`
  - Shows competitor name, overall score, CPO name (if generated)
  - Click to open scoring panel (compact category-level scores from Phase 3)
  - Auto-generates CPO when scores are entered
- New file: `src/components/visual-builder/nodes/category-node.tsx`
  - Small node showing category name, weight, current score
  - Connecting a persona to a category marks that persona as domain expert

**10d. Sidebar panel with draggable node palette**
- New file: `src/components/visual-builder/node-palette.tsx`
- Left sidebar with draggable items: "Add Persona", "Add Competitor", "Add Category"
- Uses React Flow's `onDrop` + `screenToFlowPosition` for placement
- Includes preset layouts: "Quick Start" (pre-wired 5 personas + app + 3 competitors)

**10e. Bidirectional sync with wizard**
- File: `src/components/improvement-wizard/improvement-shell.tsx`
- New file: `src/components/visual-builder/use-flow-draft-sync.ts`
- Add a toggle at the top of the wizard: "Form View" | "Canvas View"
- When switching views, the underlying `ImprovementDraft` stays in sync:
  - Canvas nodes → draft fields (on node edit/add/remove)
  - Draft fields → canvas nodes (when switching from form to canvas)
- Both views are valid entry points to the same data

**10f. Flow-to-draft converter**
- New file: `src/components/visual-builder/flow-to-draft.ts`
- `flowToDraft(nodes, edges): ImprovementDraft` — converts canvas state to draft
- `draftToFlow(draft): { nodes, edges }` — converts draft to canvas state
- Handles edge cases: missing connections, duplicate personas, orphan nodes

**10g. Canvas-specific features**
- **Auto-layout**: Button to auto-arrange nodes using ELKjs (dagre layout)
- **Minimap**: React Flow's built-in minimap for large canvases
- **Export**: Save canvas layout as JSON alongside `.supraloop/` config
- **Connection validation**: Only allow valid edges (persona→category, app→competitor)

### UX Flow

1. User lands on wizard, sees "Form View | Canvas View" toggle
2. **Canvas View**: Blank canvas with node palette sidebar
3. Drag "App" node to center → click to fill in app details
4. Drag 3-5 "Persona" nodes → they auto-connect to the app
5. Drag "Competitor" nodes → click each to score → CPO auto-generates
6. Visual gap analysis appears as edge colors (red=critical gap, green=low gap)
7. Click "Start Improvement Loop" → switches to Step 5 (Improve) with all data populated
8. At any point, toggle to "Form View" to see/edit the same data in traditional form layout

### Why this matters
- **Visual thinkers** prefer spatial layouts over sequential forms
- **Faster onboarding**: dragging 5 nodes is faster than filling 5 forms
- **Better mental model**: seeing personas connected to categories makes the scoring system intuitive
- **Differentiation**: no competitor benchmarking tool offers a visual builder

---

## Implementation Order

| Phase | Changes | Files Modified |
|-------|---------|----------------|
| **Phase 1** | 1a, 1b, 1c (Team cleanup) | step-team.tsx, improvement.ts |
| **Phase 2** | 2a, 2b, 2c, 2d (App strategic fields) | step-app.tsx, improvement.ts |
| **Phase 3** | 3a, 3b (Compact scoring + tooltips) | scoring-grid.tsx, improvement.ts |
| **Phase 4** | 3c, 3d (Flexible ref apps + pre-populate) | step-benchmark.tsx, improvement-shell.tsx |
| **Phase 5** | 4a, 4b, 4c (Self-score context) | step-self-score.tsx, scoring-grid.tsx |
| **Phase 6** | 4d (Configurable weights) | step-self-score.tsx, improvement.ts |
| **Phase 7** | 5a, 5b (User agency in improve loop) | step-improve.tsx, improvement.ts |
| **Phase 8** | 5c, 5d, 5e (Improve UX polish) | step-improve.tsx, improvement.ts |
| **Phase 9** | 6a, 6b, 6c (Shell improvements) | improvement-shell.tsx |
| **Phase 10** | 10a-10d (Visual builder foundation) | NEW: flow-canvas.tsx, node types, node-palette.tsx |
| **Phase 11** | 10e-10g (Builder integration + sync) | improvement-shell.tsx, NEW: use-flow-draft-sync.ts, flow-to-draft.ts |

Each phase is independently shippable. Phases 1-3 are highest impact (reduce input burden, add presets). Phases 4-6 add polish. Phases 7-9 transform the improve loop. Phases 10-11 add the visual builder as an alternative entry point (depends on Phases 1-6 being complete for node editors to reuse compact scoring components).

---

## Shipped: Visual Builder + AI Chatbot + Templates (Phases 10-11)

### What was built

**Flow Builder Infrastructure:**
- `@xyflow/react` installed (MIT licensed)
- 5 custom node types: PersonaNode, AppNode, CompetitorNode, ActionNode, NoteNode
- FlowCanvas component with drag-and-drop from palette, edge creation, minimap, controls
- Dark theme styling consistent with existing UI

**Built-in Templates (8 total):**
- Team: Balanced, Design-Led, Eng-Heavy (3 presets with different vote weights)
- App: SaaS Product, Mobile-First App (2 app structure templates)
- Benchmark: 3-Way Competitive Analysis
- Scoring: Full Scoring Pipeline (self-score → persona → consensus → gaps)
- Improve: Sprint Improvement Cycle (select → propose → review → apply → commit loop)

**Template Management:**
- Browse templates by category (team/app/benchmark/scoring/improve/custom)
- Save current canvas as custom template (persisted to localStorage)
- Delete custom templates
- Built-in templates marked with badge, cannot be deleted

**AI Flow Assistant (Chatbot):**
- Floating chat bubble on canvas view
- Sends current canvas context + user message to `/api/flow-chat`
- AI generates flow-json blocks that can be applied to canvas with one click
- AI can also save templates on user request
- Powered by Claude Sonnet via user's Anthropic API key

**Wizard Integration:**
- Form View / Canvas View toggle in improvement shell header
- Each wizard step maps to a flow template category
- Step subtitles shown in progress bar for active step
- Canvas view shows full-height React Flow canvas with palette + template browser

### Files created
| File | Purpose |
|------|---------|
| `src/lib/flow-templates.ts` | Template types, built-in presets, localStorage CRUD |
| `src/components/visual-builder/flow-canvas.tsx` | Main React Flow canvas with drag-and-drop |
| `src/components/visual-builder/node-palette.tsx` | Draggable node type sidebar |
| `src/components/visual-builder/template-manager.tsx` | Browse/save/delete templates modal |
| `src/components/visual-builder/ai-flow-chat.tsx` | AI chatbot for building flows |
| `src/components/visual-builder/nodes/persona-node.tsx` | Persona team member node |
| `src/components/visual-builder/nodes/app-node.tsx` | App definition node |
| `src/components/visual-builder/nodes/competitor-node.tsx` | Competitor reference node |
| `src/components/visual-builder/nodes/action-node.tsx` | Workflow action step node |
| `src/components/visual-builder/nodes/note-node.tsx` | Annotation note node |
| `src/app/api/flow-chat/route.ts` | AI chatbot API endpoint |

### Files modified
| File | Change |
|------|--------|
| `src/components/improvement-wizard/improvement-shell.tsx` | Added view toggle, canvas view, step subtitles |
| `src/app/layout.tsx` | Switched to system font stack (removed Google Fonts network dependency) |
| `package.json` | Added `@xyflow/react` dependency |
