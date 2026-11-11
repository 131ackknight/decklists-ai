/**
 * The score without lands (2026-11-11). Free.
 *
 *   pnpm exec tsx scripts/no-lands-check.ts [--decks] [--models]
 *
 * Owner: "Maybe we can find the score with lands removed, I guess? Or something that is at least showing
 * the progress with those excluded somehow?" Three views of every saved build's score (evals/score.ts
 * PARTS; the rule is in BUILD_LOG.md, written before this ran):
 *
 *   whole deck                     the match %, before rounding
 *   without lands                  lands taken out of the build and out of each settled list; cards shared
 *                                  over the average size of the two piles
 *   without lands or hidden cards  the same, with the signature cards the prompt doesn't name taken out too
 *
 * For each: every saved version (the model alone, v0, first), the inventors' first-week lists, a settled
 * list against the other settled lists, and the best possible pile with hindsight; each deck counted once.
 * Then Added on each view (a build's score minus its closest earlier list's score; the closest list picked
 * on the whole deck, as the protocol's Added does, and again picked on the spells alone), each version's
 * gain over the base, over the model alone and over v2 (the first harness with real lists), paired by deck
 * with a 95% range, the gap to the inventors split into lands, hidden cards and the other spells, and how
 * much a deck's score moves between runs of one version. Dev (holdout-v2), the future test (future-v2), and
 * the future test's 6 decks that are not dev archetypes. --models adds the versions run on cheaper models.
 */
import { readFileSync } from "node:fs";
import { loadCardIndex } from "../src/cards/load";
import { FileDataSource } from "../src/data/source";
import { PROTOCOL, onProtocolData, pairedGain } from "../evals/protocol";
import { latestRuns, type RunRecord } from "../evals/register";
import { brewDeps } from "../evals/round4/deps";
import { isLand, round4Items, toCounts, type Line } from "../evals/round4/items";
import { PARTS, addedScore, earlierLists, legalOnDateView, loadLists, overlap, partScores, type Counts, type RefList } from "../evals/score";
import { sameItems, testById } from "../evals/tests";

