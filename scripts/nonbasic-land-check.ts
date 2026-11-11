/**
 * Which nonbasic lands does the brewer miss, and could it have known them? (2026-11-10). Free: reads result files.
 *
 *   pnpm exec tsx scripts/nonbasic-land-check.ts [--harness v22] [--test holdout-v2|future-v2] [--decks] [--lands]
 *
 * Owner: "What can we do about non basic lands then?" For each saved build and each of its deck's settled
 * lists: the nonbasic land copies the real list plays, the ones the build shares, and the ones it misses.
 * Each missed copy is sorted three ways:
 *   - by the build's colors: right (the colors most of the settled lists have) or wrong;
 *   - by what the land is to the real deck (src/harness/lands.ts): a color fixer (any color, or two or
 *     more of the deck's colors), a land of one of its colors, a colorless land, or an off-color land;
 *   - by whether data could have shown it, first match wins: not legal yet on the deck's date (Standard;
 *     nobody could have played it); in the build's closest earlier list (so the brewer cut it or passed
 *     it over); usual for these colors (a quarter or more of the format's lists with the real deck's
 *     colors in the 90 days before, when there are 5 or more); a format staple (a tenth or more of the
 *     format's lists); played a little (1% or more); a new card (first printed in those 90 days); or an
 *     old card nobody played.
 * Beside the brewer: the inventors (the deck's first-week real lists), scored the same way.
 */
import { readFileSync } from "node:fs";
import { loadCardIndex } from "../src/cards/load";
import { deckColors, isBasicLand, isFixerRole, landRole } from "../src/harness/lands";
import { latestRuns, type RunRecord } from "../evals/register";
import { isLand, round4Items, toCounts, type Line } from "../evals/round4/items";
import { PROTOCOL } from "../evals/protocol";
import { earlierLists, futureLists, legalOnDateView, loadLists, overlap, settledLists, type Counts, type RefList } from "../evals/score";
import { sameItems, testById } from "../evals/tests";

const DAY = 86_400_000;
const arg = (name: string) => (process.argv.includes(`--${name}`) ? process.argv[process.argv.indexOf(`--${name}`) + 1] : undefined);
const harness = arg("harness") ?? PROTOCOL.base;
const testId = arg("test") ?? "holdout-v2";
const perDeck = process.argv.includes("--decks");
const showLands = process.argv.includes("--lands");

const index = loadCardIndex();
const items = new Map(round4Items(index).map((it) => [it.id, it]));
const lists = loadLists(String(testById("tuning-v1").params.dataThrough));
const cache = new Map<RefList, Counts>();
const countsOf = (l: RefList) => cache.get(l) ?? cache.set(l, toCounts(index, l.main)).get(l)!;
const legalView = legalOnDateView(index, lists, countsOf);
const land = (k: string) => isLand(index, k);
const basic = (k: string) => isBasicLand(index.getCard(k));
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const one = (x: number) => x.toFixed(1);
const pct = (x: number) => `${Math.round(x * 100)}%`;
const ranked = new Map<Counts, string[]>();
const rankedOf = (l: Counts) => ranked.get(l) ?? ranked.set(l, deckColors(index, l, true)).get(l)!;
const setOf = (colors: string[]) => [...colors].sort().join("") || "C";

const ids = testById(testId).items;
const KINDS = ["color fixer", "one of its colors", "colorless", "off-color"] as const;
const KNOWN = ["not legal yet on the deck's date", "in the build's closest earlier list", "usual for these colors", "a format staple", "played a little", "a new card", "an old card nobody played"] as const;
type Tally = { missedBy: Map<string, { copies: number; known: string; kind: string }>; extraBy: Map<string, number>; n: number; realLands: number; realBasics: number; realNonbasic: number; lands: number; basics: number; nonbasic: number; sharedBasics: number; sharedNonbasic: number; extraBasics: number; extraNonbasic: number; kind: Record<string, number>; known: Record<string, number> };
const empty = (): Tally => ({ missedBy: new Map(), extraBy: new Map(), n: 0, realLands: 0, realBasics: 0, realNonbasic: 0, lands: 0, basics: 0, nonbasic: 0, sharedBasics: 0, sharedNonbasic: 0, extraBasics: 0, extraNonbasic: 0, kind: {}, known: {} });

/** Everything about one deck that doesn't depend on the build. */
const facts = new Map(
  ids.map((id) => {
    const it = items.get(id)!;
    const t = it.target!;
    const date = it.before ?? t.firstSeen;
    const cut = Date.parse(date);
    const settled = testId === "holdout-v2" ? settledLists(index, lists, t, 30, 90) : settledLists(index, lists, t, 7, 365);
    const votes = new Map<string, number>();
    for (const l of settled) votes.set(setOf(rankedOf(l)), (votes.get(setOf(rankedOf(l))) ?? 0) + 1);
    const colors = [...votes].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "C";
    const recent = lists.filter((l) => l.format === t.format && Date.parse(l.date) < cut && Date.parse(l.date) >= cut - 90 * DAY).map(countsOf);
    const same = recent.filter((l) => setOf(rankedOf(l)) === colors);
    const share = (ls: Counts[], k: string) => (ls.length ? ls.filter((l) => l.has(k)).length / ls.length : 0);
    const newSince = new Date(cut - 90 * DAY).toISOString().slice(0, 10);
    return [id, { t, date, newSince, settled, colors, same, recent, share, earlier: earlierLists(lists, t.format, date, countsOf), firstWeek: futureLists(index, lists, t).firstWeek }] as const;
  }),
);

