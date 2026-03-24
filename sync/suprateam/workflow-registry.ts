/**
 * CRM-specific node registry for the automation builder.
 * Defines SupraTeam's triggers, actions, config schemas, and icons.
 */
import type { NodeRegistry, NodePaletteItem } from "../packages/automation-builder/dist/index";
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
} from "lucide-react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyField = any; // async_select fields use extended props not in base ConfigFieldDef

// ── Palette items ───────────────────────────────────────────────

export const CRM_TRIGGERS: NodePaletteItem[] = [
  { type: "trigger", subType: "deal_stage_change", label: "Deal Stage Change", description: "When a deal moves stages", icon: "ArrowRightLeft", defaultConfig: {} },
  { type: "trigger", subType: "deal_created", label: "Deal Created", description: "When a new deal is added", icon: "PlusCircle", defaultConfig: {} },
  { type: "trigger", subType: "deal_value_change", label: "Deal Value Change", description: "When a deal's value changes", icon: "DollarSign", defaultConfig: {} },
  { type: "trigger", subType: "email_received", label: "Email Received", description: "When an email arrives", icon: "Mail", defaultConfig: {} },
  { type: "trigger", subType: "tg_message", label: "Telegram Message", description: "When a TG message matches", icon: "MessageCircle", defaultConfig: {} },
  { type: "trigger", subType: "calendar_event", label: "Calendar Event", description: "Google Calendar trigger", icon: "Calendar", defaultConfig: {} },
  { type: "trigger", subType: "webhook", label: "Webhook", description: "Triggered by HTTP POST", icon: "Webhook", defaultConfig: {} },
  { type: "trigger", subType: "manual", label: "Manual Trigger", description: "Run manually", icon: "Play", defaultConfig: {} },
];

export const CRM_ACTIONS: NodePaletteItem[] = [
  { type: "action", subType: "send_telegram", label: "Send Telegram", description: "Send a Telegram message", icon: "Send", defaultConfig: { message: "" } },
  { type: "action", subType: "send_email", label: "Send Email", description: "Send an email", icon: "Mail", defaultConfig: { subject: "", body: "" } },
  { type: "action", subType: "send_slack", label: "Send Slack", description: "Send a Slack message", icon: "Hash", defaultConfig: { channel_id: "", message: "*[{{group_name}}]* {{sender_name}}: {{message_text}}\n<{{message_link}}|View in Telegram>", mention_user_id: "" } },
  { type: "action", subType: "update_deal", label: "Update Deal", description: "Change a deal field", icon: "Pencil", defaultConfig: { field: "stage", value: "" } },
  { type: "action", subType: "update_contact", label: "Update Contact", description: "Change a contact field", icon: "UserCog", defaultConfig: { field: "company", value: "" } },
  { type: "action", subType: "assign_deal", label: "Assign Deal", description: "Reassign deal owner", icon: "UserPlus", defaultConfig: { assign_to: "" } },
  { type: "action", subType: "create_task", label: "Create Task", description: "Add a CRM task", icon: "CheckSquare", defaultConfig: { title: "" } },
];

// ── Full registry ───────────────────────────────────────────────

