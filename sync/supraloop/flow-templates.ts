// ── Flow Template Types & Presets ─────────────────────────────────

import type { Node, Edge } from "@xyflow/react";

export type FlowTemplate = {
  id: string;
  name: string;
  description: string;
  category: "team" | "app" | "benchmark" | "scoring" | "improve" | "workflow" | "custom";
  nodes: Node[];
  edges: Edge[];
  createdAt: string;
  isBuiltIn: boolean;
};

// ── Node data types ──────────────────────────────────────────────

export type PersonaNodeData = {
  label: string;
  role: string;
  voteWeight: number;
  expertise: string[];
  personality: string;
  emoji: string;
};

export type AppNodeData = {
  label: string;
  description: string;
  targetUsers: string;
  coreValue: string;
  currentState: "MVP" | "Beta" | "Production" | "";
};

export type CompetitorNodeData = {
  label: string;
  why: string;
  overallScore: number;
  cpoName: string;
};

export type ActionNodeData = {
  label: string;
  actionType: "score" | "analyze" | "improve" | "generate" | "commit";
  description: string;
};

export type NoteNodeData = {
  label: string;
  content: string;
};

// ── New Workflow Node Data Types ─────────────────────────────────

export type TriggerNodeData = {
  label: string;
  triggerType: "manual" | "schedule" | "webhook" | "event";
  config: string;
};

export type ConditionNodeData = {
  label: string;
  condition: string;
};

export type TransformNodeData = {
  label: string;
  transformType: "map" | "filter" | "merge" | "extract" | "custom";
  expression: string;
};

export type OutputNodeData = {
  label: string;
  outputType: "log" | "api" | "file" | "notify" | "github";
  destination: string;
};

export type LLMNodeData = {
  label: string;
  provider: "claude" | "claude-code" | "ollama" | "custom";
  model: string;
  systemPrompt: string;
  temperature?: number;
  maxTokens?: number;
};

export type StepNodeData = {
  label: string;
  stepIndex: number;
  subtitle: string;
  status: "pending" | "active" | "completed";
  summary: string;
  flowCategory: "team" | "app" | "benchmark" | "scoring" | "improve";
};

export type ConsensusNodeData = {
  label: string;
  personas: {
    name: string;
    role: string;
    emoji: string;
    voteWeight: number;
    isCeo: boolean;
  }[];
  consensusScore: number;
};

export type AffinityCategoryNodeData = {
  label: string;
  weight: number;
  score: number;
  domainExpert: string;
};

export type ConfigNodeSection = {
  title: string;
  value: string;
  icon: string;
};

export type ConfigNodeData = {
  label: string;
  configType: "root" | "instructions" | "settings" | "command" | "rule" | "skill" | "agent";
  filePath: string;
  description: string;
  gitignored: boolean;
  sections: ConfigNodeSection[];
};

// ── Built-in Templates ──────────────────────────────────────────

