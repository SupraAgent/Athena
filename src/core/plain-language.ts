/**
 * Plain-language formatting for execution records.
 * Converts raw execution data into human-readable summaries.
 */
import type { ExecutionRecord, NodeExecutionEvent } from "./types";

// ── Duration formatting ─────────────────────────────────────────

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "0ms";
  if (ms < 1000) return `${Math.round(ms)}ms`;

  const seconds = ms / 1000;
  if (seconds < 60) {
    return `${seconds % 1 === 0 ? seconds : seconds.toFixed(1)}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  if (minutes < 60) {
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

// ── Node type to human verb mapping ─────────────────────────────

const NODE_TYPE_VERBS: Record<string, string> = {
  trigger: "received",
  action: "executed",
  condition: "checked",
  delay: "waited",
  code: "ran custom code",
  try_catch: "handled errors for",
  switch: "evaluated",
  loop: "iterated over",
};

/** Maps specific action subtypes to descriptive verbs. */
const ACTION_SUBTYPE_VERBS: Record<string, string> = {
  send_telegram: "sent a Telegram message",
  send_slack: "sent a Slack message",
  send_email: "sent an email",
  send_discord: "sent a Discord message",
  send_sms: "sent an SMS",
  send_notification: "sent a notification",
  http_request: "made an HTTP request",
  llm_call: "generated an AI response",
  ai_generate: "generated an AI response",
  webhook: "called a webhook",
  send_webhook: "called a webhook",
  database_query: "ran a database query",
  update_record: "updated a record",
  create_record: "created a record",
  delete_record: "deleted a record",
  fetch_data: "fetched data",
  transform_data: "transformed data",
  log: "logged a message",
  wait: "waited",
  set_variable: "set a variable",
};

const TRIGGER_SUBTYPE_VERBS: Record<string, string> = {
  webhook: "receiving a webhook",
  schedule: "a scheduled trigger",
  cron: "a cron schedule",
  manual: "a manual trigger",
  event: "an event",
  new_message: "receiving a new message",
  new_email: "receiving a new email",
  form_submission: "a form submission",
  price_alert: "a price alert",
  on_chain_event: "an on-chain event",
};

// ── Single event formatting ─────────────────────────────────────

export function formatNodeEvent(event: NodeExecutionEvent): string {
  const durationSuffix =
    event.durationMs != null ? ` (${formatDuration(event.durationMs)})` : "";

  if (event.status === "skipped") {
    const reason = event.error ? ` -- ${event.error}` : "";
    return `Skipped ${event.nodeType} node${reason}`;
  }

  if (event.status === "failed") {
    const errorMsg = event.error ? ` -- ${event.error}` : "";
    return `${capitalize(event.nodeType)} node failed${errorMsg}${durationSuffix}`;
  }

  if (event.status === "retried") {
    return `Retrying ${event.nodeType} node (attempt ${event.attempt ?? "?"})${durationSuffix}`;
  }

  if (event.status === "started") {
    return `Started ${event.nodeType} node`;
  }

  // completed
  const subType = extractSubType(event);
  if (subType && ACTION_SUBTYPE_VERBS[subType]) {
    return `${capitalize(ACTION_SUBTYPE_VERBS[subType])}${durationSuffix}`;
  }

  const verb = NODE_TYPE_VERBS[event.nodeType] ?? "processed";
  return `${capitalize(verb)} ${event.nodeType} node${durationSuffix}`;
}

// ── Full run summary ────────────────────────────────────────────

export function formatRunSummary(record: ExecutionRecord): string {
  const parts: string[] = [];

  // Collect completed events (the interesting ones)
  const completedEvents = record.nodeEvents.filter(
    (e) => e.status === "completed"
  );

  if (completedEvents.length === 0 && record.status === "running") {
    return "Workflow is running...";
  }

  if (completedEvents.length === 0 && record.status === "failed") {
    return `Workflow failed${record.error ? `: ${record.error}` : "."}`;
  }

  if (completedEvents.length === 0) {
    return `Workflow ${record.status}.`;
  }

  // Describe the trigger if present
  const triggerEvent = completedEvents.find((e) => e.nodeType === "trigger");
  if (triggerEvent) {
    const triggerSubType = extractSubType(triggerEvent) ?? record.triggerType;
    if (triggerSubType && TRIGGER_SUBTYPE_VERBS[triggerSubType]) {
      parts.push(`After ${TRIGGER_SUBTYPE_VERBS[triggerSubType]}`);
    } else if (triggerSubType) {
      parts.push(`Triggered by ${triggerSubType}`);
    }
  }

  // Describe the action nodes
  const actionEvents = completedEvents.filter(
    (e) => e.nodeType !== "trigger"
  );

  // Group by verb to avoid repetition
  const descriptions: string[] = [];
  for (const event of actionEvents) {
    const subType = extractSubType(event);
    if (subType && ACTION_SUBTYPE_VERBS[subType]) {
      descriptions.push(ACTION_SUBTYPE_VERBS[subType]);
    } else {
      const verb = NODE_TYPE_VERBS[event.nodeType];
      if (verb) {
        descriptions.push(`${verb} a ${event.nodeType} step`);
      }
    }
  }

  // Deduplicate and join
  const uniqueDescs = [...new Set(descriptions)];
  if (uniqueDescs.length > 0) {
    // If we have a trigger prefix, lowercase the first action description
    if (parts.length > 0) {
      parts.push(joinHumanList(uniqueDescs));
    } else {
      parts.push(capitalize(joinHumanList(uniqueDescs)));
    }
  }

  // Duration
  if (record.durationMs != null) {
    parts.push(`Completed in ${formatDuration(record.durationMs)}.`);
  } else if (record.status === "failed") {
    parts.push(`Failed${record.error ? `: ${record.error}` : "."}`);
  } else if (record.status === "completed") {
    parts.push("Completed successfully.");
  } else if (record.status === "paused") {
    parts.push("Paused, waiting to resume.");
  } else {
    parts.push("Running...");
  }

  // Join with comma+space for the trigger/action part, period for duration
  const sentence = parts.join(", ").replace(/, (Completed|Failed|Paused|Running)/, ". $1");
  return sentence;
}

// ── Helpers ─────────────────────────────────────────────────────

function capitalize(s: string): string {
  if (s.length === 0) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function extractSubType(event: NodeExecutionEvent): string | undefined {
  // The subtype is typically stored in input or output config
  const input = event.input as Record<string, unknown> | undefined;
  const output = event.output as Record<string, unknown> | undefined;

  // Check common config shapes
  if (input?.actionType && typeof input.actionType === "string") return input.actionType;
  if (input?.triggerType && typeof input.triggerType === "string") return input.triggerType;
  if (output?.actionType && typeof output.actionType === "string") return output.actionType;

  // Check if the nodeType itself is a known subtype
  if (ACTION_SUBTYPE_VERBS[event.nodeType]) return event.nodeType;
  if (TRIGGER_SUBTYPE_VERBS[event.nodeType]) return event.nodeType;

  return undefined;
}

function joinHumanList(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}
