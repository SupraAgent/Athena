# Mobile UX Review — CPO Agent Report

**Reviewer:** Aria Chen, CPO (Zapier + Make + n8n + Retool + Figma + Framer composite)
**Date:** 2026-03-26
**App:** SupraLoop — Iterative Improvement Engine
**Focus:** Automation Builder (drag-and-drop canvas) + overall mobile experience
**Persona Definition:** [`docs/personas/mobile-ux-cpo-agent.md`](./personas/mobile-ux-cpo-agent.md)

---

## Executive Summary

SupraLoop has a **sophisticated desktop builder** — 14 node types, grouped drag-and-drop, undo/redo, AI chat, template system, workspace management, and a full execution engine. The architecture is clean and extensible. However, **the mobile experience is effectively non-functional**. The app was built desktop-first with almost zero responsive adaptation. A single `MobileHeader` component exists but the rest of the app — especially the builder — ignores viewports below 1024px entirely.

**Overall Mobile Score: 15/100**

| Dimension | Score | Max |
|-----------|-------|-----|
| Touch Interaction Model | 2/25 | 25 |
| Responsive Layout & Navigation | 5/20 | 20 |
| Node Editing on Small Screens | 1/20 | 20 |
| Progressive Disclosure | 3/15 | 15 |
| Performance & Perceived Speed | 3/10 | 10 |
| Accessibility & Input Modes | 1/10 | 10 |

---

## Section 1: Critical Findings (Builder-Focused)

### 1.1 The Canvas is Unusable on Touch Devices

**Files:** `packages/builder/src/components/flow-canvas.tsx`, `workflow-builder.tsx`

**Current state:**
- React Flow's default touch handling conflicts with browser scroll/zoom gestures
- No `panOnScroll`, `zoomOnPinch`, or touch-specific React Flow props are configured
- Drag-and-drop from `NodePalette` uses `dataTransfer` — the HTML Drag and Drop API does **not work on mobile browsers** (no `dragstart`/`dragover`/`drop` events on touch)
- The canvas renders at full size with no viewport-aware initial zoom
- `MiniMap` and `Controls` overlay in fixed positions that collide with mobile chrome (bottom nav bars, notches)

**Impact:** Users literally cannot add nodes to the canvas on phone or tablet.

**What competitors do:**
- **Figma Mobile:** Read-only canvas with pinch-zoom + tap-to-select; editing via bottom sheet
- **Make Mobile:** Simplified linear flow view on phone; full canvas on tablet with touch-optimized handles
- **n8n:** Community-built mobile view that collapses canvas into a step list

### 1.2 Node Palette Drag Doesn't Work on Touch

**File:** `packages/builder/src/components/node-palette.tsx`

```tsx
onDragStart={(e) => {
  e.dataTransfer.setData("application/reactflow", item.type);
  e.dataTransfer.setData("application/reactflow-data", JSON.stringify(item.data));
  e.dataTransfer.effectAllowed = "move";
}}
```

The HTML5 Drag and Drop API has **zero support** on iOS Safari and only partial support on Android Chrome. This is the single biggest mobile blocker — users cannot create workflows at all.

### 1.3 Node Inspector is Off-Screen

**File:** `packages/builder/src/components/node-inspector.tsx`

```tsx
<div className="flex h-full w-[300px] flex-col border-l ...">
```

The inspector is a fixed 300px sidebar. On a 375px phone screen, this consumes 80% of the viewport. There's no collapse/expand toggle, no bottom-sheet alternative, and no responsive width.

### 1.4 AI Flow Chat Overlaps Everything

**File:** `packages/builder/src/components/ai-flow-chat.tsx`

```tsx
// Rendered as fixed position bottom-right
fixed bottom-6 right-6 z-50 flex h-[500px] w-[380px] flex-col
```

On a 375px-wide screen this chat panel is **wider than the viewport** (380px > 375px). It covers the entire canvas. No mobile-sized variant exists.

### 1.5 Template Sidebar Stacks Incorrectly

**File:** `packages/builder/src/components/template-sidebar.tsx`

Fixed 288px (`w-72`) sidebar. Combined with the 300px inspector, these two panels alone consume 588px — more than most tablets in portrait.

---

## Section 2: Shell & Navigation Issues

### 2.1 Desktop Sidebar Has No Responsive Behavior

**File:** `src/components/shell/sidebar.tsx`

```tsx
<aside className="fixed left-0 top-0 bottom-0 w-60 bg-card border-r ...">
```

