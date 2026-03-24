#!/usr/bin/env node
/**
 * sync-registry.mjs
 *
 * Scans a consumer repo for workflow registry definitions and updates
 * the corresponding src/registries/<consumer>.ts file.
 *
 * Usage:
 *   node scripts/sync-registry.mjs <consumer-name> <consumer-repo-path>
 *
 * Example:
 *   node scripts/sync-registry.mjs suprateam ./consumer
 *   node scripts/sync-registry.mjs supraloop ./consumer
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, resolve } from "path";

const [consumerName, consumerPath] = process.argv.slice(2);

if (!consumerName || !consumerPath) {
  console.error("Usage: node scripts/sync-registry.mjs <consumer-name> <consumer-repo-path>");
  process.exit(1);
}

const resolvedConsumerPath = resolve(consumerPath);
const registryFile = resolve("src/registries", `${consumerName}.ts`);

if (!existsSync(registryFile)) {
  console.error(`Registry file not found: ${registryFile}`);
  process.exit(1);
}

// ── Discovery: find registry source files ───────────────────────

const SEARCH_PATTERNS = {
  suprateam: [
    "lib/workflow-registry.ts",
    "lib/workflow-actions.ts",
  ],
  supraloop: [
    "src/lib/flow-templates.ts",
    "src/components/visual-builder/node-palette.tsx",
  ],
  autopurchaser: [
    "lib/deal-registry.ts",
    "lib/deal-actions.ts",
  ],
};

const patterns = SEARCH_PATTERNS[consumerName];
if (!patterns) {
  console.log(`No search patterns defined for "${consumerName}", skipping scan.`);
  process.exit(0);
}

// ── Parse: extract node definitions from source ─────────────────

/**
 * Extract NodePaletteItem arrays from TypeScript source.
 * Looks for array literals assigned to variables containing "TRIGGERS" or "ACTIONS".
 */
function extractPaletteItems(source, kind) {
  const items = [];
  // Match object literals inside arrays that look like NodePaletteItem
  const pattern = /\{\s*type:\s*"(trigger|action)",\s*subType:\s*"([^"]+)",\s*label:\s*"([^"]+)",\s*description:\s*"([^"]+)",\s*icon:\s*"([^"]+)",\s*defaultConfig:\s*(\{[^}]*\})\s*\}/g;

  let match;
  while ((match = pattern.exec(source)) !== null) {
    const [, type, subType, label, description, icon, defaultConfigStr] = match;
    if (kind === "trigger" && type !== "trigger") continue;
    if (kind === "action" && type !== "action") continue;
    items.push({ type, subType, label, description, icon, defaultConfigStr });
  }
  return items;
}

/**
 * Extract config field definitions (NodeTypeRegistration) from source.
 */
function extractConfigBlocks(source) {
  const configs = {};
  // Match subType keys with their configFields arrays
  const blockPattern = /(\w+):\s*\{\s*subType:\s*"([^"]+)",\s*configFields:\s*\[([\s\S]*?)\](?:,\s*infoText:\s*"([^"]*)")?\s*\}/g;

  let match;
  while ((match = blockPattern.exec(source)) !== null) {
    const [, , subType, fieldsStr, infoText] = match;
    configs[subType] = { fieldsStr: fieldsStr.trim(), infoText: infoText || null };
  }
  return configs;
}

/**
 * Extract condition fields from source.
 */
function extractConditionFields(source) {
  const fields = [];
  const pattern = /\{\s*value:\s*"([^"]+)",\s*label:\s*"([^"]+)"\s*\}/g;

  // Only match within conditionFields array context
  const cfMatch = source.match(/conditionFields:\s*\[([\s\S]*?)\]/);
  if (!cfMatch) return fields;

  let match;
  while ((match = pattern.exec(cfMatch[1])) !== null) {
    fields.push({ value: match[1], label: match[2] });
  }
  return fields;
}

// ── Read consumer sources ───────────────────────────────────────

let combinedSource = "";
for (const pattern of patterns) {
  const filePath = join(resolvedConsumerPath, pattern);
  if (existsSync(filePath)) {
    console.log(`Reading: ${filePath}`);
    combinedSource += "\n" + readFileSync(filePath, "utf-8");
  } else {
    console.log(`Skipping (not found): ${filePath}`);
  }
}

if (!combinedSource.trim()) {
  console.log("No source files found, nothing to sync.");
  process.exit(0);
}

// ── Extract definitions ─────────────────────────────────────────

const triggers = extractPaletteItems(combinedSource, "trigger");
const actions = extractPaletteItems(combinedSource, "action");
const triggerConfigs = extractConfigBlocks(combinedSource);
const conditionFields = extractConditionFields(combinedSource);

console.log(`Found: ${triggers.length} triggers, ${actions.length} actions, ${Object.keys(triggerConfigs).length} configs, ${conditionFields.length} condition fields`);

if (triggers.length === 0 && actions.length === 0) {
  console.log("No node definitions found, skipping update.");
  process.exit(0);
}

// ── Update registry file ────────────────────────────────────────

const existingContent = readFileSync(registryFile, "utf-8");
const constPrefix = consumerName.toUpperCase().replace(/-/g, "_");

/**
 * Replace content between SYNC-START and SYNC-END markers.
 */
function replaceSyncBlock(content, blockName, newContent) {
  const startMarker = `// ── SYNC-START: ${blockName}`;
  const endMarker = `// ── SYNC-END: ${blockName}`;

  const startIdx = content.indexOf(startMarker);
  const endIdx = content.indexOf(endMarker);

  if (startIdx === -1 || endIdx === -1) {
    console.log(`Warning: SYNC markers for "${blockName}" not found, skipping.`);
    return content;
  }

  const startLineEnd = content.indexOf("\n", startIdx);
  const endLineStart = content.lastIndexOf("\n", endIdx);

  return (
    content.substring(0, startLineEnd + 1) +
    "\n" +
    newContent +
    "\n" +
    content.substring(endLineStart + 1)
  );
}

// Format triggers
function formatPaletteItems(items, varName) {
  const formatted = items
    .map((item) => `  { type: "${item.type}", subType: "${item.subType}", label: "${item.label}", description: "${item.description}", icon: "${item.icon}", defaultConfig: ${item.defaultConfigStr} },`)
    .join("\n");
  return `export const ${varName}: NodePaletteItem[] = [\n${formatted}\n];`;
}

let updatedContent = existingContent;

if (triggers.length > 0) {
  updatedContent = replaceSyncBlock(
    updatedContent,
    "triggers",
    formatPaletteItems(triggers, `${constPrefix}_TRIGGERS`)
  );
}

if (actions.length > 0) {
  updatedContent = replaceSyncBlock(
    updatedContent,
    "actions",
    formatPaletteItems(actions, `${constPrefix}_ACTIONS`)
  );
}

if (conditionFields.length > 0) {
  const cfFormatted = conditionFields
    .map((f) => `  { value: "${f.value}", label: "${f.label}" },`)
    .join("\n");
  updatedContent = replaceSyncBlock(
    updatedContent,
    "conditionFields",
    `export const ${constPrefix}_CONDITION_FIELDS = [\n${cfFormatted}\n];`
  );
}

// Write updated file
if (updatedContent !== existingContent) {
  writeFileSync(registryFile, updatedContent, "utf-8");
  console.log(`Updated: ${registryFile}`);
} else {
  console.log("No changes detected.");
}