/** One build against its deck's settled lists. */
function tally(id: string, raw: Counts): Tally & { right: boolean } {
  const f = facts.get(id)!;
  const build = legalView(raw, f.t.format, f.date);
  let closest: Counts = new Map();
  let best = -1;
  for (const l of f.earlier) {
    const o = overlap(build, l);
    if (o > best) [best, closest] = [o, l];
  }
  const out = empty();
  out.n = 1;
  for (const l of f.settled) {
    const w = 1 / f.settled.length;
    const colors = rankedOf(l);
    // Standard: a land the real list plays that wasn't legal yet on the deck's date (nobody could have played it).
    const legalNow = legalView(l, f.t.format, f.date);
    for (const [k, q] of l) {
      if (!land(k)) continue;
      const shared = Math.min(q, build.get(k) ?? 0);
      out.realLands += q * w;
      if (basic(k)) {
        out.realBasics += q * w;
        out.sharedBasics += shared * w;
        continue;
      }
      out.realNonbasic += q * w;
      out.sharedNonbasic += shared * w;
      const miss = q - shared;
      if (!miss) continue;
      const role = landRole(index.getCard(k)!, colors);
      const kind = isFixerRole(role) ? KINDS[0] : role === "none" ? KINDS[2] : role.includes("x") ? KINDS[3] : KINDS[1];
      out.kind[kind] = (out.kind[kind] ?? 0) + miss * w;
      const released = index.getCard(k)?.released ?? "0000";
      const known = !legalNow.has(k)
        ? KNOWN[0]
        : (closest.get(k) ?? 0) > (build.get(k) ?? 0)
          ? KNOWN[1]
          : f.same.length >= 5 && f.share(f.same, k) >= 0.25
            ? KNOWN[2]
            : f.share(f.recent, k) >= 0.1
              ? KNOWN[3]
              : f.share(f.recent, k) >= 0.01
                ? KNOWN[4]
                : released >= f.newSince
                  ? KNOWN[5]
                  : KNOWN[6];
      out.known[known] = (out.known[known] ?? 0) + miss * w;
      out.missedBy.set(k, { copies: (out.missedBy.get(k)?.copies ?? 0) + miss * w, known, kind });
    }
    for (const [k, q] of build) {
      if (!land(k)) continue;
      const extra = q - Math.min(q, l.get(k) ?? 0);
      if (basic(k)) out.extraBasics += extra * w;
      else out.extraNonbasic += extra * w;
      if (extra) out.extraBy.set(k, (out.extraBy.get(k) ?? 0) + extra * w);
    }
  }
  for (const [k, q] of build) {
    if (!land(k)) continue;
    out.lands += q;
    if (basic(k)) out.basics += q;
    else out.nonbasic += q;
  }
  return { ...out, right: setOf(deckColors(index, build)) === f.colors };
}

const add = (into: Tally, t: Tally, w = 1) => {
  for (const key of ["n", "realLands", "realBasics", "realNonbasic", "lands", "basics", "nonbasic", "sharedBasics", "sharedNonbasic", "extraBasics", "extraNonbasic"] as const) into[key] += t[key] * w;
  for (const k of Object.keys(t.kind)) into.kind[k] = (into.kind[k] ?? 0) + t.kind[k] * w;
  for (const k of Object.keys(t.known)) into.known[k] = (into.known[k] ?? 0) + t.known[k] * w;
};

