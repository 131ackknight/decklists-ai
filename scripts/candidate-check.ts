/**
 * Would a candidate list contain the spells inventors borrowed? (2026-11-08, owner: "Yes, check it".)
 * Free: no model calls.
 *
 *   pnpm exec tsx scripts/candidate-check.ts [--colors settled|requested|coplay|none]
 *
 * For each dev deck (holdout-v1), the target is the little-played spells (under 10% of the format's lists
 * in the 90 days before the cut) that the inventors' first-week lists took from other decks (not in that
 * list's closest earlier list, not requested) and that stayed (in half or more of the settled lists).
 * Candidates are the format's little-played spells in those 90 days, castable in the deck's colors, ranked
 * four ways using only what a brewer knows at the cut. --colors: settled = the settled deck's colors (not
 * known when brewing; the default, as first run); requested = the requested cards' colors; coplay = the
 * most common colors of the format's earlier lists that run a requested card (else the requested cards'
 * colors); none = no color filter. Prints how many target spells
 * each ranking puts in its top 20, 50 and 100, and how many the AI's own dev decks already contain.
 */
import { readFileSync } from "node:fs";
import { loadCardIndex } from "../src/cards/load";
import { RoleReader } from "../src/coach/coach";
import { FileDataSource } from "../src/data/source";
import { synergyModelFor, synergyScore } from "../src/synergy/feature-synergy";
import { isLand, round4Items, toCounts, type Line } from "../evals/round4/items";
import { borrowedSpells, loadLists, settledLists, type Counts, type RefList } from "../evals/score";
import { testById } from "../evals/tests";

const DAY = 86_400_000;
const NS = [20, 50, 100];
const RANKINGS = ["most-played first", "v16 synergy score", "played with the requested cards", "top per job (synergy)"] as const;
type Ranking = (typeof RANKINGS)[number];
const AI_RUNS: Record<string, string[]> = {
  "v13, Opus": ["holdout-v13-claude-opus-5-5.json", "holdout-v13-claude-opus-5-5-r2.json", "holdout-v13-claude-opus-5-5-r3.json"],
  "v14, Opus": ["holdout-v14-claude-opus-5-5.json", "holdout-v14-claude-opus-5-5-r2.json", "holdout-v14-claude-opus-5-5-r3.json"],
};

const colorRule = process.argv.includes("--colors") ? process.argv[process.argv.indexOf("--colors") + 1] : "settled";

