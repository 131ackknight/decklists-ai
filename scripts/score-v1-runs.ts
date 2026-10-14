/**
 * Objective scores for v1 eval runs, per model and pass.
 *
 *   pnpm exec tsx scripts/score-v1-runs.ts evals/results/model-comparison/*.json
 *
 * Result files are named <label>-p<pass>.json, e.g. claude-opus-5-5-p1.json.
 *
 * For every answer: did it produce a deck v1 accepted, does that deck pass
 * the decklists.ai checker (errors and mana warnings), how far is its land
 * count from the real archetype it was classified as, how many card names
 * no real card matches, plus tokens, cost and time. Writes
 * evals/results/model-comparison/objective.json and prints a summary.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getFormat } from "../src/cards/formats";
import { loadCardIndex } from "../src/cards/load";
import type { ArchetypeManaProfile } from "../src/checker/archetype-mana";
import { compareToArchetype } from "../src/checker/archetype-mana";
import { checkDeck } from "../src/checker/check";

/** USD per million tokens (input, output). */
const PRICES: Record<string, [number, number]> = {
  "claude-haiku-4-5": [1, 5],
  "claude-haiku-5-5": [0.1, 0.5],
  "claude-sonnet-5-5": [2, 10],
  "claude-opus-5-5": [4, 20],
  "claude-fable-5-1": [10, 50],
};

interface Line {
  qty: number;
  name: string;
}
interface RunFile {
  ranAt: string;
  model: string;
  pass?: string;
  results: {
    id: string;
    format: string;
    sentFormat: string | null;
    unsupported?: boolean;
    ms?: number;
    errors?: string[];
    deck?: { main: Line[]; side: Line[]; strategy?: string } | null;
    usage?: { promptTokens?: number; completionTokens?: number } | null;
  }[];
}

const files = process.argv.slice(2).filter((f) => f.endsWith(".json") && !f.endsWith("objective.json"));
const index = loadCardIndex();
const profilesPath = "data/archetype-mana.json";
const profiles = existsSync(profilesPath)
  ? new Map(
      (JSON.parse(readFileSync(profilesPath, "utf8")) as ArchetypeManaProfile[]).map((p) => [`${p.format}|${p.strategy}`, p]),
    )
  : new Map<string, ArchetypeManaProfile>();

const rows = [];
for (const file of files) {
  const run = JSON.parse(readFileSync(file, "utf8")) as RunFile;
  // Files are named <label>-p<pass>.json; the label keeps "as-shipped-claude-haiku-4-5" apart from the filtered rerun.
  const base = path.basename(file, ".json");
  const m = base.match(/^(.*)-p(\d+)$/);
  // harness-vN folders are labelled vN-; v1 runs live elsewhere and stay unprefixed.
  const harness = file.match(/harness-(v\d+)/)?.[1];
  const label = (harness ? `${harness}-` : "") + (m ? m[1] : base);
  const pass = m ? m[2] : "1";
  const [pin, pout] = PRICES[run.model] ?? [0, 0];
  const isV2 = /harness-v\d+/.test(file);
  for (const r of run.results) {
    if (r.unsupported || !r.sentFormat) continue;
    if (!r.deck && !r.usage && !r.ms) continue;
    const tokensIn = r.usage?.promptTokens ?? 0;
    const tokensOut = r.usage?.completionTokens ?? 0;
    const row: Record<string, unknown> = {
      model: label,
      pass,
      prompt: r.id,
      deck: Boolean(r.deck),
      apiError: (r.errors ?? []).length > 0,
      tokensIn,
      tokensOut,
      costUsd: isV2 ? ((r as { costUsd?: number }).costUsd ?? 0) : +((tokensIn * pin + tokensOut * pout) / 1e6).toFixed(4),
      seconds: Math.round((r.ms ?? 0) / 1000),
    };
    if (r.deck) {
      const deckFormat = (r.deck as { format?: string }).format ?? r.sentFormat;
      const format = getFormat(deckFormat)!;
      const result = checkDeck(index, {
        format: format.key,
        main: r.deck.main,
        side: r.deck.side,
        commander: (r.deck as { commander?: Line[] }).commander,
      });
      row.checkerErrors = result.errors.length;
      row.checkerWarnings = result.warnings.length;
      row.unknownCards = result.errors.filter((e) => e.code === "unknown-card").length;
      const profile = profiles.get(`${format.key}|${r.deck.strategy}`);
      if (profile && result.mana) {
        row.archetype = r.deck.strategy;
        row.landsVsArchetype = +(result.mana.lands - profile.lands.mean).toFixed(1);
        row.archetypeManaIssues = compareToArchetype(result.mana, profile).length;
      }
    }
    rows.push(row);
  }
}

type Row = (typeof rows)[number];
const groups = new Map<string, Row[]>();
for (const row of rows) {
  const k = `${row.model}|${row.pass}`;
  groups.set(k, [...(groups.get(k) ?? []), row]);
}
const summary = [...groups].sort().map(([k, rs]) => {
  const [model, pass] = k.split("|");
  const decks = rs.filter((r) => r.deck);
  const clean = decks.filter((r) => r.checkerErrors === 0);
  const withProfile = decks.filter((r) => r.landsVsArchetype !== undefined);
  return {
    model,
    pass,
    prompts: rs.length,
    decks: decks.length,
    decksPassingChecker: clean.length,
    decksWithManaWarnings: decks.filter((r) => (r.checkerWarnings as number) > 0).length,
    unknownCards: decks.reduce((n, r) => n + ((r.unknownCards as number) ?? 0), 0),
    avgAbsLandsVsArchetype: withProfile.length
      ? +(withProfile.reduce((n, r) => n + Math.abs(r.landsVsArchetype as number), 0) / withProfile.length).toFixed(2)
      : null,
    apiErrors: rs.filter((r) => r.apiError).length,
    costUsd: +rs.reduce((n, r) => n + (r.costUsd as number), 0).toFixed(2),
    medianSeconds: [...rs.map((r) => r.seconds as number)].sort((a, b) => a - b)[Math.floor(rs.length / 2)],
  };
});

console.table(summary);
writeFileSync("evals/results/model-comparison/objective.json", JSON.stringify({ summary, rows }, null, 1));
