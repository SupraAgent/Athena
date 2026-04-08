/**
 * CRM-specific node registry for the automation builder.
 * Defines SupraTeam's triggers, actions, config schemas, and icons.
 */
import type { NodeRegistry, NodePaletteItem, ConfigFieldDef } from "@supra/automation-builder";
import {
  ArrowRightLeft,
  PlusCircle,
  DollarSign,
  Mail,
  MessageCircle,
  Calendar,
  Webhook,
  Play,
  Send,
  Pencil,
  UserCog,
  UserPlus,
  CheckSquare,
  GitBranch,
  Clock,
  Hash,
  // New icons for 20 new nodes
  AlertTriangle,
  UserCheck,
  Timer,
  UserMinus,
  Trophy,
  XCircle,
  Radio,
  Tag,
  Minus,
  Globe,
  ListPlus,
  ListMinus,
  Sparkles,
  Brain,
  Shield,
  FilePlus,
} from "lucide-react";

// ConfigFieldDef now natively supports optionsUrl + mapOption — no cast needed

const BOARD_OPTIONS = [{ value: "", label: "Any" }, { value: "BD", label: "BD" }, { value: "Marketing", label: "Marketing" }, { value: "Admin", label: "Admin" }];
// Null-safe mapOption helpers — guard against null/undefined fields from Supabase
const safeStr = (v: unknown, fallback = ""): string => (v != null ? String(v) : fallback);

const stageMapOption = (item: Record<string, unknown>) => ({ value: safeStr(item.name), label: safeStr(item.name) });
const groupMapOption = (item: Record<string, unknown>) => ({ value: safeStr(item.telegram_group_id || item.chat_id), label: safeStr(item.group_name, "Unknown group") });
const teamMapOption = (item: Record<string, unknown>) => ({ value: safeStr(item.id), label: `${safeStr(item.display_name || item.email, "Unknown")}${item.crm_role ? ` (${safeStr(item.crm_role)})` : ""}` });
const contactMapOption = (item: Record<string, unknown>) => ({ value: safeStr(item.email), label: `${safeStr(item.name, "Unknown")}${item.email ? ` (${safeStr(item.email)})` : ""}${item.company ? ` — ${safeStr(item.company)}` : ""}` });
const slackChannelMapOption = (item: Record<string, unknown>) => ({ value: safeStr(item.channel_id || item.id), label: `#${safeStr(item.channel_name || item.name, "unknown")}` });
const slackUserMapOption = (item: Record<string, unknown>) => ({ value: safeStr(item.user_id || item.id), label: `@${safeStr(item.display_name || item.name, "unknown")}` });

// ── Palette items ───────────────────────────────────────────────

