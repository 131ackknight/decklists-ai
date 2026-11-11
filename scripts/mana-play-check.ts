/**
 * Does the brewer's mana work in play as well as the real decks' mana? (2026-11-10). Free: no model calls.
 *
 *   pnpm exec tsx scripts/mana-play-check.ts [--harness v22] [--test holdout-v2|future-v2] [--games 2000] [--decks]
 *
 * Owner: "Where are other high potential gaps we can fill?" The match % asks whether the brewer's cards
 * are the real deck's cards. This asks whether its mana does the job: the opening-turns simulator
 * (src/sim/goldfish.ts: land drops, colored mana, mulligans; no card abilities beyond making mana) plays
 * each saved build, and for the same deck up to 12 of its settled real lists and up to 8 of its
 * first-week lists (the inventors), a few thousand games each with the same seed.
 *
 * Reported per deck, averaged: mulligans, games stuck on two or fewer lands on turn 4, flooded games, and
 * the share of games in which every spell in hand that the deck has enough mana for can also be cast
 * with the colors it has, on turns 2, 3 and 4. Differences from the real lists are paired by deck (95% range).
 */
import { readFileSync } from "node:fs";
import { loadCardIndex } from "../src/cards/load";
import { goldfish } from "../src/sim/goldfish";
import { latestRuns, type RunRecord } from "../evals/register";
import { round4Items, type Line } from "../evals/round4/items";
import { PROTOCOL, pairedGain } from "../evals/protocol";
import { loadLists } from "../evals/score";
import { sameItems, testById } from "../evals/tests";

const DAY = 86_400_000;
const WIDGET_ROW = /^Cards?\s*\(\d+%?\)\s*$/i;
const arg = (name: string) => (process.argv.includes(`--${name}`) ? process.argv[process.argv.indexOf(`--${name}`) + 1] : undefined);
const harness = arg("harness") ?? PROTOCOL.base;
const testId = arg("test") ?? "holdout-v2";
const games = Number(arg("games") ?? 2000);
const perDeck = process.argv.includes("--decks");

const index = loadCardIndex();
const items = new Map(round4Items(index).map((it) => [it.id, it]));
const lists = loadLists(String(testById("tuning-v1").params.dataThrough));
const ids = testById(testId).items;
const [from, to] = testId === "holdout-v2" ? [30, 90] : [7, 365];
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const every = <T>(xs: T[], n: number) => xs.filter((_, i) => i % Math.max(1, Math.floor(xs.length / n)) === 0).slice(0, n);

const MEASURES = ["Mulligans %", "Stuck on 2 lands or fewer on turn 4 %", "Flooded %", "Colors work on turn 2 %", "Colors work on turn 3 %", "Colors work on turn 4 %"] as const;
type Stats = Record<(typeof MEASURES)[number], number>;
const play = (main: Line[]): Stats => {
  const r = goldfish(index, { main: main.filter((c) => !WIDGET_ROW.test(c.name)), games, seed: 7 });
  // The simulator reports its rates as percents already.
  return {
    "Mulligans %": r.mulliganRate,
    "Stuck on 2 lands or fewer on turn 4 %": r.screwRate,
    "Flooded %": r.floodRate,
    "Colors work on turn 2 %": r.colorOkByTurn[1],
    "Colors work on turn 3 %": r.colorOkByTurn[2],
    "Colors work on turn 4 %": r.colorOkByTurn[3],
  };
};
const average = (xs: Stats[]): Stats => Object.fromEntries(MEASURES.map((m) => [m, mean(xs.map((x) => x[m]))])) as Stats;

const covers = (r: RunRecord, t: string) => r.tests.includes(t) || r.tests.some((x) => sameItems(x, t));
const records = latestRuns().finished.filter((r) => r.model === PROTOCOL.model && r.harness === harness && covers(r, testId));
if (!records.length) throw new Error(`no ${harness} runs on ${testId}`);
const builds = new Map<string, Line[][]>();
for (const rec of records)
  for (const r of JSON.parse(readFileSync(rec.file, "utf8")).results as ({ id: string; deck: { main: Line[] } | null } | null)[])
    if (r?.deck && ids.includes(r.id)) builds.set(r.id, [...(builds.get(r.id) ?? []), r.deck.main]);

const rows = new Map<string, { brew: Stats; real: Stats; inventors: Stats | null }>();
for (const id of ids) {
  const t = items.get(id)!.target!;
  const first = Date.parse(t.firstSeen);
  const ofDeck = lists.filter((l) => l.format === t.format && l.strategy === t.strategy);
  const settled = every(ofDeck.filter((l) => Date.parse(l.date) >= first + from * DAY && Date.parse(l.date) < first + to * DAY), 12);
  const firstWeek = every(ofDeck.filter((l) => Date.parse(l.date) < first + 7 * DAY), 8);
  if (!settled.length || !builds.has(id)) continue;
  rows.set(id, { brew: average(builds.get(id)!.map(play)), real: average(settled.map((l) => play(l.main))), inventors: firstWeek.length ? average(firstWeek.map((l) => play(l.main))) : null });
}

const one = (x: number) => x.toFixed(1);
const signed = (x: number) => `${x >= 0 ? "+" : ""}${one(x)}`;
console.log(`${harness} on ${testId}: ${records.length} run(s), ${rows.size} decks, ${games} games a list. The brewer's builds against the same decks' settled real lists.`);
console.log(`\n${"Measure".padEnd(40)} real lists | inventors | the brewer | brewer minus real (95% range)`);
for (const m of MEASURES) {
  const col = (pick: (r: { brew: Stats; real: Stats }) => Stats) => [new Map([...rows].map(([id, r]) => [id, pick(r)[m]] as const))];
  const g = pairedGain(col((r) => r.brew), col((r) => r.real));
  const inv = mean([...rows.values()].flatMap((r) => (r.inventors ? [r.inventors[m]] : [])));
  console.log(`${m.padEnd(40)} ${one(mean([...rows.values()].map((r) => r.real[m]))).padStart(10)} | ${one(inv).padStart(9)} | ${one(mean([...rows.values()].map((r) => r.brew[m]))).padStart(10)} | ${signed(g.gain)} (${signed(g.lo)} to ${signed(g.hi)})`);
}
if (perDeck) {
  console.log("\nPer deck: colors work on turn 3 (real / brewer), mulligans (real / brewer), stuck (real / brewer)");
  for (const [id, r] of rows)
    console.log(
      `  ${id.replace(/^(holdout|future)-/, "").padEnd(30)} ${one(r.real["Colors work on turn 3 %"]).padStart(5)} / ${one(r.brew["Colors work on turn 3 %"]).padStart(5)} | ${one(r.real["Mulligans %"]).padStart(5)} / ${one(r.brew["Mulligans %"]).padStart(5)} | ${one(r.real["Stuck on 2 lands or fewer on turn 4 %"]).padStart(5)} / ${one(r.brew["Stuck on 2 lands or fewer on turn 4 %"]).padStart(5)}`,
    );
}
