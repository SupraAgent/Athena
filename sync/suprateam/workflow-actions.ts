/**
 * Workflow action executors.
 * Each function handles one action node type, wrapping existing CRM infrastructure.
 */
import { createSupabaseAdmin } from "@/lib/supabase";
import { sendTelegramWithTracking } from "@/lib/telegram-send";
import { renderTemplate } from "@/lib/telegram-templates";
import { getDriverForUser } from "@/lib/email/driver";
// Config types are now simple Record<string, unknown> from the generic builder.
// We define local interfaces for type safety in the executor functions.
import { getSlackToken, sendSlackMessage } from "@/lib/slack";

interface ActionSendTelegramConfig {
  message: string;
  chat_id?: string;
}

interface ActionSendEmailConfig {
  to?: string;
  subject: string;
  body: string;
  template_id?: string;
}

interface ActionSendSlackConfig {
  channel_id: string;
  channel_name?: string;
  message: string;
  mention_user_id?: string;
  mention_user_name?: string;
}

interface ActionUpdateDealConfig {
  field: string;
  value: string;
}

interface ActionUpdateContactConfig {
  field: string;
  value: string;
}

interface ActionAssignDealConfig {
  assign_to: string;
}

interface ActionCreateTaskConfig {
  title: string;
  description?: string;
  due_hours?: number;
}

export interface ActionContext {
  workflowId: string;
  runId: string;
  dealId?: string;
  contactId?: string;
  userId?: string; // created_by on the workflow
  vars: Record<string, string | number | undefined>; // template variables
}

export interface ActionResult {
  success: boolean;
  output?: Record<string, unknown>;
  error?: string;
}

/**
 * Execute a "send_telegram" action.
 * Sends to the deal's linked chat (or override chat_id).
 */
export async function executeSendTelegram(
  config: ActionSendTelegramConfig,
  ctx: ActionContext
): Promise<ActionResult> {
  const supabase = createSupabaseAdmin();
  if (!supabase) return { success: false, error: "Supabase not configured" };

  // Resolve chat ID
  let chatId = config.chat_id ? Number(config.chat_id) : null;

  if (!chatId && ctx.dealId) {
    const { data: deal } = await supabase
      .from("crm_deals")
      .select("telegram_chat_id")
      .eq("id", ctx.dealId)
      .single();
    chatId = deal?.telegram_chat_id ?? null;
  }

  if (!chatId) {
    return { success: false, error: "No chat ID available" };
  }

  const message = renderTemplate(config.message || "{{deal_name}}", ctx.vars);

  const result = await sendTelegramWithTracking({
    chatId,
    text: message,
    notificationType: "workflow",
    dealId: ctx.dealId,
  });

  return {
    success: result.success,
    output: { messageId: result.messageId },
    error: result.error,
  };
}

/**
 * Execute a "send_email" action.
 * Uses the workflow creator's email connection.
 */