export const CRM_TRIGGERS: NodePaletteItem[] = [
  // Existing
  { type: "trigger", subType: "deal_stage_change", label: "Deal Stage Change", description: "When a deal moves stages", icon: "ArrowRightLeft", defaultConfig: {} },
  { type: "trigger", subType: "deal_created", label: "Deal Created", description: "When a new deal is added", icon: "PlusCircle", defaultConfig: {} },
  { type: "trigger", subType: "deal_value_change", label: "Deal Value Change", description: "When a deal's value changes", icon: "DollarSign", defaultConfig: {} },
  { type: "trigger", subType: "email_received", label: "Email Received", description: "When an email arrives", icon: "Mail", defaultConfig: {} },
  { type: "trigger", subType: "tg_message", label: "Telegram Message", description: "When a TG message matches", icon: "MessageCircle", defaultConfig: {} },
  { type: "trigger", subType: "calendar_event", label: "Calendar Event", description: "Google Calendar trigger", icon: "Calendar", defaultConfig: {} },
  { type: "trigger", subType: "webhook", label: "Webhook", description: "Triggered by HTTP POST", icon: "Webhook", defaultConfig: {} },
  { type: "trigger", subType: "manual", label: "Manual Trigger", description: "Run manually", icon: "Play", defaultConfig: {} },
  // New triggers
  { type: "trigger", subType: "deal_stale", label: "Deal Stale", description: "Deal idle for N days", icon: "AlertTriangle", defaultConfig: { stale_days: 7 } },
  { type: "trigger", subType: "contact_created", label: "Contact Created", description: "New contact added", icon: "UserCheck", defaultConfig: {} },
  { type: "trigger", subType: "task_overdue", label: "Task Overdue", description: "Task past due date", icon: "Timer", defaultConfig: {} },
  { type: "trigger", subType: "tg_member_joined", label: "TG Member Joined", description: "User joins a TG group", icon: "UserPlus", defaultConfig: {} },
  { type: "trigger", subType: "tg_member_left", label: "TG Member Left", description: "User leaves a TG group", icon: "UserMinus", defaultConfig: {} },
  { type: "trigger", subType: "deal_won", label: "Deal Won", description: "Deal reaches final stage", icon: "Trophy", defaultConfig: {} },
  { type: "trigger", subType: "deal_lost", label: "Deal Lost", description: "Deal marked as lost", icon: "XCircle", defaultConfig: {} },
  { type: "trigger", subType: "scheduled", label: "Scheduled", description: "Runs on a cron schedule", icon: "Clock", defaultConfig: { cron_expression: "0 9 * * 1-5" } },
  { type: "trigger", subType: "lead_qualified", label: "Lead Qualified", description: "AI agent qualifies a lead from TG conversation", icon: "Sparkles", defaultConfig: {} },
  { type: "trigger", subType: "bot_dm_received", label: "Bot DM Received", description: "When someone DMs the bot", icon: "MessageCircle", defaultConfig: {} },
];

export const CRM_ACTIONS: NodePaletteItem[] = [
  // Existing
  { type: "action", subType: "send_telegram", label: "Send Telegram", description: "Send a Telegram message", icon: "Send", defaultConfig: { message: "" } },
  { type: "action", subType: "send_email", label: "Send Email", description: "Send an email", icon: "Mail", defaultConfig: { subject: "", body: "" } },
  { type: "action", subType: "send_slack", label: "Send Slack", description: "Send a Slack message", icon: "Hash", defaultConfig: { channel_id: "", message: "", mention_user_id: "" } },
  { type: "action", subType: "update_deal", label: "Update Deal", description: "Change a deal field", icon: "Pencil", defaultConfig: { field: "stage", value: "" } },
  { type: "action", subType: "update_contact", label: "Update Contact", description: "Change a contact field", icon: "UserCog", defaultConfig: { field: "company", value: "" } },
  { type: "action", subType: "assign_deal", label: "Assign Deal", description: "Reassign deal owner", icon: "UserPlus", defaultConfig: { assign_to: "" } },
  { type: "action", subType: "create_task", label: "Create Task", description: "Add a CRM task", icon: "CheckSquare", defaultConfig: { title: "" } },
  // New actions
  { type: "action", subType: "delay", label: "Delay / Wait", description: "Pause before next step", icon: "Clock", defaultConfig: { duration: 1, unit: "hours" } },
  { type: "action", subType: "condition", label: "If / Else", description: "Branch on a condition", icon: "GitBranch", defaultConfig: { field: "stage", operator: "equals", value: "" } },
  { type: "action", subType: "send_broadcast", label: "Send Broadcast", description: "Broadcast to TG groups by slug", icon: "Radio", defaultConfig: { slug: "", message: "" } },
  { type: "action", subType: "add_tag", label: "Add Tag", description: "Tag a deal or contact", icon: "Tag", defaultConfig: { target: "deal", tag: "" } },
  { type: "action", subType: "remove_tag", label: "Remove Tag", description: "Remove a tag", icon: "Minus", defaultConfig: { target: "deal", tag: "" } },
  { type: "action", subType: "http_request", label: "HTTP Request", description: "Call an external API", icon: "Globe", defaultConfig: { method: "POST", url: "", body: "" } },
  { type: "action", subType: "add_to_sequence", label: "Add to Sequence", description: "Enroll in outreach sequence", icon: "ListPlus", defaultConfig: { sequence_id: "" } },
  { type: "action", subType: "remove_from_sequence", label: "Remove from Sequence", description: "Unenroll from sequence", icon: "ListMinus", defaultConfig: { sequence_id: "" } },
  { type: "action", subType: "ai_summarize", label: "AI Summarize", description: "Claude summarizes deal/chat", icon: "Sparkles", defaultConfig: { target: "deal_history", output_to: "deal_notes" } },
  { type: "action", subType: "ai_classify", label: "AI Classify", description: "AI scores or classifies", icon: "Brain", defaultConfig: { classification_type: "lead_quality" } },
  { type: "action", subType: "tg_manage_access", label: "TG Manage Access", description: "Add/remove user from TG groups", icon: "Shield", defaultConfig: { action: "add", slug: "" } },
  { type: "action", subType: "create_deal", label: "Create Deal", description: "Create a new deal", icon: "FilePlus", defaultConfig: { name: "", board_type: "BD" } },
];

