/**
 * How good are the brewer's sideboards? Never measured before (2026-11-10). Free: reads result files.
 *
 *   pnpm exec tsx scripts/sideboard-check.ts [--harness v22] [--test holdout-v2|future-v2] [--decks]
 *
 * Owner: "Where are other high potential gaps we can fill?" Every score so far counts the main deck's 60
 * cards. Each saved build also has a sideboard. Here it is scored like the main deck: cards shared with
 * the sideboard of each of the deck's settled lists (the same lists the test uses), out of 15, as a
 * percent. In Standard, cards not legal on the deck's date earn nothing (as in holdout-v2).
 *
 * Beside the brewer's sideboard, on the same decks:
 *   inventors      the sideboards of the deck's first-week real lists;
 *   closest        the sideboard of the build's closest earlier list (most main deck cards shared);
 *   data           15 cards by vote: the sideboard copies most played by the format's lists of the 90
 *                  days before in the build's own colors (5 or more lists, else every list of the format),
 *                  keeping only cards in the card pool, legal on the date, castable in the build's colors
 *                  and within the copy limit with the main deck. No model call.
 * Gains over the brewer's own sideboard are paired by deck (95% range). Also reported: how many of the
 * 15 are cards the settled lists play in the main deck instead, and the other way round.
 */
import { readFileSync } from "node:fs";
import { loadCardIndex } from "../src/cards/load";
import { FileDataSource } from "../src/data/source";
import { deckColors, isBasicLand } from "../src/harness/lands";
import { latestRuns, type RunRecord } from "../evals/register";
import { brewDeps } from "../evals/round4/deps";
import { round4Items, toCounts, type Line } from "../evals/round4/items";
import { PROTOCOL, pairedGain } from "../evals/protocol";
import { legalOnDateView, loadLists, overlap, type Counts, type RefList } from "../evals/score";
import { sameItems, testById } from "../evals/tests";

const DAY = 86_400_000;
const WIDGET_ROW = /^Cards?\s*\(\d+%?\)\s*$/i;
const arg = (name: string) => (process.argv.includes(`--${name}`) ? process.argv[process.argv.indexOf(`--${name}`) + 1] : undefined);
const harness = arg("harness") ?? PROTOCOL.base;
const testId = arg("test") ?? "holdout-v2";
const perDeck = process.argv.includes("--decks");
type Listed = RefList & { side?: Line[] };

