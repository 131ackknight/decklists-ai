/**
 * Would a land lookup show the nonbasic lands the brewer misses? (2026-11-10). Free: reads result files.
 *
 *   pnpm exec tsx scripts/land-lookup-check.ts [--harness v22] [--test holdout-v2|future-v2] [--decks]
 *
 * Owner: "What can we do about non basic lands then?" For each saved build, the nonbasic land copies its
 * deck's settled lists play that it lacks (scripts/nonbasic-land-check.ts; copies not legal yet on the
 * deck's date left out), and four lists of lands the brewer could be shown, each built only from data
 * before the deck's date, on the card pool of that date:
 *
 *   beside     lands real decks play beside the requested cards: lists of ANY format in the 400 days
 *              before that run one of the requested cards (or all of them), 5 or more such lists, a land
 *              in a fifth or more of them. This is played_with, which today leaves lands out.
 *   closest    the lands of the build's closest earlier list (what the brewer built on).
 *   colors     lands in a quarter or more of the format's recent lists in the build's own colors
 *              (what v14's mana_base tool showed).
 *   staples    lands in a tenth or more of the format's recent lists.
 *
 * For each list: how many of the missed copies it holds (reach), how many lands it shows, and how many of
 * the lands it shows are right (in half or more of the settled lists). A list that reaches far but is
 * mostly wrong lands is the v20 problem again: the AI plays more of whatever it is shown.
 */
import { readFileSync } from "node:fs";
import { FORMATS } from "../src/cards/formats";
import { loadCardIndex } from "../src/cards/load";
import { FileDataSource } from "../src/data/source";
import { deckColors, isBasicLand } from "../src/harness/lands";
import { latestRuns, type RunRecord } from "../evals/register";
import { brewDeps } from "../evals/round4/deps";
import { isLand, round4Items, toCounts, type Line } from "../evals/round4/items";
import { PROTOCOL } from "../evals/protocol";
import { earlierLists, legalOnDateView, loadLists, overlap, settledLists, type Counts, type RefList } from "../evals/score";
import { sameItems, testById } from "../evals/tests";

const DAY = 86_400_000;
const arg = (name: string) => (process.argv.includes(`--${name}`) ? process.argv[process.argv.indexOf(`--${name}`) + 1] : undefined);
const harness = arg("harness") ?? PROTOCOL.base;
const testId = arg("test") ?? "holdout-v2";
const perDeck = process.argv.includes("--decks");
const SOURCES = ["beside", "closest", "colors", "staples"] as const;
type Source = (typeof SOURCES)[number];

