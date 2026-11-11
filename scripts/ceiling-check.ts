/**
 * What is the best possible score on this test, and what does the prompt hide? (2026-11-11). Free.
 *
 *   pnpm exec tsx scripts/ceiling-check.ts [--decks]
 *
 * Owner: "I think we are either testing incorrectly or missing something. There is a theoretical max that
 * I dont think we have hit yet." A deck's score is its mean overlap with the settled lists, so it is the
 * sum, over the card copies it plays, of the share of settled lists that play that copy ("copy 3 of Shock
 * is in 62% of the lists"). That makes three things computable:
 *
 * 1. A ladder of scores, each from more knowledge than the last: the model alone, the brewer, the best
 *    old list picked with hindsight, that list with the requested cards put in (cuts chosen with
 *    hindsight), the inventors' first-week lists, a settled list against the other settled lists, and
 *    the best 60 cards possible (the copies most settled lists play), with and without cards that did
 *    not exist or were not legal on the deck's date.
 * 2. Where the points are, by how many settled lists agree on a copy: core (80%+), common (50-80%),
 *    flex (20-50%), fringe (under 20%). Nobody can count on the fringe.
 * 3. What the prompt hides. The prompt names up to 3 signature cards (scripts/find-new-archetypes.ts: in
 *    80% of the deck's first 10 lists, in 5% or less of the format before). Decks often have more such
 *    cards than 3. The unnamed ones are counted here, with how many of them the brewer finds, and an
 *    estimate of the brewer's score had the prompt named them all (it plays 4 of a named card; the cards
 *    they would push out are valued at what its other spells earn).
 *
 * 4. Whether the unnamed signature cards were findable: new cards from the same set as a named card,
 *    cards shown by played_with for a named card (lists of any format in the 400 days before that run it;
 *    the 25 nonland cards most often beside it), or cards in the brew's closest earlier list.
 *
 * Dev (v22 and v0, 3 runs) and the future test (v13, 2 runs). Standard cards not legal on the deck's date
 * earn a brew nothing, as in holdout-v2.
 */
import { readFileSync } from "node:fs";
import { FORMATS } from "../src/cards/formats";
import { loadCardIndex } from "../src/cards/load";
import { FileDataSource } from "../src/data/source";
import { isBasicLand } from "../src/harness/lands";
import { latestRuns } from "../evals/register";
import { brewDeps } from "../evals/round4/deps";
import { isLand, round4Items, toCounts, type Line } from "../evals/round4/items";
import { legalOnDateView, loadLists, type Counts, type RefList } from "../evals/score";
import { sameItems, testById } from "../evals/tests";

