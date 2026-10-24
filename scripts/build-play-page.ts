/**
 * Build the "would you play it?" page: one deck at a time from one run, yes/no
 * and a line on what's wrong. The question for a settled base harness, where
 * there is nothing left to compare against.
 *
 *   pnpm exec tsx scripts/build-play-page.ts --run evals/results/round4/expert2-v11-claude-opus-5-5.json \
 *     --out evals/rating/play-expert2-v11.html --key evals/results/round4/play-expert2-v11-key.json [--items id,id] [--title "..."] [--compare]
 *
 * Blind panel (2026-10-24): repeat --run to mix several versions, --shuffle to
 * put them in a fixed random order, --deck-only to drop the reply text (it gives
 * the version away: v17+ replies end with an "After review" section).
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { loadCardIndex } from "../src/cards/load";

interface Line {
  qty: number;
  name: string;
}
interface Result {
  id: string;
  format?: string;
  prompt?: string;
  text?: string;
  deck?: { main: Line[]; side: Line[]; commander?: Line[] } | null;
}
const argv = process.argv.slice(2);
const opt = (n: string) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const runFiles = argv.flatMap((a, i) => (a === "--run" ? [argv[i + 1]] : []));
const shuffle = argv.includes("--shuffle");
const deckOnly = argv.includes("--deck-only");
const out = opt("out") ?? "evals/rating/play.html";
const keyPath = opt("key") ?? "evals/results/round4/play-key.json";
const template = opt("template") ?? "evals/rating/play-template.html";
const only = opt("items")?.split(",");
const title = opt("title");
// --compare: a rebuild round, where "no" splits into closer / further away than the deck judged before.
const compare = argv.includes("--compare");

const runs = runFiles.map((f) => JSON.parse(readFileSync(f, "utf8")) as { harness: string; model: string; results: Result[] });
const index = loadCardIndex();
const cards: Record<string, { cost: string; type: string; text: string; pt?: string }> = {};
const key: Record<string, { item: string; harness: string; model: string }> = {};
const decks = runs
  .flatMap((run) => run.results.filter((r) => r && (!only || only.includes(r.id))).map((r) => ({ run, r })))
  .map(({ run, r }) => {
    const id = createHash("sha256").update(`${run.harness}|${run.model}|${r.id}`).digest("hex").slice(0, 12);
    key[id] = { item: r.id, harness: run.harness, model: run.model };
    for (const l of [...(r.deck?.main ?? []), ...(r.deck?.side ?? []), ...(r.deck?.commander ?? [])]) {
      const c = index.getCard(l.name);
      if (c && !cards[l.name]) cards[l.name] = { cost: c.manaCost, type: c.typeLine, text: c.text, pt: c.power != null ? `${c.power}/${c.toughness}` : undefined };
    }
    return { id, format: r.format ?? "", prompt: r.prompt ?? r.id, text: deckOnly ? "" : (r.text ?? ""), deck: r.deck ? { main: r.deck.main, side: r.deck.side ?? [], commander: r.deck.commander ?? [] } : null };
  });
// Order by the hashed id: random-looking, and the same on every rebuild.
if (shuffle) decks.sort((a, b) => a.id.localeCompare(b.id));
const json = JSON.stringify({ decks, cards, compare }).replace(/</g, "\\u003c");
let page = readFileSync(template, "utf8").replace("/*DATA*/", () => json);
if (title) page = page.replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`).replace(/<h1>[^<]*<\/h1>/, `<h1>${title}</h1>`);
writeFileSync(out, page);
writeFileSync(keyPath, JSON.stringify(key, null, 1) + "\n");
console.log(`wrote ${out}: ${decks.length} decks`);