export const BUILT_IN_TEMPLATES: FlowTemplate[] = [
  // ── TEAM templates ──
  {
    id: "team-balanced",
    name: "Balanced Team",
    description: "5 personas with balanced vote weights — product, eng, design, growth, QA",
    category: "team",
    isBuiltIn: true,
    createdAt: "2026-01-01",
    nodes: [
      { id: "hub", type: "appNode", position: { x: 450, y: 300 }, data: { label: "Your App", description: "", targetUsers: "", coreValue: "", currentState: "" } },
      { id: "p1", type: "personaNode", position: { x: 50, y: 50 }, data: { label: "Alex Chen", role: "Head of Product", voteWeight: 1.2, expertise: ["Feature prioritization", "User research", "Roadmap strategy"], personality: "Data-driven, user-obsessed, kills scope creep", emoji: "🎯" } },
      { id: "p2", type: "personaNode", position: { x: 850, y: 50 }, data: { label: "Sam Okafor", role: "Engineering Lead", voteWeight: 1.0, expertise: ["Architecture", "Performance", "API design"], personality: "Pragmatic, hates over-engineering, ships fast", emoji: "⚙️" } },
      { id: "p3", type: "personaNode", position: { x: 50, y: 550 }, data: { label: "Maya Torres", role: "Design Lead", voteWeight: 1.0, expertise: ["UI/UX", "Design systems", "Accessibility"], personality: "Opinionated on craft, pushes for polish", emoji: "🎨" } },
      { id: "p4", type: "personaNode", position: { x: 850, y: 550 }, data: { label: "Raj Patel", role: "Growth & Analytics", voteWeight: 0.8, expertise: ["Onboarding", "Retention", "Analytics"], personality: "Metric-obsessed, challenges assumptions", emoji: "📈" } },
      { id: "p5", type: "personaNode", position: { x: 450, y: 620 }, data: { label: "Lena Kim", role: "QA & Reliability", voteWeight: 0.8, expertise: ["Testing", "Edge cases", "Security"], personality: "Finds every bug, thinks in failure modes", emoji: "🛡️" } },
    ],
    edges: [
      { id: "e1", source: "p1", target: "hub", type: "smoothstep", animated: true },
      { id: "e2", source: "p2", target: "hub", type: "smoothstep", animated: true },
      { id: "e3", source: "p3", target: "hub", type: "smoothstep", animated: true },
      { id: "e4", source: "p4", target: "hub", type: "smoothstep", animated: true },
      { id: "e5", source: "p5", target: "hub", type: "smoothstep", animated: true },
    ],
  },
  {
    id: "team-design-led",
    name: "Design-Led Team",
    description: "Design-heavy weighting — ideal for consumer apps where UX is the differentiator",
    category: "team",
    isBuiltIn: true,
    createdAt: "2026-01-01",
    nodes: [
      { id: "hub", type: "appNode", position: { x: 450, y: 300 }, data: { label: "Your App", description: "", targetUsers: "", coreValue: "", currentState: "" } },
      { id: "p1", type: "personaNode", position: { x: 50, y: 50 }, data: { label: "Alex Chen", role: "Head of Product", voteWeight: 1.0, expertise: ["Feature prioritization", "User research"], personality: "Data-driven, user-obsessed", emoji: "🎯" } },
      { id: "p2", type: "personaNode", position: { x: 850, y: 50 }, data: { label: "Sam Okafor", role: "Engineering Lead", voteWeight: 0.8, expertise: ["Architecture", "Performance"], personality: "Pragmatic, ships fast", emoji: "⚙️" } },
      { id: "p3", type: "personaNode", position: { x: 450, y: 0 }, data: { label: "Maya Torres", role: "Design Lead", voteWeight: 1.3, expertise: ["UI/UX", "Design systems", "Accessibility", "Motion"], personality: "Opinionated on craft, pushes for polish, user empathy", emoji: "🎨" } },
      { id: "p4", type: "personaNode", position: { x: 850, y: 550 }, data: { label: "Raj Patel", role: "Growth & Analytics", voteWeight: 0.8, expertise: ["Onboarding", "Retention"], personality: "Metric-obsessed", emoji: "📈" } },
      { id: "p5", type: "personaNode", position: { x: 50, y: 550 }, data: { label: "Lena Kim", role: "QA & Reliability", voteWeight: 0.8, expertise: ["Testing", "Edge cases"], personality: "Finds every bug", emoji: "🛡️" } },
    ],
    edges: [
      { id: "e1", source: "p1", target: "hub", type: "smoothstep", animated: true },
      { id: "e2", source: "p2", target: "hub", type: "smoothstep", animated: true },
      { id: "e3", source: "p3", target: "hub", type: "smoothstep", animated: true, style: { strokeWidth: 3 } },
      { id: "e4", source: "p4", target: "hub", type: "smoothstep", animated: true },
      { id: "e5", source: "p5", target: "hub", type: "smoothstep", animated: true },
    ],
  },
  {
    id: "team-eng-heavy",
    name: "Eng-Heavy Team",
    description: "Engineering-weighted — ideal for infrastructure, developer tools, or performance-critical apps",
    category: "team",
    isBuiltIn: true,
    createdAt: "2026-01-01",
    nodes: [
      { id: "hub", type: "appNode", position: { x: 450, y: 300 }, data: { label: "Your App", description: "", targetUsers: "", coreValue: "", currentState: "" } },
      { id: "p1", type: "personaNode", position: { x: 50, y: 50 }, data: { label: "Alex Chen", role: "Head of Product", voteWeight: 1.0, expertise: ["Feature prioritization", "Roadmap strategy"], personality: "Data-driven, user-obsessed", emoji: "🎯" } },
      { id: "p2", type: "personaNode", position: { x: 450, y: 0 }, data: { label: "Sam Okafor", role: "Engineering Lead", voteWeight: 1.3, expertise: ["Architecture", "Performance", "API design", "Reliability"], personality: "Pragmatic, hates over-engineering, ships fast", emoji: "⚙️" } },
      { id: "p3", type: "personaNode", position: { x: 50, y: 550 }, data: { label: "Maya Torres", role: "Design Lead", voteWeight: 0.8, expertise: ["UI/UX", "Design systems"], personality: "Opinionated on craft", emoji: "🎨" } },
      { id: "p4", type: "personaNode", position: { x: 850, y: 550 }, data: { label: "Raj Patel", role: "Growth & Analytics", voteWeight: 0.8, expertise: ["Onboarding", "Retention"], personality: "Metric-obsessed", emoji: "📈" } },
      { id: "p5", type: "personaNode", position: { x: 850, y: 50 }, data: { label: "Lena Kim", role: "QA & Reliability", voteWeight: 1.1, expertise: ["Testing", "Edge cases", "Security", "Performance"], personality: "Finds every bug, thinks in failure modes", emoji: "🛡️" } },
    ],
    edges: [
      { id: "e1", source: "p1", target: "hub", type: "smoothstep", animated: true },
      { id: "e2", source: "p2", target: "hub", type: "smoothstep", animated: true, style: { strokeWidth: 3 } },
      { id: "e3", source: "p3", target: "hub", type: "smoothstep", animated: true },
      { id: "e4", source: "p4", target: "hub", type: "smoothstep", animated: true },
      { id: "e5", source: "p5", target: "hub", type: "smoothstep", animated: true, style: { strokeWidth: 2 } },
    ],
  },

  // ── APP templates ──
  {
    id: "app-saas",
    name: "SaaS Product",
    description: "Standard SaaS app structure with auth, dashboard, billing, and team features",
    category: "app",
    isBuiltIn: true,
    createdAt: "2026-01-01",
    nodes: [
      { id: "app", type: "appNode", position: { x: 400, y: 250 }, data: { label: "My SaaS App", description: "A SaaS product", targetUsers: "Business teams", coreValue: "Productivity", currentState: "MVP" } },
      { id: "a1", type: "actionNode", position: { x: 50, y: 50 }, data: { label: "Auth & Users", actionType: "score", description: "User registration, login, roles" } },
      { id: "a2", type: "actionNode", position: { x: 750, y: 50 }, data: { label: "Dashboard", actionType: "score", description: "Main workspace and navigation" } },
      { id: "a3", type: "actionNode", position: { x: 50, y: 480 }, data: { label: "Billing", actionType: "score", description: "Subscription management" } },
      { id: "a4", type: "actionNode", position: { x: 750, y: 480 }, data: { label: "Team Features", actionType: "score", description: "Collaboration and sharing" } },
      { id: "n1", type: "noteNode", position: { x: 400, y: 530 }, data: { label: "Priority", content: "Focus on core workflow before billing" } },
    ],
    edges: [
      { id: "e1", source: "a1", target: "app", type: "smoothstep" },
      { id: "e2", source: "a2", target: "app", type: "smoothstep" },
      { id: "e3", source: "a3", target: "app", type: "smoothstep" },
      { id: "e4", source: "a4", target: "app", type: "smoothstep" },
    ],
  },
  {
    id: "app-mobile",
    name: "Mobile-First App",
    description: "Mobile-optimized app structure focused on onboarding and performance",
    category: "app",
    isBuiltIn: true,
    createdAt: "2026-01-01",
    nodes: [
      { id: "app", type: "appNode", position: { x: 400, y: 250 }, data: { label: "My Mobile App", description: "A mobile-first application", targetUsers: "Consumers", coreValue: "Speed and simplicity", currentState: "MVP" } },
      { id: "a1", type: "actionNode", position: { x: 50, y: 50 }, data: { label: "Onboarding", actionType: "score", description: "First-run experience, social login" } },
      { id: "a2", type: "actionNode", position: { x: 750, y: 50 }, data: { label: "Core UX", actionType: "score", description: "Gestures, haptics, transitions" } },
      { id: "a3", type: "actionNode", position: { x: 50, y: 480 }, data: { label: "Offline Mode", actionType: "score", description: "Works without connection" } },
      { id: "a4", type: "actionNode", position: { x: 750, y: 480 }, data: { label: "Push Notifications", actionType: "score", description: "Engagement and retention" } },
    ],
    edges: [
      { id: "e1", source: "a1", target: "app", type: "smoothstep" },
      { id: "e2", source: "a2", target: "app", type: "smoothstep" },
      { id: "e3", source: "a3", target: "app", type: "smoothstep" },
      { id: "e4", source: "a4", target: "app", type: "smoothstep" },
    ],
  },

  // ── BENCHMARK templates ──
  {
    id: "benchmark-3way",
    name: "3-Way Competitive Analysis",
    description: "Compare your app against 3 competitors with CPO personas and gap analysis",
    category: "benchmark",
    isBuiltIn: true,
    createdAt: "2026-01-01",
    nodes: [
      { id: "app", type: "appNode", position: { x: 400, y: 300 }, data: { label: "Your App", description: "", targetUsers: "", coreValue: "", currentState: "" } },
      { id: "c1", type: "competitorNode", position: { x: 0, y: 50 }, data: { label: "Competitor 1", why: "Market leader", overallScore: 0, cpoName: "" } },
      { id: "c2", type: "competitorNode", position: { x: 400, y: 0 }, data: { label: "Competitor 2", why: "Fast follower", overallScore: 0, cpoName: "" } },
      { id: "c3", type: "competitorNode", position: { x: 800, y: 50 }, data: { label: "Competitor 3", why: "Niche specialist", overallScore: 0, cpoName: "" } },
      { id: "analyze", type: "actionNode", position: { x: 400, y: 550 }, data: { label: "Gap Analysis", actionType: "analyze", description: "Auto-identify gaps between your app and competitors" } },
    ],
    edges: [
      { id: "e1", source: "c1", target: "app", type: "smoothstep", animated: true, label: "vs" },
      { id: "e2", source: "c2", target: "app", type: "smoothstep", animated: true, label: "vs" },
      { id: "e3", source: "c3", target: "app", type: "smoothstep", animated: true, label: "vs" },
      { id: "e4", source: "app", target: "analyze", type: "smoothstep", animated: true },
    ],
  },

  // ── SCORING templates ──
  {
    id: "scoring-full",
    name: "Full Scoring Pipeline",
    description: "Complete scoring flow: self-score -> persona review -> consensus -> gaps",
    category: "scoring",
    isBuiltIn: true,
    createdAt: "2026-01-01",
    nodes: [
      { id: "self", type: "actionNode", position: { x: 50, y: 200 }, data: { label: "Self-Score", actionType: "score", description: "Rate your app on 8 categories" } },
      { id: "review", type: "actionNode", position: { x: 350, y: 200 }, data: { label: "Persona Review", actionType: "analyze", description: "5 AI personas independently score" } },
      { id: "consensus", type: "actionNode", position: { x: 650, y: 200 }, data: { label: "Consensus", actionType: "analyze", description: "Weighted average across personas" } },
      { id: "gaps", type: "actionNode", position: { x: 950, y: 200 }, data: { label: "Gap Analysis", actionType: "analyze", description: "Compare vs competitors" } },
      { id: "n1", type: "noteNode", position: { x: 350, y: 50 }, data: { label: "Tip", content: "Domain experts score stricter in their area" } },
    ],
    edges: [
      { id: "e1", source: "self", target: "review", type: "smoothstep", animated: true },
      { id: "e2", source: "review", target: "consensus", type: "smoothstep", animated: true },
      { id: "e3", source: "consensus", target: "gaps", type: "smoothstep", animated: true },
    ],
  },

  // ── IMPROVE templates ──
  {
    id: "improve-sprint",
    name: "Sprint Improvement Cycle",
    description: "5-round sprint with gap selection, proposal, review, and commit",
    category: "improve",
    isBuiltIn: true,
    createdAt: "2026-01-01",
    nodes: [
      { id: "select", type: "actionNode", position: { x: 50, y: 250 }, data: { label: "Select Gap", actionType: "analyze", description: "Pick the highest-priority gap to address" } },
      { id: "propose", type: "actionNode", position: { x: 350, y: 250 }, data: { label: "AI Proposal", actionType: "improve", description: "AI generates improvement brief" } },
      { id: "review", type: "actionNode", position: { x: 650, y: 250 }, data: { label: "Team Review", actionType: "analyze", description: "Personas vote on the proposal" } },
      { id: "apply", type: "actionNode", position: { x: 950, y: 250 }, data: { label: "Apply & Score", actionType: "score", description: "Apply change, recalculate scores" } },
      { id: "cpo", type: "actionNode", position: { x: 650, y: 50 }, data: { label: "CPO Reactions", actionType: "generate", description: "Competitor CPOs react to your improvement" } },
      { id: "commit", type: "actionNode", position: { x: 950, y: 450 }, data: { label: "Commit to GitHub", actionType: "commit", description: "Save round log to .supraloop/" } },
      { id: "loop", type: "noteNode", position: { x: 50, y: 450 }, data: { label: "Loop", content: "Repeat until gap < 10 or max rounds reached" } },
    ],
    edges: [
      { id: "e1", source: "select", target: "propose", type: "smoothstep", animated: true },
      { id: "e2", source: "propose", target: "review", type: "smoothstep", animated: true },
      { id: "e3", source: "review", target: "apply", type: "smoothstep", animated: true },
      { id: "e4", source: "review", target: "cpo", type: "smoothstep", animated: true },
      { id: "e5", source: "apply", target: "commit", type: "smoothstep" },
      { id: "e6", source: "apply", target: "select", type: "smoothstep", animated: true, label: "next round", style: { strokeDasharray: "5 5" } },
    ],
  },

  // ── WORKFLOW templates ──
  {
    id: "workflow-builder",
    name: "Workflow Builder",
    description: "General-purpose workflow: trigger -> LLM processing -> transform -> output. Chain operations in any order.",
    category: "workflow",
    isBuiltIn: true,
    createdAt: "2026-03-21",
    nodes: [
      { id: "trigger", type: "triggerNode", position: { x: 0, y: 200 }, data: { label: "Start", triggerType: "manual", config: "Click to run workflow" } },
      { id: "llm1", type: "llmNode", position: { x: 300, y: 100 }, data: { label: "Claude Analysis", provider: "claude", model: "claude-sonnet-4-5-20250514", systemPrompt: "Analyze the input and provide structured insights", temperature: 0.7, maxTokens: 2048 } },
      { id: "condition", type: "conditionNode", position: { x: 600, y: 200 }, data: { label: "Quality Check", condition: "score > 80" } },
      { id: "transform", type: "transformNode", position: { x: 900, y: 100 }, data: { label: "Format Output", transformType: "map", expression: "result -> markdown" } },
      { id: "retry", type: "llmNode", position: { x: 900, y: 380 }, data: { label: "Refine", provider: "claude", model: "claude-sonnet-4-5-20250514", systemPrompt: "Improve the quality of this output", temperature: 0.5, maxTokens: 1024 } },
      { id: "output", type: "outputNode", position: { x: 1200, y: 200 }, data: { label: "Save Result", outputType: "file", destination: "output.md" } },
      { id: "note", type: "noteNode", position: { x: 300, y: 400 }, data: { label: "Tip", content: "Connect your own Claude API key or Claude Code for the LLM nodes" } },
    ],
    edges: [
      { id: "e1", source: "trigger", target: "llm1", type: "smoothstep", animated: true },
      { id: "e2", source: "llm1", target: "condition", type: "smoothstep", animated: true },
      { id: "e3", source: "condition", target: "transform", type: "smoothstep", animated: true, sourceHandle: "true", label: "pass" },
      { id: "e4", source: "condition", target: "retry", type: "smoothstep", animated: true, sourceHandle: "false", label: "retry" },
      { id: "e5", source: "retry", target: "condition", type: "smoothstep", animated: true, style: { strokeDasharray: "5 5" } },
      { id: "e6", source: "transform", target: "output", type: "smoothstep", animated: true },
    ],
  },
  {
    id: "workflow-persona-builder",
    name: "Persona Builder",
    description: "Build AI personas from competitor research: trigger -> research -> generate persona -> validate -> output CPO profile",
    category: "workflow",
    isBuiltIn: true,
    createdAt: "2026-03-21",
    nodes: [
      { id: "trigger", type: "triggerNode", position: { x: 0, y: 250 }, data: { label: "New Competitor", triggerType: "manual", config: "Enter competitor name to analyze" } },
      { id: "research", type: "llmNode", position: { x: 300, y: 100 }, data: { label: "Research Competitor", provider: "claude", model: "claude-sonnet-4-5-20250514", systemPrompt: "Research this company's product strategy, key decisions, and leadership philosophy. Focus on CPO-level thinking.", temperature: 0.7, maxTokens: 4096 } },
      { id: "extract", type: "transformNode", position: { x: 600, y: 100 }, data: { label: "Extract Traits", transformType: "extract", expression: "strengths, blindSpots, decisionStyle, philosophy" } },
      { id: "generate", type: "llmNode", position: { x: 900, y: 100 }, data: { label: "Generate CPO Persona", provider: "claude", model: "claude-sonnet-4-5-20250514", systemPrompt: "Create a detailed CPO persona with name, title, philosophy, strengths, blind spots, decision style, and iconic move", temperature: 0.8, maxTokens: 2048 } },
      { id: "validate", type: "conditionNode", position: { x: 900, y: 370 }, data: { label: "Persona Valid?", condition: "has name AND philosophy AND strengths.length >= 2" } },
      { id: "persona-card", type: "personaNode", position: { x: 1200, y: 100 }, data: { label: "Generated CPO", role: "Competitor CPO", voteWeight: 1.0, expertise: ["Product strategy", "Market analysis"], personality: "Generated from competitor research", emoji: "🎭" } },
      { id: "save", type: "outputNode", position: { x: 1200, y: 370 }, data: { label: "Save to Config", outputType: "file", destination: ".supraloop/personas/" } },
      { id: "note", type: "noteNode", position: { x: 300, y: 400 }, data: { label: "How it works", content: "Feeds competitor info through Claude to auto-generate a realistic CPO persona for benchmarking" } },
    ],
    edges: [
      { id: "e1", source: "trigger", target: "research", type: "smoothstep", animated: true },
      { id: "e2", source: "research", target: "extract", type: "smoothstep", animated: true },
      { id: "e3", source: "extract", target: "generate", type: "smoothstep", animated: true },
      { id: "e4", source: "generate", target: "validate", type: "smoothstep", animated: true },
      { id: "e5", source: "validate", target: "persona-card", type: "smoothstep", animated: true, sourceHandle: "true", label: "valid" },
      { id: "e6", source: "validate", target: "generate", type: "smoothstep", animated: true, sourceHandle: "false", label: "retry", style: { strokeDasharray: "5 5" } },
      { id: "e7", source: "persona-card", target: "save", type: "smoothstep", animated: true },
    ],
  },
  {
    id: "workflow-launch-kit",
    name: "Launch Kit",
    description: "Full launch pipeline: define app -> benchmark competitors -> score -> generate improvements -> commit to GitHub",
    category: "workflow",
    isBuiltIn: true,
    createdAt: "2026-03-21",
    nodes: [
      { id: "trigger", type: "triggerNode", position: { x: 0, y: 300 }, data: { label: "Launch Review", triggerType: "manual", config: "Start a full launch readiness review" } },
      { id: "app", type: "appNode", position: { x: 300, y: 300 }, data: { label: "Your App", description: "Define your app details here", targetUsers: "", coreValue: "", currentState: "MVP" } },
      { id: "c1", type: "competitorNode", position: { x: 600, y: 50 }, data: { label: "Competitor 1", why: "Market leader", overallScore: 0, cpoName: "" } },
      { id: "c2", type: "competitorNode", position: { x: 600, y: 250 }, data: { label: "Competitor 2", why: "Fast follower", overallScore: 0, cpoName: "" } },
      { id: "c3", type: "competitorNode", position: { x: 600, y: 450 }, data: { label: "Competitor 3", why: "Niche player", overallScore: 0, cpoName: "" } },
      { id: "benchmark-llm", type: "llmNode", position: { x: 900, y: 150 }, data: { label: "AI Benchmark", provider: "claude", model: "claude-sonnet-4-5-20250514", systemPrompt: "Score each competitor across 8 categories and generate CPO personas", temperature: 0.7, maxTokens: 4096 } },
      { id: "gap-analyze", type: "actionNode", position: { x: 900, y: 420 }, data: { label: "Gap Analysis", actionType: "analyze", description: "Compare your scores vs competitors" } },
      { id: "check", type: "conditionNode", position: { x: 1200, y: 300 }, data: { label: "Launch Ready?", condition: "gap < 10" } },
      { id: "improve-llm", type: "llmNode", position: { x: 1200, y: 550 }, data: { label: "Generate Fix", provider: "claude-code", model: "", systemPrompt: "Propose the highest-impact improvement to close the gap", temperature: 0.6, maxTokens: 2048 } },
      { id: "launch-output", type: "outputNode", position: { x: 1500, y: 150 }, data: { label: "Launch Report", outputType: "github", destination: ".supraloop/launch-report.md" } },
      { id: "commit", type: "outputNode", position: { x: 1500, y: 550 }, data: { label: "Commit Improvement", outputType: "github", destination: ".supraloop/rounds/" } },
      { id: "note", type: "noteNode", position: { x: 0, y: 530 }, data: { label: "Launch Kit", content: "End-to-end pipeline: benchmark -> score -> improve -> launch. Uses Claude Code to implement fixes." } },
    ],
    edges: [
      { id: "e1", source: "trigger", target: "app", type: "smoothstep", animated: true },
      { id: "e2", source: "app", target: "c1", type: "smoothstep", animated: true },
      { id: "e3", source: "app", target: "c2", type: "smoothstep", animated: true },
      { id: "e4", source: "app", target: "c3", type: "smoothstep", animated: true },
      { id: "e5", source: "c1", target: "benchmark-llm", type: "smoothstep", animated: true },
      { id: "e6", source: "c2", target: "benchmark-llm", type: "smoothstep", animated: true },
      { id: "e7", source: "c3", target: "benchmark-llm", type: "smoothstep", animated: true },
      { id: "e8", source: "benchmark-llm", target: "gap-analyze", type: "smoothstep", animated: true },
      { id: "e9", source: "gap-analyze", target: "check", type: "smoothstep", animated: true },
      { id: "e10", source: "check", target: "launch-output", type: "smoothstep", animated: true, sourceHandle: "true", label: "ready" },
      { id: "e11", source: "check", target: "improve-llm", type: "smoothstep", animated: true, sourceHandle: "false", label: "needs work" },
      { id: "e12", source: "improve-llm", target: "commit", type: "smoothstep", animated: true },
      { id: "e13", source: "improve-llm", target: "gap-analyze", type: "smoothstep", animated: true, style: { strokeDasharray: "5 5" }, label: "re-score" },
    ],
  },
  {
    id: "workflow-chatbot-builder",
    name: "Chatbot Builder",
    description: "Build a conversational AI chain: trigger -> context -> LLM -> condition -> respond or escalate",
    category: "workflow",
    isBuiltIn: true,
    createdAt: "2026-03-21",
    nodes: [
      { id: "trigger", type: "triggerNode", position: { x: 0, y: 200 }, data: { label: "User Message", triggerType: "webhook", config: "/api/chat incoming message" } },
      { id: "context", type: "transformNode", position: { x: 300, y: 200 }, data: { label: "Load Context", transformType: "merge", expression: "message + history + user_profile" } },
      { id: "llm", type: "llmNode", position: { x: 600, y: 200 }, data: { label: "Claude Chat", provider: "claude", model: "claude-sonnet-4-5-20250514", systemPrompt: "You are a helpful assistant. Answer based on the provided context.", temperature: 0.7, maxTokens: 1024 } },
      { id: "check", type: "conditionNode", position: { x: 900, y: 200 }, data: { label: "Confident?", condition: "confidence > 0.7" } },
      { id: "respond", type: "outputNode", position: { x: 1200, y: 100 }, data: { label: "Send Reply", outputType: "api", destination: "POST /api/chat/response" } },
      { id: "escalate", type: "llmNode", position: { x: 1200, y: 380 }, data: { label: "Claude Code Agent", provider: "claude-code", model: "", systemPrompt: "Deep research needed. Use tools to find the answer.", temperature: 0.3, maxTokens: 4096 } },
      { id: "respond2", type: "outputNode", position: { x: 1500, y: 380 }, data: { label: "Send Deep Reply", outputType: "api", destination: "POST /api/chat/response" } },
    ],
    edges: [
      { id: "e1", source: "trigger", target: "context", type: "smoothstep", animated: true },
      { id: "e2", source: "context", target: "llm", type: "smoothstep", animated: true },
      { id: "e3", source: "llm", target: "check", type: "smoothstep", animated: true },
      { id: "e4", source: "check", target: "respond", type: "smoothstep", animated: true, sourceHandle: "true", label: "yes" },
      { id: "e5", source: "check", target: "escalate", type: "smoothstep", animated: true, sourceHandle: "false", label: "no" },
      { id: "e6", source: "escalate", target: "respond2", type: "smoothstep", animated: true },
    ],
  },

  // ── STEP FLOW template ──
  {
    id: "step-flow-pipeline",
    name: "Step Flow Pipeline",
    description: "Full 5-step improvement loop — each step shows a live summary card connected by data flow edges",
    category: "improve",
    isBuiltIn: true,
    createdAt: "2026-01-01",
    nodes: [
      { id: "s0", type: "stepNode", position: { x: 0, y: 250 }, data: { label: "Team", stepIndex: 0, subtitle: "Define your AI panel", status: "active", summary: "5 personas with weighted voting", flowCategory: "team" } },
      { id: "s1", type: "stepNode", position: { x: 350, y: 250 }, data: { label: "App", stepIndex: 1, subtitle: "Describe what you're building", status: "pending", summary: "Name, stack, users, state", flowCategory: "app" } },
      { id: "s2", type: "stepNode", position: { x: 700, y: 250 }, data: { label: "Benchmark", stepIndex: 2, subtitle: "Score the competition", status: "pending", summary: "3 reference apps scored on 8 categories", flowCategory: "benchmark" } },
      { id: "s3", type: "stepNode", position: { x: 1050, y: 250 }, data: { label: "Self-Score", stepIndex: 3, subtitle: "Rate your own app", status: "pending", summary: "Persona review + consensus + gap analysis", flowCategory: "scoring" } },
      { id: "s4", type: "stepNode", position: { x: 1400, y: 250 }, data: { label: "Improve", stepIndex: 4, subtitle: "Close the gap", status: "pending", summary: "AI proposals, team votes, CPO reactions", flowCategory: "improve" } },
      { id: "data-team", type: "noteNode", position: { x: 100, y: 50 }, data: { label: "Data Flow", content: "Team weights feed into consensus scoring" } },
      { id: "data-bench", type: "noteNode", position: { x: 800, y: 50 }, data: { label: "Data Flow", content: "Competitor scores generate CPO personas" } },
      { id: "data-gap", type: "noteNode", position: { x: 1200, y: 50 }, data: { label: "Data Flow", content: "Gaps drive improvement selection" } },
    ],
    edges: [
      { id: "se01", source: "s0", target: "s1", sourceHandle: "right", targetHandle: "left", type: "smoothstep", animated: true, label: "team weights" },
      { id: "se12", source: "s1", target: "s2", sourceHandle: "right", targetHandle: "left", type: "smoothstep", animated: true, label: "app brief" },
      { id: "se23", source: "s2", target: "s3", sourceHandle: "right", targetHandle: "left", type: "smoothstep", animated: true, label: "ref scores" },
      { id: "se34", source: "s3", target: "s4", sourceHandle: "right", targetHandle: "left", type: "smoothstep", animated: true, label: "gap analysis" },
      { id: "se40", source: "s4", target: "s0", sourceHandle: "bottom", targetHandle: "bottom", type: "smoothstep", animated: true, label: "re-score", style: { strokeDasharray: "5 5" } },
    ],
  },

  // ── CONSENSUS BUCKET template ──
  {
    id: "consensus-bucket",
    name: "Consensus Voting Bucket",
    description: "Persona cards inside a consensus group — CEO highlighted as decision maker, weighted voting",
    category: "scoring",
    isBuiltIn: true,
    createdAt: "2026-01-01",
    nodes: [
      {
        id: "consensus",
        type: "consensusNode",
        position: { x: 250, y: 200 },
        data: {
          label: "Team Consensus",
          personas: [
            { name: "Alex Chen", role: "Head of Product", emoji: "🎯", voteWeight: 1.2, isCeo: true },
            { name: "Sam Okafor", role: "Engineering Lead", emoji: "⚙️", voteWeight: 1.0, isCeo: false },
            { name: "Maya Torres", role: "Design Lead", emoji: "🎨", voteWeight: 1.0, isCeo: false },
            { name: "Raj Patel", role: "Growth & Analytics", emoji: "📈", voteWeight: 0.8, isCeo: false },
            { name: "Lena Kim", role: "QA & Reliability", emoji: "🛡️", voteWeight: 0.8, isCeo: false },
          ],
          consensusScore: 0,
        },
      },
      { id: "self-score", type: "actionNode", position: { x: 450, y: 30 }, data: { label: "Self-Score Input", actionType: "score", description: "Your 8-category scores feed into persona review" } },
      { id: "gap-out", type: "actionNode", position: { x: 450, y: 550 }, data: { label: "Gap Analysis", actionType: "analyze", description: "Weighted consensus vs best competitor" } },
      { id: "tip", type: "noteNode", position: { x: 0, y: 30 }, data: { label: "CEO Rule", content: "The CEO (highest vote weight) breaks ties and has final say on disputed improvements" } },
    ],
    edges: [
      { id: "ce1", source: "self-score", target: "consensus", type: "smoothstep", animated: true, label: "scores" },
      { id: "ce2", source: "consensus", target: "gap-out", type: "smoothstep", animated: true, label: "consensus" },
    ],
  },

  // ── PERSONA-CATEGORY AFFINITY GRAPH template ──
  {
    id: "affinity-graph",
    name: "Persona-Category Affinity",
    description: "Bipartite graph — personas on the left, scoring categories on the right, edges weighted by domain expertise",
    category: "team",
    isBuiltIn: true,
    createdAt: "2026-01-01",
    nodes: [
      { id: "p-product", type: "personaNode", position: { x: 0, y: 0 }, data: { label: "Alex Chen", role: "Head of Product", voteWeight: 1.2, expertise: ["Feature prioritization", "User research", "Roadmap strategy"], personality: "Data-driven, user-obsessed", emoji: "🎯" } },
      { id: "p-eng", type: "personaNode", position: { x: 0, y: 200 }, data: { label: "Sam Okafor", role: "Engineering Lead", voteWeight: 1.0, expertise: ["Architecture", "Performance", "API design"], personality: "Pragmatic, ships fast", emoji: "⚙️" } },
      { id: "p-design", type: "personaNode", position: { x: 0, y: 400 }, data: { label: "Maya Torres", role: "Design Lead", voteWeight: 1.0, expertise: ["UI/UX", "Design systems", "Accessibility"], personality: "Opinionated on craft", emoji: "🎨" } },
      { id: "p-growth", type: "personaNode", position: { x: 0, y: 600 }, data: { label: "Raj Patel", role: "Growth & Analytics", voteWeight: 0.8, expertise: ["Onboarding", "Retention", "Analytics"], personality: "Metric-obsessed", emoji: "📈" } },
      { id: "p-qa", type: "personaNode", position: { x: 0, y: 800 }, data: { label: "Lena Kim", role: "QA & Reliability", voteWeight: 0.8, expertise: ["Testing", "Edge cases", "Security"], personality: "Finds every bug", emoji: "🛡️" } },
      { id: "c-core", type: "affinityCategoryNode", position: { x: 750, y: 0 }, data: { label: "Core Features", weight: 0.2, score: 0, domainExpert: "Alex Chen" } },
      { id: "c-uiux", type: "affinityCategoryNode", position: { x: 750, y: 120 }, data: { label: "UI/UX Quality", weight: 0.15, score: 0, domainExpert: "Maya Torres" } },
      { id: "c-onboard", type: "affinityCategoryNode", position: { x: 750, y: 240 }, data: { label: "Onboarding & Setup", weight: 0.1, score: 0, domainExpert: "Raj Patel" } },
      { id: "c-perf", type: "affinityCategoryNode", position: { x: 750, y: 360 }, data: { label: "Performance", weight: 0.1, score: 0, domainExpert: "Sam Okafor" } },
      { id: "c-auth", type: "affinityCategoryNode", position: { x: 750, y: 480 }, data: { label: "Auth & Security", weight: 0.1, score: 0, domainExpert: "Lena Kim" } },
      { id: "c-rely", type: "affinityCategoryNode", position: { x: 750, y: 600 }, data: { label: "Reliability", weight: 0.1, score: 0, domainExpert: "Sam Okafor" } },
      { id: "c-custom", type: "affinityCategoryNode", position: { x: 750, y: 720 }, data: { label: "Customization", weight: 0.1, score: 0, domainExpert: "Alex Chen" } },
      { id: "c-collab", type: "affinityCategoryNode", position: { x: 750, y: 840 }, data: { label: "Team & Collaboration", weight: 0.15, score: 0, domainExpert: "Raj Patel" } },
    ],
    edges: [
      { id: "af1", source: "p-product", target: "c-core", sourceHandle: "right", targetHandle: "left", type: "smoothstep", animated: true, style: { strokeWidth: 3, stroke: "rgba(59,130,246,0.6)" }, label: "domain" },
      { id: "af2", source: "p-product", target: "c-custom", sourceHandle: "right", targetHandle: "left", type: "smoothstep", style: { strokeWidth: 3, stroke: "rgba(59,130,246,0.6)" }, label: "domain" },
      { id: "af3", source: "p-eng", target: "c-perf", sourceHandle: "right", targetHandle: "left", type: "smoothstep", animated: true, style: { strokeWidth: 3, stroke: "rgba(16,185,129,0.6)" }, label: "domain" },
      { id: "af4", source: "p-eng", target: "c-rely", sourceHandle: "right", targetHandle: "left", type: "smoothstep", style: { strokeWidth: 3, stroke: "rgba(16,185,129,0.6)" }, label: "domain" },
      { id: "af5", source: "p-design", target: "c-uiux", sourceHandle: "right", targetHandle: "left", type: "smoothstep", animated: true, style: { strokeWidth: 3, stroke: "rgba(168,85,247,0.6)" }, label: "domain" },
      { id: "af6", source: "p-growth", target: "c-onboard", sourceHandle: "right", targetHandle: "left", type: "smoothstep", animated: true, style: { strokeWidth: 3, stroke: "rgba(249,115,22,0.6)" }, label: "domain" },
      { id: "af7", source: "p-growth", target: "c-collab", sourceHandle: "right", targetHandle: "left", type: "smoothstep", style: { strokeWidth: 3, stroke: "rgba(249,115,22,0.6)" }, label: "domain" },
      { id: "af8", source: "p-qa", target: "c-auth", sourceHandle: "right", targetHandle: "left", type: "smoothstep", animated: true, style: { strokeWidth: 3, stroke: "rgba(239,68,68,0.6)" }, label: "domain" },
      { id: "af-s1", source: "p-product", target: "c-uiux", sourceHandle: "right", targetHandle: "left", type: "smoothstep", style: { strokeWidth: 1, stroke: "rgba(255,255,255,0.08)" } },
      { id: "af-s2", source: "p-product", target: "c-onboard", sourceHandle: "right", targetHandle: "left", type: "smoothstep", style: { strokeWidth: 1, stroke: "rgba(255,255,255,0.08)" } },
      { id: "af-s3", source: "p-product", target: "c-collab", sourceHandle: "right", targetHandle: "left", type: "smoothstep", style: { strokeWidth: 1, stroke: "rgba(255,255,255,0.08)" } },
      { id: "af-s4", source: "p-eng", target: "c-core", sourceHandle: "right", targetHandle: "left", type: "smoothstep", style: { strokeWidth: 1, stroke: "rgba(255,255,255,0.08)" } },
      { id: "af-s5", source: "p-eng", target: "c-auth", sourceHandle: "right", targetHandle: "left", type: "smoothstep", style: { strokeWidth: 1, stroke: "rgba(255,255,255,0.08)" } },
      { id: "af-s6", source: "p-design", target: "c-core", sourceHandle: "right", targetHandle: "left", type: "smoothstep", style: { strokeWidth: 1, stroke: "rgba(255,255,255,0.08)" } },
      { id: "af-s7", source: "p-design", target: "c-onboard", sourceHandle: "right", targetHandle: "left", type: "smoothstep", style: { strokeWidth: 1, stroke: "rgba(255,255,255,0.08)" } },
      { id: "af-s8", source: "p-design", target: "c-custom", sourceHandle: "right", targetHandle: "left", type: "smoothstep", style: { strokeWidth: 1, stroke: "rgba(255,255,255,0.08)" } },
      { id: "af-s9", source: "p-growth", target: "c-uiux", sourceHandle: "right", targetHandle: "left", type: "smoothstep", style: { strokeWidth: 1, stroke: "rgba(255,255,255,0.08)" } },
      { id: "af-s10", source: "p-qa", target: "c-rely", sourceHandle: "right", targetHandle: "left", type: "smoothstep", style: { strokeWidth: 1, stroke: "rgba(255,255,255,0.08)" } },
      { id: "af-s11", source: "p-qa", target: "c-perf", sourceHandle: "right", targetHandle: "left", type: "smoothstep", style: { strokeWidth: 1, stroke: "rgba(255,255,255,0.08)" } },
    ],
  },

  // ── SIDEBAR FEATURE TEMPLATES ──

  // Improvement Loop — the 5-step wizard as a workflow
  {
    id: "workflow-improvement-loop",
    name: "Improvement Loop",
    description: "Full SupraLoop 5-step cycle: team -> app -> benchmark -> score -> improve, repeating until gap < 10",
    category: "workflow",
    isBuiltIn: true,
    createdAt: "2026-03-25",
    nodes: [
      { id: "trigger", type: "triggerNode", position: { x: 0, y: 250 }, data: { label: "Start Loop", triggerType: "manual", config: "Begin improvement cycle" } },
      { id: "team", type: "actionNode", position: { x: 300, y: 100 }, data: { label: "Define Team", actionType: "generate", description: "Create 5 AI personas with weighted voting" } },
      { id: "app", type: "actionNode", position: { x: 600, y: 100 }, data: { label: "Define App", actionType: "generate", description: "Name, stack, target users, current state" } },
      { id: "benchmark", type: "llmNode", position: { x: 900, y: 100 }, data: { label: "Benchmark", provider: "claude", model: "claude-sonnet-4-5-20250514", systemPrompt: "Score 3 competitor apps across 8 categories and generate CPO personas", temperature: 0.7, maxTokens: 4096 } },
      { id: "score", type: "actionNode", position: { x: 900, y: 350 }, data: { label: "Self-Score & Gap", actionType: "score", description: "Rate your app, compare vs competitors, find gaps" } },
      { id: "check", type: "conditionNode", position: { x: 600, y: 350 }, data: { label: "Gap < 10?", condition: "maxGap < 10" } },
      { id: "improve", type: "llmNode", position: { x: 300, y: 350 }, data: { label: "AI Improve", provider: "claude-code", model: "", systemPrompt: "Pick highest-impact gap and generate improvement", temperature: 0.6, maxTokens: 2048 } },
      { id: "done", type: "outputNode", position: { x: 600, y: 550 }, data: { label: "Loop Complete", outputType: "file", destination: ".supraloop/loop-summary.md" } },
    ],
    edges: [
      { id: "e1", source: "trigger", target: "team", type: "smoothstep", animated: true },
      { id: "e2", source: "team", target: "app", type: "smoothstep", animated: true },
      { id: "e3", source: "app", target: "benchmark", type: "smoothstep", animated: true },
      { id: "e4", source: "benchmark", target: "score", type: "smoothstep", animated: true },
      { id: "e5", source: "score", target: "check", type: "smoothstep", animated: true },
      { id: "e6", source: "check", target: "done", type: "smoothstep", animated: true, sourceHandle: "true", label: "done" },
      { id: "e7", source: "check", target: "improve", type: "smoothstep", animated: true, sourceHandle: "false", label: "improve" },
      { id: "e8", source: "improve", target: "score", type: "smoothstep", animated: true, style: { strokeDasharray: "5 5" }, label: "re-score" },
    ],
  },

  // Persona Studio — build and customize personas
  {
    id: "workflow-persona-studio",
    name: "Persona Studio",
    description: "Design and customize AI team personas: define roles, set vote weights, assign expertise domains",
    category: "workflow",
    isBuiltIn: true,
    createdAt: "2026-03-25",
    nodes: [
      { id: "trigger", type: "triggerNode", position: { x: 0, y: 250 }, data: { label: "New Persona", triggerType: "manual", config: "Define a new AI team member" } },
      { id: "role-llm", type: "llmNode", position: { x: 300, y: 100 }, data: { label: "Generate Role", provider: "claude", model: "claude-sonnet-4-5-20250514", systemPrompt: "Given a role description, generate a detailed persona with name, personality, expertise areas, and vote weight", temperature: 0.8, maxTokens: 1024 } },
      { id: "persona", type: "personaNode", position: { x: 600, y: 100 }, data: { label: "New Persona", role: "Custom Role", voteWeight: 1.0, expertise: ["Define expertise"], personality: "Define personality traits", emoji: "👤" } },
      { id: "validate", type: "conditionNode", position: { x: 600, y: 350 }, data: { label: "Has Expertise?", condition: "expertise.length >= 2 AND personality.length > 0" } },
      { id: "save", type: "outputNode", position: { x: 900, y: 100 }, data: { label: "Save Persona", outputType: "file", destination: ".supraloop/personas/" } },
      { id: "refine", type: "llmNode", position: { x: 300, y: 350 }, data: { label: "Refine Persona", provider: "claude", model: "claude-sonnet-4-5-20250514", systemPrompt: "Add more depth to this persona's expertise and personality", temperature: 0.7, maxTokens: 1024 } },
      { id: "note", type: "noteNode", position: { x: 0, y: 450 }, data: { label: "Tip", content: "Good personas have specific expertise areas and a clear personality that influences their scoring" } },
    ],
    edges: [
      { id: "e1", source: "trigger", target: "role-llm", type: "smoothstep", animated: true },
      { id: "e2", source: "role-llm", target: "persona", type: "smoothstep", animated: true },
      { id: "e3", source: "persona", target: "validate", type: "smoothstep", animated: true },
      { id: "e4", source: "validate", target: "save", type: "smoothstep", animated: true, sourceHandle: "true", label: "valid" },
      { id: "e5", source: "validate", target: "refine", type: "smoothstep", animated: true, sourceHandle: "false", label: "needs work" },
      { id: "e6", source: "refine", target: "persona", type: "smoothstep", animated: true, style: { strokeDasharray: "5 5" } },
    ],
  },

  // My Personas — manage persona library
  {
    id: "workflow-my-personas",
    name: "My Personas",
    description: "Manage your persona library: browse, compare, and organize AI team members and competitor CPOs",
    category: "workflow",
    isBuiltIn: true,
    createdAt: "2026-03-25",
    nodes: [
      { id: "p1", type: "personaNode", position: { x: 0, y: 0 }, data: { label: "Product Lead", role: "Head of Product", voteWeight: 1.2, expertise: ["Feature prioritization", "User research", "Roadmap"], personality: "Data-driven, user-obsessed", emoji: "🎯" } },
      { id: "p2", type: "personaNode", position: { x: 400, y: 0 }, data: { label: "Engineering Lead", role: "Engineering Lead", voteWeight: 1.0, expertise: ["Architecture", "Performance", "API design"], personality: "Pragmatic, ships fast", emoji: "⚙️" } },
      { id: "p3", type: "personaNode", position: { x: 800, y: 0 }, data: { label: "Design Lead", role: "Design Lead", voteWeight: 1.0, expertise: ["UI/UX", "Design systems", "Accessibility"], personality: "Opinionated on craft", emoji: "🎨" } },
      { id: "p4", type: "personaNode", position: { x: 0, y: 250 }, data: { label: "Growth Lead", role: "Growth & Analytics", voteWeight: 0.8, expertise: ["Onboarding", "Retention", "Analytics"], personality: "Metric-obsessed", emoji: "📈" } },
      { id: "p5", type: "personaNode", position: { x: 400, y: 250 }, data: { label: "QA Lead", role: "QA & Reliability", voteWeight: 0.8, expertise: ["Testing", "Edge cases", "Security"], personality: "Finds every bug", emoji: "🛡️" } },
      { id: "consensus", type: "consensusNode", position: { x: 200, y: 500 }, data: { label: "Team Consensus", personas: [{ name: "Product Lead", role: "Head of Product", emoji: "🎯", voteWeight: 1.2, isCeo: true }, { name: "Engineering Lead", role: "Engineering Lead", emoji: "⚙️", voteWeight: 1.0, isCeo: false }, { name: "Design Lead", role: "Design Lead", emoji: "🎨", voteWeight: 1.0, isCeo: false }], consensusScore: 0 } },
      { id: "note", type: "noteNode", position: { x: 800, y: 250 }, data: { label: "Library", content: "Drag personas into the consensus node to build your review team" } },
    ],
    edges: [
      { id: "e1", source: "p1", target: "consensus", type: "smoothstep", animated: true },
      { id: "e2", source: "p2", target: "consensus", type: "smoothstep", animated: true },
      { id: "e3", source: "p3", target: "consensus", type: "smoothstep", animated: true },
    ],
  },

  // Design-to-Ship — design-first workflow
  {
    id: "workflow-design-to-ship",
    name: "Design-to-Ship",
    description: "Design-first workflow: mockup -> design review -> implementation -> QA -> ship. Persona-driven design feedback.",
    category: "workflow",
    isBuiltIn: true,
    createdAt: "2026-03-25",
    nodes: [
      { id: "trigger", type: "triggerNode", position: { x: 0, y: 250 }, data: { label: "New Design", triggerType: "manual", config: "Upload or describe a design mockup" } },
      { id: "analyze", type: "llmNode", position: { x: 300, y: 100 }, data: { label: "Design Analysis", provider: "claude", model: "claude-sonnet-4-5-20250514", systemPrompt: "Analyze this design for usability, accessibility, and visual consistency", temperature: 0.7, maxTokens: 2048 } },
      { id: "review", type: "actionNode", position: { x: 600, y: 100 }, data: { label: "Persona Review", actionType: "analyze", description: "Design Lead and Product Lead review the mockup" } },
      { id: "check", type: "conditionNode", position: { x: 600, y: 350 }, data: { label: "Approved?", condition: "designScore > 75" } },
      { id: "implement", type: "llmNode", position: { x: 900, y: 100 }, data: { label: "Generate Code", provider: "claude-code", model: "", systemPrompt: "Implement this approved design as React components with Tailwind CSS", temperature: 0.3, maxTokens: 4096 } },
      { id: "qa", type: "actionNode", position: { x: 1200, y: 100 }, data: { label: "QA Check", actionType: "score", description: "QA persona reviews implementation against design" } },
      { id: "ship", type: "outputNode", position: { x: 1200, y: 350 }, data: { label: "Ship to GitHub", outputType: "github", destination: ".supraloop/designs/" } },
      { id: "revise", type: "llmNode", position: { x: 300, y: 350 }, data: { label: "Revise Design", provider: "claude", model: "claude-sonnet-4-5-20250514", systemPrompt: "Revise the design based on persona feedback", temperature: 0.7, maxTokens: 2048 } },
    ],
    edges: [
      { id: "e1", source: "trigger", target: "analyze", type: "smoothstep", animated: true },
      { id: "e2", source: "analyze", target: "review", type: "smoothstep", animated: true },
      { id: "e3", source: "review", target: "check", type: "smoothstep", animated: true },
      { id: "e4", source: "check", target: "implement", type: "smoothstep", animated: true, sourceHandle: "true", label: "approved" },
      { id: "e5", source: "check", target: "revise", type: "smoothstep", animated: true, sourceHandle: "false", label: "revise" },
      { id: "e6", source: "revise", target: "review", type: "smoothstep", animated: true, style: { strokeDasharray: "5 5" } },
      { id: "e7", source: "implement", target: "qa", type: "smoothstep", animated: true },
      { id: "e8", source: "qa", target: "ship", type: "smoothstep", animated: true },
    ],
  },

  // VibeCode — rapid prototyping
  {
    id: "workflow-vibecode",
    name: "VibeCode",
    description: "Rapid AI prototyping: describe an idea -> Claude Code builds it -> test -> iterate. Ship MVPs fast.",
    category: "workflow",
    isBuiltIn: true,
    createdAt: "2026-03-25",
    nodes: [
      { id: "trigger", type: "triggerNode", position: { x: 0, y: 200 }, data: { label: "Idea Input", triggerType: "manual", config: "Describe what you want to build" } },
      { id: "plan", type: "llmNode", position: { x: 300, y: 200 }, data: { label: "Plan MVP", provider: "claude", model: "claude-sonnet-4-5-20250514", systemPrompt: "Break this idea into a minimal viable plan with components, routes, and data model", temperature: 0.7, maxTokens: 2048 } },
      { id: "build", type: "llmNode", position: { x: 600, y: 200 }, data: { label: "Claude Code Build", provider: "claude-code", model: "", systemPrompt: "Implement this plan as a working prototype", temperature: 0.3, maxTokens: 8192 } },
      { id: "test", type: "conditionNode", position: { x: 900, y: 200 }, data: { label: "Works?", condition: "builds && no_errors" } },
      { id: "output", type: "outputNode", position: { x: 1200, y: 100 }, data: { label: "Commit MVP", outputType: "github", destination: "main branch" } },
      { id: "fix", type: "llmNode", position: { x: 1200, y: 380 }, data: { label: "Fix Issues", provider: "claude-code", model: "", systemPrompt: "Debug and fix the build errors", temperature: 0.3, maxTokens: 4096 } },
      { id: "note", type: "noteNode", position: { x: 0, y: 400 }, data: { label: "VibeCode", content: "Ship fast, iterate faster. Claude Code handles the implementation." } },
    ],
    edges: [
      { id: "e1", source: "trigger", target: "plan", type: "smoothstep", animated: true },
      { id: "e2", source: "plan", target: "build", type: "smoothstep", animated: true },
      { id: "e3", source: "build", target: "test", type: "smoothstep", animated: true },
      { id: "e4", source: "test", target: "output", type: "smoothstep", animated: true, sourceHandle: "true", label: "ship it" },
      { id: "e5", source: "test", target: "fix", type: "smoothstep", animated: true, sourceHandle: "false", label: "fix" },
      { id: "e6", source: "fix", target: "test", type: "smoothstep", animated: true, style: { strokeDasharray: "5 5" } },
    ],
  },

  // Auto-Research
  {
    id: "workflow-auto-research",
    name: "Auto-Research",
    description: "Automated competitor and market research: define topic -> Claude researches -> extract insights -> summarize findings",
    category: "workflow",
    isBuiltIn: true,
    createdAt: "2026-03-25",
    nodes: [
      { id: "trigger", type: "triggerNode", position: { x: 0, y: 200 }, data: { label: "Research Topic", triggerType: "manual", config: "Enter a topic, competitor, or market question" } },
      { id: "research", type: "llmNode", position: { x: 300, y: 200 }, data: { label: "Deep Research", provider: "claude", model: "claude-sonnet-4-5-20250514", systemPrompt: "Research this topic thoroughly. Identify key players, trends, strengths, weaknesses, and opportunities.", temperature: 0.7, maxTokens: 4096 } },
      { id: "extract", type: "transformNode", position: { x: 600, y: 100 }, data: { label: "Extract Insights", transformType: "extract", expression: "key_findings, competitors, trends, opportunities" } },
      { id: "summarize", type: "llmNode", position: { x: 600, y: 350 }, data: { label: "Summarize", provider: "claude", model: "claude-sonnet-4-5-20250514", systemPrompt: "Create a concise executive summary with actionable recommendations", temperature: 0.5, maxTokens: 2048 } },
      { id: "report", type: "outputNode", position: { x: 900, y: 100 }, data: { label: "Research Report", outputType: "file", destination: ".supraloop/research/" } },
      { id: "brief", type: "outputNode", position: { x: 900, y: 350 }, data: { label: "Executive Brief", outputType: "file", destination: ".supraloop/briefs/" } },
    ],
    edges: [
      { id: "e1", source: "trigger", target: "research", type: "smoothstep", animated: true },
      { id: "e2", source: "research", target: "extract", type: "smoothstep", animated: true },
      { id: "e3", source: "research", target: "summarize", type: "smoothstep", animated: true },
      { id: "e4", source: "extract", target: "report", type: "smoothstep", animated: true },
      { id: "e5", source: "summarize", target: "brief", type: "smoothstep", animated: true },
    ],
  },

  // Docs Dashboard
  {
    id: "workflow-docs-dashboard",
    name: "Docs Dashboard",
    description: "Knowledge base workflow: ingest docs -> index -> query -> generate answers from your documentation",
    category: "workflow",
    isBuiltIn: true,
    createdAt: "2026-03-25",
    nodes: [
      { id: "trigger", type: "triggerNode", position: { x: 0, y: 200 }, data: { label: "Doc Query", triggerType: "manual", config: "Ask a question about your docs" } },
      { id: "index", type: "transformNode", position: { x: 300, y: 50 }, data: { label: "Index Docs", transformType: "extract", expression: "parse .supraloop/ directory for all config and round data" } },
      { id: "search", type: "transformNode", position: { x: 300, y: 350 }, data: { label: "Search Relevant", transformType: "filter", expression: "match query against indexed documents" } },
      { id: "llm", type: "llmNode", position: { x: 600, y: 200 }, data: { label: "Generate Answer", provider: "claude", model: "claude-sonnet-4-5-20250514", systemPrompt: "Answer the question using only the provided documentation context. Cite sources.", temperature: 0.3, maxTokens: 2048 } },
      { id: "output", type: "outputNode", position: { x: 900, y: 200 }, data: { label: "Display Answer", outputType: "log", destination: "console" } },
    ],
    edges: [
      { id: "e1", source: "trigger", target: "index", type: "smoothstep", animated: true },
      { id: "e2", source: "trigger", target: "search", type: "smoothstep", animated: true },
      { id: "e3", source: "index", target: "llm", type: "smoothstep", animated: true },
      { id: "e4", source: "search", target: "llm", type: "smoothstep", animated: true },
      { id: "e5", source: "llm", target: "output", type: "smoothstep", animated: true },
    ],
  },

  // ── CLAUDE CODE PROJECT STRUCTURE template ──
  {
    id: "workflow-claude-project",
    name: "Claude Code Project",
    description: "Full .claude/ project structure template — CLAUDE.md, settings, commands, rules, skills, and agents as connected nodes",
    category: "workflow",
    isBuiltIn: true,
    createdAt: "2026-03-25",
    nodes: [
      // ── Root project node ──
      { id: "root", type: "configNode", position: { x: 0, y: 320 }, data: { label: "your-project/", configType: "root", filePath: "./", description: "Project root — all .claude/ config lives here", gitignored: false, sections: [{ title: "CLAUDE.md", value: "Team instructions, committed", icon: "📋" }, { title: ".claude/", value: "Config directory", icon: "📁" }, { title: "CLAUDE.local.md", value: "Personal overrides, gitignored", icon: "🔒" }] } },

      // ── Top-level instruction files ──
      { id: "claude-md", type: "configNode", position: { x: 350, y: 80 }, data: { label: "CLAUDE.md", configType: "instructions", filePath: "CLAUDE.md", description: "Team-shared instructions — committed to git. Every Claude session loads this automatically.", gitignored: false, sections: [{ title: "Architecture", value: "Stack, patterns, conventions", icon: "🏗️" }, { title: "Key Files", value: "Important paths and purposes", icon: "📂" }, { title: "Guidelines", value: "Code style, testing, deployment", icon: "📏" }, { title: "Context", value: "What the project does and why", icon: "💡" }] } },
      { id: "claude-local", type: "configNode", position: { x: 350, y: 550 }, data: { label: "CLAUDE.local.md", configType: "instructions", filePath: "CLAUDE.local.md", description: "Personal instruction overrides — gitignored. Your preferences without affecting the team.", gitignored: true, sections: [{ title: "Preferences", value: "Editor style, verbosity, tone", icon: "🎨" }, { title: "Local Paths", value: "Machine-specific overrides", icon: "📍" }, { title: "Debug", value: "Personal debugging shortcuts", icon: "🐛" }] } },

      // ── .claude/ directory hub ──
      { id: "claude-dir", type: "configNode", position: { x: 700, y: 320 }, data: { label: ".claude/", configType: "root", filePath: ".claude/", description: "Configuration directory — settings, commands, rules, skills, and agents", gitignored: false, sections: [{ title: "settings.json", value: "Shared permissions", icon: "⚙️" }, { title: "commands/", value: "Slash commands", icon: "⌨️" }, { title: "rules/", value: "Auto-loaded context", icon: "📏" }, { title: "skills/", value: "Auto-invoked workflows", icon: "🧠" }, { title: "agents/", value: "Subagent personas", icon: "🤖" }] } },

      // ── Settings ──
      { id: "settings-json", type: "configNode", position: { x: 1100, y: 0 }, data: { label: "settings.json", configType: "settings", filePath: ".claude/settings.json", description: "Shared team permissions and config — committed to git", gitignored: false, sections: [{ title: "allowedTools", value: "Bash, Read, Edit, Write, Glob, Grep", icon: "🔧" }, { title: "deny", value: "Blocked patterns (e.g. rm -rf /)", icon: "🚫" }, { title: "permissions", value: "Tool-level allow/deny rules", icon: "🔑" }] } },
      { id: "settings-local", type: "configNode", position: { x: 1100, y: 200 }, data: { label: "settings.local.json", configType: "settings", filePath: ".claude/settings.local.json", description: "Personal permissions — gitignored. Override shared settings for your machine.", gitignored: true, sections: [{ title: "allowedTools", value: "Personal tool overrides", icon: "🔧" }, { title: "env", value: "Local environment variables", icon: "🌐" }] } },

      // ── Commands ──
      { id: "commands-dir", type: "configNode", position: { x: 1100, y: 400 }, data: { label: "commands/", configType: "command", filePath: ".claude/commands/", description: "Custom slash commands — type /project:<name> to run", gitignored: false, sections: [{ title: "review.md", value: "/project:review — code review workflow", icon: "👁️" }, { title: "fix-issue.md", value: "/project:fix-issue <id> — fix a GitHub issue", icon: "🔨" }, { title: "deploy.md", value: "/project:deploy — deployment workflow", icon: "🚀" }] } },
      { id: "cmd-review", type: "configNode", position: { x: 1500, y: 310 }, data: { label: "review.md", configType: "command", filePath: ".claude/commands/review.md", description: "Code review command — runs diff analysis, checks types, tests, and conventions", gitignored: false, sections: [{ title: "Trigger", value: "/project:review", icon: "▶" }, { title: "Steps", value: "git diff → type check → test → lint → report", icon: "📝" }, { title: "Output", value: "Structured review with pass/fail", icon: "📤" }] } },
      { id: "cmd-fix", type: "configNode", position: { x: 1500, y: 510 }, data: { label: "fix-issue.md", configType: "command", filePath: ".claude/commands/fix-issue.md", description: "Fix a GitHub issue by number — fetches context, plans fix, implements, and verifies", gitignored: false, sections: [{ title: "Trigger", value: "/project:fix-issue $ARGUMENTS", icon: "▶" }, { title: "Input", value: "GitHub issue number", icon: "🎯" }, { title: "Steps", value: "Fetch issue → plan → implement → test → PR", icon: "📝" }] } },
      { id: "cmd-deploy", type: "configNode", position: { x: 1500, y: 710 }, data: { label: "deploy.md", configType: "command", filePath: ".claude/commands/deploy.md", description: "Deployment workflow — build, verify, push, and monitor", gitignored: false, sections: [{ title: "Trigger", value: "/project:deploy", icon: "▶" }, { title: "Steps", value: "Build → test → push → health check", icon: "📝" }, { title: "Platform", value: "Railway / Vercel / custom", icon: "☁️" }] } },

      // ── Rules ──
      { id: "rules-dir", type: "configNode", position: { x: 1100, y: 630 }, data: { label: "rules/", configType: "rule", filePath: ".claude/rules/", description: "Modular instruction files — auto-loaded as context every session", gitignored: false, sections: [{ title: "code-style.md", value: "TypeScript, React 19, Tailwind conventions", icon: "🎨" }, { title: "testing.md", value: "Build verification, pre-commit checks", icon: "🧪" }, { title: "api-conventions.md", value: "Route handlers, API patterns", icon: "🔌" }] } },
      { id: "rule-style", type: "configNode", position: { x: 1500, y: 900 }, data: { label: "code-style.md", configType: "rule", filePath: ".claude/rules/code-style.md", description: "Code style conventions — loaded automatically so every session follows the same patterns", gitignored: false, sections: [{ title: "TypeScript", value: "Strict mode, no any, prefer const", icon: "📘" }, { title: "React", value: "Function components, hooks, server components", icon: "⚛️" }, { title: "Tailwind", value: "v4 syntax, design tokens, no arbitrary values", icon: "🎨" }, { title: "Imports", value: "Absolute paths via @/, barrel exports", icon: "📦" }] } },
      { id: "rule-test", type: "configNode", position: { x: 1500, y: 1120 }, data: { label: "testing.md", configType: "rule", filePath: ".claude/rules/testing.md", description: "Testing rules — build verification and pre-commit requirements", gitignored: false, sections: [{ title: "Build Check", value: "npm run build must pass before commit", icon: "🏗️" }, { title: "Type Check", value: "npx tsc --noEmit must pass", icon: "✅" }, { title: "Manual Test", value: "Verify UI changes in browser", icon: "👁️" }] } },
      { id: "rule-api", type: "configNode", position: { x: 1500, y: 1310 }, data: { label: "api-conventions.md", configType: "rule", filePath: ".claude/rules/api-conventions.md", description: "API and integration patterns — route handlers, auth, external services", gitignored: false, sections: [{ title: "Routes", value: "App Router route.ts handlers", icon: "🔌" }, { title: "Auth", value: "Supabase session checks", icon: "🔐" }, { title: "AI", value: "Anthropic API via user key", icon: "🧠" }, { title: "GitHub", value: "Octokit patterns", icon: "🐙" }] } },

      // ── Skills ──
      { id: "skills-dir", type: "configNode", position: { x: 1100, y: 870 }, data: { label: "skills/", configType: "skill", filePath: ".claude/skills/", description: "Auto-invoked workflows — triggered when touching specific areas of code", gitignored: false, sections: [{ title: "security-review/", value: "Triggers on auth/API/key changes", icon: "🔒" }, { title: "deploy/", value: "Railway deployment workflow", icon: "🚀" }] } },
      { id: "skill-security", type: "configNode", position: { x: 1500, y: 1500 }, data: { label: "security-review/", configType: "skill", filePath: ".claude/skills/security-review/SKILL.md", description: "Auto-triggers when modifying auth, API keys, or sensitive data handling", gitignored: false, sections: [{ title: "Trigger", value: "Changes to auth/, api/, or key handling", icon: "⚡" }, { title: "Checks", value: "No secrets in code, proper validation", icon: "🔍" }, { title: "Action", value: "Flag issues, suggest fixes", icon: "🛡️" }] } },
      { id: "skill-deploy", type: "configNode", position: { x: 1500, y: 1700 }, data: { label: "deploy/", configType: "skill", filePath: ".claude/skills/deploy/SKILL.md", description: "Deployment skill — automates build, verify, and push to Railway", gitignored: false, sections: [{ title: "Trigger", value: "/project:deploy or manual", icon: "▶" }, { title: "Pre-flight", value: "Build + type check + test", icon: "✅" }, { title: "Deploy", value: "git push → Railway auto-deploy", icon: "🚂" }, { title: "Verify", value: "Health check post-deploy", icon: "💚" }] } },

      // ── Agents ──
      { id: "agents-dir", type: "configNode", position: { x: 1100, y: 1080 }, data: { label: "agents/", configType: "agent", filePath: ".claude/agents/", description: "Subagent personas — isolated reviewers that run in parallel without polluting main context", gitignored: false, sections: [{ title: "code-reviewer.md", value: "Quality + stack pattern review", icon: "👁️" }, { title: "security-auditor.md", value: "API keys, auth, input sanitization", icon: "🔒" }] } },
      { id: "agent-reviewer", type: "configNode", position: { x: 1500, y: 1880 }, data: { label: "code-reviewer.md", configType: "agent", filePath: ".claude/agents/code-reviewer.md", description: "Code review subagent — checks quality, patterns, and stack conventions in isolation", gitignored: false, sections: [{ title: "Focus", value: "Type safety, React patterns, Tailwind usage", icon: "🎯" }, { title: "Stack", value: "Next.js 15, React 19, TypeScript", icon: "📚" }, { title: "Output", value: "Structured review with severity levels", icon: "📊" }] } },
      { id: "agent-auditor", type: "configNode", position: { x: 1500, y: 2070 }, data: { label: "security-auditor.md", configType: "agent", filePath: ".claude/agents/security-auditor.md", description: "Security audit subagent — checks for exposed keys, auth gaps, and input sanitization", gitignored: false, sections: [{ title: "Focus", value: "API keys, env vars, auth flows", icon: "🔐" }, { title: "Checks", value: "OWASP top 10, XSS, injection", icon: "🛡️" }, { title: "Output", value: "Security findings with risk levels", icon: "⚠️" }] } },

      // ── Annotation notes ──
      { id: "note-committed", type: "noteNode", position: { x: 350, y: 0 }, data: { label: "Committed", content: "Files without .gitignore badge are committed to git and shared with the team" } },
      { id: "note-personal", type: "noteNode", position: { x: 350, y: 700 }, data: { label: "Personal / Gitignored", content: "Files with .gitignore badge are local-only — personal preferences and machine-specific config" } },
    ],
    edges: [
      // Root → top-level files
      { id: "e-root-md", source: "root", target: "claude-md", type: "smoothstep", animated: true, label: "team" },
      { id: "e-root-local", source: "root", target: "claude-local", type: "smoothstep", animated: true, label: "personal", style: { strokeDasharray: "5 5" } },
      { id: "e-root-dir", source: "root", target: "claude-dir", type: "smoothstep", animated: true, label: ".claude/" },

      // .claude/ → sections
      { id: "e-dir-settings", source: "claude-dir", target: "settings-json", type: "smoothstep", animated: true },
      { id: "e-dir-slocal", source: "claude-dir", target: "settings-local", type: "smoothstep", animated: true, style: { strokeDasharray: "5 5" } },
      { id: "e-dir-cmds", source: "claude-dir", target: "commands-dir", type: "smoothstep", animated: true },
      { id: "e-dir-rules", source: "claude-dir", target: "rules-dir", type: "smoothstep", animated: true },
      { id: "e-dir-skills", source: "claude-dir", target: "skills-dir", type: "smoothstep", animated: true },
      { id: "e-dir-agents", source: "claude-dir", target: "agents-dir", type: "smoothstep", animated: true },

      // Commands → children
      { id: "e-cmds-review", source: "commands-dir", target: "cmd-review", type: "smoothstep", animated: true },
      { id: "e-cmds-fix", source: "commands-dir", target: "cmd-fix", type: "smoothstep", animated: true },
      { id: "e-cmds-deploy", source: "commands-dir", target: "cmd-deploy", type: "smoothstep", animated: true },

      // Rules → children
      { id: "e-rules-style", source: "rules-dir", target: "rule-style", type: "smoothstep", animated: true },
      { id: "e-rules-test", source: "rules-dir", target: "rule-test", type: "smoothstep", animated: true },
      { id: "e-rules-api", source: "rules-dir", target: "rule-api", type: "smoothstep", animated: true },

      // Skills → children
      { id: "e-skills-sec", source: "skills-dir", target: "skill-security", type: "smoothstep", animated: true },
      { id: "e-skills-dep", source: "skills-dir", target: "skill-deploy", type: "smoothstep", animated: true },

      // Agents → children
      { id: "e-agents-rev", source: "agents-dir", target: "agent-reviewer", type: "smoothstep", animated: true },
      { id: "e-agents-aud", source: "agents-dir", target: "agent-auditor", type: "smoothstep", animated: true },
    ],
  },

  // Agent Tasks
  {
    id: "workflow-agent-tasks",
    name: "Agent Tasks",
    description: "Orchestrate autonomous agent tasks: define goal -> assign persona -> execute with Claude Code -> review -> report",
    category: "workflow",
    isBuiltIn: true,
    createdAt: "2026-03-25",
    nodes: [
      { id: "trigger", type: "triggerNode", position: { x: 0, y: 200 }, data: { label: "New Task", triggerType: "manual", config: "Define an agent task goal" } },
      { id: "assign", type: "transformNode", position: { x: 300, y: 200 }, data: { label: "Assign Persona", transformType: "map", expression: "match task type to best persona" } },
      { id: "execute", type: "llmNode", position: { x: 600, y: 200 }, data: { label: "Execute Task", provider: "claude-code", model: "", systemPrompt: "Execute this task autonomously. Use tools, write code, and verify results.", temperature: 0.3, maxTokens: 8192 } },
      { id: "check", type: "conditionNode", position: { x: 900, y: 200 }, data: { label: "Task Done?", condition: "status === 'completed' && no_errors" } },
      { id: "report", type: "outputNode", position: { x: 1200, y: 100 }, data: { label: "Task Report", outputType: "file", destination: ".supraloop/agent-tasks/" } },
      { id: "retry", type: "llmNode", position: { x: 1200, y: 380 }, data: { label: "Debug & Retry", provider: "claude-code", model: "", systemPrompt: "Analyze what went wrong and retry the task with a different approach", temperature: 0.4, maxTokens: 4096 } },
    ],
    edges: [
      { id: "e1", source: "trigger", target: "assign", type: "smoothstep", animated: true },
      { id: "e2", source: "assign", target: "execute", type: "smoothstep", animated: true },
      { id: "e3", source: "execute", target: "check", type: "smoothstep", animated: true },
      { id: "e4", source: "check", target: "report", type: "smoothstep", animated: true, sourceHandle: "true", label: "done" },
      { id: "e5", source: "check", target: "retry", type: "smoothstep", animated: true, sourceHandle: "false", label: "retry" },
      { id: "e6", source: "retry", target: "check", type: "smoothstep", animated: true, style: { strokeDasharray: "5 5" } },
    ],
  },

  // ── Claude Code Project Setup template ──
  {
    id: "workflow-claude-project-setup",
    name: "Claude Code Project Setup",
    description: "Full .claude/ folder structure — CLAUDE.md, commands, rules, skills, and agents as connected nodes",
    category: "workflow",
    isBuiltIn: true,
    createdAt: "2026-03-25",
    nodes: [
      // ── Row 0: Project Root ──
      { id: "project-root", type: "appNode", position: { x: 550, y: 0 }, data: { label: "your-project", description: "The root of your project. CLAUDE.md and .claude/ live here.", targetUsers: "Your dev team + Claude Code", coreValue: "Everything Claude needs to know about your project lives right here", currentState: "" } },

      // ── Row 1: Top-level files + .claude directory ──
      { id: "claude-md", type: "noteNode", position: { x: 100, y: 200 }, data: { label: "CLAUDE.md", content: "Team instructions, committed to git.\n\n## Sections to include:\n- Project description & what it does\n- Architecture overview\n- Tech stack\n- Key files & their purpose\n- Coding conventions\n- Any project-specific rules" } },
      { id: "claude-local-md", type: "noteNode", position: { x: 1000, y: 200 }, data: { label: "CLAUDE.local.md", content: "Personal overrides, gitignored.\n\n## Examples:\n- Response style preferences\n- Local environment differences\n- Testing preferences\n- Your deployment config\n\nWon't affect other contributors." } },
      { id: "claude-dir", type: "stepNode", position: { x: 520, y: 200 }, data: { label: ".claude/", stepIndex: 0, subtitle: "The control center", status: "active", summary: "Contains all Claude Code configuration: permissions, commands, rules, skills, and agents.", flowCategory: "app" } },

      // ── Row 2: Settings files + directory nodes ──
      { id: "settings-json", type: "noteNode", position: { x: -100, y: 430 }, data: { label: "settings.json", content: "Permissions + config, committed to git.\n\nShared team permissions:\n- Bash commands (npm, git, gh)\n- WebFetch domains\n- Tool-specific allows\n\nExample:\n{\"permissions\":{\"allow\":[\"Bash(npm run:*)\"]}}" } },
      { id: "settings-local", type: "noteNode", position: { x: 1200, y: 430 }, data: { label: "settings.local.json", content: "Personal permissions, gitignored.\n\nYour local overrides:\n- Extra bash permissions\n- Personal API domains\n- dangerously-skip-permissions\n\nWon't conflict with team settings." } },
      { id: "commands-dir", type: "stepNode", position: { x: 200, y: 430 }, data: { label: "commands/", stepIndex: 1, subtitle: "Custom slash commands", status: "pending", summary: "Each .md file becomes a /project:<name> command. Define reusable workflows your whole team can trigger.", flowCategory: "app" } },
      { id: "rules-dir", type: "stepNode", position: { x: 500, y: 430 }, data: { label: "rules/", stepIndex: 2, subtitle: "Modular instruction files", status: "pending", summary: "Auto-loaded as context in every session. Break CLAUDE.md into focused, maintainable modules.", flowCategory: "benchmark" } },
      { id: "skills-dir", type: "stepNode", position: { x: 780, y: 430 }, data: { label: "skills/", stepIndex: 3, subtitle: "Auto-invoked workflows", status: "pending", summary: "Triggered automatically based on what files you're changing. Each skill is a folder with a SKILL.md.", flowCategory: "scoring" } },
      { id: "agents-dir", type: "stepNode", position: { x: 1040, y: 430 }, data: { label: "agents/", stepIndex: 4, subtitle: "Subagent personas", status: "pending", summary: "Isolated subagent definitions. Run in their own context window for focused, parallel work.", flowCategory: "improve" } },

      // ── Row 3: Command files ──
      { id: "cmd-review", type: "actionNode", position: { x: 20, y: 680 }, data: { label: "review.md", actionType: "analyze", description: "/project:review\n\nReview current branch against main:\n- Type safety & error handling\n- Framework patterns (React 19, Tailwind 4)\n- Security issues\n- Performance concerns\n\nOutputs: Issues, Suggestions, Approval status" } },
      { id: "cmd-fix-issue", type: "actionNode", position: { x: 240, y: 680 }, data: { label: "fix-issue.md", actionType: "improve", description: "/project:fix-issue <number>\n\nFetch GitHub issue → read context → implement fix → build verify → type check → commit with issue ref.\n\nAccepts issue number as $ARGUMENTS." } },
      { id: "cmd-deploy", type: "actionNode", position: { x: 440, y: 680 }, data: { label: "deploy.md", actionType: "commit", description: "/project:deploy\n\nBuild → type check → verify clean state → push → deploy → monitor logs → report status.\n\nCustomize for your platform (Railway, Vercel, etc.)" } },

      // ── Row 3: Rule files ──
      { id: "rule-code-style", type: "noteNode", position: { x: 20, y: 920 }, data: { label: "code-style.md", content: "TypeScript & React conventions:\n- Strict mode, no `any`\n- interface > type for objects\n- App Router patterns\n- 'use client' boundary rules\n- Tailwind utility-first\n- File organization standards" } },
      { id: "rule-testing", type: "noteNode", position: { x: 240, y: 920 }, data: { label: "testing.md", content: "Build & test verification:\n- npm run build before commits\n- tsc --noEmit for type safety\n- Visual testing with Preview\n- Responsive breakpoints to check\n- Pre-commit check requirements" } },
      { id: "rule-api", type: "noteNode", position: { x: 460, y: 920 }, data: { label: "api-conventions.md", content: "API route patterns:\n- Route handler exports (GET, POST...)\n- Input validation requirements\n- Auth patterns (Supabase, OAuth)\n- API key handling rules\n- Error response format\n- External service conventions" } },

      // ── Row 3: Skill folders ──
      { id: "skill-security", type: "llmNode", position: { x: 680, y: 680 }, data: { label: "security-review/", provider: "claude-code", model: "", systemPrompt: "Auto-triggers on changes to:\n- API routes (src/app/api/**)\n- Auth code (src/lib/supabase/**)\n- Key handling (llm-client.ts)\n\nChecks: OWASP Top 10, key exposure, input validation, CORS, data leaks", temperature: 0.2, maxTokens: 4096 } },
      { id: "skill-deploy", type: "llmNode", position: { x: 900, y: 680 }, data: { label: "deploy/", provider: "claude-code", model: "", systemPrompt: "Auto-invoked deployment:\n1. Build verification\n2. Type checking\n3. Push to remote\n4. Deploy (Railway/Vercel)\n5. Monitor logs\n6. Verify HTTP 200\n7. Rollback on failure", temperature: 0.1, maxTokens: 2048 } },

      // ── Row 3: Agent files ──
      { id: "agent-reviewer", type: "personaNode", position: { x: 960, y: 920 }, data: { label: "Code Reviewer", role: "code-reviewer.md", voteWeight: 1.0, expertise: ["Architecture", "Type safety", "Performance", "React patterns"], personality: "Reviews for quality, patterns, and issues specific to your stack. Outputs: BLOCKER / WARNING / NOTE.", emoji: "🔍" } },
      { id: "agent-security", type: "personaNode", position: { x: 1180, y: 920 }, data: { label: "Security Auditor", role: "security-auditor.md", voteWeight: 1.0, expertise: ["API key handling", "Auth flows", "Input sanitization", "OWASP"], personality: "Audits for vulnerabilities. Focuses on key exposure, auth bypass, injection. Outputs: Critical/High/Medium/Low.", emoji: "🛡️" } },
    ],
    edges: [
      // Project root → top-level files
      { id: "e-root-claude", source: "project-root", target: "claude-md", type: "smoothstep", animated: true, label: "committed" },
      { id: "e-root-dir", source: "project-root", target: "claude-dir", type: "smoothstep", animated: true },
      { id: "e-root-local", source: "project-root", target: "claude-local-md", type: "smoothstep", animated: false, label: "gitignored", style: { strokeDasharray: "5 5" } },

      // .claude/ → subdirectories & settings
      { id: "e-dir-settings", source: "claude-dir", target: "settings-json", type: "smoothstep", animated: true, label: "committed" },
      { id: "e-dir-settingslocal", source: "claude-dir", target: "settings-local", type: "smoothstep", animated: false, label: "gitignored", style: { strokeDasharray: "5 5" } },
      { id: "e-dir-commands", source: "claude-dir", target: "commands-dir", type: "smoothstep", animated: true },
      { id: "e-dir-rules", source: "claude-dir", target: "rules-dir", type: "smoothstep", animated: true },
      { id: "e-dir-skills", source: "claude-dir", target: "skills-dir", type: "smoothstep", animated: true },
      { id: "e-dir-agents", source: "claude-dir", target: "agents-dir", type: "smoothstep", animated: true },

      // commands/ → command files
      { id: "e-cmd-review", source: "commands-dir", target: "cmd-review", type: "smoothstep", animated: true },
      { id: "e-cmd-fix", source: "commands-dir", target: "cmd-fix-issue", type: "smoothstep", animated: true },
      { id: "e-cmd-deploy", source: "commands-dir", target: "cmd-deploy", type: "smoothstep", animated: true },

      // rules/ → rule files
      { id: "e-rule-style", source: "rules-dir", target: "rule-code-style", type: "smoothstep", animated: true },
      { id: "e-rule-test", source: "rules-dir", target: "rule-testing", type: "smoothstep", animated: true },
      { id: "e-rule-api", source: "rules-dir", target: "rule-api", type: "smoothstep", animated: true },

      // skills/ → skill folders
      { id: "e-skill-sec", source: "skills-dir", target: "skill-security", type: "smoothstep", animated: true },
      { id: "e-skill-deploy", source: "skills-dir", target: "skill-deploy", type: "smoothstep", animated: true },

      // agents/ → agent files
      { id: "e-agent-rev", source: "agents-dir", target: "agent-reviewer", type: "smoothstep", animated: true },
      { id: "e-agent-sec", source: "agents-dir", target: "agent-security", type: "smoothstep", animated: true },

      // Cross-connections: skills invoke agents
      { id: "e-sec-skill-agent", source: "skill-security", target: "agent-security", type: "smoothstep", animated: false, label: "invokes", style: { strokeDasharray: "5 5", stroke: "#a855f7" } },
      { id: "e-deploy-review", source: "skill-deploy", target: "agent-reviewer", type: "smoothstep", animated: false, label: "invokes", style: { strokeDasharray: "5 5", stroke: "#a855f7" } },
    ],
  },
];

