# @supra/automation-builder — Integration Guide

> Canonical source: [github.com/SupraAgent/Supra-Automation-Builder](https://github.com/SupraAgent/Supra-Automation-Builder)
>
> This package is the single source of truth for the visual drag-and-drop workflow builder shared across all Supra apps. All builder updates are made here and consumed by each app.

---

## Quick Start

### 1. Install

```bash
npm install github:SupraAgent/Supra-Automation-Builder
```

The `prepare` script runs `tsup` automatically, so `dist/` is built on install. No manual build step needed.

### 2. Peer Dependencies

Your app must have these installed:

| Package | Version |
|---------|---------|
| `@xyflow/react` | `^12.0.0` |
| `lucide-react` | `>=0.300.0` |
| `react` | `>=18.0.0` |
| `react-dom` | `>=18.0.0` |

### 3. TypeScript Path Alias

Add to `tsconfig.json` paths:

```json
{
  "compilerOptions": {
    "paths": {
      "@supra/automation-builder": ["./node_modules/@supra/automation-builder/dist/index"]
    }
  }
}
```

### 4. Tailwind CSS

**Tailwind v3** — add to `content` array in `tailwind.config.ts`:

```ts
content: [
  // ... your app's content paths
  "./node_modules/@supra/automation-builder/dist/**/*.js",
],
```

**Tailwind v4** — add to `globals.css`:

```css
@source "../../node_modules/@supra/automation-builder/dist";
```

### 5. Import Styles

In your root layout or global CSS:

```ts
import "@supra/automation-builder/styles.css";
```

---

## Core Concepts

The package provides three layers:

| Layer | What it does | Key exports |
|-------|-------------|-------------|
| **UI Components** | Visual canvas, node config, templates | `FlowCanvas`, `NodeConfigPanel`, `TemplateManager`, `GroupContainerNode` |
| **Engine** | Workflow execution, condition evaluation | `executeWorkflow`, `resumeWorkflow`, `evaluateCondition` |
| **Registries** | App-specific trigger/action definitions | `NodeRegistry`, `NodePaletteItem`, `ConfigFieldDef` |

Each consuming app provides its own:
- **Node registry** — which triggers, actions, and logic nodes are available
- **Persistence adapter** — where workflow runs are stored (Supabase, localStorage, etc.)
- **Action executor** — what happens when each action node fires

---

## Rendering the Builder

### Minimal Example

```tsx
"use client";

import {
  FlowCanvas,
  type NodeRegistry,
} from "@supra/automation-builder";

const registry: NodeRegistry = {
  triggers: [
    {
      type: "trigger",
      subType: "manual",
      label: "Manual Trigger",
      description: "Run on demand",
      icon: "Play",
      defaultConfig: {},
    },
  ],
  actions: [
    {
      type: "action",
      subType: "send_email",
      label: "Send Email",
      description: "Send an email notification",
      icon: "Mail",
      defaultConfig: { to: "", subject: "", body: "" },
    },
  ],
};

export default function BuilderPage() {
  return (
    <FlowCanvas
      initialNodes={[]}
      initialEdges={[]}
      onSave={(nodes, edges) => {
        console.log("Saved:", { nodes, edges });
      }}
      registry={registry}
      enableUndoRedo
      showUndoRedoButtons
    />
  );
}
```

### FlowCanvas Props

```typescript
interface FlowCanvasProps {
  initialNodes: Node[];           // Starting nodes
  initialEdges: Edge[];           // Starting edges
  onSave: (nodes: Node[], edges: Edge[]) => void;  // Save callback
  saving?: boolean;               // Show saving indicator
  autoSaveDelay?: number;         // Auto-save debounce (ms)
  customNodeTypes?: NodeTypes;    // Domain-specific node components
  hideSidebar?: boolean;          // Hide the node palette sidebar
  hideConfigPanel?: boolean;      // Hide the config panel
  registry?: NodeRegistry;        // Your app's trigger/action definitions
  smartDefaultRules?: SmartDefaultRule[];  // Auto-fill rules
  enableUndoRedo?: boolean;       // Enable undo/redo (Ctrl+Z / Ctrl+Shift+Z)
  showUndoRedoButtons?: boolean;  // Show undo/redo toolbar buttons
  enableContextMenu?: boolean;    // Right-click context menu
}
```

---

## Building a Node Registry

A registry tells the builder what nodes are available in the sidebar palette and how to configure them.

```typescript
import type {
  NodeRegistry,
  NodePaletteItem,
  NodeTypeRegistration,
  ConfigFieldDef,
} from "@supra/automation-builder";

// 1. Define palette items (what appears in the sidebar)
const triggers: NodePaletteItem[] = [
  {
    type: "trigger",
    subType: "new_order",
    label: "New Order",
    description: "When a new order is placed",
    icon: "ShoppingCart",       // lucide-react icon name
    defaultConfig: {},
  },
];

const actions: NodePaletteItem[] = [
  {
    type: "action",
    subType: "send_notification",
    label: "Send Notification",
    description: "Send a push notification",
    icon: "Bell",
    defaultConfig: { title: "", body: "" },
  },
];

// 2. Define config fields (what appears in the config panel when a node is selected)
const triggerConfigs: Record<string, NodeTypeRegistration> = {
  new_order: {
    subType: "new_order",
    configFields: [
      { key: "min_value", label: "Minimum order value", type: "number", placeholder: "0" },
      { key: "category", label: "Category", type: "select", options: [
        { value: "electronics", label: "Electronics" },
        { value: "clothing", label: "Clothing" },
      ]},
    ],
  },
};

const actionConfigs: Record<string, NodeTypeRegistration> = {
  send_notification: {
    subType: "send_notification",
    configFields: [
      { key: "title", label: "Title", type: "text", placeholder: "Notification title" },
      { key: "body", label: "Body", type: "textarea", placeholder: "Message body..." },
    ],
  },
};

// 3. Define condition fields (available variables for condition nodes)
const conditionFields = [
  { value: "order.total", label: "Order Total" },
  { value: "order.status", label: "Order Status" },
  { value: "customer.name", label: "Customer Name" },
];

// 4. Assemble the registry
export const MY_REGISTRY: NodeRegistry = {
  triggers,
  actions,
  triggerConfigs,
  actionConfigs,
  conditionFields,
};
```

### ConfigFieldDef Types

| Type | Renders | Extra props |
|------|---------|-------------|
| `text` | Text input | `placeholder` |
| `textarea` | Multi-line input | `placeholder` |
| `number` | Number input | `placeholder`, `defaultValue` |
| `select` | Static dropdown | `options: { value, label }[]` |
| `async_select` | Dynamic dropdown (fetches options from URL) | `optionsUrl`, `mapOption`, `createUrl`, `createFields` |
| `secret` | Password input | `placeholder`, `credentialRef` |

#### async_select Example

```typescript
{
  key: "channel_id",
  label: "Slack Channel",
  type: "async_select",
  placeholder: "Select a channel...",
  optionsUrl: "/api/slack/channels",           // GET endpoint returning JSON array
  mapOption: (item) => ({                       // Transform each item to { value, label }
    value: item.id as string,
    label: item.name as string,
  }),
  createUrl: "/api/slack/channels",            // Optional: POST to create new option inline
  createFields: { valueKey: "id", labelKey: "name" },  // Map created record fields
}
```

---

## Templates

### TemplateManager Component

A two-tab modal for browsing and saving workflow templates.

```tsx
import { TemplateManager, type ManagedTemplate } from "@supra/automation-builder";

<TemplateManager
  templates={allTemplates}
  currentNodes={nodes}
  currentEdges={edges}
  onSelect={(template) => loadTemplate(template)}
  onSave={(template) => saveTemplate(template)}
  onDelete={(id) => deleteTemplate(id)}
  onClose={() => setShowTemplates(false)}
  categories={["crm", "notifications", "custom"]}
  defaultCategory="crm"
/>
```

### TemplatePersistence (localStorage)

For apps that don't have a database, use the built-in localStorage persistence:

```typescript
import { TemplatePersistence } from "@supra/automation-builder";

// Each app uses its own storage key
const templateStore = new TemplatePersistence("myapp_custom_templates", builtInTemplates);

// CRUD
const all = templateStore.getAllTemplates();
const custom = templateStore.getCustomTemplates();
templateStore.saveCustomTemplate(template);
templateStore.deleteCustomTemplate(id);
const copy = templateStore.copyTemplate(template);  // Auto-increments name

// Import/Export
const json = templateStore.exportJSON();
const { imported, skipped } = templateStore.importJSON(json);

// Categories
const categories = templateStore.getCategories();
const filtered = templateStore.getTemplatesByCategory("custom");
```

For apps with a database (e.g., Supabase), implement your own persistence using the `onSave`/`onDelete`/`onSelect` callbacks on `TemplateManager`.

---

## Workflow Execution Engine

### Setting Up the Engine

```typescript
import {
  executeWorkflow,
  resumeWorkflow,
  type EngineConfig,
  type ActionContext,
  type ActionResult,
  type PersistenceAdapter,
  type WorkflowData,
} from "@supra/automation-builder";

// 1. Implement your action executor
async function myActionExecutor(
  actionType: string,
  config: Record<string, unknown>,
  ctx: ActionContext
): Promise<ActionResult> {
  switch (actionType) {
    case "send_notification":
      await sendNotification(config.title as string, config.body as string);
      return { success: true };
    default:
      return { success: false, error: `Unknown action: ${actionType}` };
  }
}

// 2. Implement your persistence adapter
const myPersistence: PersistenceAdapter = {
  async createRun(workflowId, event) {
    // Create a run record, return runId
    return crypto.randomUUID();
  },
  async updateRun(runId, status, nodeOutputs, error, currentNodeId) {
    // Update the run record
  },
  async scheduleResume(runId, workflowId, resumeAt, event) {
    // Schedule a delayed resume (for delay nodes)
  },
};

// 3. Build the engine config
const engineConfig: EngineConfig = {
  executeAction: myActionExecutor,
  persistence: myPersistence,
  renderTemplate: (template, vars) => {
    // Replace {{var}} placeholders
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => String(vars[key] ?? ""));
  },
};

// 4. Execute a workflow
const result = await executeWorkflow(
  workflowData,                    // WorkflowData with nodes/edges
  { type: "manual", payload: {} }, // Triggering event
  { vars: { user: "jon" } },       // Initial context
  engineConfig
);

console.log(result.status);       // "completed" | "failed" | "paused"
console.log(result.nodeOutputs);  // Output from each node
console.log(result.nodeTimings);  // Execution timing per node
```

### Optional Engine Features

```typescript
const engineConfig: EngineConfig = {
  executeAction: myActionExecutor,
  persistence: myPersistence,

  // Template rendering for message actions
  renderTemplate: (template, vars) => renderMyTemplate(template, vars),

  // Retry failed actions (default: 0)
  maxRetries: 3,

  // Resolve stored credentials (API keys, tokens)
  credentialStore: myCredentialStore,

  // Execution logging
  logger: {
    onNodeStart: (runId, nodeId, nodeType) => console.log(`[${runId}] ${nodeType} started`),
    onNodeComplete: (runId, nodeId, output, durationMs) => console.log(`[${runId}] done in ${durationMs}ms`),
    onNodeError: (runId, nodeId, error) => console.error(`[${runId}] ${error}`),
  },

  // Rate limiting for API-heavy actions
  rateLimiter: new TokenBucketRateLimiter({ tokensPerSecond: 10, maxBurst: 20 }),

  // Sub-workflow resolution
  workflowResolver: { resolve: (id) => fetchWorkflowById(id) },

  // Database operations (for database nodes)
  databaseAdapter: myDatabaseAdapter,

  // AI operations (for AI nodes)
  aiProvider: myAIProvider,
};
```

---

## Built-in Node Types

| Type | Description | Key config |
|------|-------------|------------|
| `trigger` | Entry point, fires on events | `triggerType`, per-trigger config |
| `action` | Performs an operation | `actionType`, per-action config |
| `condition` | If/else branching | `field`, `operator`, `value`, `logic` ("and"/"or") |
| `delay` | Pause execution | `duration`, `unit` ("minutes"/"hours"/"days") |
| `try_catch` | Error handling wrapper | `tryPath`, `catchPath` |
| `code` | Run JavaScript/TypeScript | `language`, `code`, `timeout` |
| `switch` | Multi-path branching | `expression`, `cases[]`, `defaultCase` |
| `loop` | Iterate over arrays | `arrayExpression`, `itemVariable`, `maxIterations` |
| `transform` | Data transformation pipeline | `inputExpression`, `operations[]` (map, filter, sort, pick, omit, rename, flatten, group_by, aggregate, template, json_parse, json_stringify, unique, take, skip) |
| `sub_workflow` | Run another workflow | `workflowId`, `inputMappings`, `outputMappings` |
| `schedule` | Time-based trigger | `mode` ("interval"/"cron"/"calendar"), schedule config |
| `database` | Database operations | `connectorType`, `operation` (query/insert/update/delete/find/aggregate) |
| `ai` | LLM-powered node | `provider`, `model`, `prompt`, `tools[]`, `responseFormat` |
| `group_container` | Figma-style visual grouping | `children[]`, `acceptType`, `maxChildren`, `accent` |

---

## Group Container Node

Drag-drop container for visually grouping nodes (Figma-style).

```tsx
import { GroupContainerNode, type GroupContainerNodeData } from "@supra/automation-builder";

// Pass as customNodeTypes to FlowCanvas
<FlowCanvas
  customNodeTypes={{ group_container: GroupContainerNode }}
  // ...
/>
```

The container listens for `supra:group-add-child` custom events when items are dropped in. Your app handles this event to update node data.

### Accent Colors

Available accents: `"blue"`, `"purple"`, `"emerald"`, `"orange"`, `"primary"` (default).

---

## Undo/Redo

```tsx
import { useUndoRedo } from "@supra/automation-builder";

const { undo, redo, canUndo, canRedo } = useUndoRedo(nodes, edges, setNodes, setEdges);
```

- 50-snapshot history
- JSON-based deduplication (won't record identical states)
- Keyboard shortcuts: `Ctrl+Z` (undo), `Ctrl+Shift+Z` / `Ctrl+Y` (redo)
- Skips recording when focused in input/textarea/select elements

Or just pass `enableUndoRedo` and `showUndoRedoButtons` to `FlowCanvas` — it handles everything internally.

---

## Connector SDK

Build reusable connectors that auto-generate palette items, config panels, and action executors.

```typescript
import { defineConnector } from "@supra/automation-builder";

const myConnector = defineConnector({
  id: "slack",
  name: "Slack",
  description: "Send messages and manage channels",
  version: "1.0.0",
  icon: "MessageSquare",
  category: "communication",
  auth: {
    type: "bearer",
    fields: [{ key: "token", label: "Bot Token", required: true }],
  },
  triggers: [
    {
      id: "new_message",
      name: "New Message",
      description: "When a message is posted",
      config: [
        { key: "channel", label: "Channel", type: "text", placeholder: "#general" },
      ],
    },
  ],
  actions: [
    {
      id: "send_message",
      name: "Send Message",
      description: "Post a message to a channel",
      config: [
        { key: "channel", label: "Channel", type: "text", placeholder: "#general" },
        { key: "text", label: "Message", type: "textarea", placeholder: "Hello!" },
      ],
      executor: async (config, context) => {
        // Your implementation
        return { success: true, output: { ts: "1234567890.123456" } };
      },
    },
  ],
});

// Use the generated registry items
// myConnector.paletteItems, myConnector.triggerConfigs, myConnector.actionConfigs
// myConnector.actionExecutor — ready-to-use ActionExecutor function
```

---

## Existing App Registries

The package includes pre-built registries for current consumers:

| Registry | Import | App |
|----------|--------|-----|
| `SUPRATEAM_REGISTRY` | `@supra/automation-builder` | SupraTeam CRM |
| `AUTOPURCHASER_REGISTRY` | `@supra/automation-builder` | LeeJones Auto Purchaser |

These are exported for reference and can be used directly or extended.

---

## Advanced Features

### RBAC (Role-Based Access Control)

```typescript
import { RBACManager, RBACProvider, useRBAC } from "@supra/automation-builder";
```

Built-in permissions: `workflow:create`, `workflow:read`, `workflow:update`, `workflow:delete`, `workflow:execute`, `workflow:toggle`, `credential:*`, `template:*`, `history:*`, `admin:*`.

### Execution History

```typescript
import { ExecutionHistoryStore } from "@supra/automation-builder";
```

localStorage-based execution history with filtering, stats, and time-series bucketing.

### Partner Applets

```typescript
import { AppletStore, EXAMPLE_APPLETS } from "@supra/automation-builder";
```

Marketplace-style pre-built workflow templates from partners.

### Template Import/Export

```typescript
import {
  exportTemplate,
  importTemplate,
  validateTemplate,
  encodeTemplateToUrl,
  decodeTemplateFromUrl,
} from "@supra/automation-builder";
```

Share templates as JSON or URL-encoded links.

---

## Updating the Package

To pull the latest version:

```bash
npm install github:SupraAgent/Supra-Automation-Builder
```

This fetches the latest `main` branch and rebuilds `dist/` via the `prepare` script.

To pin to a specific commit:

```bash
npm install github:SupraAgent/Supra-Automation-Builder#abc1234
```

---

## Rules

- **All builder changes go to this repo** — never modify `@supra/automation-builder` code inside a consuming app
- **Don't duplicate builder components locally** — import from the package
- **App-specific logic stays in the app** — persistence adapters, action executors, and domain-specific node components belong in the consuming app, not here
- **New registries welcome** — add `src/registries/yourapp.ts` via PR to this repo
- **Keep it light** — no database clients, no API SDKs, no large dependencies

---

## Currently Integrated Apps

| App | Status | Notes |
|-----|--------|-------|
| SupraTeam (CRM) | Verified | Supabase persistence, 24 triggers, 20 actions |
| SupraLoop | Verified | localStorage persistence, domain-specific persona/consensus nodes |
| LeeJones (Auto Purchaser) | Integrated | localStorage persistence, scraper-focused triggers |