// ── Full registry ───────────────────────────────────────────────

export const CRM_REGISTRY: NodeRegistry = {
  triggers: CRM_TRIGGERS,
  actions: CRM_ACTIONS,

  triggerConfigs: {
    deal_stage_change: {
      subType: "deal_stage_change",
      configFields: [
        { key: "from_stage", label: "From stage (optional)", type: "async_select", placeholder: "Any stage", optionsUrl: "/api/pipeline", mapOption: stageMapOption },
        { key: "to_stage", label: "To stage (optional)", type: "async_select", placeholder: "Any stage", optionsUrl: "/api/pipeline", mapOption: stageMapOption },
        { key: "board_type", label: "Board type (optional)", type: "select", options: BOARD_OPTIONS },
      ],
    },
    deal_created: {
      subType: "deal_created",
      configFields: [
        { key: "board_type", label: "Board type (optional)", type: "select", options: BOARD_OPTIONS },
      ],
    },
    email_received: {
      subType: "email_received",
      configFields: [
        { key: "from_contains", label: "From contains", type: "text", placeholder: "e.g. @supra.com" },
        { key: "subject_contains", label: "Subject contains", type: "text", placeholder: "e.g. Partnership" },
      ],
    },
    tg_message: {
      subType: "tg_message",
      configFields: [
        { key: "chat_id", label: "Telegram Group", type: "async_select", placeholder: "Any group", optionsUrl: "/api/groups", mapOption: groupMapOption },
        { key: "keyword", label: "Keyword match (optional)", type: "text", placeholder: "e.g. interested, urgent" },
      ],
      infoText: "Fires when a message is received in the selected Telegram group. Optionally filter by keyword.",
    },
    calendar_event: {
      subType: "calendar_event",
      configFields: [
        { key: "event_type", label: "Event type", type: "select", options: [{ value: "created", label: "Created" }, { value: "updated", label: "Updated" }, { value: "upcoming", label: "Upcoming" }] },
        { key: "minutes_before", label: "Minutes before (for upcoming)", type: "number", defaultValue: 15 },
      ],
    },
    webhook: { subType: "webhook", configFields: [], infoText: "Webhook URL will be generated after saving." },
    manual: { subType: "manual", configFields: [], infoText: 'Click "Run" to trigger this workflow manually.' },
    // New trigger configs
    deal_stale: {
      subType: "deal_stale",
      configFields: [
        { key: "stale_days", label: "Days without movement", type: "number", defaultValue: 7 },
        { key: "board_type", label: "Board type (optional)", type: "select", options: BOARD_OPTIONS },
        { key: "stage", label: "Stage (optional)", type: "async_select", placeholder: "Any stage", optionsUrl: "/api/pipeline", mapOption: stageMapOption },
      ],
      infoText: "Fires when a deal stays in the same stage for the specified number of days.",
    },
    contact_created: {
      subType: "contact_created",
      configFields: [
        { key: "source", label: "Source (optional)", type: "select", options: [{ value: "", label: "Any" }, { value: "telegram", label: "Telegram" }, { value: "manual", label: "Manual" }, { value: "import", label: "Import" }] },
        { key: "company_contains", label: "Company contains (optional)", type: "text", placeholder: "e.g. Supra" },
      ],
    },
    task_overdue: {
      subType: "task_overdue",
      configFields: [
        { key: "assigned_to", label: "Assigned to (optional)", type: "async_select", placeholder: "Any team member", optionsUrl: "/api/team", mapOption: teamMapOption },
        { key: "priority", label: "Priority (optional)", type: "select", options: [{ value: "", label: "Any" }, { value: "urgent", label: "Urgent" }, { value: "high", label: "High" }, { value: "normal", label: "Normal" }, { value: "low", label: "Low" }] },
      ],
    },
    tg_member_joined: {
      subType: "tg_member_joined",
      configFields: [
        { key: "chat_id", label: "Telegram Group (optional)", type: "async_select", placeholder: "Any group", optionsUrl: "/api/groups", mapOption: groupMapOption },
      ],
      infoText: "Fires when a new user joins a Telegram group managed by the bot.",
    },
    tg_member_left: {
      subType: "tg_member_left",
      configFields: [
        { key: "chat_id", label: "Telegram Group (optional)", type: "async_select", placeholder: "Any group", optionsUrl: "/api/groups", mapOption: groupMapOption },
      ],
      infoText: "Fires when a user leaves or is removed from a Telegram group.",
    },
    deal_won: {
      subType: "deal_won",
      configFields: [
        { key: "board_type", label: "Board type (optional)", type: "select", options: BOARD_OPTIONS },
        { key: "min_value", label: "Min deal value (optional)", type: "number", placeholder: "0" },
      ],
      infoText: "Fires when a deal outcome is set to Won.",
    },
    deal_lost: {
      subType: "deal_lost",
      configFields: [
        { key: "board_type", label: "Board type (optional)", type: "select", options: BOARD_OPTIONS },
      ],
      infoText: "Fires when a deal outcome is set to Lost.",
    },
    scheduled: {
      subType: "scheduled",
      configFields: [
        { key: "cron_expression", label: "Cron expression", type: "text", placeholder: "0 9 * * 1-5 (weekdays 9am)" },
        { key: "timezone", label: "Timezone", type: "text", placeholder: "Asia/Taipei" },
      ],
      infoText: "Runs on a schedule. Examples: '0 9 * * 1-5' (weekdays 9am), '0 9 * * 1' (Mondays 9am), '0 */6 * * *' (every 6 hours).",
    },
    lead_qualified: {
      subType: "lead_qualified",
      configFields: [
        { key: "board_type", label: "Board type (optional)", type: "select", options: BOARD_OPTIONS },
      ],
      infoText: "Fires when the AI agent qualifies a lead from a Telegram conversation and auto-creates a deal. Available vars: {{deal_name}}, {{contact_name}}, {{stage}}, {{qualification}}.",
    },
    bot_dm_received: {
      subType: "bot_dm_received",
      configFields: [
        { key: "keyword", label: "Keyword match (optional)", type: "text", placeholder: "e.g. pricing, support, help" },
      ],
      infoText: "Fires when a user sends a direct message to the bot. Available vars: {{sender_name}}, {{sender_username}}, {{sender_id}}, {{message_text}}.",
    },
  },

  actionConfigs: {
    send_telegram: {
      subType: "send_telegram",
      configFields: [
        { key: "message", label: "Message template", type: "textarea", placeholder: "Use {{deal_name}}, {{stage}}, {{value}}" },
        { key: "chat_id", label: "Send to group (optional)", type: "async_select", placeholder: "Default: deal's linked chat", optionsUrl: "/api/groups", mapOption: groupMapOption },
      ],
      infoText: "Variables: {{deal_name}}, {{stage}}, {{value}}, {{contact_name}}, {{company}}",
    },
    send_email: {
      subType: "send_email",
      configFields: [
        { key: "to", label: "To (optional override)", type: "async_select", placeholder: "Default: contact email", optionsUrl: "/api/contacts", mapOption: contactMapOption },
        { key: "subject", label: "Subject", type: "text", placeholder: "Email subject" },
        { key: "body", label: "Body", type: "textarea", placeholder: "Email body…" },
      ],
    },
    send_slack: {
      subType: "send_slack",
      configFields: [
        { key: "channel_id", label: "Slack Channel", type: "async_select", placeholder: "Select a channel…", optionsUrl: "/api/slack/saved-channels", mapOption: slackChannelMapOption, createUrl: "/api/slack/saved-channels", createFields: { valueKey: "channel_id", labelKey: "channel_name" } },
        { key: "mention_user_id", label: "@Mention User (optional)", type: "async_select", placeholder: "Select a user…", optionsUrl: "/api/slack/saved-users", mapOption: slackUserMapOption, createUrl: "/api/slack/saved-users", createFields: { valueKey: "user_id", labelKey: "display_name" } },
        { key: "message", label: "Message template", type: "textarea", placeholder: "*[{{group_name}}]* {{sender_name}}: {{message_text}}" },
      ],
      infoText: "Sends to your connected Slack workspace. Variables: {{sender_name}}, {{message_text}}, {{group_name}}, {{message_link}}",
    },
    update_deal: {
      subType: "update_deal",
      configFields: [
        { key: "field", label: "Field", type: "select", options: [{ value: "stage", label: "Stage" }, { value: "value", label: "Value" }, { value: "board_type", label: "Board Type" }, { value: "assigned_to", label: "Assigned To" }] },
        { key: "value", label: "New value", type: "text", placeholder: "Value…" },
      ],
    },
    update_contact: {
      subType: "update_contact",
      configFields: [
        { key: "field", label: "Field", type: "select", options: [{ value: "company", label: "Company" }, { value: "title", label: "Title" }, { value: "phone", label: "Phone" }, { value: "email", label: "Email" }, { value: "name", label: "Name" }] },
        { key: "value", label: "New value", type: "text", placeholder: "Value…" },
      ],
    },
    assign_deal: {
      subType: "assign_deal",
      configFields: [
        { key: "assign_to", label: "Assign to", type: "async_select", placeholder: "Select team member…", optionsUrl: "/api/team", mapOption: teamMapOption },
      ],
    },
    create_task: {
      subType: "create_task",
      configFields: [
        { key: "title", label: "Task title", type: "text", placeholder: "e.g. Follow up on {{deal_name}}" },
        { key: "description", label: "Description (optional)", type: "textarea", placeholder: "Task details…" },
        { key: "assigned_to", label: "Assign to (optional)", type: "async_select", placeholder: "Select team member…", optionsUrl: "/api/team", mapOption: teamMapOption },
        { key: "due_hours", label: "Due in (hours)", type: "number", defaultValue: 24 },
      ],
    },
    // New action configs
    delay: {
      subType: "delay",
      configFields: [
        { key: "duration", label: "Duration", type: "number", defaultValue: 1 },
        { key: "unit", label: "Unit", type: "select", options: [{ value: "minutes", label: "Minutes" }, { value: "hours", label: "Hours" }, { value: "days", label: "Days" }] },
      ],
      infoText: "Pauses the workflow for the specified duration before continuing to the next step.",
    },
    condition: {
      subType: "condition",
      configFields: [
        { key: "field", label: "Field", type: "select", options: [{ value: "board_type", label: "Board Type" }, { value: "stage", label: "Stage" }, { value: "value", label: "Value" }, { value: "assigned_to", label: "Assigned To" }, { value: "company", label: "Company" }, { value: "tags", label: "Tags" }] },
        { key: "operator", label: "Operator", type: "select", options: [{ value: "equals", label: "Equals" }, { value: "not_equals", label: "Not Equals" }, { value: "contains", label: "Contains" }, { value: "gt", label: "Greater Than" }, { value: "lt", label: "Less Than" }, { value: "is_empty", label: "Is Empty" }] },
        { key: "value", label: "Value", type: "text", placeholder: "Compare value…" },
      ],
      infoText: "Routes to True or False path based on the condition. Connect both outputs.",
    },
    send_broadcast: {
      subType: "send_broadcast",
      configFields: [
        { key: "chat_id", label: "Telegram Group (optional)", type: "async_select", placeholder: "All groups with slug", optionsUrl: "/api/groups", mapOption: groupMapOption },
        { key: "slug", label: "Slug filter", type: "text", placeholder: "e.g. partners, ecosystem" },
        { key: "message", label: "Message", type: "textarea", placeholder: "Broadcast message…" },
        { key: "pin", label: "Pin message", type: "select", options: [{ value: "false", label: "No" }, { value: "true", label: "Yes" }] },
      ],
      infoText: "Sends to all TG groups tagged with the specified slug, or a specific group.",
    },
    add_tag: {
      subType: "add_tag",
      configFields: [
        { key: "target", label: "Target", type: "select", options: [{ value: "deal", label: "Deal" }, { value: "contact", label: "Contact" }] },
        { key: "tag", label: "Tag name", type: "text", placeholder: "e.g. hot-lead, vip" },
      ],
    },
    remove_tag: {
      subType: "remove_tag",
      configFields: [
        { key: "target", label: "Target", type: "select", options: [{ value: "deal", label: "Deal" }, { value: "contact", label: "Contact" }] },
        { key: "tag", label: "Tag name", type: "text", placeholder: "e.g. churn-risk" },
      ],
    },
    http_request: {
      subType: "http_request",
      configFields: [
        { key: "method", label: "Method", type: "select", options: [{ value: "GET", label: "GET" }, { value: "POST", label: "POST" }, { value: "PUT", label: "PUT" }, { value: "PATCH", label: "PATCH" }, { value: "DELETE", label: "DELETE" }] },
        { key: "url", label: "URL", type: "text", placeholder: "https://api.example.com/webhook" },
        { key: "headers", label: "Headers (JSON, optional)", type: "textarea", placeholder: '{"Authorization": "Bearer xxx"}' },
        { key: "body", label: "Body (JSON, optional)", type: "textarea", placeholder: '{"deal_name": "{{deal_name}}"}' },
      ],
      infoText: "Make an HTTP request to an external API. Supports merge variables in URL and body.",
    },
    add_to_sequence: {
      subType: "add_to_sequence",
      configFields: [
        { key: "sequence_id", label: "Outreach Sequence", type: "async_select", placeholder: "Select sequence…", optionsUrl: "/api/outreach/sequences", mapOption: (item: Record<string, unknown>) => ({ value: String((item as { id?: string }).id ?? ""), label: String((item as { name?: string }).name ?? "Unknown") }) },
        { key: "start_step", label: "Start at step", type: "number", defaultValue: 1 },
      ],
      infoText: "Enrolls the deal's contact into the selected outreach sequence.",
    },
    remove_from_sequence: {
      subType: "remove_from_sequence",
      configFields: [
        { key: "sequence_id", label: "Outreach Sequence", type: "async_select", placeholder: "Select sequence…", optionsUrl: "/api/outreach/sequences", mapOption: (item: Record<string, unknown>) => ({ value: String((item as { id?: string }).id ?? ""), label: String((item as { name?: string }).name ?? "Unknown") }) },
      ],
      infoText: "Removes the contact from the specified outreach sequence.",
    },
    ai_summarize: {
      subType: "ai_summarize",
      configFields: [
        { key: "target", label: "Summarize", type: "select", options: [{ value: "deal_history", label: "Deal History" }, { value: "tg_conversation", label: "TG Conversation" }, { value: "contact_notes", label: "Contact Notes" }] },
        { key: "output_to", label: "Output to", type: "select", options: [{ value: "deal_notes", label: "Deal Notes" }, { value: "task", label: "Create Task" }, { value: "telegram", label: "Send to Telegram" }, { value: "slack", label: "Send to Slack" }] },
      ],
      infoText: "Uses Claude to generate a summary. The result is stored or sent to the selected output.",
    },
    ai_classify: {
      subType: "ai_classify",
      configFields: [
        { key: "classification_type", label: "Classify by", type: "select", options: [{ value: "lead_quality", label: "Lead Quality (1-10)" }, { value: "sentiment", label: "Sentiment" }, { value: "intent", label: "Intent" }, { value: "urgency", label: "Urgency" }] },
        { key: "field_to_update", label: "Save result to field (optional)", type: "text", placeholder: "e.g. lead_score" },
      ],
      infoText: "Uses Claude to classify or score. Result can be saved to a custom field or used in downstream conditions.",
    },
    tg_manage_access: {
      subType: "tg_manage_access",
      configFields: [
        { key: "action", label: "Action", type: "select", options: [{ value: "add", label: "Add to groups" }, { value: "remove", label: "Remove from groups" }] },
        { key: "chat_id", label: "Specific group (optional)", type: "async_select", placeholder: "Or use slug below", optionsUrl: "/api/groups", mapOption: groupMapOption },
        { key: "slug", label: "Slug (optional)", type: "text", placeholder: "e.g. partners" },
        { key: "telegram_user_id", label: "Telegram User ID (optional)", type: "text", placeholder: "Default: contact's TG ID. Or use {{contact_tg_id}}" },
      ],
      infoText: "Adds or removes a user from all Telegram groups tagged with the specified slug, or a specific group.",
    },
    create_deal: {
      subType: "create_deal",
      configFields: [
        { key: "name", label: "Deal name", type: "text", placeholder: "e.g. {{contact_name}} — Partnership" },
        { key: "board_type", label: "Board", type: "select", options: [{ value: "BD", label: "BD" }, { value: "Marketing", label: "Marketing" }, { value: "Admin", label: "Admin" }] },
        { key: "stage", label: "Initial stage", type: "async_select", placeholder: "First stage", optionsUrl: "/api/pipeline", mapOption: stageMapOption },
        { key: "value", label: "Value (optional)", type: "number", placeholder: "0" },
        { key: "assign_to", label: "Assign to (optional)", type: "async_select", placeholder: "Select team member…", optionsUrl: "/api/team", mapOption: teamMapOption },
      ],
      infoText: "Creates a new deal. Use merge variables in the name: {{contact_name}}, {{company}}, {{sender_name}}.",
    },
  },

  conditionFields: [
    { value: "board_type", label: "Board Type" },
    { value: "stage", label: "Stage" },
    { value: "value", label: "Value" },
    { value: "assigned_to", label: "Assigned To" },
    { value: "company", label: "Company" },
    { value: "tags", label: "Tags" },
    { value: "contact_source", label: "Contact Source" },
    { value: "deal_age_days", label: "Deal Age (days)" },
    { value: "outcome", label: "Outcome" },
  ],
};

