import type {
  ImprovementDraft,
  TeamMember,
  ReferenceApp,
  CategoryScore,
  PersonaScore,
  GapItem,
  Round,
  CPOPersona,
} from "./improvement";
import { calcWeightedOverall } from "./improvement";

// ── Helpers ─────────────────────────────────────────────────────────

function generatedHeader(label: string): string {
  return `# ${label}\n# Generated: ${new Date().toISOString()}\n`;
}

/** Escape a string value for YAML inline scalar (single-quoted). */
function yamlStr(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/** Indent every line of a block by N spaces. */
function indent(block: string, spaces: number): string {
  const pad = " ".repeat(spaces);
  return block
    .split("\n")
    .map((line) => (line.trim() === "" ? "" : pad + line))
    .join("\n");
}

/** Zero-pad a number to a given width. */
function pad(n: number, width: number): string {
  return String(n).padStart(width, "0");
}

// ── config.yaml ─────────────────────────────────────────────────────

function buildConfigYaml(draft: ImprovementDraft): string {
  const { app, team } = draft;

  const teamBlock = team
    .map((m: TeamMember) =>
      [
        `  - id: ${m.id}`,
        `    name: ${yamlStr(m.name)}`,
        `    role: ${yamlStr(m.role)}`,
        `    modeled_after: ${yamlStr(m.modeled_after)}`,
        `    vote_weight: ${m.vote_weight}`,
        `    personality: ${yamlStr(m.personality)}`,
        `    expertise:`,
        m.expertise.map((e) => `      - ${yamlStr(e)}`).join("\n"),
        `    reviews:`,
        m.reviews.map((r) => `      - ${yamlStr(r)}`).join("\n"),
      ].join("\n")
    )
    .join("\n\n");

  return [
    generatedHeader("Athena Configuration"),
    "",
    "app:",
    `  name: ${yamlStr(app.name)}`,
    `  description: ${yamlStr(app.description)}`,
    `  target_users: ${yamlStr(app.target_users)}`,
    `  core_value: ${yamlStr(app.core_value)}`,
    `  tech_stack: ${yamlStr(app.tech_stack)}`,
    `  current_state: ${yamlStr(app.current_state)}`,
    "",
    "team:",
    teamBlock,
    "",
  ].join("\n");
}

// ── benchmarks.yaml ─────────────────────────────────────────────────

function buildCategoryScoresBlock(scores: CategoryScore[], baseIndent: number): string {
  const pad2 = " ".repeat(baseIndent);
  const pad4 = " ".repeat(baseIndent + 2);
  const pad6 = " ".repeat(baseIndent + 4);

  return scores
    .map((cat) => {
      const subBlock = cat.subCriteria
        .map((sc) => `${pad6}- name: ${yamlStr(sc.name)}\n${pad6}  score: ${sc.score}`)
        .join("\n");
      return [
        `${pad2}- name: ${yamlStr(cat.name)}`,
        `${pad4}weight: ${cat.weight}`,
        `${pad4}avg: ${cat.avg}`,
        `${pad4}sub_criteria:`,
        subBlock,
      ].join("\n");
    })
    .join("\n");
}

function buildBenchmarksYaml(draft: ImprovementDraft): string {
  const { referenceApps } = draft;

  if (referenceApps.length === 0) {
    return [
      generatedHeader("Athena Benchmarks"),
      "",
      "# No reference apps recorded yet.",
      "reference_apps: []\n",
    ].join("\n");
  }

  const appsBlock = referenceApps
    .map((app: ReferenceApp) => {
      const overallScore =
        app.scores.length > 0 ? calcWeightedOverall(app.scores) : 0;
      const scoresBlock = buildCategoryScoresBlock(app.scores, 4);
      return [
        `  - name: ${yamlStr(app.name)}`,
        `    why: ${yamlStr(app.why)}`,
        `    overall: ${overallScore}`,
        `    scores:`,
        scoresBlock,
      ].join("\n");
    })
    .join("\n\n");

  return [
    generatedHeader("Athena Benchmarks"),
    "",
    "reference_apps:",
    appsBlock,
    "",
  ].join("\n");
}

// ── scores.yaml ──────────────────────────────────────────────────────

function buildPersonaScoresBlock(personaScores: PersonaScore[]): string {
  if (personaScores.length === 0) return "persona_scores: []\n";

  const blocks = personaScores
    .map((ps) => {
      const catBlock = buildCategoryScoresBlock(ps.scores, 4);
      return [
        `  - persona_id: ${ps.personaId}`,
        `    persona_name: ${yamlStr(ps.personaName)}`,
        `    overall: ${ps.overall}`,
        `    scores:`,
        catBlock,
      ].join("\n");
    })
    .join("\n\n");

  return `persona_scores:\n${blocks}\n`;
}

function buildGapBlock(gapAnalysis: GapItem[]): string {
  if (gapAnalysis.length === 0) return "gap_analysis: []\n";

  const rows = gapAnalysis
    .map(
      (g) =>
        `  - category: ${yamlStr(g.category)}\n` +
        `    your_score: ${g.yourScore}\n` +
        `    best_ref: ${g.bestRef}\n` +
        `    gap: ${g.gap}\n` +
        `    priority: ${g.priority}`
    )
    .join("\n");

  return `gap_analysis:\n${rows}\n`;
}

function buildScoresYaml(draft: ImprovementDraft): string {
  const { selfScores, consensusScores, personaScores, gapAnalysis, targetScore } =
    draft;

  const selfOverall = calcWeightedOverall(selfScores);
  const consensusOverall = calcWeightedOverall(consensusScores);

  const selfBlock = buildCategoryScoresBlock(selfScores, 2);
  const consensusBlock = buildCategoryScoresBlock(consensusScores, 2);

  return [
    generatedHeader("Athena Scores"),
    "",
    `target_score: ${targetScore}`,
    "",
    `self_scores:`,
    `  # overall: ${selfOverall}`,
    selfBlock,
    "",
    `consensus_scores:`,
    `  # overall: ${consensusOverall}`,
    consensusBlock,
    "",
    buildPersonaScoresBlock(personaScores),
    buildGapBlock(gapAnalysis),
  ].join("\n");
}

// ── rounds/round-NNN.yaml ───────────────────────────────────────────

function buildRoundYaml(round: Round): string {
  const changesBlock = round.changes
    .map((c) => `  - ${yamlStr(c)}`)
    .join("\n");

  return [
    generatedHeader(`Athena Round ${pad(round.number, 3)}`),
    "",
    `round: ${round.number}`,
    `decision: ${yamlStr(round.decision)}`,
    `proposed_by: ${round.proposedBy}`,
    `proposed_by_role: ${yamlStr(round.proposedByRole)}`,
    `vote: ${yamlStr(round.vote)}`,
    `category_affected: ${yamlStr(round.categoryAffected)}`,
    `score_before: ${round.scoreBefore}`,
    `score_after: ${round.scoreAfter}`,
    `overall_before: ${round.overallBefore}`,
    `overall_after: ${round.overallAfter}`,
    `gap_remaining: ${round.gapRemaining}`,
    `changes:`,
    changesBlock,
    "",
  ].join("\n");
}

// ── cpos/{app-name}.yaml ────────────────────────────────────────────

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function buildCPOYaml(appName: string, cpo: CPOPersona): string {
  const strengthsBlock = cpo.strengths.map((s) => `  - ${yamlStr(s)}`).join("\n");
  const blindSpotsBlock = cpo.blindSpots.map((s) => `  - ${yamlStr(s)}`).join("\n");

  return [
    generatedHeader(`CPO Persona — ${appName}`),
    "",
    `name: ${yamlStr(cpo.name)}`,
    `company: ${yamlStr(cpo.company)}`,
    `title: ${yamlStr(cpo.title)}`,
    `philosophy: ${yamlStr(cpo.philosophy)}`,
    `decision_style: ${yamlStr(cpo.decisionStyle)}`,
    `iconic_move: ${yamlStr(cpo.iconicMove)}`,
    `strengths:`,
    strengthsBlock,
    `blind_spots:`,
    blindSpotsBlock,
    "",
  ].join("\n");
}

// ── Public API ───────────────────────────────────────────────────────

/**
 * Generates all files for the .athena/ directory from an ImprovementDraft.
 * Returns an array of { path, content } objects ready to be written to disk.
 */
export function generateAthenaFiles(
  draft: ImprovementDraft,
  appName: string
): { path: string; content: string }[] {
  const files: { path: string; content: string }[] = [];

  // config.yaml
  files.push({
    path: ".athena/config.yaml",
    content: buildConfigYaml(draft),
  });

  // benchmarks.yaml
  files.push({
    path: ".athena/benchmarks.yaml",
    content: buildBenchmarksYaml(draft),
  });

  // scores.yaml
  files.push({
    path: ".athena/scores.yaml",
    content: buildScoresYaml(draft),
  });

  // rounds/round-NNN.yaml — one file per completed round
  for (const round of draft.rounds) {
    files.push({
      path: `.athena/rounds/round-${pad(round.number, 3)}.yaml`,
      content: buildRoundYaml(round),
    });
  }

  // cpos/{app-name}.yaml — one file per reference app that has a CPO
  for (const refApp of draft.referenceApps) {
    if (refApp.cpo) {
      const slug = slugify(refApp.name);
      files.push({
        path: `.athena/cpos/${slug}.yaml`,
        content: buildCPOYaml(refApp.name, refApp.cpo),
      });
    }
  }

  return files;
}

/**
 * Generates a git commit message summarising the current improvement state.
 */
export function generateCommitMessage(draft: ImprovementDraft): string {
  const { app, rounds, consensusScores, gapAnalysis, targetScore } = draft;

  const overall = calcWeightedOverall(consensusScores);
  const appLabel = app.name || "app";

  if (rounds.length === 0) {
    return `chore(athena): initialise .athena/ for ${appLabel}\n\nScore baseline: ${overall}/${targetScore} target. No improvement rounds yet.`;
  }

  const lastRound = rounds[rounds.length - 1];
  const topGaps = [...gapAnalysis]
    .filter((g) => g.gap > 0)
    .sort((a, b) => b.gap - a.gap)
    .slice(0, 3)
    .map((g) => `${g.category} (gap: ${g.gap}, ${g.priority})`)
    .join(", ");

  const scoreProgress =
    rounds.length > 1
      ? `${rounds[0].overallBefore} → ${lastRound.overallAfter}`
      : `${lastRound.overallBefore} → ${lastRound.overallAfter}`;

  const summary =
    `improve(athena): round ${lastRound.number} — ${lastRound.categoryAffected}\n\n` +
    `App: ${appLabel}\n` +
    `Decision: ${lastRound.decision}\n` +
    `Proposed by: ${lastRound.proposedByRole} | Vote: ${lastRound.vote}\n` +
    `Score: ${scoreProgress} (target ${targetScore})\n` +
    (topGaps ? `Top gaps remaining: ${topGaps}\n` : "");

  return summary.trimEnd();
}