export const CRM_REGISTRY: NodeRegistry = {
  triggers: CRM_TRIGGERS,
  actions: CRM_ACTIONS,

  triggerConfigs: {
    deal_stage_change: {
      subType: "deal_stage_change",
      configFields: [
        { key: "from_stage", label: "From stage (optional)", type: "async_select", placeholder: "Any stage", optionsUrl: "/api/pipeline", mapOption: (item: Record<string, unknown>) => ({ value: String((item as { name?: string }).name ?? ""), label: String((item as { name?: string }).name ?? "") }) } as AnyField,
        { key: "to_stage", label: "To stage (optional)", type: "async_select", placeholder: "Any stage", optionsUrl: "/api/pipeline", mapOption: (item: Record<string, unknown>) => ({ value: String((item as { name?: string }).name ?? ""), label: String((item as { name?: string }).name ?? "") }) } as AnyField,
        { key: "board_type", label: "Board type (optional)", type: "select", options: [{ value: "", label: "Any" }, { value: "BD", label: "BD" }, { value: "Marketing", label: "Marketing" }, { value: "Admin", label: "Admin" }] },
      ],
    },
    deal_created: {
      subType: "deal_created",
      configFields: [
        { key: "board_type", label: "Board type (optional)", type: "select", options: [{ value: "", label: "Any" }, { value: "BD", label: "BD" }, { value: "Marketing", label: "Marketing" }, { value: "Admin", label: "Admin" }] },
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
        { key: "chat_id", label: "Telegram Group", type: "async_select", placeholder: "Any group", optionsUrl: "/api/groups", mapOption: (item: Record<string, unknown>) => ({ value: String((item as { chat_id?: unknown }).chat_id ?? ""), label: String((item as { group_name?: string }).group_name ?? "Unknown group") }) } as AnyField,
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
    webhook: {
      subType: "webhook",
      configFields: [],
      infoText: "Webhook URL will be generated after saving.",
    },
    manual: {
      subType: "manual",
      configFields: [],
      infoText: 'Click "Run" to trigger this workflow manually.',
    },
  },

  actionConfigs: {
    send_telegram: {
      subType: "send_telegram",
      configFields: [
        { key: "message", label: "Message template", type: "textarea", placeholder: "Use {{deal_name}}, {{stage}}, {{value}}" },
        { key: "chat_id", label: "Send to group (optional)", type: "async_select", placeholder: "Default: deal's linked chat", optionsUrl: "/api/groups", mapOption: (item: Record<string, unknown>) => ({ value: String((item as { chat_id?: unknown }).chat_id ?? ""), label: String((item as { group_name?: string }).group_name ?? "Unknown group") }) } as AnyField,
      ],
      infoText: "Variables: {{deal_name}}, {{stage}}, {{value}}, {{contact_name}}, {{company}}",
    },
    send_email: {
      subType: "send_email",
      configFields: [
        { key: "to", label: "To (optional override)", type: "async_select", placeholder: "Default: contact email", optionsUrl: "/api/contacts", mapOption: (item: Record<string, unknown>) => { const c = item as { email?: string; name?: string; company?: string }; return { value: c.email || "", label: `${c.name || "Unknown"}${c.email ? ` (${c.email})` : ""}${c.company ? ` — ${c.company}` : ""}` }; } } as AnyField,
        { key: "subject", label: "Subject", type: "text", placeholder: "Email subject" },
        { key: "body", label: "Body", type: "textarea", placeholder: "Email body…" },
      ],
    },
    send_slack: {
      subType: "send_slack",
      configFields: [
        { key: "channel_id", label: "Slack Channel", type: "async_select", placeholder: "Select a channel…", optionsUrl: "/api/slack/channels", mapOption: (item: Record<string, unknown>) => ({ value: String((item as { id?: string }).id ?? ""), label: `#${(item as { name?: string }).name ?? "unknown"}` }) } as AnyField,
        { key: "mention_user_id", label: "@Mention User (optional)", type: "async_select", placeholder: "Select a user…", optionsUrl: "/api/slack/users", mapOption: (item: Record<string, unknown>) => ({ value: String((item as { id?: string }).id ?? ""), label: `@${(item as { display_name?: string; name?: string }).display_name || (item as { name?: string }).name || "unknown"}` }) } as AnyField,
        { key: "message", label: "Message template", type: "textarea", placeholder: "*[{{group_name}}]* {{sender_name}}: {{message_text}}\n<{{message_link}}|View in Telegram>" },
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
        { key: "assign_to", label: "Assign to", type: "async_select", placeholder: "Select team member…", optionsUrl: "/api/team", mapOption: (item: Record<string, unknown>) => { const u = item as { id?: string; display_name?: string; email?: string; crm_role?: string }; return { value: u.id || "", label: `${u.display_name || u.email || "Unknown"}${u.crm_role ? ` (${u.crm_role})` : ""}` }; } } as AnyField,
      ],
      infoText: "Tip: Use {{current_user}} in a text override to assign to the workflow creator.",
    },
    create_task: {
      subType: "create_task",
      configFields: [
        { key: "title", label: "Task title", type: "text", placeholder: "e.g. Follow up on {{deal_name}}" },
        { key: "description", label: "Description (optional)", type: "textarea", placeholder: "Task details…" },
        { key: "due_hours", label: "Due in (hours)", type: "number", defaultValue: 24 },
      ],
    },
  },

  conditionFields: [
    { value: "board_type", label: "Board Type" },
    { value: "stage", label: "Stage" },
    { value: "value", label: "Value" },
    { value: "assigned_to", label: "Assigned To" },
    { value: "company", label: "Company" },
    { value: "tags", label: "Tags" },
  ],
};

// ── Icon map ────────────────────────────────────────────────────

export const CRM_ICON_MAP: Record<string, React.ElementType> = {
  // Trigger icons (by subType)
  deal_stage_change: ArrowRightLeft,
  deal_created: PlusCircle,
  deal_value_change: DollarSign,
  email_received: Mail,
  tg_message: MessageCircle,
  calendar_event: Calendar,
  webhook: Webhook,
  manual: Play,
  // Action icons (by subType)
  send_telegram: Send,
  send_email: Mail,
  send_slack: Hash,
  update_deal: Pencil,
  update_contact: UserCog,
  assign_deal: UserPlus,
  create_task: CheckSquare,
  // Sidebar palette icons (by icon name)
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
};