// ── Icon map ────────────────────────────────────────────────────

export const CRM_ICON_MAP: Record<string, React.ElementType> = {
  // Trigger icons
  deal_stage_change: ArrowRightLeft,
  deal_created: PlusCircle,
  deal_value_change: DollarSign,
  email_received: Mail,
  tg_message: MessageCircle,
  calendar_event: Calendar,
  webhook: Webhook,
  manual: Play,
  deal_stale: AlertTriangle,
  contact_created: UserCheck,
  task_overdue: Timer,
  tg_member_joined: UserPlus,
  tg_member_left: UserMinus,
  deal_won: Trophy,
  deal_lost: XCircle,
  scheduled: Clock,
  bot_dm_received: MessageCircle,
  // Action icons
  send_telegram: Send,
  send_email: Mail,
  send_slack: Hash,
  update_deal: Pencil,
  update_contact: UserCog,
  assign_deal: UserPlus,
  create_task: CheckSquare,
  delay: Clock,
  condition: GitBranch,
  send_broadcast: Radio,
  add_tag: Tag,
  remove_tag: Minus,
  http_request: Globe,
  add_to_sequence: ListPlus,
  remove_from_sequence: ListMinus,
  ai_summarize: Sparkles,
  ai_classify: Brain,
  tg_manage_access: Shield,
  create_deal: FilePlus,
  // Sidebar palette icons (by icon name)
  ArrowRightLeft, PlusCircle, DollarSign, Mail, MessageCircle, Calendar, Webhook, Play,
  Send, Pencil, UserCog, UserPlus, CheckSquare, GitBranch, Clock, Hash,
  AlertTriangle, UserCheck, Timer, UserMinus, Trophy, XCircle, Radio,
  Tag, Minus, Globe, ListPlus, ListMinus, Sparkles, Brain, Shield, FilePlus,
};
