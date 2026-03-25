/**
 * Built-in example applets — real, useful workflow templates
 * that ship with the Supra Automation Builder.
 */

import type { PartnerApplet } from "./types";

export const EXAMPLE_APPLETS: PartnerApplet[] = [
  // ── 1. Slack Notification on Schedule ──────────────────────
  {
    id: "applet_slack_daily_digest",
    partnerId: "partner_slack",
    partnerName: "Slack",
    name: "Slack Daily Digest",
    description:
      "Sends a daily summary message to a Slack channel at a scheduled time. Perfect for morning standup reminders, daily KPI digests, or team announcements.",
    category: "Notifications",
    tags: ["slack", "schedule", "notification", "daily", "digest"],
    template: {
      nodes: [
        {
          id: "schedule_1",
          type: "schedule",
          position: { x: 250, y: 100 },
          data: {
            nodeType: "schedule",
            label: "Daily at 9am",
            config: {
              mode: "calendar" as const,
              calendar: {
                frequency: "daily" as const,
                time: "09:00",
              },
              timezone: "America/New_York",
            },
          },
        },
        {
          id: "transform_1",
          type: "transform",
          position: { x: 250, y: 250 },
          data: {
            nodeType: "transform",
            label: "Build Message",
            config: {
              inputExpression: "{}",
              operations: [
                {
                  type: "template" as const,
                  template:
                    "{{messageTemplate}}",
                },
              ],
            },
          },
        },
        {
          id: "action_1",
          type: "action",
          position: { x: 250, y: 400 },
          data: {
            nodeType: "action",
            label: "Post to Slack",
            actionType: "slack_send_message",
            config: {
              channel: "{{channel}}",
              message: "{{steps.transform_1.output}}",
            },
          },
        },
      ],
      edges: [
        { id: "e_s1_t1", source: "schedule_1", target: "transform_1" },
        { id: "e_t1_a1", source: "transform_1", target: "action_1" },
      ],
    },
    requiredConfig: [
      {
        key: "channel",
        label: "Slack Channel",
        type: "text",
        placeholder: "#general",
        required: true,
        helpText: "The Slack channel to post the digest to (e.g. #general, #team-updates)",
      },
      {
        key: "messageTemplate",
        label: "Message Template",
        type: "text",
        placeholder: "Good morning team! Here is your daily update...",
        required: true,
        helpText: "The message content to send each day. Supports markdown formatting.",
      },
      {
        key: "slackCredential",
        label: "Slack Bot Token",
        type: "credential",
        required: true,
        helpText: "Select your Slack bot token credential",
      },
    ],
    summary:
      "Automatically posts a configurable message to your Slack channel every morning at 9am EST. Great for daily standups, announcements, or recurring reminders.",
    examples: [
      "Post a morning standup reminder to #engineering at 9am",
      "Send a daily KPI summary to #leadership",
      "Remind team of weekly goals every Monday morning",
    ],
    installs: 1842,
    rating: 4.7,
    verified: true,
    publishedAt: "2025-06-15T00:00:00.000Z",
  },

  // ── 2. Email Alert on Condition ────────────────────────────
  {
    id: "applet_email_conditional_alert",
    partnerId: "partner_email",
    partnerName: "Email",
    name: "Conditional Email Alert",
    description:
      "Monitors incoming webhook data and sends an email notification when a specified field exceeds a threshold. Ideal for stock price alerts, sensor readings, or metric monitoring.",
    category: "Notifications",
    tags: ["email", "alert", "condition", "webhook", "monitoring"],
    template: {
      nodes: [
        {
          id: "trigger_1",
          type: "trigger",
          position: { x: 250, y: 100 },
          data: {
            nodeType: "trigger",
            triggerType: "webhook",
            label: "Incoming Data",
            config: {
              method: "POST",
              path: "/alert-monitor",
            },
          },
        },
        {
          id: "condition_1",
          type: "condition",
          position: { x: 250, y: 250 },
          data: {
            nodeType: "condition",
            label: "Check Threshold",
            config: {
              field: "{{conditionField}}",
              operator: "gt",
              value: "{{threshold}}",
            },
          },
        },
        {
          id: "action_1",
          type: "action",
          position: { x: 100, y: 400 },
          data: {
            nodeType: "action",
            label: "Send Alert Email",
            actionType: "send_email",
            config: {
              to: "{{emailAddress}}",
              subject: "Alert: {{conditionField}} exceeded threshold",
              body: "The value of {{conditionField}} has exceeded your threshold of {{threshold}}. Current value: {{trigger.payload.value}}",
            },
          },
        },
      ],
      edges: [
        { id: "e_t1_c1", source: "trigger_1", target: "condition_1" },
        {
          id: "e_c1_a1",
          source: "condition_1",
          target: "action_1",
          sourceHandle: "true",
        },
      ],
    },
    requiredConfig: [
      {
        key: "emailAddress",
        label: "Alert Email",
        type: "text",
        placeholder: "alerts@company.com",
        required: true,
        helpText: "Email address to receive alert notifications",
      },
      {
        key: "conditionField",
        label: "Field to Monitor",
        type: "text",
        placeholder: "payload.temperature",
        required: true,
        helpText: "The data field path to check against the threshold",
      },
      {
        key: "threshold",
        label: "Threshold Value",
        type: "number",
        placeholder: "100",
        required: true,
        helpText: "Alert triggers when the monitored field exceeds this value",
      },
    ],
    summary:
      "Receives webhook data, checks a field against a configurable threshold, and sends an email alert when the condition is met.",
    examples: [
      "Send an email when server CPU exceeds 90%",
      "Alert when inventory drops below minimum stock level",
      "Notify when temperature sensor reads above 100F",
    ],
    installs: 2310,
    rating: 4.5,
    verified: true,
    publishedAt: "2025-05-20T00:00:00.000Z",
  },

  // ── 3. Data Sync (Webhook to Database) ─────────────────────
  {
    id: "applet_data_sync_webhook_db",
    partnerId: "partner_datasync",
    partnerName: "DataSync",
    name: "Webhook to Database Sync",
    description:
      "Receives data via webhook, transforms field names and formats, then inserts or upserts records into a database table. Supports field mapping and data normalization.",
    category: "Data",
    tags: ["webhook", "database", "sync", "transform", "etl"],
    template: {
      nodes: [
        {
          id: "trigger_1",
          type: "trigger",
          position: { x: 250, y: 100 },
          data: {
            nodeType: "trigger",
            triggerType: "webhook",
            label: "Receive Data",
            config: {
              method: "POST",
              path: "/data-sync",
            },
          },
        },
        {
          id: "transform_1",
          type: "transform",
          position: { x: 250, y: 250 },
          data: {
            nodeType: "transform",
            label: "Map Fields",
            config: {
              inputExpression: "trigger.payload",
              operations: [
                {
                  type: "rename" as const,
                  mapping: { "{{sourceField1}}": "{{destField1}}", "{{sourceField2}}": "{{destField2}}" },
                },
              ],
            },
          },
        },
        {
          id: "action_1",
          type: "action",
          position: { x: 250, y: 400 },
          data: {
            nodeType: "action",
            label: "Insert to Database",
            actionType: "database_insert",
            config: {
              table: "{{tableName}}",
              data: "{{steps.transform_1.output}}",
              onConflict: "upsert",
            },
          },
        },
      ],
      edges: [
        { id: "e_t1_tr1", source: "trigger_1", target: "transform_1" },
        { id: "e_tr1_a1", source: "transform_1", target: "action_1" },
      ],
    },
    requiredConfig: [
      {
        key: "tableName",
        label: "Database Table",
        type: "text",
        placeholder: "users",
        required: true,
        helpText: "Target database table name for data insertion",
      },
      {
        key: "sourceField1",
        label: "Source Field 1",
        type: "text",
        placeholder: "firstName",
        required: true,
        helpText: "Field name from the incoming webhook payload",
      },
      {
        key: "destField1",
        label: "Destination Field 1",
        type: "text",
        placeholder: "first_name",
        required: true,
        helpText: "Corresponding column name in the database table",
      },
      {
        key: "sourceField2",
        label: "Source Field 2",
        type: "text",
        placeholder: "lastName",
        required: false,
        helpText: "Optional second field mapping from webhook payload",
      },
      {
        key: "destField2",
        label: "Destination Field 2",
        type: "text",
        placeholder: "last_name",
        required: false,
        helpText: "Corresponding column name for the second field",
      },
      {
        key: "dbCredential",
        label: "Database Credential",
        type: "credential",
        required: true,
        helpText: "Select your database connection credential",
      },
    ],
    summary:
      "Syncs incoming webhook data to a database table with configurable field mappings and automatic upsert on conflict.",
    examples: [
      "Sync Stripe customer data to your users table",
      "Push form submissions into a leads database",
      "Mirror product catalog updates from a supplier API",
    ],
    installs: 1567,
    rating: 4.3,
    verified: true,
    publishedAt: "2025-07-01T00:00:00.000Z",
  },

  // ── 4. AI Content Generator ────────────────────────────────
  {
    id: "applet_ai_content_generator",
    partnerId: "partner_contentbot",
    partnerName: "ContentBot",
    name: "AI Content Generator",
    description:
      "On a recurring schedule, generates AI-powered content based on a configurable topic and posts the result to a webhook endpoint. Perfect for auto-generating blog drafts, social posts, or marketing copy.",
    category: "AI",
    tags: ["ai", "content", "generation", "schedule", "webhook"],
    template: {
      nodes: [
        {
          id: "schedule_1",
          type: "schedule",
          position: { x: 250, y: 100 },
          data: {
            nodeType: "schedule",
            label: "Content Schedule",
            config: {
              mode: "calendar" as const,
              calendar: {
                frequency: "weekly" as const,
                time: "10:00",
                dayOfWeek: 1,
              },
              timezone: "UTC",
            },
          },
        },
        {
          id: "action_1",
          type: "action",
          position: { x: 250, y: 250 },
          data: {
            nodeType: "action",
            label: "Generate Content",
            actionType: "ai_generate",
            config: {
              prompt:
                "Write a {{contentType}} about {{topic}}. Keep it professional and engaging. Target length: 300 words.",
              model: "gpt-4",
              maxTokens: 1000,
            },
          },
        },
        {
          id: "action_2",
          type: "action",
          position: { x: 250, y: 400 },
          data: {
            nodeType: "action",
            label: "Post to Destination",
            actionType: "webhook_post",
            config: {
              url: "{{destinationUrl}}",
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: '{"content": "{{steps.action_1.output.text}}", "topic": "{{topic}}"}',
            },
          },
        },
      ],
      edges: [
        { id: "e_s1_a1", source: "schedule_1", target: "action_1" },
        { id: "e_a1_a2", source: "action_1", target: "action_2" },
      ],
    },
    requiredConfig: [
      {
        key: "topic",
        label: "Content Topic",
        type: "text",
        placeholder: "SaaS growth strategies",
        required: true,
        helpText: "The main topic or theme for generated content",
      },
      {
        key: "contentType",
        label: "Content Type",
        type: "select",
        required: true,
        options: [
          { label: "Blog Post", value: "blog post" },
          { label: "Social Media Post", value: "social media post" },
          { label: "Newsletter", value: "newsletter" },
          { label: "Product Description", value: "product description" },
        ],
        defaultValue: "blog post",
        helpText: "The format of content to generate",
      },
      {
        key: "destinationUrl",
        label: "Destination Webhook URL",
        type: "text",
        placeholder: "https://api.example.com/content",
        required: true,
        helpText: "The webhook URL where generated content will be posted",
      },
      {
        key: "aiCredential",
        label: "AI API Key",
        type: "credential",
        required: true,
        helpText: "Select your OpenAI or compatible AI service credential",
      },
    ],
    summary:
      "Generates AI-powered content on a weekly schedule and delivers it to your chosen endpoint. Configure the topic, content type, and destination.",
    examples: [
      "Auto-generate weekly blog posts about industry trends",
      "Create daily social media content for your brand",
      "Draft weekly newsletter content for your subscribers",
    ],
    installs: 956,
    rating: 4.6,
    verified: true,
    publishedAt: "2025-08-10T00:00:00.000Z",
  },

  // ── 5. Error Monitor ───────────────────────────────────────
  {
    id: "applet_error_monitor",
    partnerId: "partner_alertops",
    partnerName: "AlertOps",
    name: "Workflow Error Monitor",
    description:
      "Watches workflow executions via webhook callbacks and alerts when the failure count exceeds a configurable threshold. Supports Slack, email, or custom webhook alerting.",
    category: "Monitoring",
    tags: ["monitoring", "errors", "alerting", "devops", "observability"],
    template: {
      nodes: [
        {
          id: "trigger_1",
          type: "trigger",
          position: { x: 250, y: 100 },
          data: {
            nodeType: "trigger",
            triggerType: "webhook",
            label: "Execution Callback",
            config: {
              method: "POST",
              path: "/error-monitor",
            },
          },
        },
        {
          id: "condition_1",
          type: "condition",
          position: { x: 250, y: 250 },
          data: {
            nodeType: "condition",
            label: "Is Failure?",
            config: {
              field: "trigger.payload.status",
              operator: "equals",
              value: "failed",
            },
          },
        },
        {
          id: "code_1",
          type: "code",
          position: { x: 100, y: 400 },
          data: {
            nodeType: "code",
            label: "Check Threshold",
            config: {
              language: "javascript" as const,
              code: `const failCount = (vars.failureCount || 0) + 1;
const threshold = Number(vars.failureThreshold) || 3;
vars.failureCount = failCount;
vars.shouldAlert = failCount >= threshold;
if (vars.shouldAlert) { vars.failureCount = 0; }
return { failCount, shouldAlert: vars.shouldAlert };`,
            },
          },
        },
        {
          id: "condition_2",
          type: "condition",
          position: { x: 100, y: 550 },
          data: {
            nodeType: "condition",
            label: "Threshold Met?",
            config: {
              field: "steps.code_1.shouldAlert",
              operator: "equals",
              value: "true",
            },
          },
        },
        {
          id: "action_1",
          type: "action",
          position: { x: -50, y: 700 },
          data: {
            nodeType: "action",
            label: "Send Alert",
            actionType: "webhook_post",
            config: {
              url: "{{alertWebhookUrl}}",
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: '{"text": "Workflow failures exceeded threshold ({{failureThreshold}}). Latest error: {{trigger.payload.error}}"}',
            },
          },
        },
      ],
      edges: [
        { id: "e_t1_c1", source: "trigger_1", target: "condition_1" },
        {
          id: "e_c1_co1",
          source: "condition_1",
          target: "code_1",
          sourceHandle: "true",
        },
        { id: "e_co1_c2", source: "code_1", target: "condition_2" },
        {
          id: "e_c2_a1",
          source: "condition_2",
          target: "action_1",
          sourceHandle: "true",
        },
      ],
    },
    requiredConfig: [
      {
        key: "alertWebhookUrl",
        label: "Alert Webhook URL",
        type: "text",
        placeholder: "https://hooks.slack.com/services/...",
        required: true,
        helpText:
          "Webhook URL to send alerts to (Slack incoming webhook, PagerDuty, or custom endpoint)",
      },
      {
        key: "failureThreshold",
        label: "Failure Threshold",
        type: "number",
        placeholder: "3",
        required: true,
        defaultValue: 3,
        helpText:
          "Number of consecutive failures before triggering an alert",
      },
    ],
    summary:
      "Monitors workflow execution callbacks and sends an alert when failures exceed your configured threshold. Resets the counter after each alert.",
    examples: [
      "Alert Slack when 3 consecutive workflow runs fail",
      "Send PagerDuty incident on repeated workflow errors",
      "Track failure rates and notify the on-call engineer",
    ],
    installs: 2089,
    rating: 4.8,
    verified: true,
    publishedAt: "2025-04-12T00:00:00.000Z",
  },

  // ── 6. Form to Spreadsheet ─────────────────────────────────
  {
    id: "applet_form_to_sheet",
    partnerId: "partner_formflow",
    partnerName: "FormFlow",
    name: "Form to Spreadsheet",
    description:
      "Receives form submission data via webhook, transforms and validates the fields, then appends a new row to a spreadsheet via a Google Sheets or compatible webhook API.",
    category: "Data",
    tags: ["form", "spreadsheet", "webhook", "google-sheets", "data-collection"],
    template: {
      nodes: [
        {
          id: "trigger_1",
          type: "trigger",
          position: { x: 250, y: 100 },
          data: {
            nodeType: "trigger",
            triggerType: "webhook",
            label: "Form Submission",
            config: {
              method: "POST",
              path: "/form-submit",
            },
          },
        },
        {
          id: "transform_1",
          type: "transform",
          position: { x: 250, y: 250 },
          data: {
            nodeType: "transform",
            label: "Extract Fields",
            config: {
              inputExpression: "trigger.payload",
              operations: [
                {
                  type: "pick" as const,
                  keys: ["name", "email", "message", "timestamp"],
                },
              ],
            },
          },
        },
        {
          id: "condition_1",
          type: "condition",
          position: { x: 250, y: 400 },
          data: {
            nodeType: "condition",
            label: "Has Email?",
            config: {
              field: "steps.transform_1.email",
              operator: "is_not_empty",
              value: "",
            },
          },
        },
        {
          id: "action_1",
          type: "action",
          position: { x: 100, y: 550 },
          data: {
            nodeType: "action",
            label: "Append to Sheet",
            actionType: "webhook_post",
            config: {
              url: "{{sheetWebhookUrl}}",
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: "{{steps.transform_1.output}}",
            },
          },
        },
      ],
      edges: [
        { id: "e_t1_tr1", source: "trigger_1", target: "transform_1" },
        { id: "e_tr1_c1", source: "transform_1", target: "condition_1" },
        {
          id: "e_c1_a1",
          source: "condition_1",
          target: "action_1",
          sourceHandle: "true",
        },
      ],
    },
    requiredConfig: [
      {
        key: "sheetWebhookUrl",
        label: "Spreadsheet Webhook URL",
        type: "text",
        placeholder: "https://script.google.com/macros/s/.../exec",
        required: true,
        helpText:
          "Google Apps Script webhook URL or compatible spreadsheet API endpoint",
      },
      {
        key: "validateEmail",
        label: "Require Email",
        type: "boolean",
        required: false,
        defaultValue: true,
        helpText: "Skip submissions that do not include an email address",
      },
    ],
    summary:
      "Captures form submissions, validates required fields, and appends each entry as a new row in your spreadsheet.",
    examples: [
      "Collect contact form submissions into Google Sheets",
      "Log event RSVPs to a spreadsheet for tracking",
      "Aggregate survey responses from a custom form",
    ],
    installs: 1245,
    rating: 4.4,
    verified: true,
    publishedAt: "2025-09-01T00:00:00.000Z",
  },
];
