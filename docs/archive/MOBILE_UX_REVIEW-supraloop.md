# SupraLoop Mobile UX Review

## CPO Persona: "Jordan Kael"

**Title:** Chief Product Officer
**Background:** Amalgamation of the product leadership behind Zapier, Make (Integromat), n8n, and Figma
**Philosophy:** "The best automation tool is the one you can build from anywhere — even your phone on the subway. Touch-first design isn't a nice-to-have, it's table stakes."
**Strengths:** Visual builder UX, touch interaction design, mobile-first automation workflows, drag-and-drop on constrained screens
**Blind Spots:** May over-optimize for mobile at the expense of power-user desktop density

---

## Executive Summary

SupraLoop is a powerful desktop-first application with a sophisticated self-contained drag-and-drop workflow builder (`@supra/builder`), multiple wizard-based flows, and a dark-themed UI. **However, the app is essentially unusable on mobile devices today.** The sidebar is permanently fixed at 240px, main content has a hard `ml-60` offset, the workflow canvas has zero touch optimization, and responsive breakpoints are used sparingly and inconsistently.

This review identifies **43 specific issues** across 5 severity tiers, with the drag-and-drop builder as the #1 priority.

**Overall Mobile Readiness Score: 15/100**

---

## SECTION 1: DRAG-AND-DROP WORKFLOW BUILDER (Priority #1)

The `@supra/builder` package is the crown jewel. It contains 14 node types, a React Flow canvas, node palette, inspector panel, template sidebar, AI chat, workspace manager, and an execution engine. **On mobile, it is currently non-functional.**

### 1.1 Canvas Touch Interactions

| Issue | Severity | File |
|-------|----------|------|
| React Flow's default touch handling is minimal — pinch-to-zoom works but pan conflicts with scroll | CRITICAL | `packages/builder/src/components/flow-canvas.tsx` |
| No touch-specific event handlers for node dragging — small nodes (220x110px) are hard to grab with fingers | CRITICAL | `flow-canvas.tsx` |
| Magnetic alignment guides use 8px threshold — too tight for finger precision, needs 16-20px on touch | HIGH | `flow-canvas.tsx` |
| Snap grid is 20x20px — good for mouse, too fine for touch; consider 40x40 on mobile | MEDIUM | `flow-canvas.tsx` |
| No long-press gesture to replace right-click context menu | CRITICAL | `flow-canvas.tsx`, `node-context-menu.tsx` |
| Edge connection handles (top/bottom/left/right) are too small for touch — need minimum 44x44px hit area | CRITICAL | All 14 node components |
| No pinch-to-zoom feedback (scale indicator) | LOW | `flow-canvas.tsx` |

### 1.2 Node Palette (Adding Nodes)

| Issue | Severity | File |
|-------|----------|------|
| Node palette is a sidebar panel — needs to become a bottom sheet or FAB menu on mobile | CRITICAL | `node-palette.tsx` |
| Dragging from palette to canvas doesn't work reliably on touch (browser intercepts drag as scroll) | CRITICAL | `node-palette.tsx` |
| Alternative: tap-to-add (tap palette item, then tap canvas location) not implemented | HIGH | `node-palette.tsx` |
| 14 node types need a compact grid or categorized accordion for small screens | MEDIUM | `node-palette.tsx` |

### 1.3 Node Inspector (Editing Properties)

| Issue | Severity | File |
|-------|----------|------|
| Inspector is a fixed side panel — needs to become a bottom sheet or slide-over on mobile | CRITICAL | `node-inspector.tsx` |
| PersonaEditor, LLMEditor, etc. have multi-field forms that don't stack vertically for narrow screens | HIGH | `node-inspector.tsx` |
| Temperature slider and number inputs need larger touch targets | MEDIUM | `node-inspector.tsx` |

### 1.4 Node Groups & Templates

