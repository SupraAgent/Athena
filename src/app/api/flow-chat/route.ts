import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { DEFAULT_CLAUDE_MODEL } from "@/lib/llm-client";
import { requireAuth } from "@/lib/auth-guard";
import { sanitizeErrorMessage } from "@supra/builder";

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const body = await request.json();
  const { apiKey, message, currentNodes, currentEdges, canvasSummary, category, history } = body;

  if (!apiKey) {
    return NextResponse.json(
      { error: "Anthropic API key required. Set it in Settings." },
      { status: 400 }
    );
  }

  const client = new Anthropic({ apiKey });

  const systemPrompt = `You are the Builder Assistant for Athena, a visual automation builder. You help users build workflow flows, create custom nodes, and manage templates.

You operate inside a self-contained builder app with a drag-and-drop canvas. Users can build workflow chains where each node is a card that connects to others.

## Available Built-in Node Types

CORE NODES:
- personaNode: AI team members with { label, role, voteWeight, expertise[], personality, emoji }
- appNode: The user's app with { label, description, targetUsers, coreValue, currentState }
- competitorNode: Reference apps with { label, why, overallScore, cpoName }
- actionNode: Workflow steps with { label, actionType ("score"|"analyze"|"improve"|"generate"|"commit"), description }
- noteNode: Annotations with { label, content }
- stepNode: Pipeline steps with { label, stepIndex, subtitle, status ("pending"|"active"|"completed"), summary, flowCategory ("team"|"app"|"benchmark"|"scoring"|"improve") }
- consensusNode: Persona group bucket with { label, personas: [{ name, role, emoji, voteWeight, isCeo }], consensusScore }
- affinityCategoryNode: Scoring category with { label, weight, score, domainExpert }

WORKFLOW NODES:
- triggerNode: Start workflow with { label, triggerType ("manual"|"schedule"|"webhook"|"event"), config }
- conditionNode: Branch logic with { label, condition }. Has "true" and "false" source handles
- transformNode: Data transformation with { label, transformType ("map"|"filter"|"merge"|"extract"|"custom"), expression }
- outputNode: Send results with { label, outputType ("log"|"api"|"file"|"notify"|"github"), destination }
- llmNode: AI/Claude node with { label, provider ("claude"|"claude-code"|"ollama"|"custom"), model, systemPrompt, temperature?, maxTokens? }

INTEGRATION NODES:
- httpNode: Make API calls with { label, method ("GET"|"POST"|"PUT"|"PATCH"|"DELETE"), url, headers, body, timeout, authType ("none"|"bearer"|"basic"|"api-key"), authValue }
- webhookNode: Receive HTTP calls with { label, webhookMethod ("POST"|"GET"|"PUT"|"ANY"), path, secret, responseCode, responseBody }
- emailNode: Send & read email with { label, emailAction ("send"|"read"|"reply"|"forward"), to, subject, body, format ("text"|"html"), provider ("smtp"|"sendgrid"|"resend") }
- databaseNode: Query databases with { label, dbAction ("query"|"insert"|"update"|"delete"|"upsert"), dbType ("postgres"|"mysql"|"mongodb"|"supabase"|"sqlite"), connectionString, table, query, params }
- storageNode: File storage with { label, storageAction ("read"|"write"|"list"|"delete"|"copy"), provider ("s3"|"r2"|"supabase"|"local"), bucket, path, content }

DATA NODES:
- jsonNode: Parse & build JSON with { label, jsonAction ("parse"|"stringify"|"extract"|"build"|"validate"), expression, template, strict }
- textNode: Text processing with { label, textAction ("split"|"join"|"replace"|"truncate"|"template"|"regex"), delimiter, pattern, replacement, maxLength, template }
- aggregatorNode: Combine & reduce with { label, aggregateType ("concat"|"sum"|"average"|"min"|"max"|"count"), separator, field }
- validatorNode: Validate data with { label, validationType ("required"|"type-check"|"range"|"regex"|"schema"|"custom"), field, rule, errorMessage }. Has "pass" and "fail" source handles
- formatterNode: Format output with { label, formatType ("markdown"|"html"|"csv"|"table"|"yaml"|"xml"), template, includeHeaders }

LOGIC NODES:
- loopNode: Iterate with { label, loopType ("forEach"|"times"|"while"|"map"), maxIterations, field, condition }. Has "item" and "done" source handles
- switchNode: Multi-way routing with { label, matchType ("exact"|"contains"|"regex"|"range"|"type"), field, cases (JSON array) }
- delayNode: Wait & throttle with { label, delayType ("fixed"|"random"|"throttle"|"debounce"|"cron"), duration, maxDuration, schedule }
- errorHandlerNode: Catch errors with { label, errorAction ("catch"|"retry"|"fallback"|"log"|"ignore"), maxRetries, fallbackValue, logLevel }. Has "success" and "error" source handles
- mergeNode: Join branches with { label, mergeStrategy ("waitAll"|"firstComplete"|"combine"|"zip"|"append"), outputFormat ("array"|"object"|"text"), separator }

AI NODES:
- classifierNode: Categorize text with { label, classifyType ("sentiment"|"topic"|"intent"|"spam"|"language"|"custom"), categories, confidence, multiLabel }
- summarizerNode: Summarize text with { label, summaryStyle ("bullets"|"abstract"|"tldr"|"takeaways"|"headline"|"custom"), maxLength, language, customPrompt }
- searchNode: Web search with { label, searchProvider ("brave"|"serper"|"tavily"|"google"|"bing"), query, maxResults, includeSnippets, safeSearch }
- embeddingNode: Vector embeddings with { label, embeddingAction ("embed"|"similarity"|"cluster"|"nearest"|"store"), provider ("openai"|"cohere"|"voyage"|"ollama"), model, dimensions }
- extractorNode: Extract structured data with { label, extractType ("entities"|"dates"|"amounts"|"contacts"|"table"|"custom"), fields, outputFormat ("json"|"csv"|"text"), instructions }

## Creating Custom User Nodes

When the user asks you to create a new custom node type, respond with a \`\`\`user-node block. These get saved to the user's node library and appear in their palette.

\`\`\`user-node
{
  "label": "Node Name",
  "description": "What this node does",
  "emoji": "🔌",
  "color": "#818cf8",
  "inputs": 1,
  "outputs": 1,
  "fields": [
    { "key": "label", "label": "Label", "type": "text", "defaultValue": "Node Name" },
    { "key": "url", "label": "URL", "type": "text", "defaultValue": "", "placeholder": "https://..." },
    { "key": "method", "label": "Method", "type": "select", "defaultValue": "GET", "options": ["GET", "POST", "PUT", "DELETE"] },
    { "key": "timeout", "label": "Timeout (ms)", "type": "number", "defaultValue": 5000 },
    { "key": "enabled", "label": "Enabled", "type": "boolean", "defaultValue": true }
  ]
}
\`\`\`

Field types: "text", "textarea", "number", "select", "boolean"
Always include a "label" field. Choose a relevant emoji and color.
Be creative with field definitions — think about what configuration the node would need.

## Creating / Modifying Flows

When the user asks to create or modify a flow, respond with a \`\`\`flow-json block:

\`\`\`flow-json
{ "nodes": [...], "edges": [...] }
\`\`\`

- Node positions: spread out (x: 0-1200, y: 0-600)
- Edges: use "smoothstep" type, can have animated: true
- Each node needs unique id, type, position {x, y}, and data object
- For conditionNode edges, use sourceHandle: "true" or "false"
- For user-created node types, use the nodeType from their definition

## Saving Templates

If the user asks to save as a template:
\`\`\`save-template
{"name": "Template Name", "description": "What it does"}
\`\`\`

## Context

Current canvas category: "${category}"
Current canvas has ${currentNodes?.length ?? 0} nodes and ${currentEdges?.length ?? 0} edges.

Keep responses concise. Focus on building what they asked for. If the user asks a question, answer conversationally without code blocks.`;

  try {
    const messages = [
      ...(history ?? []).map((h: { role: string; content: string }) => ({
        role: h.role as "user" | "assistant",
        content: h.content,
      })),
      {
        role: "user" as const,
        content: canvasSummary
          ? `Current canvas:\n${canvasSummary}\n\nUser request: ${message}`
          : `Current nodes: ${JSON.stringify(currentNodes?.slice(0, 50) ?? [])}\n\nCurrent edges: ${JSON.stringify(currentEdges?.slice(0, 50) ?? [])}\n\nUser request: ${message}`,
      },
    ];

    const response = await client.messages.create({
      model: DEFAULT_CLAUDE_MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      messages,
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "";

    // Parse flow-json blocks
    let flowUpdate = null;
    const flowMatch = text.match(/```flow-json\s*([\s\S]*?)```/);
    if (flowMatch) {
      try {
        flowUpdate = JSON.parse(flowMatch[1].trim());
      } catch {
        // Ignore parse errors
      }
    }

    // Parse save-template blocks
    let saveAsTemplate = null;
    const saveMatch = text.match(/```save-template\s*([\s\S]*?)```/);
    if (saveMatch) {
      try {
        saveAsTemplate = JSON.parse(saveMatch[1].trim());
      } catch {
        // Ignore parse errors
      }
    }

    // Parse user-node blocks server-side and return as structured data
    let userNodeDef = null;
    const userNodeMatch = text.match(/```user-node\s*([\s\S]*?)```/);
    if (userNodeMatch) {
      try {
        userNodeDef = JSON.parse(userNodeMatch[1].trim());
      } catch {
        // Ignore parse errors
      }
    }

    // Clean ALL code blocks from the display message
    const cleanMessage = text
      .replace(/```flow-json[\s\S]*?```/g, "")
      .replace(/```save-template[\s\S]*?```/g, "")
      .replace(/```user-node[\s\S]*?```/g, "")
      .trim();

    return NextResponse.json({
      message: cleanMessage || "Here's your updated flow:",
      flowUpdate,
      saveAsTemplate,
      userNodeDef,
    });
  } catch (err) {
    const rawMessage = err instanceof Error ? err.message : "AI request failed";
    // Strip any API key patterns from error messages
    const errorMessage = sanitizeErrorMessage(rawMessage);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