const DAY = 86_400_000;
const perDeck = process.argv.includes("--decks");
const BANDS = ["core (80%+ of lists)", "common (50-80%)", "flex (20-50%)", "fringe (under 20%)"] as const;
const CLASSES = [
  "Cards the prompt names",
  "Unnamed signature cards",
  "Format staples (10%+ of lists before)",
  "Played some (2-10%)",
  "Played a little (under 2%)",
  "Other spells nobody was playing",
  "Basic lands",
  "Nonbasic lands",
] as const;
type Shares = Map<string, number[]>;

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
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
  const one = (x: number) => x.toFixed(1);
  const keyOf = (name: string) => [...toCounts(index, [{ qty: 1, name }]).keys()][0];
  const total = (m: Counts) => [...m.values()].reduce((a, b) => a + b, 0);
  const sharesOf = (ls: Counts[]): Shares => {
    const m: Shares = new Map();
    for (const k of new Set(ls.flatMap((l) => [...l.keys()]))) {
      const qs = ls.map((l) => l.get(k) ?? 0);
      m.set(k, Array.from({ length: Math.max(...qs) }, (_, i) => qs.filter((q) => q > i).length / ls.length));
    }
    return m;
  };
  /** A deck's score against the lists behind `shares`: the shares of the copies it plays, out of 60. */
  const scoreOf = (d: Counts, shares: Shares, keep: (k: string, share: number) => boolean = () => true) => {
    let s = 0;
    for (const [k, q] of d) for (let i = 0; i < q; i++) if (keep(k, shares.get(k)?.[i] ?? 0)) s += shares.get(k)?.[i] ?? 0;
    return (s / 60) * 100;
  };
  const bestSixty = (shares: Shares, allowed: (k: string) => boolean = () => true) =>
    ([...shares].flatMap(([k, xs]) => (allowed(k) ? xs : [])).sort((a, b) => b - a).slice(0, 60).reduce((a, b) => a + b, 0) / 60) * 100;
  const devKeys = new Set(testById("holdout-v2").items.map((id) => `${items.get(id)!.target!.format}|${items.get(id)!.target!.strategy}`));

  for (const [label, harnesses, testId, from, to, onlyUnseen] of [
    ["dev (holdout-v2)", ["v22", "v0"], "holdout-v2", 30, 90, false],
    ["future test (future-v2), all 14 decks", ["v13", "v0"], "future-v2", 7, 365, false],
    ["future test, the 6 that are not dev archetypes", ["v13", "v0"], "future-v2", 7, 365, true],
  ] as const) {
    const ids = testById(testId).items.filter((id) => !onlyUnseen || !devKeys.has(`${items.get(id)!.target!.format}|${items.get(id)!.target!.strategy}`));
    const buildsOf = (harness: string) => {
      const out = new Map<string, Counts[]>();
      const recs = latestRuns().finished.filter((r) => r.model === "claude-opus-5-5" && r.harness === harness && (r.tests.includes(testId) || r.tests.some((x) => sameItems(x, testId))));
      for (const rec of recs)
        for (const r of JSON.parse(readFileSync(rec.file, "utf8")).results as ({ id: string; deck: { main: Line[] } | null } | null)[])
          if (r?.deck && ids.includes(r.id)) out.set(r.id, [...(out.get(r.id) ?? []), toCounts(index, r.deck.main)]);
      return out;
    };
    const [brews, alone] = [buildsOf(harnesses[0]), buildsOf(harnesses[1])];

    const ladder: Record<string, number[]> = {};
    const push = (name: string, x: number) => (ladder[name] = [...(ladder[name] ?? []), x]);
    const bandPts = Object.fromEntries(BANDS.map((b) => [b, { real: [] as number[], brewer: [] as number[], inventors: [] as number[] }]));
    const classPts = Object.fromEntries(CLASSES.map((c) => [c, { real: [] as number[], brewer: [] as number[], inventors: [] as number[] }]));
    const hidden: { id: string; names: string[]; copies: number; found: number; named: number; est: number; now: number; inventors: number | null }[] = [];
    const wasted: number[] = [];
    const wastedInv: number[] = [];
    const findable = { copies: 0, sameSet: 0, otherNew: 0, beside: 0, closest: 0, none: 0 };
    const besideShown: number[] = [];
    const perBuild: { id: string; found: number; score: number; rest: number }[] = [];

    for (const id of ids) {
      const it = items.get(id)!;
      const t = it.target!;
      const date = it.before ?? t.firstSeen;
      const cut = Date.parse(date);
      const first = Date.parse(t.firstSeen);
      const pool = depsOf(it).index;
      const view = (d: Counts) => legalView(d, t.format, date);
      const inFileOrder = lists.filter((l) => l.format === t.format && l.strategy === t.strategy);
      const ofDeck = [...inFileOrder].sort((a, b) => a.date.localeCompare(b.date));
      // The test's own settled lists, sampled exactly as evals/score.ts settledLists samples them (in file order).
      const window = inFileOrder.filter((l) => Date.parse(l.date) >= first + from * DAY && Date.parse(l.date) < first + to * DAY);
      const step = Math.max(1, Math.floor(window.length / 50));
      const settled = window.filter((_, i) => i % step === 0).slice(0, 50).map(countsOf);
      if (!settled.length || !brews.has(id)) continue;
      const shares = sharesOf(settled);
      const firstWeek = ofDeck.filter((l) => Date.parse(l.date) >= first && Date.parse(l.date) < first + 7 * DAY).map(countsOf);
      const earlier = lists.filter((l) => l.format === t.format && Date.parse(l.date) < cut);
      const asked = new Set((it.keyCards ?? []).map(keyOf));
      const available = (k: string) => ["legal", "restricted"].includes(pool.getCard(k)?.legal[t.format] ?? "");
      const brewerScore = mean(brews.get(id)!.map((d) => scoreOf(view(d), shares)));

      // 1. The ladder.
      if (alone.has(id)) push("The model alone (v0)", mean(alone.get(id)!.map((d) => scoreOf(view(d), shares))));
      push(`The brewer (${harnesses[0]})`, brewerScore);
      if (process.env.ROUNDED) push("  (the brewer, each build rounded to a whole percent, as the scoreboard does)", mean(brews.get(id)!.map((d) => Math.round(scoreOf(view(d), shares)))));
      const ranked = earlier.map((l) => ({ l, s: scoreOf(view(countsOf(l)), shares) })).sort((a, b) => b.s - a.s);
      push("The best old list, picked with hindsight", ranked[0]?.s ?? 0);
      const withRequested = (l: RefList) => {
        const d = new Map(view(countsOf(l)));
        for (const r of asked) if (available(r)) d.set(r, Math.max(d.get(r) ?? 0, 4));
        const copies = [...d].flatMap(([k, q]) => (asked.has(k) ? [] : Array.from({ length: q }, (_, i) => ({ k, s: shares.get(k)?.[i] ?? 0 })))).sort((a, b) => a.s - b.s);
        for (const c of copies.slice(0, Math.max(0, total(d) - 60))) d.set(c.k, d.get(c.k)! - 1);
        return scoreOf(d, shares);
      };
      push("That list with the requested cards put in (cuts with hindsight)", ranked.slice(0, 300).reduce((b, x) => Math.max(b, withRequested(x.l)), 0));
      if (firstWeek.length) push("The inventors (first-week real lists)", mean(firstWeek.map((d) => scoreOf(d, shares))));
      if (settled.length > 2) push("A settled list against the other settled lists", mean(settled.map((d, j) => scoreOf(d, sharesOf(settled.filter((_, i) => i !== j))))));
      push("The best 60 possible from cards legal on the date", bestSixty(shares, available));
      push("The best 60 possible (hindsight, any card)", bestSixty(shares));

      // 2. Points by how many settled lists agree on a copy.
      const bandOf = (s: number) => (s >= 0.8 ? BANDS[0] : s >= 0.5 ? BANDS[1] : s >= 0.2 ? BANDS[2] : BANDS[3]);
      for (const b of BANDS) {
        bandPts[b].real.push(([...shares.values()].flat().filter((s) => bandOf(s) === b).reduce((a, x) => a + x, 0) / 60) * 100);
        bandPts[b].brewer.push(mean(brews.get(id)!.map((d) => scoreOf(view(d), shares, (_, s) => s > 0 && bandOf(s) === b))));
        if (firstWeek.length) bandPts[b].inventors.push(mean(firstWeek.map((d) => scoreOf(d, shares, (_, s) => s > 0 && bandOf(s) === b))));
      }
      // Copies of the brew that no settled list plays.
      wasted.push(mean(brews.get(id)!.map((d) => [...view(d)].reduce((n, [k, q]) => n + Math.max(0, q - (shares.get(k)?.length ?? 0)), 0))));
      if (firstWeek.length) wastedInv.push(mean(firstWeek.map((d) => [...d].reduce((n, [k, q]) => n + Math.max(0, q - (shares.get(k)?.length ?? 0)), 0))));

      // 3. What the prompt hides: signature cards beyond the ones it names (the test's own rule).
      const firstTen = ofDeck.slice(0, 10).map(countsOf);
      const inFirst = (k: string) => firstTen.filter((l) => l.has(k)).length / firstTen.length;
      const before = lists.filter((l) => l.format === t.format && Date.parse(l.date) < first).map(countsOf);
      const prior = new Map<string, number>();
      for (const l of before) for (const k of l.keys()) prior.set(k, (prior.get(k) ?? 0) + 1 / before.length);
      const recent = earlier.filter((l) => Date.parse(l.date) >= cut - 90 * DAY).map(countsOf);
      const rate = new Map<string, number>();
      for (const l of recent) for (const k of l.keys()) rate.set(k, (rate.get(k) ?? 0) + 1 / recent.length);
      const signature = new Set([...new Set(firstTen.flatMap((l) => [...l.keys()]))].filter((k) => !land(k) && !asked.has(k) && inFirst(k) >= 0.8 && (prior.get(k) ?? 0) <= 0.05 && pool.getCard(k)));
      const classOf = (k: string): (typeof CLASSES)[number] =>
        land(k)
          ? isBasicLand(index.getCard(k))
            ? "Basic lands"
            : "Nonbasic lands"
          : asked.has(k)
            ? CLASSES[0]
            : signature.has(k)
              ? CLASSES[1]
              : (rate.get(k) ?? 0) >= 0.1
                ? CLASSES[2]
                : (rate.get(k) ?? 0) >= 0.02
                  ? CLASSES[3]
                  : (rate.get(k) ?? 0) > 0
                    ? CLASSES[4]
                    : CLASSES[5];
      for (const c of CLASSES) {
        classPts[c].real.push(([...shares].filter(([k]) => classOf(k) === c).flatMap(([, xs]) => xs).reduce((a, x) => a + x, 0) / 60) * 100);
        classPts[c].brewer.push(mean(brews.get(id)!.map((d) => scoreOf(view(d), shares, (k) => classOf(k) === c))));
        if (firstWeek.length) classPts[c].inventors.push(mean(firstWeek.map((d) => scoreOf(d, shares, (k) => classOf(k) === c))));
      }
      // Per build: the hidden-card points it found, its score, and its score on everything else.
      for (const raw of brews.get(id)!) {
        const found = scoreOf(view(raw), shares, (k) => signature.has(k));
        const score = scoreOf(view(raw), shares);
        perBuild.push({ id, found, score, rest: score - found });
      }
      // Had the prompt named them: 4 copies of each, pushing out copies worth what the brew's other spells earn.
      const est = mean(
        brews.get(id)!.map((raw) => {
          const d = view(raw);
          const others = [...d].filter(([k]) => !land(k) && !asked.has(k) && !signature.has(k));
          const otherCopies = others.reduce((n, [, q]) => n + q, 0);
          const otherValue = others.reduce((n, [k, q]) => n + Array.from({ length: q }, (_, i) => shares.get(k)?.[i] ?? 0).reduce((a, x) => a + x, 0), 0) / Math.max(1, otherCopies);
          let gain = 0;
          for (const k of signature) for (let i = d.get(k) ?? 0; i < 4; i++) gain += (shares.get(k)?.[i] ?? 0) - otherValue;
          return (gain / 60) * 100;
        }),
      );
      // 4. Were the unnamed signature cards findable? (copies in the real deck, counted once, first match wins)
      const data = depsOf(it).data;
      const wide = FORMATS.filter((f) => f.hasData).flatMap((f) => data.recentLists(f.key, { days: 400 }).map((l) => toCounts(index, l.main)));
      const shown = new Set<string>();
      for (const query of [...[...asked].map((k) => [k]), ...(asked.size > 1 ? [[...asked]] : [])]) {
        const hits = wide.filter((l) => query.every((k) => l.has(k)));
        if (!hits.length) continue;
        const n = new Map<string, number>();
        for (const l of hits) for (const k of l.keys()) if (!land(k) && !query.includes(k)) n.set(k, (n.get(k) ?? 0) + 1);
        for (const [k] of [...n].sort((a, b) => b[1] - a[1]).slice(0, 25)) shown.add(k);
      }
      besideShown.push(shown.size);
      const askedReleases = new Set([...asked].map((k) => index.getCard(k)?.released ?? "?"));
      const fresh = (k: string) => (index.getCard(k)?.released ?? "0000") >= new Date(cut - 90 * DAY).toISOString().slice(0, 10);
      const inClosest = (k: string) =>
        mean(
          brews.get(id)!.map((raw) => {
            const d = view(raw);
            let best: Counts = new Map();
            let most = -1;
            for (const l of earlier) {
              const o = [...d].reduce((x, [c, q]) => x + Math.min(q, countsOf(l).get(c) ?? 0), 0);
              if (o > most) [most, best] = [o, countsOf(l)];
            }
            return best.has(k) ? 1 : 0;
          }),
        );
      for (const k of signature) {
        const copies = (shares.get(k) ?? []).reduce((a, x) => a + x, 0);
        findable.copies += copies;
        if (fresh(k) && askedReleases.has(index.getCard(k)?.released ?? "")) findable.sameSet += copies;
        else if (shown.has(k)) findable.beside += copies;
        else if (inClosest(k) >= 0.5) findable.closest += copies;
        else if (fresh(k)) findable.otherNew += copies;
        else findable.none += copies;
      }
      hidden.push({
        id,
        names: [...signature].map((k) => index.getCard(k)?.name ?? k),
        copies: [...signature].reduce((n, k) => n + (shares.get(k) ?? []).reduce((a, x) => a + x, 0), 0),
        found: mean(brews.get(id)!.map((d) => (scoreOf(view(d), shares, (k) => signature.has(k)) / 100) * 60)),
        named: asked.size,
        est,
        now: brewerScore,
        inventors: firstWeek.length ? mean(firstWeek.map((d) => scoreOf(d, shares))) : null,
      });
    }

    console.log(`\n==================== ${label}: ${hidden.length} decks ====================`);
    console.log("1. The ladder (match %, per deck; unrounded):");
    for (const [name, xs] of Object.entries(ladder)) console.log(`   ${name.padEnd(64)} ${one(mean(xs)).padStart(5)}${xs.length < hidden.length ? `  (${xs.length} decks)` : ""}`);
    console.log("\n2. Points by how many settled lists agree on a copy (real deck has / the brewer gets / inventors get):");
    for (const b of BANDS) console.log(`   ${b.padEnd(24)} ${one(mean(bandPts[b].real)).padStart(5)} / ${one(mean(bandPts[b].brewer)).padStart(5)} / ${one(mean(bandPts[b].inventors)).padStart(5)}`);
    console.log(`   copies in a brew that no settled list plays: ${one(mean(wasted))} of 60 (inventors: ${one(mean(wastedInv))})`);
    console.log("\n3. Points by kind of card (real deck has / the brewer gets / inventors get):");
    for (const c of CLASSES) console.log(`   ${c.padEnd(40)} ${one(mean(classPts[c].real)).padStart(5)} / ${one(mean(classPts[c].brewer)).padStart(5)} / ${one(mean(classPts[c].inventors)).padStart(5)}`);
    const withHidden = hidden.filter((h) => h.names.length);
    console.log(`\n   Decks with signature cards the prompt doesn't name: ${withHidden.length} of ${hidden.length}; ${one(mean(hidden.map((h) => h.names.length)))} such cards a deck, ${one(mean(hidden.map((h) => h.copies)))} copies in the real deck; the brewer finds ${one(mean(hidden.map((h) => h.found)))} of those copies.`);
    console.log(`   Had the prompt named them all (estimate): the brewer ${one(mean(hidden.map((h) => h.now)))} -> ${one(mean(hidden.map((h) => h.now + h.est)))}`);
    const share = (x: number) => `${Math.round((x / Math.max(1e-9, findable.copies)) * 100)}%`;
    console.log(`\n4. The unnamed signature cards' copies, by where the brewer could have met them (first match wins):`);
    console.log(`   a new card from the same set as a named card ${share(findable.sameSet)} | shown by played_with for a named card (top 25 beside it; ${one(mean(besideShown))} cards shown a deck) ${share(findable.beside)} | in the brew's closest earlier list ${share(findable.closest)} | another new card ${share(findable.otherNew)} | none of these ${share(findable.none)}`);
    // Does the hidden part explain each deck's gap to its inventors?
    const pts = hidden.filter((h) => h.inventors !== null).map((h) => ({ x: ((h.copies - h.found) / 60) * 100, y: h.inventors! - h.now }));
    const [mx, my] = [mean(pts.map((p) => p.x)), mean(pts.map((p) => p.y))];
    const cov = mean(pts.map((p) => (p.x - mx) * (p.y - my)));
    const [vx, vy] = [mean(pts.map((p) => (p.x - mx) ** 2)), mean(pts.map((p) => (p.y - my) ** 2))];
    const few = pts.filter((p) => p.x < 8);
    const many = pts.filter((p) => p.x >= 8);
    console.log(`   Per deck, gap to the inventors against unnamed signature points the brewer misses: correlation ${(cov / Math.sqrt(vx * vy)).toFixed(2)} (${pts.length} decks). Decks missing under 8 such points (${few.length}): gap ${one(mean(few.map((p) => p.y)))}; decks missing 8 or more (${many.length}): gap ${one(mean(many.map((p) => p.y)))}.`);
    // Within a deck: do builds that find more of the hidden cards also do better on the rest of the deck?
    const byDeck = new Map<string, typeof perBuild>();
    for (const b of perBuild) byDeck.set(b.id, [...(byDeck.get(b.id) ?? []), b]);
    let [sxx, sxy, sxr] = [0, 0, 0];
    for (const bs of byDeck.values()) {
      const [mf, ms, mr] = [mean(bs.map((b) => b.found)), mean(bs.map((b) => b.score)), mean(bs.map((b) => b.rest))];
      for (const b of bs) {
        sxx += (b.found - mf) ** 2;
        sxy += (b.found - mf) * (b.score - ms);
        sxr += (b.found - mf) * (b.rest - mr);
      }
    }
    console.log(`   Within a deck, across its builds: each point of unnamed signature cards a build finds goes with ${sxx ? (sxy / sxx).toFixed(2) : "-"} points of score, ${sxx ? (sxr / sxx).toFixed(2) : "-"} of them on the rest of the deck (${perBuild.length} builds).`);
    if (perDeck) for (const h of hidden) console.log(`     ${h.id.replace(/^(holdout|future)-/, "").padEnd(30)} now ${one(h.now).padStart(5)} est ${one(h.now + h.est).padStart(5)} inventors ${(h.inventors === null ? "-" : one(h.inventors)).padStart(5)} | unnamed signature: ${h.names.length} cards, ${one(h.copies)} copies, found ${one(h.found)} | ${h.names.join(", ").slice(0, 150)}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