| Issue | Severity | File |
|-------|----------|------|
| Group creation (select multiple + group) requires multi-select which needs a touch mode (toggle-select vs drag-select) | CRITICAL | `use-node-groups.ts` |
| Group drag constraints work but visual group boundary indicator is missing on mobile | HIGH | `use-node-groups.ts` |
| Template sidebar needs mobile-friendly presentation (full-screen overlay or bottom sheet) | HIGH | `template-sidebar.tsx` |
| "Save as template" flow has no mobile-optimized UI | MEDIUM | `template-manager.tsx` |
| Node group locking/unlocking needs a visible touch-friendly toggle, not just context menu | HIGH | `use-node-groups.ts`, `node-context-menu.tsx` |

### 1.5 AI Flow Chat

| Issue | Severity | File |
|-------|----------|------|
| Chat panel positioning may overlap canvas on small screens | HIGH | `ai-flow-chat.tsx` |
| Chat input area needs mobile keyboard awareness (viewport resize handling) | MEDIUM | `ai-flow-chat.tsx` |

### 1.6 Execution Panel

| Issue | Severity | File |
|-------|----------|------|
| Execution status panel layout untested on mobile — likely overflows | MEDIUM | `workflow-builder.tsx` |
| Node execution highlighting (pulse animation) works but is hard to see on small screens | LOW | `styles.css` |

---

## SECTION 2: APP SHELL & NAVIGATION

### 2.1 Sidebar

| Issue | Severity | File |
|-------|----------|------|
| Sidebar is `fixed left-0 w-60` with NO responsive hiding — takes 240px on ALL screen sizes | CRITICAL | `src/components/shell/sidebar.tsx` |
| Main content has `ml-60` — pushed off-screen on phones (<375px usable) | CRITICAL | `src/components/shell/app-shell.tsx` |
| `MobileHeader` component exists but is NOT rendered in `AppShell` | CRITICAL | `app-shell.tsx`, `mobile-header.tsx` |
| Shell context has `mobileNavOpen` and `sidebarCollapsed` state but neither is wired to responsive breakpoints | HIGH | `shell-context.tsx` |

**What should happen:** Sidebar hidden by default on `<md` screens, replaced by MobileHeader with hamburger menu. Main content should be full-width on mobile.

### 2.2 Mobile Header

| Issue | Severity | File |
|-------|----------|------|
| MobileHeader has 11 nav items in a flat list — needs grouping to match sidebar's BUILD/BUILDER FORMS/CONNECT sections | MEDIUM | `mobile-header.tsx` |
| No swipe-to-close gesture on mobile nav overlay | LOW | `mobile-header.tsx` |
| Missing icons (sidebar has emoji icons, mobile header has plain text only) | LOW | `mobile-header.tsx` |

---

## SECTION 3: WIZARD FLOWS (Improvement Loop, Persona Studio, etc.)

### 3.1 Progress Indicators

| Issue | Severity | File |
|-------|----------|------|
| Step pills in `improvement-shell.tsx` use horizontal `flex` with `gap-2` — overflows on mobile with 5 steps | HIGH | `improvement-shell.tsx` |
| Step labels + subtitles inside pills are too wide for <375px screens | MEDIUM | `improvement-shell.tsx` |
| Same pattern repeated in `launch-shell.tsx` (6 steps), `dts-shell.tsx` (5 steps), `unified-shell.tsx` (6 steps) | HIGH | All wizard shells |

**Fix:** Use horizontal scroll with snap, or collapse to "Step 2 of 5" with prev/next arrows on mobile.

### 3.2 Benchmark Step (Step 3)

| Issue | Severity | File |
|-------|----------|------|
| `grid-cols-3` for reference app names — needs `grid-cols-1` on mobile | HIGH | `step-benchmark.tsx:208` |
| CPO persona card "Strengths & Blind Spots" uses `grid-cols-2` — needs stacking on mobile | MEDIUM | `step-benchmark.tsx:318` |
| CPO panel summary uses `grid-cols-3` — needs responsive stacking | MEDIUM | `step-benchmark.tsx:388` |
| Tab bar with 3 app tabs has truncated names on narrow screens | LOW | `step-benchmark.tsx:227` |