// ── Template helpers ─────────────────────────────────────────────

const STORAGE_KEY = "supraloop_custom_templates";

export function getCustomTemplates(): FlowTemplate[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveCustomTemplate(template: FlowTemplate): void {
  const existing = getCustomTemplates();
  const idx = existing.findIndex((t) => t.id === template.id);
  if (idx >= 0) {
    existing[idx] = template;
  } else {
    existing.push(template);
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
}

export function deleteCustomTemplate(id: string): void {
  const existing = getCustomTemplates().filter((t) => t.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
}

export function getAllTemplates(): FlowTemplate[] {
  return [...BUILT_IN_TEMPLATES, ...getCustomTemplates()];
}

export function getTemplatesByCategory(
  category: FlowTemplate["category"]
): FlowTemplate[] {
  return getAllTemplates().filter((t) => t.category === category);
}

/** Generate the next copy name with _001, _002, etc. suffix */
export function getNextCopyName(baseName: string): string {
  const all = getAllTemplates();
  // Strip any existing _NNN suffix to get the clean base
  const cleanBase = baseName.replace(/_\d{3}$/, "");
  let maxNum = 0;
  for (const t of all) {
    const tClean = t.name.replace(/_\d{3}$/, "");
    if (tClean === cleanBase) {
      const match = t.name.match(/_(\d{3})$/);
      const num = match ? parseInt(match[1], 10) : 0;
      if (num > maxNum) maxNum = num;
    }
  }
  const next = String(maxNum + 1).padStart(3, "0");
  return `${cleanBase}_${next}`;
}

// ── Starred Templates ──────────────────────────────────────────

const STARRED_KEY = "supraloop-starred-templates";

export function getStarredTemplateIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(STARRED_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

export function toggleStarTemplate(id: string): boolean {
  const starred = getStarredTemplateIds();
  if (starred.has(id)) {
    starred.delete(id);
  } else {
    starred.add(id);
  }
  localStorage.setItem(STARRED_KEY, JSON.stringify([...starred]));
  return starred.has(id);
}

export function isTemplateStarred(id: string): boolean {
  return getStarredTemplateIds().has(id);
}

/** Create a copy of a template as a new custom template */
export function copyTemplate(template: FlowTemplate): FlowTemplate {
  const name = getNextCopyName(template.name);
  const copy: FlowTemplate = {
    id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name,
    description: template.description,
    category: "custom",
    nodes: JSON.parse(JSON.stringify(template.nodes)),
    edges: JSON.parse(JSON.stringify(template.edges)),
    createdAt: new Date().toISOString().split("T")[0],
    isBuiltIn: false,
  };
  saveCustomTemplate(copy);
  return copy;
}