export async function executeSendEmail(
  config: ActionSendEmailConfig,
  ctx: ActionContext
): Promise<ActionResult> {
  if (!ctx.userId) {
    return { success: false, error: "No user context for email" };
  }

  try {
    const { driver } = await getDriverForUser(ctx.userId);

    // Resolve recipient
    let to = config.to;
    if (!to && ctx.contactId) {
      const supabase = createSupabaseAdmin();
      if (supabase) {
        const { data: contact } = await supabase
          .from("crm_contacts")
          .select("email")
          .eq("id", ctx.contactId)
          .single();
        to = contact?.email ?? undefined;
      }
    }

    if (!to) {
      return { success: false, error: "No recipient email" };
    }

    const subject = renderTemplate(config.subject || "", ctx.vars);
    const body = renderTemplate(config.body || "", ctx.vars);

    const msg = await driver.send({
      to: [{ name: to, email: to }],
      subject,
      body,
    });

    return {
      success: true,
      output: { messageId: msg.id, to },
    };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

/**
 * Execute a "send_slack" action.
 * Sends a message to a Slack channel with optional @mention.
 */
export async function executeSendSlack(
  config: ActionSendSlackConfig,
  ctx: ActionContext
): Promise<ActionResult> {
  const token = await getSlackToken();
  if (!token) {
    return { success: false, error: "Slack not connected — add token in Settings" };
  }

  if (!config.channel_id) {
    return { success: false, error: "No Slack channel selected" };
  }

  // Use shared renderTemplate for consistency (handles conditionals, filters, fallbacks)
  let message = renderTemplate(config.message || "{{message_text}}", ctx.vars);

  // Prepend @mention if configured
  if (config.mention_user_id) {
    message = `<@${config.mention_user_id}> ${message}`;
  }

  const result = await sendSlackMessage(token, config.channel_id, message);

  return {
    success: result.ok,
    output: { slackMessageTs: result.ts, channel: config.channel_id },
    error: result.error,
  };
}

/**
 * Execute an "update_deal" action.
 */
export async function executeUpdateDeal(
  config: ActionUpdateDealConfig,
  ctx: ActionContext
): Promise<ActionResult> {
  if (!ctx.dealId) {
    return { success: false, error: "No deal context" };
  }

  const supabase = createSupabaseAdmin();
  if (!supabase) return { success: false, error: "Supabase not configured" };

  const value = renderTemplate(config.value || "", ctx.vars);

  // Allowlist of safe fields to prevent arbitrary column writes
  const ALLOWED_FIELDS = ["deal_name", "value", "probability", "board_type", "notes", "priority", "assigned_to", "stage"];
  if (!ALLOWED_FIELDS.includes(config.field)) {
    return { success: false, error: `Invalid deal field: ${config.field}` };
  }

  // Handle stage changes specially — need to resolve stage ID
  if (config.field === "stage") {
    const { data: stage } = await supabase
      .from("pipeline_stages")
      .select("id")
      .eq("name", value)
      .single();

    if (!stage) {
      return { success: false, error: `Stage "${value}" not found` };
    }

    const { error } = await supabase
      .from("crm_deals")
      .update({ stage_id: stage.id })
      .eq("id", ctx.dealId);

    return error
      ? { success: false, error: error.message }
      : { success: true, output: { field: "stage", value } };
  }

  // Generic field update
  const { error } = await supabase
    .from("crm_deals")
    .update({ [config.field]: value })
    .eq("id", ctx.dealId);

  return error
    ? { success: false, error: error.message }
    : { success: true, output: { field: config.field, value } };
}

/**
 * Execute a "create_task" action.
 * Creates a reminder/task linked to the deal.
 */
export async function executeCreateTask(
  config: ActionCreateTaskConfig,
  ctx: ActionContext
): Promise<ActionResult> {
  const supabase = createSupabaseAdmin();
  if (!supabase) return { success: false, error: "Supabase not configured" };

  const title = renderTemplate(config.title || "Task", ctx.vars);
  const description = config.description
    ? renderTemplate(config.description, ctx.vars)
    : null;

  const dueHours = config.due_hours ?? 24;
  const dueAt = new Date(Date.now() + dueHours * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("crm_deal_reminders")
    .insert({
      deal_id: ctx.dealId || null,
      reminder_type: "follow_up",
      message: title + (description ? `\n${description}` : ""),
      due_at: dueAt,
    })
    .select("id")
    .single();

  return error
    ? { success: false, error: error.message }
    : { success: true, output: { taskId: data?.id, title, dueAt } };
}

/**
 * Execute an "update_contact" action.
 * Updates a field on the deal's linked contact.
 */
export async function executeUpdateContact(
  config: ActionUpdateContactConfig,
  ctx: ActionContext
): Promise<ActionResult> {
  const supabase = createSupabaseAdmin();
  if (!supabase) return { success: false, error: "Supabase not configured" };

  // Resolve contact ID from deal if not in context
  let contactId = ctx.contactId;
  if (!contactId && ctx.dealId) {
    const { data: deal } = await supabase
      .from("crm_deals")
      .select("contact_id")
      .eq("id", ctx.dealId)
      .single();
    contactId = deal?.contact_id ?? undefined;
  }

  if (!contactId) {
    return { success: false, error: "No contact context" };
  }

  const value = renderTemplate(config.value || "", ctx.vars);
  const ALLOWED_FIELDS = ["company", "title", "phone", "email", "name"];
  if (!ALLOWED_FIELDS.includes(config.field)) {
    return { success: false, error: `Invalid contact field: ${config.field}` };
  }

  const { error } = await supabase
    .from("crm_contacts")
    .update({ [config.field]: value })
    .eq("id", contactId);

  return error
    ? { success: false, error: error.message }
    : { success: true, output: { field: config.field, value, contactId } };
}

/**
 * Execute an "assign_deal" action.
 * Reassigns the deal to a different user.
 */
export async function executeAssignDeal(
  config: ActionAssignDealConfig,
  ctx: ActionContext
): Promise<ActionResult> {
  if (!ctx.dealId) {
    return { success: false, error: "No deal context" };
  }

  const supabase = createSupabaseAdmin();
  if (!supabase) return { success: false, error: "Supabase not configured" };

  const assignTo = renderTemplate(config.assign_to || "", ctx.vars);
  if (!assignTo) {
    return { success: false, error: "No assign_to specified" };
  }

  const { error } = await supabase
    .from("crm_deals")
    .update({ assigned_to: assignTo, updated_at: new Date().toISOString() })
    .eq("id", ctx.dealId);

  return error
    ? { success: false, error: error.message }
    : { success: true, output: { assigned_to: assignTo } };
}