function report(label: string, builds: (Tally & { right: boolean; id: string })[]) {
  const group = (name: string, xs: typeof builds) => {
    if (!xs.length) return;
    const t = empty();
    for (const b of xs) add(t, b);
    const per = (x: number) => x / t.n;
    const missing = per(t.realNonbasic - t.sharedNonbasic);
    console.log(`\n${label}, ${name}: ${xs.length} builds on ${new Set(xs.map((b) => b.id)).size} decks`);
    console.log(`  real decks: ${one(per(t.realLands))} lands = ${one(per(t.realBasics))} basic + ${one(per(t.realNonbasic))} nonbasic`);
    console.log(`  the build:  ${one(per(t.lands))} lands = ${one(per(t.basics))} basic + ${one(per(t.nonbasic))} nonbasic`);
    console.log(`  shared: ${one(per(t.sharedBasics))} basic (${pct(t.sharedBasics / Math.max(1e-9, t.realBasics))}) + ${one(per(t.sharedNonbasic))} nonbasic (${pct(t.sharedNonbasic / Math.max(1e-9, t.realNonbasic))})`);
    console.log(`  nonbasic copies missed: ${one(missing)}; the build plays instead ${one(per(t.extraBasics))} basics and ${one(per(t.extraNonbasic))} nonbasic lands the real deck doesn't`);
    console.log(`    by what the land is:   ${KINDS.map((k) => `${k} ${one(per(t.kind[k] ?? 0))}`).join(" | ")}`);
    console.log(`    by what data showed:   ${KNOWN.map((k) => `${k} ${one(per(t.known[k] ?? 0))}`).join(" | ")}`);
    const could = missing - per(t.known[KNOWN[0]] ?? 0);
    console.log(`    could have been played: ${one(could)} of the ${one(missing)} missed; nonbasic match without the not-yet-legal copies: ${pct(t.sharedNonbasic / Math.max(1e-9, t.realNonbasic - (t.known[KNOWN[0]] ?? 0)))}`);
  };
  group("all", builds);
  group("right colors", builds.filter((b) => b.right));
  group("wrong colors", builds.filter((b) => !b.right));
}

const covers = (r: RunRecord, t: string) => r.tests.includes(t) || r.tests.some((x) => sameItems(x, t));
const records = latestRuns().finished.filter((r) => r.model === PROTOCOL.model && r.harness === harness && covers(r, testId));
if (!records.length) throw new Error(`no ${harness} runs on ${testId}`);
const builds = records.flatMap((rec) =>
  (JSON.parse(readFileSync(rec.file, "utf8")).results as ({ id: string; deck: { main: Line[] } | null } | null)[]).flatMap((r) =>
    r?.deck && ids.includes(r.id) && facts.get(r.id)!.settled.length ? [{ ...tally(r.id, toCounts(index, r.deck.main)), id: r.id }] : [],
  ),
);
console.log(`${harness} on ${testId}: ${records.length} run(s). Per build, averaged over each deck's settled lists.`);
report(harness, builds);
report("Inventors (first-week real lists)", ids.flatMap((id) => (facts.get(id)!.settled.length ? facts.get(id)!.firstWeek.map((l) => ({ ...tally(id, l), id })) : [])));

if (perDeck) {
  console.log("\nPer deck (the brewer's builds):");
  for (const id of ids) {
    const xs = builds.filter((b) => b.id === id);
    if (!xs.length) continue;
    const m = (f: (b: (typeof xs)[number]) => number) => one(mean(xs.map(f)));
    console.log(
      `  ${id.replace(/^(holdout|future)-/, "").padEnd(30)} colors right ${xs.filter((b) => b.right).length}/${xs.length} | real nonbasic ${m((b) => b.realNonbasic)} | shared ${m((b) => b.sharedNonbasic)} | missed: fixers ${m((b) => b.kind[KINDS[0]] ?? 0)}, own color ${m((b) => b.kind[KINDS[1]] ?? 0)}, colorless ${m((b) => b.kind[KINDS[2]] ?? 0)} | not legal yet ${m((b) => b.known[KNOWN[0]] ?? 0)}, in closest list ${m((b) => b.known[KNOWN[1]] ?? 0)}, usual ${m((b) => b.known[KNOWN[2]] ?? 0)}, staple ${m((b) => b.known[KNOWN[3]] ?? 0)} | extra basics ${m((b) => b.extraBasics)}`,
    );
  }
}

if (showLands) {
  console.log("\nPer deck: the nonbasic lands missed (copies per build; what the land is; what data showed), and the lands played that the real deck doesn't.");
  for (const id of ids) {
    const xs = builds.filter((b) => b.id === id);
    if (!xs.length) continue;
    const f = facts.get(id)!;
    const missed = new Map<string, { copies: number; known: string; kind: string }>();
    const extra = new Map<string, number>();
    for (const b of xs) {
      for (const [k, v] of b.missedBy) missed.set(k, { ...v, copies: (missed.get(k)?.copies ?? 0) + v.copies / xs.length });
      for (const [k, v] of b.extraBy) extra.set(k, (extra.get(k) ?? 0) + v / xs.length);
    }
    const name = (k: string) => index.getCard(k)?.name ?? k;
    console.log(`\n  ${id.replace(/^(holdout|future)-/, "")} (${f.t.format}, real colors ${f.colors}, ${f.date}; colors right ${xs.filter((b) => b.right).length}/${xs.length}; ${f.same.length} recent lists in these colors)`);
    for (const [k, v] of [...missed].sort((a, b) => b[1].copies - a[1].copies).slice(0, 7))
      console.log(`    missed ${one(v.copies)}  ${name(k).padEnd(34)} ${v.kind.padEnd(18)} ${v.known}; in ${pct(f.share(f.same, k))} of these colors' lists, ${pct(f.share(f.recent, k))} of the format's`);
    console.log(`    plays instead: ${[...extra].sort((a, b) => b[1] - a[1]).slice(0, 7).map(([k, v]) => `${one(v)} ${name(k)}`).join(", ")}`);
  }
}
