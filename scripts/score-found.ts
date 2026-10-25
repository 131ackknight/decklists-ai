/**
 * How close do brews get to a deck the owner found outside MTGO? (2026-10-25)
 *
 *   pnpm exec tsx scripts/score-found.ts evals/results/round4/found-<run>.json [...]
 *
 * Main deck overlap with the found list, card for card (copies count), split
 * into spells and lands, plus which of the list's cards each brew has and
 * misses. Baseline: the closest list in Decklist Data (no model), the score a
 * brewer would get by copying the nearest MTGO list.
 */
import { readFileSync } from "node:fs";
import { loadCardIndex } from "../src/cards/load";
import { isLand, toCounts, type Line } from "../evals/round4/items";

const W = /^Cards?\s*\(\d+%?\)\s*$/i;
const FOUND = "evals/round4/lists/found/premodern-mono-blue-squee-bouncer.json";
const ITEMS = ["found-premodern-squee-bouncer-a", "found-premodern-squee-bouncer-b"];

const index = loadCardIndex();
const found = JSON.parse(readFileSync(FOUND, "utf8")) as { label: string; format: string; main: Line[] };
const target = toCounts(index, found.main);
const name = (k: string) => index.getCard(k)?.name ?? k;
const land = (k: string) => isLand(index, k);
const overlap = (a: Map<string, number>, b: Map<string, number>, keep: (k: string) => boolean = () => true) =>
  [...a].filter(([k]) => keep(k)).reduce((n, [k, q]) => n + Math.min(q, b.get(k) ?? 0), 0);
const sum = (m: Map<string, number>, keep: (k: string) => boolean = () => true) => [...m].filter(([k]) => keep(k)).reduce((n, [, q]) => n + q, 0);

// Baseline: the closest Premodern list in the data.
const raw = readFileSync("data/reference-lists-all.jsonl", "utf8")
  .split("\n")
  .filter(Boolean)
  .map((l) => JSON.parse(l) as { format: string; date: string; strategy: string; main: Line[] })
  .filter((l) => l.format === found.format.toLowerCase());
const closest = raw
  .map((l) => ({ l, o: overlap(target, toCounts(index, l.main.filter((c) => !W.test(c.name)))) }))
  .sort((a, b) => b.o - a.o)[0];
console.log(`${found.label}: closest list in the data ${closest.o}/60 (${closest.l.strategy}, ${closest.l.date})\n`);

const rows: Record<string, string | number>[] = [];
const byPrompt = new Map<string, number[]>();
for (const f of process.argv.slice(2)) {
  const run = JSON.parse(readFileSync(f, "utf8")) as { harness: string; results: { id: string; deck: { main: Line[] } | null }[] };
  const tag = f.match(/-(r\d)\.json$/)?.[1] ?? "";
  for (const r of run.results.filter((x) => x && ITEMS.includes(x.id))) {
    const prompt = r.id.endsWith("-a") ? "A" : "B";
    if (!r.deck) {
      rows.push({ prompt, run: `${run.harness} ${tag}`, overlap: "no deck" });
      continue;
    }
    const m = toCounts(index, r.deck.main);
    const o = overlap(target, m);
    const key = `${prompt} ${run.harness}`;
    byPrompt.set(key, [...(byPrompt.get(key) ?? []), o]);
    const has = [...target].filter(([k]) => !land(k) && m.has(k)).map(([k]) => `${name(k)} ${m.get(k)}`);
    const nonBlue = [...m].filter(([k]) => !land(k) && (index.getCard(k)?.colors ?? []).some((c) => c !== "U")).map(([k]) => name(k));
    rows.push({
      prompt,
      run: `${run.harness} ${tag}`,
      overlap: `${o}/60`,
      spells: `${overlap(target, m, (k) => !land(k))}/${sum(target, (k) => !land(k))}`,
      lands: `${overlap(target, m, land)}/${sum(target, land)}`,
      squee: m.get([...target.keys()].find((k) => name(k) === "Squee, Goblin Nabob")!) ?? 0,
      "found's spells it has": has.join(", "),
      "non-blue spells": nonBlue.join(", "),
    });
  }
}
console.table(rows);
for (const [k, v] of [...byPrompt].sort()) console.log(`${k}: ${v.map((x) => `${x}/60`).join(", ")} (mean ${Math.round((v.reduce((a, b) => a + b, 0) / v.length / 60) * 100)}%)`);
