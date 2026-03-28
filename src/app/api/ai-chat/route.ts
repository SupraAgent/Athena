import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

/**
 * POST: Global AI assistant chat for Athena.
 * Context-aware — knows the current page.
 */
export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "AI not configured. Set ANTHROPIC_API_KEY." },
      { status: 503 }
    );
  }

  let body: {
    messages: { role: string; content: string }[];
    context?: {
      page?: string;
      workflowNodes?: unknown[];
      workflowEdges?: unknown[];
      pageData?: Record<string, unknown>;
    };
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (!body.messages?.length) {
    return NextResponse.json({ error: "messages required" }, { status: 400 });
  }

  const systemPrompt = buildSystemPrompt(body.context);

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4000,
        system: systemPrompt,
        messages: body.messages.map((m) => ({
          role: m.role === "user" ? "user" : "assistant",
          content: m.content,
        })),
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Claude API error: ${res.status} ${err}`);
    }

    const data = await res.json();
    const rawText: string = data.content?.[0]?.text ?? "";

    return NextResponse.json({ data: { reply: rawText }, source: "ai" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "AI request failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function buildSystemPrompt(context?: {
  page?: string;
  workflowNodes?: unknown[];
  workflowEdges?: unknown[];
  pageData?: Record<string, unknown>;
}): string {
  const page = context?.page ?? "/";

  let prompt = `You are Athena AI, a helpful assistant for a recursive improvement engine.
You help users benchmark apps against competitors, create AI-generated CPO personas, build visual workflows, and ship improvements.
Be concise and direct. Use short paragraphs.

Athena features:
- Workflow Builder: Visual drag-and-drop workflow builder with 13 node types (personas, apps, competitors, LLM, triggers, conditions, transforms, outputs)
- Improvement Loop: Recursive benchmarking engine — score apps against competitors using AI CPO personas
- Persona Studio: Create and customize AI CPO personas for product evaluation
- Launch Kit: Generate launch strategies and go-to-market plans
- Design-to-Ship: Turn designs into shipped features
- VibeCode: AI-powered code generation
- Auto-Research: Deep competitive analysis with AI
- Agent Tasks: Manage AI agent task execution`;

  if (page.startsWith("/builder")) {
    prompt += `

CURRENT PAGE: Workflow Builder
You are helping the user build visual automation workflows. You can help with:
- Designing workflow architectures (trigger → process → output)
- Choosing the right node types for their use case
- Connecting personas to improvement loops
- LLM node configuration (model selection, prompt design)
- Debugging workflow execution issues
- Suggesting workflow templates for common patterns`;

    if (context?.workflowNodes?.length) {
      prompt += `

CURRENT WORKFLOW STATE (${context.workflowNodes.length} nodes):
Nodes: ${JSON.stringify(context.workflowNodes)}
Edges: ${JSON.stringify(context.workflowEdges)}`;
    }
  } else if (page.startsWith("/improve")) {
    prompt += `

CURRENT PAGE: Improvement Loop
You are helping the user run recursive improvement cycles. You can help with:
- Setting up benchmark comparisons
- Interpreting CPO persona feedback
- Prioritizing improvement gaps
- Understanding scoring methodology
- Suggesting next improvement actions`;
  } else if (page.startsWith("/studio")) {
    prompt += `

CURRENT PAGE: Persona Studio
You are helping the user create AI CPO personas. You can help with:
- Defining persona characteristics and evaluation criteria
- Calibrating persona scoring preferences
- Understanding how personas evaluate different aspects of apps
- Creating specialized personas for specific industries or product types`;
  } else if (page.startsWith("/settings")) {
    prompt += `

CURRENT PAGE: Settings
You are helping the user configure Athena. You can help with:
- API key configuration
- GitHub integration setup
- Understanding available settings`;
  }

  return prompt;
}