async function main() {
  const index = loadCardIndex();
  const roles = new RoleReader(index);
  const items = new Map(round4Items(index).map((it) => [it.id, it]));
  const lists = loadLists(String(testById("tuning-v1").params.dataThrough));
  const history = await FileDataSource.load("data/reference-lists-all.jsonl", index);
  const cache = new Map<RefList, Counts>();
  const countsOf = (l: RefList) => cache.get(l) ?? cache.set(l, toCounts(index, l.main)).get(l)!;
  const land = (k: string) => isLand(index, k);
  const colorsOf = (m: Counts) => {
    const n = new Map<string, number>();
    for (const [k, q] of m) if (!land(k)) for (const c of index.getCard(k)?.colors ?? []) n.set(c, (n.get(c) ?? 0) + q);
    return [...n].filter(([, q]) => q >= 4).map(([c]) => c).sort().join("");
  };
  const jobOf = (k: string) => {
    const c = index.getCard(k);
    return c ? (roles.job(c) ?? (/\bCreature\b/.test(c.typeLine) ? "creature" : "other")) : "other";
  };
  const aiDecks = Object.fromEntries(
    Object.entries(AI_RUNS).map(([label, files]) => [
      label,
      files.flatMap((f) =>
        (JSON.parse(readFileSync(`evals/results/round4/${f}`, "utf8")).results as { id: string; deck: { main: Line[] } | null }[])
          .filter((r) => r?.deck)
          .map((r) => [r.id, toCounts(index, r.deck!.main)] as [string, Counts]),
      ),
    ]),
  );

  const found = Object.fromEntries(RANKINGS.map((r) => [r, NS.map(() => 0)])) as Record<Ranking, number[]>;
  const aiFound: Record<string, number[]> = {};
  const pools: number[] = [];
  let targets = 0;
  let wrongColors = 0;
  const perDeck: string[] = [];

  for (const id of testById("holdout-v1").items) {
    const it = items.get(id)!;
    const t = it.target!;
    const before = it.before ?? t.firstSeen;
    const cut = Date.parse(before);
    const recent = lists.filter((l) => l.format === t.format && Date.parse(l.date) < cut && Date.parse(l.date) >= cut - 90 * DAY);
    const rate = new Map<string, number>();
    for (const l of recent) for (const k of countsOf(l).keys()) rate.set(k, (rate.get(k) ?? 0) + 1 / recent.length);
    const asked = new Set((it.keyCards ?? []).map((n) => [...toCounts(index, [{ qty: 1, name: n }]).keys()][0]));
    const requested = (it.keyCards ?? []).map((n) => index.getCard(n)).filter((c) => !!c);
    const settled = settledLists(index, lists, t, 30, 90);
    const colorCount = new Map<string, number>();
    for (const s of settled) colorCount.set(colorsOf(s), (colorCount.get(colorsOf(s)) ?? 0) + 1);
    const settledColors = [...colorCount].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
    const requestedColors = [...new Set(requested.flatMap((c) => c!.colors))].sort().join("");
    const coplayCount = new Map<string, number>();
    for (const l of lists)
      if (l.format === t.format && Date.parse(l.date) < cut && [...asked].some((a) => countsOf(l).has(a))) coplayCount.set(colorsOf(countsOf(l)), (coplayCount.get(colorsOf(countsOf(l))) ?? 0) + 1);
    const coplayColors = [...coplayCount].sort((a, b) => b[1] - a[1])[0]?.[0] ?? requestedColors;
    const colors = colorRule === "settled" ? settledColors : colorRule === "requested" ? requestedColors : colorRule === "coplay" ? coplayColors : "WUBRG";
    if (colorRule !== "none" && colors !== settledColors) wrongColors++;
    const target = borrowedSpells(index, lists, it, countsOf);
    if (!target.size) continue;

    const castable = (k: string) => colorRule === "none" || (index.getCard(k)?.colors ?? []).every((c) => colors.includes(c));
    const pool = [...rate.keys()].filter((k) => !!index.getCard(k) && !land(k) && !asked.has(k) && rate.get(k)! < 0.1 && castable(k));
    pools.push(pool.length);
    const model = synergyModelFor(index, history.cut(before));
    const syn = new Map(pool.map((k) => [k, requested.length ? synergyScore(model, requested, index.getCard(k)!) : 0]));
    const coplay = new Map<string, number>();
    for (const l of lists) {
      if (Date.parse(l.date) >= cut) continue;
      const m = countsOf(l);
      if (![...asked].some((a) => m.has(a))) continue;
      for (const k of m.keys()) coplay.set(k, (coplay.get(k) ?? 0) + 1);
    }
    const byJob = new Map<string, string[]>();
    for (const k of [...pool].sort((a, b) => syn.get(b)! - syn.get(a)!)) byJob.set(jobOf(k), [...(byJob.get(jobOf(k)) ?? []), k]);
    const interleaved: string[] = [];
    for (let i = 0; interleaved.length < pool.length; i++) for (const ks of byJob.values()) if (ks[i]) interleaved.push(ks[i]);
    const ranked: Record<Ranking, string[]> = {
      "most-played first": [...pool].sort((a, b) => rate.get(b)! - rate.get(a)!),
      "v16 synergy score": [...pool].sort((a, b) => syn.get(b)! - syn.get(a)!),
      "played with the requested cards": [...pool].sort((a, b) => (coplay.get(b) ?? 0) - (coplay.get(a) ?? 0)),
      "top per job (synergy)": interleaved,
    };

    targets += target.size;
    for (const r of RANKINGS) NS.forEach((n, i) => (found[r][i] += ranked[r].slice(0, n).filter((k) => target.has(k)).length));
    for (const [label, decks] of Object.entries(aiDecks))
      for (const [did, d] of decks) if (did === id) (aiFound[label] ??= []).push([...target].filter((k) => d.has(k)).length / target.size);
    const rankIn = (r: Ranking, k: string) => ranked[r].indexOf(k) + 1 || "-";
    perDeck.push(
      `${id.replace("holdout-", "")} (pool ${pool.length}, colors ${colors || "C"}): ` +
        [...target].map((k) => `${index.getCard(k)?.name ?? k} [played ${Math.round((rate.get(k) ?? 0) * 1000) / 10}%; ranks ${RANKINGS.map((r) => rankIn(r, k)).join(" / ")}]`).join("; "),
    );
  }

  pools.sort((a, b) => a - b);
  console.log(`colors: ${colorRule}; differ from the settled deck's on ${wrongColors} of ${pools.length} decks`);
  console.log(`target spells: ${targets} over ${pools.length} dev decks; candidates per deck: median ${pools[Math.floor(pools.length / 2)]} (${pools[0]}-${pools[pools.length - 1]})`);
  for (const r of RANKINGS) console.log(`${r.padEnd(34)} ${NS.map((n, i) => `top ${n}: ${Math.round((found[r][i] / targets) * 100)}%`).join(" | ")}`);
  for (const [label, xs] of Object.entries(aiFound)) console.log(`${label}: a deck already contains ${Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100)}% of its target spells`);
  console.log(`\nper deck: target spells [play rate; ranks by ${RANKINGS.join(" / ")}]`);
  for (const line of perDeck) console.log(line);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