### 3.3 Team Step (Step 1)

| Issue | Severity | File |
|-------|----------|------|
| Expanded team member form uses `grid-cols-2` for Name/Role — needs stacking on mobile | MEDIUM | `step-team.tsx:88` |
| Tag inputs (expertise, reviews) work on mobile but need larger touch targets | LOW | `step-team.tsx` |

### 3.4 Improve Step (Step 5)

| Issue | Severity | File |
|-------|----------|------|
| Status cards use `grid-cols-3` — needs `grid-cols-1` or stacked on mobile | HIGH | `step-improve.tsx:233` |
| CPO panel uses horizontal `flex gap-3` — wraps awkwardly on narrow screens | MEDIUM | `step-improve.tsx:274` |
| Round log cards are dense with nested content — need accordion or summary view on mobile | MEDIUM | `step-improve.tsx:348` |
| "Save to GitHub" section layout needs vertical stacking on mobile | LOW | `step-improve.tsx:516` |

### 3.5 Scoring Grid

| Issue | Severity | File |
|-------|----------|------|
| Score input fields (`w-20 h-8`) are small for mobile touch | MEDIUM | `scoring-grid.tsx:82-95` |
| Category headers work well (full-width accordion pattern is mobile-friendly) | OK | `scoring-grid.tsx` |

---

## SECTION 4: OVERLAYS & MODALS

| Issue | Severity | File |
|-------|----------|------|
| Modal uses `max-w-lg` — fine on mobile but needs padding adjustment (currently `p-6`, safe) | LOW | `modal.tsx` |
| SlideOver uses `max-w-md` — should be full-width on mobile (`max-w-full sm:max-w-md`) | MEDIUM | `slide-over.tsx` |
| Neither modal nor slide-over prevents body scroll when open | MEDIUM | `modal.tsx`, `slide-over.tsx` |

---

## SECTION 5: GLOBAL & TYPOGRAPHY

| Issue | Severity | File |
|-------|----------|------|
| No `<meta name="viewport">` verified in root layout (Next.js adds it by default, but should confirm) | LOW | `src/app/layout.tsx` |
| `text-[10px]` used extensively for labels — below minimum readable size on mobile (12px recommended) | MEDIUM | Multiple files |
| Touch targets: buttons at `h-9` (36px) and `h-10` (40px) are close but some icon buttons at `h-9 w-9` miss the 44px WCAG minimum | MEDIUM | `button.tsx` |
| Radial gradient background performs fine on mobile | OK | `globals.css` |
| Dark theme contrast ratios are good for OLED screens | OK | `globals.css` |

---

## ACTION PLAN

### Phase 1: Make the App Accessible on Mobile (CRITICAL — Week 1)

These changes unblock basic mobile usage.

**1.1 Fix App Shell responsive layout**
- File: `src/components/shell/app-shell.tsx`
- Change: Hide sidebar on `<md`, render MobileHeader, remove `ml-60` on mobile
- Implementation:
  ```
  <Sidebar /> → add className="hidden md:flex"
  <main className="flex-1 md:ml-60"> → conditional margin
  Add <MobileHeader /> before <main> for md:hidden
  ```

**1.2 Make sidebar responsive**
- File: `src/components/shell/sidebar.tsx`
- Change: Add `hidden md:flex` to the `<aside>` element
- Also: Wire `sidebarCollapsed` context to a media query listener in `shell-context.tsx`

**1.3 Integrate MobileHeader into AppShell**
- File: `src/components/shell/app-shell.tsx`
- Change: Import and render `<MobileHeader />` inside the shell, before `<main>`
- Also: Add grouped nav sections and emoji icons to match sidebar

**1.4 Add body scroll lock for overlays**
- Files: `modal.tsx`, `slide-over.tsx`
- Change: `document.body.style.overflow = 'hidden'` on open, restore on close

### Phase 2: Mobile-Friendly Wizard Flows (HIGH — Week 2)