The sidebar is **always visible** at 240px. The main content uses `ml-60` to offset. On mobile, this means:
- 240px sidebar + content = horizontal overflow or crushed content
- The `MobileHeader` exists (`md:hidden`) but the sidebar doesn't hide (`md:block` / `hidden md:flex` is missing)

**Fix:** Add `hidden md:flex` to sidebar, remove `ml-60` on mobile from main content.

### 2.2 Builder Page Height Calculation

**File:** `src/app/builder/page.tsx`

```tsx
<div className="h-[calc(100vh-4rem)]">
```

This assumes a 4rem header. On mobile with `MobileHeader` (3rem/48px), there's a 16px gap. On devices with browser chrome (Safari's URL bar, Android's nav bar), `100vh` includes hidden chrome area causing content to be cut off.

**Fix:** Use `h-[calc(100dvh-3rem)]` on mobile (`dvh` = dynamic viewport height, accounts for browser chrome).

---

## Section 3: Recommendations (Prioritized by Impact)

### Priority 1 — Make the Builder Functional on Mobile (CRITICAL)

These changes turn the builder from "broken" to "usable" on touch devices.

#### R1. Replace HTML5 DnD with Touch-Compatible Drag

**Effort:** Medium | **Impact:** Unlocks the entire builder on mobile

Replace `onDragStart`/`dataTransfer` in `NodePalette` with a touch-compatible approach:

- **Option A (Recommended):** Tap-to-add pattern. On mobile, tapping a palette item adds the node at canvas center (or a smart position near the last node). No drag needed. This is what Figma Mobile and Retool Mobile do.
- **Option B:** Use a library like `@dnd-kit/core` which supports both mouse and touch with a unified API. More complex but preserves the drag metaphor.
- **Option C:** Implement `touchstart`/`touchmove`/`touchend` handlers manually with a "ghost node" overlay during drag. Most work, most native feel.

**Suggested implementation (Option A):**
```tsx
// In NodePalette, detect touch device
const isTouchDevice = 'ontouchstart' in window;

// On touch: tap adds node at smart position
// On desktop: keep existing drag behavior
onClick={isTouchDevice ? () => onAddNode(item.type, item.data) : undefined}
onDragStart={!isTouchDevice ? handleDragStart : undefined}
```

#### R2. Configure React Flow for Touch

**Effort:** Low | **Impact:** Canvas becomes navigable on touch

Add these props to the `<ReactFlow>` component in `flow-canvas.tsx`:

```tsx
<ReactFlow
  // ... existing props
  panOnScroll={false}
  panOnDrag={[1, 2]}        // Pan with 1 or 2 finger drag
  zoomOnPinch={true}         // Pinch to zoom
  zoomOnDoubleClick={false}  // Prevent accidental zoom
  selectOnDrag={false}       // Prevent selection box on touch
  nodesDraggable={true}      // Allow touch-dragging nodes
  minZoom={0.2}              // Allow zooming out further on small screens
  defaultViewport={{ x: 0, y: 0, zoom: 0.6 }} // Start zoomed out on mobile
/>
```

#### R3. Convert Inspector to Bottom Sheet on Mobile

**Effort:** Medium | **Impact:** Node editing becomes possible on phone

When viewport < 768px, render the `NodeInspector` as a **bottom sheet** (slide-up panel) instead of a side panel:

```tsx
// Mobile: bottom sheet that slides up from bottom, covers ~60% of screen
// Swipe down to dismiss, tap node to re-open
<div className={cn(
  "flex flex-col border-t md:border-l md:border-t-0",
  "fixed inset-x-0 bottom-0 md:static",
  "h-[60vh] md:h-full",
  "w-full md:w-[300px]",
  "rounded-t-2xl md:rounded-none",
  "z-40 md:z-auto"
)}>
```

#### R4. Make AI Chat Responsive

**Effort:** Low | **Impact:** AI assistant usable on mobile

```tsx
// Replace fixed dimensions with responsive ones
<div className={cn(
  "fixed z-50 flex flex-col",
  "bottom-0 right-0 h-[100dvh] w-full",           // mobile: full screen
  "md:bottom-6 md:right-6 md:h-[500px] md:w-[380px]", // desktop: floating
  "md:rounded-2xl"  // only round on desktop
)}>
```

Add a mobile toggle button (FAB) to show/hide the chat.

### Priority 2 — Responsive Shell (HIGH)

#### R5. Fix Sidebar Responsiveness

**File:** `src/components/shell/app-shell.tsx` and `sidebar.tsx`

