# Supra Automation Builder — Agent Instructions

A visual drag-and-drop workflow automation builder. Published as `@supra/automation-builder` npm package.

## Architecture

- **Type:** Reusable React library (not an app)
- **Build:** tsup → `dist/`
- **UI:** React Flow (@xyflow/react), Tailwind CSS
- **Pattern:** Plugin-based node registry — consuming apps provide their own trigger/action types

## Key Files

| File | Purpose |
|------|---------|
| `src/core/types.ts` | All node data types, workflow types, registry interfaces |
| `src/core/engine.ts` | Workflow execution engine |
| `src/core/auto-layout.ts` | Node overlap resolution algorithm |
| `src/components/flow-canvas.tsx` | Main React Flow canvas with drag-drop |
| `src/components/node-sidebar.tsx` | Draggable node palette |
| `src/components/node-config-panel.tsx` | Node property editor |
| `src/components/nodes/` | Individual node renderers (trigger, action, condition, delay) |
| `src/registries/` | Plugin registries for node types |

## Tech Stack

```
React + TypeScript
@xyflow/react (React Flow)
Tailwind CSS
tsup (build)
```