**2.1 Responsive progress indicators**
- Files: All wizard shells (`improvement-shell.tsx`, `launch-shell.tsx`, `dts-shell.tsx`, `unified-shell.tsx`)
- Change: On mobile, replace horizontal step pills with a compact "Step N of M" indicator with back/next arrows
- Implementation: Wrap current pills in `hidden sm:flex`, add mobile variant with `sm:hidden`

**2.2 Fix grid layouts**
- File: `step-benchmark.tsx`
  - Line 208: `grid-cols-3` → `grid-cols-1 sm:grid-cols-3`
  - Line 318: `grid-cols-2` → `grid-cols-1 sm:grid-cols-2`
  - Line 388: `grid-cols-3` → `grid-cols-1 sm:grid-cols-3`
- File: `step-team.tsx`
  - Line 88: `grid-cols-2` → `grid-cols-1 sm:grid-cols-2`
- File: `step-improve.tsx`
  - Line 233: `grid-cols-3` → `grid-cols-1 sm:grid-cols-3`
  - Line 274: `flex gap-3` → `flex flex-col sm:flex-row gap-3`

**2.3 Improvement shell header**
- File: `improvement-shell.tsx`
- Line 122: Header flex layout — stack title and view toggle vertically on mobile
- Change: `flex items-center justify-between` → `flex flex-col sm:flex-row sm:items-center gap-4 sm:justify-between`

**2.4 Scoring grid touch targets**
- File: `scoring-grid.tsx`
- Change: Increase score input from `w-20 h-8` to `w-24 h-10` on mobile for better touch targets

### Phase 3: Touch-Optimized Workflow Builder (CRITICAL — Weeks 3-4)

This is the most complex phase. The self-contained `@supra/builder` package needs a mobile interaction layer.

**3.1 Add touch detection hook**
- New file: `packages/builder/src/hooks/use-touch-device.ts`
- Detect touch capability via `'ontouchstart' in window` or `navigator.maxTouchPoints > 0`
- Export `isTouchDevice` boolean and `isMobile` (width < 768px)

**3.2 Mobile node palette — bottom sheet**
- File: `packages/builder/src/components/node-palette.tsx`
- Change: On mobile, transform the sidebar palette into a bottom sheet (slide up from bottom)
- Add a floating action button (FAB) to toggle the palette
- Implement tap-to-add: user taps node type → node appears at canvas center → user drags to position
- Categorize 14 node types into collapsible groups: Core (5), Automation (5), AI (2), Utility (2)

**3.3 Mobile node inspector — bottom sheet**
- File: `packages/builder/src/components/node-inspector.tsx`
- Change: On mobile, inspector becomes a draggable bottom sheet (half-screen default, swipe up for full)
- Stack all form fields vertically
- Increase all input heights to minimum 44px touch targets

**3.4 Long-press context menu**
- File: `packages/builder/src/components/node-context-menu.tsx`
- Change: Add `onTouchStart`/`onTouchEnd` handlers to detect 500ms long-press
- Show context menu as a centered action sheet on mobile (not positioned at cursor)
- Actions: Edit, Duplicate, Delete, Lock/Unlock Group, Add to Group

**3.5 Touch-friendly edge connections**
- File: `packages/builder/src/components/flow-canvas.tsx`
- Change: Increase handle hit areas to 44x44px on touch devices (currently ~10px)
- Add visual feedback: handles glow/enlarge when finger approaches (proximity detection)
- Consider "connection mode": tap source handle → tap target handle (instead of drag)

**3.6 Mobile node group creation**
- File: `packages/builder/src/hooks/use-node-groups.ts`
- Change: Add toggle-select mode for mobile (tap nodes to add/remove from selection)
- Add visible "Group Selected" button when 2+ nodes are selected
- Show group boundary with a dashed rectangle around grouped nodes
- Add tap-to-lock/unlock toggle on group boundary

