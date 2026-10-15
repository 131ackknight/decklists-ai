/**
 * Unblind pairwise picks and summarize them.
 *
 *   pnpm exec tsx scripts/analyze-pairwise.ts evals/results/pairwise-v1-vs-v2/pairs evals/results/pairwise-v1-vs-v2-key.json
 *
 * Labels are "<harness>-<model>" (e.g. v1-opus). Reports wins, ties and
 * yes/no rates per harness overall, per model, and per prompt type, plus
 * the owner's notes. Writes summary.json next to the picks.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const TYPE: Record<string, string> = {
  "premodern-stock-goblins": "a list exists",
  "modern-tribal-brew": "a list exists",
  "pauper-budget-aggro": "a list exists",
  "vintage-restricted": "a list exists",
  "legacy-sideboard-only": "owner's list given",
  "premodern-paste-and-tune": "owner's list given",
  "legacy-impossible": "impossible as asked",
  "modern-named-two-cards": "impossible as asked",
};
const typeOf = (p: string) => TYPE[p] ?? "brew or twist";

interface Pick {
  pair: string;
  prompt: string;
  winner?: "A" | "B" | "tie";
  aAsked?: boolean;
  aPlay?: boolean;
  bAsked?: boolean;
  bPlay?: boolean;
  notes?: string;
}

const [dir, keyFile] = process.argv.slice(2);
const key = JSON.parse(readFileSync(keyFile, "utf8")) as Record<string, { prompt: string; left: string; right: string }>;
const picks = readdirSync(dir)
  .filter((f) => f.endsWith(".json"))
  .map((f) => {
    const raw = JSON.parse(readFileSync(path.join(dir, f), "utf8"));
    return (raw.data ?? raw) as Pick;
  })
  .filter((p) => p.winner && key[p.pair]);

/** One row per answer: harness, model, asked, play, and the pair outcome from its side. */
const answers = picks.flatMap((p) => {
  const k = key[p.pair];
  const side = (label: string, mine: "A" | "B", asked?: boolean, play?: boolean) => {
    const [harness, model] = label.split("-");
    const outcome = p.winner === "tie" ? "tie" : p.winner === mine ? "win" : "loss";
    return { pair: p.pair, prompt: p.prompt, type: typeOf(p.prompt), harness, model, asked, play, outcome, notes: p.notes };
  };
  return [side(k.left, "A", p.aAsked, p.aPlay), side(k.right, "B", p.bAsked, p.bPlay)];
});

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : null);
function summarize(rows: typeof answers) {
  const n = rows.length;
  return {
    answers: n,
    wins: rows.filter((r) => r.outcome === "win").length,
    ties: rows.filter((r) => r.outcome === "tie").length,
    losses: rows.filter((r) => r.outcome === "loss").length,
    didWhatAskedPct: pct(rows.filter((r) => r.asked).length, rows.filter((r) => r.asked != null).length),
    wouldPlayPct: pct(rows.filter((r) => r.play).length, rows.filter((r) => r.play != null).length),
  };
}

// The two harnesses being compared, e.g. v1 vs v2 or v2 vs v3; the newer one is "new".
const harnesses = [...new Set(answers.map((a) => a.harness))].sort();
const [oldH, newH] = harnesses;
const groups: Record<string, unknown> = {};
for (const h of harnesses) {
  groups[h] = summarize(answers.filter((a) => a.harness === h));
  for (const m of [...new Set(answers.map((a) => a.model))]) {
    groups[`${h} ${m}`] = summarize(answers.filter((a) => a.harness === h && a.model === m));
  }
  for (const t of ["a list exists", "owner's list given", "brew or twist", "impossible as asked"]) {
    groups[`${h} | ${t}`] = summarize(answers.filter((a) => a.harness === h && a.type === t));
  }
}
console.table(groups);

const perPrompt = [...new Set(picks.map((p) => p.prompt))].map((prompt) => {
  const rows = answers.filter((a) => a.prompt === prompt && a.harness === newH);
  const olds = answers.filter((a) => a.prompt === prompt && a.harness === oldH);
  return {
    prompt,
    type: typeOf(prompt),
    [`${newH} outcome`]: rows.map((r) => `${r.model}:${r.outcome}`).join(" "),
    [`${oldH} asked`]: olds.map((a) => (a.asked ? "Y" : "N")).join(""),
    [`${newH} asked`]: rows.map((a) => (a.asked ? "Y" : "N")).join(""),
    [`${oldH} play`]: olds.map((a) => (a.play ? "Y" : "N")).join(""),
    [`${newH} play`]: rows.map((a) => (a.play ? "Y" : "N")).join(""),
  };
});
console.table(perPrompt);

const notes = picks
  .filter((p) => p.notes)
  .map((p) => {
    const k = key[p.pair];
    const winner = p.winner === "tie" ? "tie" : p.winner === "A" ? k.left : k.right;
    return { prompt: p.prompt, winner, notes: p.notes };
  });
if (notes.length) console.table(notes);

writeFileSync(path.join(path.dirname(dir), "summary.json"), JSON.stringify({ judged: picks.length, groups, perPrompt, notes }, null, 1));