```tsx
// app-shell.tsx
<div className="flex h-screen">
  <Suspense><Sidebar /></Suspense>
  <main className="flex-1 ml-0 md:ml-60 overflow-y-auto">
    <MobileHeader />
    {children}
  </main>
</div>

// sidebar.tsx
<aside className="hidden md:flex fixed left-0 top-0 bottom-0 w-60 ...">
```

This single change makes the entire app mobile-navigable. The `MobileHeader` already exists — it just needs the sidebar to actually hide.

#### R6. Safe Area and Viewport Units

Add to `globals.css`:
```css
@supports (height: 100dvh) {
  :root { --vh: 1dvh; }
}
html { height: 100dvh; height: -webkit-fill-available; }
```

And update builder page:
```tsx
<div className="h-[calc(100dvh-3rem)] md:h-[calc(100vh-4rem)]">
```

### Priority 3 — Enhanced Mobile Builder Experience (MEDIUM)

#### R7. Mobile-Specific Canvas Toolbar

Replace the desktop toolbar with a mobile-optimized bottom toolbar:

```
┌─────────────────────────────┐
│        Canvas Area          │
│                             │
│                             │
├─────────────────────────────┤
│ [+Add] [Undo] [Redo] [Run] │  <- Bottom toolbar (thumb zone)
└─────────────────────────────┘
```

- **[+Add]** opens the node palette as a bottom sheet (categorized grid)
- **[Undo/Redo]** replaces keyboard shortcuts (Cmd+Z not available on mobile)
- **[Run]** executes the workflow
- All buttons in the **thumb zone** (bottom 1/3 of screen)

#### R8. Simplified Mobile Node Rendering

Nodes should render smaller on mobile viewports:
- Reduce padding from `p-4` to `p-2`
- Hide secondary info (descriptions, help text) — show on tap
- Use 40px minimum touch targets (current icons are often 16-20px)
- Scale emoji/icons to 24px for visibility at mobile zoom levels

#### R9. Linear Flow View (Phone-Only Alternative)

For phone screens (<640px), offer an optional **linear/list view** of the workflow:

```
┌──────────────────────┐
│ 1. [Trigger] On Push │
│         │            │
│ 2. [LLM] Analyze     │
│         │            │
│ 3. [Condition] Pass? │
│        / \           │
│ 4a. [Action] Deploy  │
│ 4b. [Action] Alert   │
└──────────────────────┘
```

This mirrors what Make (Integromat) does on mobile — a simplified representation that lets users understand and edit the flow without needing a full 2D canvas. The canvas view remains available via a toggle for power users.

#### R10. Touch Gesture Enhancements

| Gesture | Action |
|---------|--------|
| Tap node | Select + show inspector (bottom sheet) |
| Long-press node | Open context menu (replaces right-click) |
| Long-press canvas | Add node at position (opens palette) |
| Pinch | Zoom in/out |
| Two-finger pan | Pan canvas |
| Swipe edge between nodes | Connect (draw edge) |
| Double-tap node | Quick-edit label inline |
| Shake device | Undo last action (optional, playful) |

### Priority 4 — Polish & Delight (LOW — do after P1-P3)

#### R11. Activate the View Density System

**File:** `src/components/shell/shell-context.tsx`

The codebase already has a `ViewDensity` system (`compact | comfortable | spacious`) stored in `ShellContext` but it's **never applied to any component**. Wire it up:

- `compact` → mobile default (tighter spacing, smaller text)
- `comfortable` → tablet/desktop default
- `spacious` → large monitors

This is free infrastructure — just needs CSS mappings.

#### R12. Haptic Feedback on Key Actions

Use the Vibration API for tactile confirmation:
- Short pulse on node drop
- Double pulse on connection made
- Long pulse on workflow execution complete

```tsx
if ('vibrate' in navigator) navigator.vibrate(50); // 50ms pulse
```

#### R13. Offline-Aware Status Bar

Show a clear indicator when the device is offline (common on mobile). Queue workflow executions for when connectivity returns. The builder itself should work fully offline since it's client-side React Flow.

#### R14. Responsive Node Palette as Categorized Grid

On mobile, replace the vertical scrollable palette list with a categorized icon grid:

```
┌─────────────────────┐
│ Core                │
│ [👤] [🚀] [🏢] [⚡] │
│ Workflow            │
│ [▶] [🔀] [🔄] [📤]  │
│ Advanced            │
│ [🤖] [📊] [⚙] [📌]  │
└─────────────────────┘
```

Tap an icon to see its name + description, tap again to add it. Compact, scannable, thumb-friendly.

---

## Section 4: Implementation Roadmap