const perDeck = process.argv.includes("--decks");
const allModels = process.argv.includes("--models");
const REFERENCE = "v0";

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
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
  const one = (x: number) => x.toFixed(1);
  const signed = (x: number) => `${x >= 0 ? "+" : ""}${one(x)}`;
  const three = (xs: number[]) => xs.map((x) => one(x).padStart(6)).join(" ");
  const modelName = (m: string) => m.replace("claude-", "").replace(/-(\d)-(\d)$/, " $1.$2");
  const versionNo = (h: string) => Number(h.replace(/\D/g, "") || 0);
  const lands = new Map<string, boolean>();
  const spellsOf = (d: Counts) => new Map([...d].filter(([k]) => !(lands.get(k) ?? lands.set(k, isLand(index, k)).get(k)!)));
  const spellCache = new Map<Counts, Counts>();
  const cachedSpells = (l: Counts) => spellCache.get(l) ?? spellCache.set(l, spellsOf(l)).get(l)!;
  const devKeys = new Set(testById("holdout-v2").items.map((id) => `${items.get(id)!.target!.format}|${items.get(id)!.target!.strategy}`));

  for (const [testId, from, to, base] of [
    ["holdout-v2", 30, 90, PROTOCOL.base],
    ["future-v2", 7, 365, "v13"],
  ] as const) {
    // Per deck: the scorers, the lists a build could have seen, and the reference rows.
    const ctx = new Map(
      testById(testId).items.flatMap((id) => {
        const it = items.get(id)!;
        const t = it.target!;
        const date = it.before ?? t.firstSeen;
        const pool = depsOf(it).index;
        const p = partScores(index, lists, it, countsOf, (k) => !!pool.getCard(k), from, to);
        if (!p.settled.length) return [];
        const view = (d: Counts) => legalView(d, t.format, date);
        const earlier = earlierLists(lists, t.format, date, countsOf);
        /**
         * A deck's three scores, and Added on each: its score minus its closest earlier list's. `a`: the
         * closest list is the one sharing the most cards (the protocol's Added); `a2`: the one sharing the
         * most nonland cards.
         */
        const scoresOf = (built: Counts, viewed: boolean) => {
          const d = viewed ? view(built) : built;
          const s = p.of(d, built);
          const baseOf = (closest: Counts | null) => (closest ? p.of(viewed ? view(closest) : closest, closest) : [0, 0, 0]);
          const b = baseOf(addedScore(built, p.settled, earlier, viewed ? view : undefined).closest);
          const mine = spellsOf(d);
          let [most, bySpells] = [0, null as Counts | null];
          for (const l of earlier) {
            const o = overlap(mine, cachedSpells(l));
            if (o > most) [most, bySpells] = [o, l];
          }
          const b2 = baseOf(bySpells);
          return { s, a: s.map((x, i) => x - b[i]), a2: s.map((x, i) => x - b2[i]), sizes: p.sizes(built), shared: p.shared(d) };
        };
        const inventors = p.firstWeek.map((d) => scoresOf(d, false));
        return [[id, { ...p, scoresOf, inventors, peers: p.settled.length > 2 ? p.peers() : null, best: p.best(), unseen: !devKeys.has(`${t.format}|${t.strategy}`) }] as const];
      }),
    );

    // Every saved build of this test's decks, by version (harness and model), then by run.
    const runs = latestRuns().finished.filter((r) => r.harness && r.model && (allModels || r.model === PROTOCOL.model) && (r.tests.includes(testId) || r.tests.some((x) => sameItems(x, testId))));
    type Build = ReturnType<NonNullable<ReturnType<typeof ctx.get>>["scoresOf"]>;
    const built = new Map<RunRecord, Map<string, Build>>();
    for (const r of runs) {
      const m = new Map<string, Build>();
      for (const x of JSON.parse(readFileSync(r.file, "utf8")).results as ({ id: string; deck: { main: Line[] } | null } | null)[])
        if (x?.deck && ctx.has(x.id)) m.set(x.id, ctx.get(x.id)!.scoresOf(toCounts(index, x.deck.main), true));
      if (m.size) built.set(r, m);
    }
    const versions = [...new Set([...built.keys()].map((r) => `${r.harness}|${r.model}`))].sort((a, b) => versionNo(a) - versionNo(b) || a.localeCompare(b));
    const runsOf = (v: string, onlyProtocolData = false) => [...built.keys()].filter((r) => `${r.harness}|${r.model}` === v && (!onlyProtocolData || onProtocolData(r)));
    const nameOf = (v: string) => `${v.split("|")[0]}${v.endsWith(PROTOCOL.model) ? "" : `, ${modelName(v.split("|")[1])}`}`;

    for (const [label, ids] of [
      [testId === "holdout-v2" ? "dev (holdout-v2)" : "future test (future-v2), all decks", [...ctx.keys()]],
      ...(testId === "future-v2" ? ([["future test, the decks that are not dev archetypes", [...ctx.keys()].filter((id) => ctx.get(id)!.unseen)]] as const) : []),
    ] as const) {
      /** Per deck, the mean over a version's runs of one number of a build; then the mean over decks. */
      const perDeckOf = (rs: RunRecord[], f: (b: Build) => number) => ids.flatMap((id) => (rs.some((r) => built.get(r)!.has(id)) ? [mean(rs.flatMap((r) => (built.get(r)!.has(id) ? [f(built.get(r)!.get(id)!)] : [])))] : []));
      const withInv = ids.filter((id) => ctx.get(id)!.inventors.length);
      const withPeers = ids.filter((id) => ctx.get(id)!.peers);

      console.log(`\n==================== ${label}: ${ids.length} decks ====================`);
      console.log(`Columns: ${PARTS.join(" | ")}. Then Added on each (the score minus the closest earlier list's score), the closest list picked on the whole deck; then picked on the spells alone.`);
      console.log(`${"".padEnd(44)} runs decks |  score: whole  no-land  no-land/hidden | Added: whole  no-land  no-land/hidden | Added, closest by spells`);
      for (const v of versions) {
        const rs = runsOf(v);
        const n = perDeckOf(rs, () => 1).length;
        if (!n) continue;
        console.log(
          `${(v.startsWith(`${REFERENCE}|`) ? `The model alone (${nameOf(v)})` : nameOf(v)).padEnd(44)} ${String(rs.length).padStart(4)} ${String(n).padStart(5)} |        ${three(PARTS.map((_, i) => mean(perDeckOf(rs, (b) => b.s[i]))))}          |        ${three(PARTS.map((_, i) => mean(perDeckOf(rs, (b) => b.a[i]))))}          | ${three(PARTS.map((_, i) => mean(perDeckOf(rs, (b) => b.a2[i]))))}`,
        );
      }
      const inv = (f: (b: Build) => number) => mean(withInv.map((id) => mean(ctx.get(id)!.inventors.map(f))));
      console.log(`${"Inventors (first-week real lists)".padEnd(44)}      ${String(withInv.length).padStart(5)} |        ${three(PARTS.map((_, i) => inv((b) => b.s[i])))}          |        ${three(PARTS.map((_, i) => inv((b) => b.a[i])))}          | ${three(PARTS.map((_, i) => inv((b) => b.a2[i])))}`);
      console.log(`${"A settled list against the other settled".padEnd(44)}      ${String(withPeers.length).padStart(5)} |        ${three(PARTS.map((_, i) => mean(withPeers.map((id) => ctx.get(id)!.peers![i]))))}`);
      console.log(`${"The best possible pile (hindsight)".padEnd(44)}      ${String(ids.length).padStart(5)} |        ${three(PARTS.map((_, i) => mean(ids.map((id) => ctx.get(id)!.best[i]))))}`);

      // How big the piles are, so the scores can be read: a build with more spells than the real deck has more guesses.
      const settledSizes = PARTS.map((_, i) => mean(ids.map((id) => mean(ctx.get(id)!.settled.map((l) => ctx.get(id)!.sizes(l)[i])))));
      const baseKey = `${base}|${PROTOCOL.model}`;
      console.log(`\nCards in each pile: the settled lists ${three(settledSizes)} | ${base} ${three(PARTS.map((_, i) => mean(perDeckOf(runsOf(baseKey), (b) => b.sizes[i]))))} | inventors ${three(PARTS.map((_, i) => inv((b) => b.sizes[i])))}`);
      console.log(`Hidden cards (unnamed signature cards) a deck: ${one(mean(ids.map((id) => ctx.get(id)!.hidden.size)))}; decks with none: ${ids.filter((id) => !ctx.get(id)!.hidden.size).length} of ${ids.length}.`);

      // The gap to the inventors, in points of the whole-deck score, by pile: lands, hidden cards, the other spells.
      const refKeyOf = `${REFERENCE}|${PROTOCOL.model}`;
      const sharedOf = (rs: RunRecord[]) => PARTS.map((_, i) => mean(withInv.flatMap((id) => (rs.some((r) => built.get(r)!.has(id)) ? [mean(rs.flatMap((r) => (built.get(r)!.has(id) ? [built.get(r)!.get(id)!.shared[i]] : [])))] : []))));
      const sharedInv = PARTS.map((_, i) => mean(withInv.map((id) => mean(ctx.get(id)!.inventors.map((b) => b.shared[i])))));
      const split = (x: number[]) => [x[0] - x[1], x[1] - x[2], x[2]];
      const pts = (cards: number) => one((cards / 60) * 100).padStart(6);
      console.log(`\nCards shared with a settled list, as points of the whole-deck score (${withInv.length} decks with first-week lists): lands | hidden cards | the other spells`);
      for (const [name, x] of [[`The model alone (${REFERENCE})`, sharedOf(runsOf(refKeyOf))], [base, sharedOf(runsOf(baseKey))], ["Inventors", sharedInv]] as const) console.log(`  ${name.padEnd(24)} ${split(x).map(pts).join(" ")}   (sum ${pts(x[0])})`);
      console.log(`  ${`Inventors over ${base}`.padEnd(24)} ${split(sharedInv).map((v, i) => pts(v - split(sharedOf(runsOf(baseKey)))[i])).join(" ")}`);
      console.log(`  ${`${base} over ${REFERENCE}`.padEnd(24)} ${split(sharedOf(runsOf(baseKey))).map((v, i) => pts(v - split(sharedOf(runsOf(refKeyOf)))[i])).join(" ")}`);
      const realPiles = split(PARTS.map((_, i) => mean(withInv.map((id) => mean(ctx.get(id)!.settled.map((l) => ctx.get(id)!.sizes(l)[i]))))));
      console.log(`  ${"In the real deck".padEnd(24)} ${realPiles.map(pts).join(" ")}`);

      // Gains, paired by deck: over the base (runs on the protocol's data only, as PROGRESS.md 2b) and over the model alone (every run, as 2a).
      const gainRow = (cand: RunRecord[], ref: RunRecord[], f: (b: Build) => number) => {
        const maps = (rs: RunRecord[]) => rs.map((r) => new Map([...built.get(r)!].filter(([id]) => ids.includes(id)).map(([id, b]) => [id, f(b)] as const)));
        const g = pairedGain(maps(cand), maps(ref));
        return `${signed(g.gain)} (${signed(g.lo)} to ${signed(g.hi)}; width ${one(g.hi - g.lo)})`;
      };
      for (const [title, refKey, strict] of [
        [`Gain over the base (${base}), runs on the protocol's data`, baseKey, true],
        [`Gain over the model alone (${REFERENCE}), every run`, `${REFERENCE}|${PROTOCOL.model}`, false],
        [`Gain over v2 (the first harness with real lists), every run`, `v2|${PROTOCOL.model}`, false],
      ] as const) {
        const ref = runsOf(refKey, strict);
        if (!ref.length) continue;
        console.log(`\n${title}; 95% range, paired by deck:`);
        for (const v of versions) {
          const cand = runsOf(v, strict);
          if (v === refKey || v.startsWith(`${REFERENCE}|`) || !cand.length || !v.endsWith(PROTOCOL.model)) continue;
          console.log(`  ${nameOf(v).padEnd(8)} ${cand.length} run${cand.length > 1 ? "s" : " "}`);
          for (const [i, part] of PARTS.entries()) console.log(`     ${part.padEnd(30)} score ${gainRow(cand, ref, (b) => b.s[i]).padEnd(44)} Added ${gainRow(cand, ref, (b) => b.a[i]).padEnd(44)} Added, closest by spells ${gainRow(cand, ref, (b) => b.a2[i])}`);
        }
      }

      // How much a deck's score moves between runs of one version (SD, pooled over decks).
      const noise = (rs: RunRecord[], f: (b: Build) => number) => {
        const vars = ids.flatMap((id) => {
          const xs = rs.flatMap((r) => (built.get(r)!.has(id) ? [f(built.get(r)!.get(id)!)] : []));
          return xs.length > 1 ? [xs.reduce((a, x) => a + (x - mean(xs)) ** 2, 0) / (xs.length - 1)] : [];
        });
        return Math.sqrt(mean(vars));
      };
      console.log(`\nA deck's score between runs of one version (SD in points, pooled over decks):`);
      for (const v of versions.filter((v) => runsOf(v).length > 1 && v.endsWith(PROTOCOL.model))) {
        const rs = runsOf(v);
        console.log(`  ${nameOf(v).padEnd(8)} ${rs.length} runs | score ${three(PARTS.map((_, i) => noise(rs, (b) => b.s[i])))} | Added ${three(PARTS.map((_, i) => noise(rs, (b) => b.a[i])))} | Added, closest by spells ${three(PARTS.map((_, i) => noise(rs, (b) => b.a2[i])))}`);
      }

      if (perDeck) {
        console.log(`\nPer deck (${base}): score whole / no-land / no-land-or-hidden; the inventors the same; hidden cards.`);
        for (const id of ids) {
          const c = ctx.get(id)!;
          const rs = runsOf(baseKey).filter((r) => built.get(r)!.has(id));
          const mine = PARTS.map((_, i) => mean(rs.map((r) => built.get(r)!.get(id)!.s[i])));
          console.log(`  ${id.replace(/^(holdout|future)-/, "").padEnd(30)} ${three(mine)} | ${c.inventors.length ? three(PARTS.map((_, i) => mean(c.inventors.map((b) => b.s[i])))) : "     -      -      -"} | ${c.hidden.size} hidden: ${[...c.hidden].map((k) => index.getCard(k)?.name ?? k).join(", ").slice(0, 110)}`);
        }
      }
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