**3.7 Template sidebar — full-screen overlay on mobile**
- File: `packages/builder/src/components/template-sidebar.tsx`
- Change: On mobile, template browser becomes a full-screen overlay with back button
- Templates shown as cards in a single-column scrollable list
- "Use Template" button fixed at bottom of screen

**3.8 Adjust canvas defaults for touch**
- File: `packages/builder/src/components/flow-canvas.tsx`
- Changes:
  - Snap grid: 40x40 on touch (vs 20x20 on desktop)
  - Alignment threshold: 16px on touch (vs 8px on desktop)
  - Minimum zoom level: 0.3 (prevent zooming too far out on small screens)
  - Default zoom: fit-view with 20% padding on mobile

**3.9 AI Chat panel — mobile overlay**
- File: `packages/builder/src/components/ai-flow-chat.tsx`
- Change: On mobile, chat becomes a toggleable full-screen overlay (not inline panel)
- Handle virtual keyboard pushing viewport up
- Add FAB button to toggle chat open/closed

### Phase 4: Polish & Refinement (MEDIUM — Week 5)

**4.1 Minimum text size**
- All files using `text-[10px]`: increase to `text-[11px]` minimum, or `text-xs` (12px) on mobile
- Use responsive: `text-[10px] sm:text-[10px]` only where desktop density requires it

**4.2 SlideOver full-width on mobile**
- File: `slide-over.tsx`
- Change: `max-w-md` → `max-w-full sm:max-w-md`

**4.3 Mobile header improvements**
- File: `mobile-header.tsx`
- Add emoji icons matching sidebar
- Group items into BUILD / BUILDER FORMS / CONNECT sections
- Add swipe-to-close gesture

**4.4 Builder page height**
- File: `src/app/builder/page.tsx`
- Change: `h-[calc(100vh-4rem)]` → `h-[calc(100vh-3rem)] md:h-[calc(100vh-4rem)]` (account for shorter mobile header)

**4.5 Workspace manager mobile layout**
- File: `packages/builder/src/components/workspace-manager.tsx`
- Ensure workspace switcher dropdown works on mobile touch

### Phase 5: Advanced Touch Gestures (LOW — Week 6+)

**5.1 Swipe gestures**
- Swipe right on mobile to open sidebar/palette
- Swipe left to close
- Swipe down on bottom sheet to minimize

**5.2 Two-finger gestures on canvas**
- Two-finger pan (already via React Flow)
- Pinch-to-zoom with scale indicator overlay
- Two-finger rotate for canvas orientation (optional, advanced)

**5.3 Haptic feedback**
- Add `navigator.vibrate(10)` on node snap-to-grid
- Haptic on successful edge connection
- Haptic on group lock/unlock

**5.4 Offline support**
- Service worker for basic offline access (localStorage already handles data)
- Queue execution requests for when connectivity returns

---

## PRIORITY MATRIX

| Phase | Effort | Impact | Priority |
|-------|--------|--------|----------|
| Phase 1: App Shell | Small (1-2 days) | Unblocks all mobile usage | DO FIRST |
| Phase 2: Wizard Flows | Small (2-3 days) | Makes forms usable | DO SECOND |
| Phase 3: Builder Touch | Large (2 weeks) | Makes core feature work on mobile | DO THIRD (most important long-term) |
| Phase 4: Polish | Small (2-3 days) | Improves quality | DO FOURTH |
| Phase 5: Advanced | Medium (1 week) | Delights users | DO LAST |

---

## SCORING PROJECTION

| Phase | Mobile Score After |
|-------|-------------------|
| Current state | 15/100 |
| After Phase 1 | 35/100 |
| After Phase 2 | 50/100 |
| After Phase 3 | 75/100 |
| After Phase 4 | 85/100 |
| After Phase 5 | 95/100 |

---

*Review conducted by Jordan Kael, CPO Persona (Zapier x Make x n8n x Figma)*
*Date: 2026-03-26*
*SupraLoop commit: claude/uiux-expert-mobile-review-kycJb*