### Phase 1: "Make It Work" (1-2 weeks)
- [ ] R5: Sidebar responsiveness (`hidden md:flex` + `ml-0 md:ml-60`)
- [ ] R2: React Flow touch props (pinch zoom, pan)
- [ ] R1: Tap-to-add nodes on touch devices
- [ ] R6: Dynamic viewport height (`100dvh`)

**Result:** App is navigable and builder is functional on mobile.

### Phase 2: "Make It Good" (2-3 weeks)
- [ ] R3: Inspector as bottom sheet on mobile
- [ ] R4: Full-screen AI chat on mobile
- [ ] R7: Mobile bottom toolbar
- [ ] R8: Smaller node rendering on mobile

**Result:** Builder is genuinely usable for real workflows on mobile.

### Phase 3: "Make It Great" (3-4 weeks)
- [ ] R9: Linear flow view for phones
- [ ] R10: Touch gesture system
- [ ] R14: Icon grid palette on mobile
- [ ] R11: View density system activation

**Result:** Builder is a competitive mobile experience.

### Phase 4: "Make It Delightful" (ongoing)
- [ ] R12: Haptic feedback
- [ ] R13: Offline awareness
- [ ] Animations for node add/remove (Framer Motion already in stack)
- [ ] Onboarding overlay for mobile-specific gestures

---

## Section 5: Competitive Gap Analysis

| Feature | Zapier | Make | n8n | Figma | SupraLoop |
|---------|--------|------|-----|-------|-----------|
| Mobile navigation | 9/10 | 8/10 | 5/10 | 9/10 | 3/10 |
| Touch canvas | N/A | 7/10 | 3/10 | 9/10 | 0/10 |
| Mobile node editing | 8/10 | 7/10 | 4/10 | 8/10 | 0/10 |
| Responsive panels | 9/10 | 8/10 | 5/10 | 9/10 | 1/10 |
| Mobile-specific UX | 8/10 | 7/10 | 3/10 | 10/10 | 1/10 |
| Offline support | 6/10 | 4/10 | 7/10 | 8/10 | 2/10 |
| **Overall Mobile** | **8/10** | **7/10** | **4/10** | **9/10** | **1.5/10** |

**The gap is ~55-75 points.** The good news: SupraLoop's architecture (React Flow, client-side state, Framer Motion, Tailwind) is well-suited for mobile adaptation. None of the recommendations require architectural rewrites — they're additive responsive layers.

---

## Section 6: Key Code Locations for Implementation

| Change | Primary File(s) |
|--------|----------------|
| Sidebar responsive | `src/components/shell/app-shell.tsx`, `sidebar.tsx` |
| React Flow touch | `packages/builder/src/components/flow-canvas.tsx` |
| Node palette touch | `packages/builder/src/components/node-palette.tsx` |
| Inspector bottom sheet | `packages/builder/src/components/node-inspector.tsx` |
| AI chat responsive | `packages/builder/src/components/ai-flow-chat.tsx` |
| Builder page viewport | `src/app/builder/page.tsx` |
| View density wiring | `src/components/shell/shell-context.tsx` |
| Template sidebar | `packages/builder/src/components/template-sidebar.tsx` |
| Node size reduction | `packages/builder/src/components/nodes/*.tsx` |
| Mobile toolbar | New: `packages/builder/src/components/mobile-toolbar.tsx` |
| Linear flow view | New: `packages/builder/src/components/linear-flow-view.tsx` |
| Global CSS fixes | `src/app/globals.css` |

---

## Final Verdict

> **Aria Chen, CPO:**
>
> "SupraLoop has built something genuinely impressive on desktop — the 14-node type system, grouped drag-and-drop, AI canvas chat, and workspace management rival tools with 10x the team size. But mobile isn't a nice-to-have anymore. Your builder's HTML5 DnD dependency means zero mobile users can create workflows. The sidebar doesn't hide. The inspector doesn't fit. The AI chat overflows the screen.
>
> The silver lining: your stack is perfect for this. Tailwind's responsive utilities, Framer Motion for sheet animations, React Flow's built-in touch support (you just need to enable it), and your existing `MobileHeader` component show the foundation is there.
>
> **Start with Phase 1. Four changes. One sprint. You'll go from 15/100 to 50/100.** Then Phase 2 gets you to 70+. The builder being self-contained in its own package makes this even cleaner — mobile adaptations stay scoped.
>
> Don't build a separate mobile app. Make this one responsive. Your users will thank you when they can check workflow status on their phone during standup, or build a quick flow on their iPad on the couch."