async function main() {
  const index = loadCardIndex();
  const items = new Map(round4Items(index).map((it) => [it.id, it]));
  const lists = loadLists(String(testById("tuning-v1").params.dataThrough)) as Listed[];
  const history = await FileDataSource.load("data/reference-lists-all.jsonl", index);
  const today = await FileDataSource.load("data/reference-lists.jsonl", index);
  const depsOf = brewDeps(index, history, today);
  const mains = new Map<Listed, Counts>();
  const mainOf = (l: Listed) => mains.get(l) ?? mains.set(l, toCounts(index, l.main)).get(l)!;
  const sides = new Map<Listed, Counts>();
  const sideOf = (l: Listed) => sides.get(l) ?? sides.set(l, toCounts(index, (l.side ?? []).filter((c) => !WIDGET_ROW.test(c.name)))).get(l)!;
  const legalView = legalOnDateView(index, lists, mainOf);
  const total = (m: Counts) => [...m.values()].reduce((a, b) => a + b, 0);
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
  const one = (x: number) => x.toFixed(1);
  const signed = (x: number) => `${x >= 0 ? "+" : ""}${one(x)}`;
  const colorCache = new Map<Counts, string>();
  const colorsOf = (l: Counts, made: boolean) => {
    if (!made) return [...deckColors(index, l)].sort().join("") || "C";
    return colorCache.get(l) ?? colorCache.set(l, [...deckColors(index, l, true)].sort().join("") || "C").get(l)!;
  };
  const pips = (k: string) => [...(index.getCard(k)?.manaCost.split(" // ")[0] ?? "").matchAll(/\{([WUBRG])\}/g)].map((m) => m[1]);
  const ids = testById(testId).items;
  const [from, to] = testId === "holdout-v2" ? [30, 90] : [7, 365];

  const facts = new Map(
    ids.map((id) => {
      const it = items.get(id)!;
      const t = it.target!;
      const date = it.before ?? t.firstSeen;
      const cut = Date.parse(date);
      const first = Date.parse(t.firstSeen);
      // The test's own settled lists (evals/score.ts settledLists), kept as lists so their sideboards can be read.
      const window = lists.filter((l) => l.format === t.format && l.strategy === t.strategy && Date.parse(l.date) >= first + from * DAY && Date.parse(l.date) < first + to * DAY);
      const step = Math.max(1, Math.floor(window.length / 50));
      const settled = window.filter((_, i) => i % step === 0).slice(0, 50).filter((l) => total(sideOf(l)) > 0);
      const firstWeek = lists.filter((l) => l.format === t.format && l.strategy === t.strategy && Date.parse(l.date) < first + 7 * DAY && total(sideOf(l)) > 0);
      const earlier = lists.filter((l) => l.format === t.format && Date.parse(l.date) < cut);
      const recent = earlier.filter((l) => Date.parse(l.date) >= cut - 90 * DAY);
      const pool = depsOf(it).index;
      const legal = (k: string) => ["legal", "restricted"].includes(pool.getCard(k)?.legal[t.format] ?? "");
      return [id, { t, date, settled, firstWeek, earlier, recent, legal }] as const;
    }),
  );

  /** A sideboard's match with the settled sideboards, out of 15, as a percent; and cards the settled lists play main instead. */
  const score = (id: string, side: Counts) => {
    const f = facts.get(id)!;
    const s = legalView(side, f.t.format, f.date);
    return {
      match: (mean(f.settled.map((l) => overlap(s, sideOf(l)))) / 15) * 100,
      inTheirMain: mean(f.settled.map((l) => [...s].reduce((n, [k, q]) => n + Math.min(Math.max(0, q - (sideOf(l).get(k) ?? 0)), mainOf(l).get(k) ?? 0), 0))),
    };
  };

  /** 15 sideboard cards by vote, for a build's main deck. */
  const dataSide = (id: string, build: Counts): Counts => {
    const f = facts.get(id)!;
    const mine = colorsOf(build, false);
    const same = f.recent.filter((l) => colorsOf(mainOf(l), true) === mine);
    const voters = same.length >= 5 ? same : f.recent;
    const slots: { k: string; i: number; share: number }[] = [];
    const seen = new Set(voters.flatMap((l) => [...sideOf(l).keys()]));
    for (const k of seen) {
      if (!f.legal(k) || !pips(k).every((c) => mine.includes(c))) continue;
      const qs = voters.map((l) => sideOf(l).get(k) ?? 0);
      const room = isBasicLand(index.getCard(k)) ? 15 : 4 - (build.get(k) ?? 0);
      for (let i = 1; i <= Math.min(room, Math.max(...qs)); i++) slots.push({ k, i, share: qs.filter((q) => q >= i).length / voters.length });
    }
    slots.sort((a, b) => b.share - a.share || a.k.localeCompare(b.k) || a.i - b.i);
    const out: Counts = new Map();
    for (const s of slots.slice(0, 15)) out.set(s.k, (out.get(s.k) ?? 0) + 1);
    return out;
  };

  const covers = (r: RunRecord, t: string) => r.tests.includes(t) || r.tests.some((x) => sameItems(x, t));
  const runNo = (f: string) => Number(f.match(/-r(\d+)(?:-partial)?\.json$/)?.[1] ?? 1);
  const records = latestRuns()
    .finished.filter((r) => r.model === PROTOCOL.model && r.harness === harness && covers(r, testId))
    .sort((a, b) => runNo(a.file) - runNo(b.file));
  if (!records.length) throw new Error(`no ${harness} runs on ${testId}`);

  type Row = { own: number; closest: number; data: number; size: number; inTheirMain: number; mainInTheirSide: number };
  const runs = records.map((rec) => {
    const out = new Map<string, Row>();
    for (const r of JSON.parse(readFileSync(rec.file, "utf8")).results as ({ id: string; deck: { main: Line[]; side?: Line[] } | null } | null)[]) {
      if (!r?.deck || !ids.includes(r.id)) continue;
      const f = facts.get(r.id)!;
      if (!f.settled.length) continue;
      const build = legalView(toCounts(index, r.deck.main), f.t.format, f.date);
      const side = toCounts(index, r.deck.side ?? []);
      let closest: Listed | null = null;
      let best = -1;
      for (const l of f.earlier) {
        const o = overlap(build, mainOf(l));
        if (o > best) [best, closest] = [o, l];
      }
      const own = score(r.id, side);
      out.set(r.id, {
        own: own.match,
        closest: closest ? score(r.id, sideOf(closest)).match : 0,
        data: score(r.id, dataSide(r.id, build)).match,
        size: total(side),
        inTheirMain: own.inTheirMain,
        // Main deck cards of the build that the settled lists keep in the sideboard instead.
        mainInTheirSide: mean(f.settled.map((l) => [...build].reduce((n, [k, q]) => n + Math.min(Math.max(0, q - (mainOf(l).get(k) ?? 0)), sideOf(l).get(k) ?? 0), 0))),
      });
    }
    return out;
  });

  const col = (f: (r: Row) => number) => runs.map((run) => new Map([...run].map(([id, row]) => [id, f(row)] as const)));
  const avg = (xs: Map<string, number>[]) => mean(xs.map((x) => mean([...x.values()])));
  const scored = ids.filter((id) => runs.some((run) => run.has(id)));
  const inventors = mean(scored.flatMap((id) => (facts.get(id)!.firstWeek.length ? [mean(facts.get(id)!.firstWeek.map((l) => score(id, sideOf(l)).match))] : [])));
  console.log(`${harness} on ${testId}: ${records.length} run(s), ${scored.length} decks with settled sideboards. Sideboard match: cards shared with each settled list's sideboard, out of 15.`);
  console.log(`  the brewer's sideboard:            ${one(avg(col((r) => r.own)))}%  (${one(avg(col((r) => r.size)))} cards; ${one(avg(col((r) => r.inTheirMain)))} of them the settled lists play in the main deck instead; ${one(avg(col((r) => r.mainInTheirSide)))} main deck cards they keep in the sideboard instead)`);
  console.log(`  inventors (first-week real lists): ${one(inventors)}%`);
  for (const [label, f] of [
    ["the closest earlier list's sideboard", (r: Row) => r.closest],
    ["a sideboard by vote, from data", (r: Row) => r.data],
  ] as const) {
    const g = pairedGain(col(f), col((r) => r.own));
    console.log(`  ${`${label}:`.padEnd(38)} ${one(avg(col(f)))}%  (over the brewer's: ${signed(g.gain)}, ${signed(g.lo)} to ${signed(g.hi)}; ${g.n} decks)`);
  }
  if (perDeck) {
    console.log("\nPer deck: the brewer's / closest list's / by vote / inventors");
    for (const id of scored) {
      const m = (f: (r: Row) => number) => one(mean(runs.flatMap((run) => (run.has(id) ? [f(run.get(id)!)] : []))));
      const fw = facts.get(id)!.firstWeek;
      console.log(`  ${id.replace(/^(holdout|future)-/, "").padEnd(30)} ${m((r) => r.own).padStart(5)} / ${m((r) => r.closest).padStart(5)} / ${m((r) => r.data).padStart(5)} / ${fw.length ? one(mean(fw.map((l) => score(id, sideOf(l)).match))).padStart(5) : "    -"}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