async function main() {
  const index = loadCardIndex();
  const items = new Map(round4Items(index).map((it) => [it.id, it]));
  const lists = loadLists(String(testById("tuning-v1").params.dataThrough));
  const history = await FileDataSource.load("data/reference-lists-all.jsonl", index);
  const today = await FileDataSource.load("data/reference-lists.jsonl", index);
  const depsOf = brewDeps(index, history, today);
  const cache = new Map<RefList, Counts>();
  const countsOf = (l: RefList) => cache.get(l) ?? cache.set(l, toCounts(index, l.main)).get(l)!;
  const legalView = legalOnDateView(index, lists, countsOf);
  const land = (k: string) => isLand(index, k);
  const nonbasic = (k: string) => land(k) && !isBasicLand(index.getCard(k));
  const keyOf = (name: string) => [...toCounts(index, [{ qty: 1, name }]).keys()][0];
  const ranked = new Map<Counts, string>();
  const colorsOf = (l: Counts, made: boolean) => {
    if (!made) return [...deckColors(index, l)].sort().join("") || "C";
    return ranked.get(l) ?? ranked.set(l, [...deckColors(index, l, true)].sort().join("") || "C").get(l)!;
  };
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
  const one = (x: number) => x.toFixed(1);
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const ids = testById(testId).items;

  const facts = new Map(
    ids.map((id) => {
      const it = items.get(id)!;
      const t = it.target!;
      const date = it.before ?? t.firstSeen;
      const cut = Date.parse(date);
      const { index: pool, data } = depsOf(it);
      const legal = (k: string) => ["legal", "restricted"].includes(pool.getCard(k)?.legal[t.format] ?? "");
      const settled = (testId === "holdout-v2" ? settledLists(index, lists, t, 30, 90) : settledLists(index, lists, t, 7, 365)).map((l) => legalView(l, t.format, date));
      const recent = lists.filter((l) => l.format === t.format && Date.parse(l.date) < cut && Date.parse(l.date) >= cut - 90 * DAY).map(countsOf);
      const shareIn = (ls: Counts[]) => {
        const n = new Map<string, number>();
        for (const l of ls) for (const k of l.keys()) if (nonbasic(k)) n.set(k, (n.get(k) ?? 0) + 1 / ls.length);
        return n;
      };
      // beside: every format, 400 days, lists running one requested card, or all of them.
      const asked = (it.keyCards ?? []).map(keyOf);
      const wide = FORMATS.filter((f) => f.hasData).flatMap((f) => data.recentLists(f.key, { days: 400 }).map((l) => toCounts(index, l.main)));
      const beside = new Map<string, number>();
      for (const query of [...asked.map((k) => [k]), ...(asked.length > 1 ? [asked] : [])]) {
        const hits = wide.filter((l) => query.every((k) => l.has(k)));
        if (hits.length < 5) continue;
        for (const [k, s] of shareIn(hits)) if (s >= 0.2 && legal(k)) beside.set(k, Math.max(beside.get(k) ?? 0, s));
      }
      const staples = new Set([...shareIn(recent)].filter(([k, s]) => s >= 0.1 && legal(k)).map(([k]) => k));
      const right = new Set([...shareIn(settled)].filter(([, s]) => s >= 0.5).map(([k]) => k));
      return [id, { t, date, legal, settled, recent, shareIn, beside: new Set(beside.keys()), staples, right, earlier: earlierLists(lists, t.format, date, countsOf) }] as const;
    }),
  );

  type Row = { id: string; missed: number; reach: Record<Source | "any", number>; shown: Record<Source, number>; rightShown: Record<Source, number>; rightNew: Record<Source, number> };
  const covers = (r: RunRecord, t: string) => r.tests.includes(t) || r.tests.some((x) => sameItems(x, t));
  const records = latestRuns().finished.filter((r) => r.model === PROTOCOL.model && r.harness === harness && covers(r, testId));
  if (!records.length) throw new Error(`no ${harness} runs on ${testId}`);
  const rows: Row[] = [];
  for (const rec of records) {
    for (const r of JSON.parse(readFileSync(rec.file, "utf8")).results as ({ id: string; deck: { main: Line[] } | null } | null)[]) {
      if (!r?.deck || !ids.includes(r.id)) continue;
      const f = facts.get(r.id)!;
      if (!f.settled.length) continue;
      const build = legalView(toCounts(index, r.deck.main), f.t.format, f.date);
      let closest: Counts = new Map();
      let best = -1;
      for (const l of f.earlier) {
        const o = overlap(build, l);
        if (o > best) [best, closest] = [o, l];
      }
      const mine = colorsOf(build, false);
      const same = f.recent.filter((l) => colorsOf(l, true) === mine);
      const sets: Record<Source, Set<string>> = {
        beside: f.beside,
        closest: new Set([...closest.keys()].filter((k) => nonbasic(k) && f.legal(k))),
        colors: new Set(same.length >= 5 ? [...f.shareIn(same)].filter(([k, s]) => s >= 0.25 && f.legal(k)).map(([k]) => k) : []),
        staples: f.staples,
      };
      // Missed nonbasic copies, per land, averaged over the settled lists.
      const missed = new Map<string, number>();
      for (const l of f.settled) for (const [k, q] of l) if (nonbasic(k)) missed.set(k, (missed.get(k) ?? 0) + Math.max(0, q - (build.get(k) ?? 0)) / f.settled.length);
      const total = [...missed.values()].reduce((a, b) => a + b, 0);
      const reachOf = (has: (k: string) => boolean) => [...missed].reduce((a, [k, m]) => a + (has(k) ? m : 0), 0);
      const row: Row = { id: r.id, missed: total, reach: { beside: 0, closest: 0, colors: 0, staples: 0, any: reachOf((k) => SOURCES.some((s) => sets[s].has(k))) }, shown: { beside: 0, closest: 0, colors: 0, staples: 0 }, rightShown: { beside: 0, closest: 0, colors: 0, staples: 0 }, rightNew: { beside: 0, closest: 0, colors: 0, staples: 0 } };
      for (const s of SOURCES) {
        row.reach[s] = reachOf((k) => sets[s].has(k));
        row.shown[s] = sets[s].size;
        row.rightShown[s] = [...sets[s]].filter((k) => f.right.has(k)).length;
        // Right lands the list shows that the build doesn't play at all: what the list could add.
        row.rightNew[s] = [...sets[s]].filter((k) => f.right.has(k) && !build.has(k)).length;
      }
      rows.push(row);
    }
  }

  const avg = (f: (r: Row) => number) => mean(ids.flatMap((id) => (rows.some((r) => r.id === id) ? [mean(rows.filter((r) => r.id === id).map(f))] : [])));
  const missed = avg((r) => r.missed);
  console.log(`${harness} on ${testId}: ${records.length} run(s), ${rows.length} builds. Nonbasic land copies missed per deck (legal on its date): ${one(missed)}.`);
  console.log(`\n${"List".padEnd(10)} missed copies it holds | lands shown | of them right | right lands shown that the build has none of`);
  for (const s of SOURCES) {
    const shown = avg((r) => r.shown[s]);
    console.log(`${s.padEnd(10)} ${one(avg((r) => r.reach[s]))} (${pct(avg((r) => r.reach[s]) / missed)})`.padEnd(34) + `| ${one(shown)}`.padEnd(14) + `| ${one(avg((r) => r.rightShown[s]))} (${pct(avg((r) => r.rightShown[s]) / Math.max(1e-9, shown))})`.padEnd(16) + `| ${one(avg((r) => r.rightNew[s]))}`);
  }
  console.log(`${"any of them".padEnd(10)} ${one(avg((r) => r.reach.any))} (${pct(avg((r) => r.reach.any) / missed)})`);
  if (perDeck) {
    console.log("\nPer deck: missed copies, and how many each list holds (lands shown / right)");
    for (const id of ids) {
      const xs = rows.filter((r) => r.id === id);
      if (!xs.length) continue;
      const m = (f: (r: Row) => number) => one(mean(xs.map(f)));
      console.log(`  ${id.replace(/^(holdout|future)-/, "").padEnd(30)} missed ${m((r) => r.missed).padStart(4)} | ${SOURCES.map((s) => `${s} ${m((r) => r.reach[s])} (${m((r) => r.shown[s])}/${m((r) => r.rightShown[s])})`).join(" | ")} | any ${m((r) => r.reach.any)}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
