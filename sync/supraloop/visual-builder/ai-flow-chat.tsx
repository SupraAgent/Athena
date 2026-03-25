"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import type { Node, Edge } from "@xyflow/react";
import type { FlowTemplate } from "@/lib/flow-templates";
import { saveCustomTemplate } from "@/lib/flow-templates";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  flowUpdate?: { nodes: Node[]; edges: Edge[] };
};

type AIFlowChatProps = {
  currentNodes: Node[];
  currentEdges: Edge[];
  category: FlowTemplate["category"];
  onApplyFlow: (nodes: Node[], edges: Edge[]) => void;
};

export function AIFlowChat({
  currentNodes,
  currentEdges,
  category,
  onApplyFlow,
}: AIFlowChatProps) {
  const [open, setOpen] = React.useState(false);
  const [messages, setMessages] = React.useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "I can help you build and modify workflow chains. Try:\n\n" +
        '- "Create a team of 3 focused on growth"\n' +
        '- "Build a pipeline with Claude and conditions"\n' +
        '- "Add an LLM node connected to Claude Code"\n' +
        '- "Create a persona builder workflow"\n' +
        '- "Save this as a template called My Flow"\n\n' +
        "Connect your own Claude API key or Claude Code for LLM nodes.",
    },
  ]);
  const [input, setInput] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend() {
    if (!input.trim() || loading) return;

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: input.trim(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const apiKey =
        typeof window !== "undefined"
          ? localStorage.getItem("supraloop_anthropic_key") ?? ""
          : "";

      const res = await fetch("/api/flow-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey,
          message: userMsg.content,
          currentNodes,
          currentEdges,
          category,
          history: messages.slice(-6).map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      const data = await res.json();

      if (data.error) {
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            role: "assistant",
            content: `Error: ${data.error}`,
          },
        ]);
      } else {
        const assistantMsg: Message = {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: data.message,
          flowUpdate: data.flowUpdate,
        };
        setMessages((prev) => [...prev, assistantMsg]);

        // If user asked to save as template
        if (data.saveAsTemplate) {
          const template: FlowTemplate = {
            id: `ai-${Date.now()}`,
            name: data.saveAsTemplate.name,
            description: data.saveAsTemplate.description,
            category: "custom",
            nodes: data.flowUpdate?.nodes ?? currentNodes,
            edges: data.flowUpdate?.edges ?? currentEdges,
            createdAt: new Date().toISOString().split("T")[0],
            isBuiltIn: false,
          };
          saveCustomTemplate(template);
        }
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: "assistant",
          content: "Failed to connect. Make sure your Anthropic API key is set in Settings.",
        },
      ]);
    }

    setLoading(false);
  }

  function handleApplyFlow(nodes: Node[], edges: Edge[]) {
    onApplyFlow(nodes, edges);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 hover:brightness-110 transition active:scale-95"
        title="AI Flow Assistant"
      >
        <span className="text-xl">🤖</span>
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 flex h-[500px] w-[380px] flex-col rounded-2xl border border-white/10 bg-background shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">🤖</span>
          <div>
            <div className="text-sm font-semibold text-foreground">Flow Assistant</div>
            <div className="text-[10px] text-muted-foreground">Build templates with AI</div>
          </div>
        </div>
        <button
          onClick={() => setOpen(false)}
          className="text-muted-foreground hover:text-foreground transition"
        >
          ✕
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                msg.role === "user"
                  ? "bg-primary/15 text-foreground"
                  : "bg-white/5 text-foreground border border-white/10"
              }`}
            >
              <div className="whitespace-pre-wrap">{msg.content}</div>
              {msg.flowUpdate && (
                <button
                  onClick={() =>
                    handleApplyFlow(msg.flowUpdate!.nodes, msg.flowUpdate!.edges)
                  }
                  className="mt-2 w-full rounded-lg bg-primary/20 px-3 py-1.5 text-[11px] font-medium text-primary hover:bg-primary/30 transition"
                >
                  Apply to Canvas ({msg.flowUpdate.nodes.length} nodes,{" "}
                  {msg.flowUpdate.edges.length} edges)
                </button>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-xs text-muted-foreground">
              <span className="animate-pulse">Thinking...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-white/10 p-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex gap-2"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Describe what to build..."
            className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
            disabled={loading}
          />
          <Button size="sm" type="submit" disabled={loading || !input.trim()}>
            Send
          </Button>
        </form>
      </div>
    </div>
  );
}
