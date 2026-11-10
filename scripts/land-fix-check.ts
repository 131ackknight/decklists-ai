/**
 * Can code fix the lands from real decks in the deck's own colors? (2026-11-10). Free: reads result files.
 *
 *   pnpm exec tsx scripts/land-fix-check.ts [--harness v22] [--show deck-id-part]
 *
 * Owner: "Colors and lands i think". On dev, the brewer plays about 3 basic lands too many and 4
 * nonbasic lands too few (scripts/point-breakdown.ts). For each saved build this takes the format's
 * lists from the 90 days before the deck's date that need the same colors of mana as the build (a plain
 * pip of the color on 4+ copies of nonland cards; at least 5 such lists, else the build is left alone), and tries fixes set before
 * looking at any score:
 *
 *   trim     basics above those lists' average basic count are swapped, one for one, for the nonbasic
 *            land copies most of those lists play and the build lacks (a copy counts if at least a
 *            quarter of the lists play it).
 *   trim50   the same, but a copy counts only if at least half of the lists play it.
 *   replace  every land is replaced by those lists' most-voted land copies, keeping the land count.
 *   cycle-trim, cycle-replace   the same two fixes, with the lands learned by cycle from every recent
 *            list with the same number of colors (src/harness/lands.ts), not from same-color lists.
 *   cycle-trim-fixers   cycle-trim, swapping in only lands that fix colors for this deck (any-color
 *            lands and lands making two or more of its colors); other lands are a deck's own business.
 *
 * A swapped-in land must be in the card pool and legal on the deck's date. Scored like any deck (dev,
 * holdout-v2): lands shared with the settled lists, match % and Added, paired by deck against the same
 * builds unchanged.
 */
import { readFileSync } from "node:fs";
import { loadCardIndex } from "../src/cards/load";
import { loadStandardWindows } from "../src/cards/standard";
import { FileDataSource } from "../src/data/source";
import { deckColors, usualLands, type UsualLands } from "../src/harness/lands";
import { latestRuns, type RunRecord } from "../evals/register";
import { isLand, round4Items, toCounts, type Line } from "../evals/round4/items";
import { PROTOCOL, pairedGain } from "../evals/protocol";
import { addedScore, earlierLists, legalOnDateView, loadLists, settledLists, type Counts, type RefList } from "../evals/score";
import { sameItems, testById } from "../evals/tests";

const DAY = 86_400_000;
const arg = (name: string) => (process.argv.includes(`--${name}`) ? process.argv[process.argv.indexOf(`--${name}`) + 1] : undefined);
const harness = arg("harness") ?? PROTOCOL.base;
const show = arg("show");

const index = loadCardIndex();
const items = new Map(round4Items(index).map((it) => [it.id, it]));
const lists = loadLists(String(testById("tuning-v1").params.dataThrough));
const cache = new Map<RefList, Counts>();
const countsOf = (l: RefList) => cache.get(l) ?? cache.set(l, toCounts(index, l.main)).get(l)!;
const ids = testById("holdout-v2").items;
const settled = new Map(ids.map((id) => [id, settledLists(index, lists, items.get(id)!.target!, 30, 90)] as const));
const legalView = legalOnDateView(index, lists, countsOf);
const dateOf = (id: string) => items.get(id)!.before ?? items.get(id)!.target!.firstSeen;
const viewOf = (id: string, d: Counts) => legalView(d, items.get(id)!.target!.format, dateOf(id));
const earlier = new Map(ids.map((id) => [id, earlierLists(lists, items.get(id)!.target!.format, dateOf(id), countsOf)] as const));
const land = (k: string) => isLand(index, k);
const basic = (k: string) => land(k) && /\bBasic\b/.test(index.getCard(k)?.typeLine ?? "");
const total = (m: Counts, keep: (k: string) => boolean = () => true) => [...m].reduce((a, [k, q]) => a + (keep(k) ? q : 0), 0);
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const one = (x: number) => x.toFixed(1);
const signed = (x: number) => `${x >= 0 ? "+" : ""}${one(x)}`;
/**
 * The colors of mana a deck's spells need: colors with a plain pip (not hybrid, not Phyrexian) on 4+
 * copies of nonland cards. A hybrid card in a one-color deck doesn't make it a two-color deck.
 */
const pipsOf = (k: string) => new Set([...(index.getCard(k)?.manaCost.split(" // ")[0] ?? "").matchAll(/\{([WUBRG])\}/g)].map((m) => m[1]));
/** Colors a real list both needs and makes: at least 3 of its lands make the color (any-color lands aside). */
const madeBy = (m: Counts) => {
  const n = new Map<string, number>();
  for (const [k, q] of m) {
    const made = land(k) ? (index.getCard(k)?.producedMana ?? []).filter((c) => "WUBRG".includes(c)) : [];
    if (made.length && made.length < 5) for (const c of made) n.set(c, (n.get(c) ?? 0) + q);
  }
  return n;
};
const listColors = (m: Counts) => {
  const made = madeBy(m);
  return colorsOf(m).split("").filter((c) => c === "C" || (made.get(c) ?? 0) >= 3).join("") || "C";
};
const colorsOf = (m: Counts) => {
  const n = new Map<string, number>();
  for (const [k, q] of m) if (!land(k)) for (const c of pipsOf(k)) n.set(c, (n.get(c) ?? 0) + q);
  return [...n].filter(([, q]) => q >= 4).map(([c]) => c).sort().join("") || "C";
};

async function main() {
  const history = await FileDataSource.load("data/reference-lists-all.jsonl", index);
  const windows = loadStandardWindows();
  const ctx = new Map(
    ids.map((id) => {
      const t = items.get(id)!.target!;
      const cut = Date.parse(dateOf(id));
      const recent = lists.filter((l) => l.format === t.format && Date.parse(l.date) < cut && Date.parse(l.date) >= cut - 90 * DAY).map(countsOf);
      const pool = index.asOf(dateOf(id), history.cardsPlayedThrough(dateOf(id)), windows);
      const ok = (k: string) => {
        const s = pool.getCard(k)?.legal[t.format];
        return s === "legal" || s === "restricted";
      };
      return [id, { recent, ok, pool, format: t.format }] as const;
    }),
  );

  /** What the format's recent lists in exactly these colors do with lands. */
  const usual = (id: string, colors: string) => {
    const same = ctx.get(id)!.recent.filter((l) => listColors(l) === colors);
    if (same.length < 5) return null;
    const slots: { k: string; i: number; share: number }[] = [];
    const cards = new Set(same.flatMap((l) => [...l.keys()].filter(land)));
    for (const k of cards) {
      if (!ctx.get(id)!.ok(k)) continue;
      const qs = same.map((l) => l.get(k) ?? 0);
      for (let i = 1; i <= Math.max(...qs); i++) slots.push({ k, i, share: qs.filter((q) => q >= i).length / same.length });
    }
    slots.sort((a, b) => b.share - a.share || a.k.localeCompare(b.k) || a.i - b.i);
    return { lists: same.length, basics: mean(same.map((l) => total(l, basic))), lands: mean(same.map((l) => total(l, land))), slots };
  };

  type Fix = (id: string, d: Counts) => Counts;
  const trim = (minShare: number): Fix => (id, d) => {
    const u = usual(id, colorsOf(d));
    if (!u) return d;
    const out = new Map(d);
    let excess = total(out, basic) - Math.round(u.basics);
    for (const s of u.slots) {
      if (excess <= 0) break;
      if (basic(s.k) || s.share < minShare || (out.get(s.k) ?? 0) >= s.i) continue;
      // Take the copy from the basic the deck has most of.
      const from = [...out].filter(([k]) => basic(k)).sort((a, b) => b[1] - a[1])[0];
      if (!from) break;
      if (from[1] === 1) out.delete(from[0]);
      else out.set(from[0], from[1] - 1);
      out.set(s.k, (out.get(s.k) ?? 0) + 1);
      excess--;
    }
    return out;
  };
  const replace: Fix = (id, d) => {
    const u = usual(id, colorsOf(d));
    if (!u) return d;
    const out = new Map([...d].filter(([k]) => !land(k)));
    for (const s of u.slots.slice(0, total(d, land))) out.set(s.k, (out.get(s.k) ?? 0) + 1);
    return out;
  };
  // By land cycle (src/harness/lands.ts): the vote is over every recent list with the same number of colors.
  const ranked = new Map<Counts, string[]>();
  const rankedOf = (l: Counts) => ranked.get(l) ?? ranked.set(l, deckColors(index, l, true)).get(l)!;
  const usualCache = new Map<string, UsualLands | null>();
  const cycleUsual = (id: string, d: Counts) => {
    const colors = deckColors(index, d);
    const key = `${id}|${colors.join("")}`;
    if (!usualCache.has(key)) {
      const c = ctx.get(id)!;
      const same = c.recent.filter((l) => rankedOf(l).length === colors.length).map((l) => ({ deck: l, colors: rankedOf(l) }));
      const legal = (card: { name: string }) => {
        const s = c.pool.getCard(card.name)?.legal[c.format];
        return s === "legal" || s === "restricted";
      };
      usualCache.set(key, usualLands(index, same, colors, legal));
    }
    return usualCache.get(key)!;
  };
  const keyOf = (name: string) => [...toCounts(index, [{ qty: 1, name }]).keys()][0];
  /** A land that fixes colors for this deck: it makes any color, or two or more of the deck's own. */
  const fixer = (role: string) => role === "any" || role.split("+").filter((r) => r !== "x").length >= 2;
  const cycleTrim = (minShare: number, fixersOnly = false): Fix => (id, d) => {
    const u = cycleUsual(id, d);
    if (!u) return d;
    const out = new Map(d);
    let excess = total(out, basic) - Math.round(u.avgBasics);
    for (const s of u.slots) {
      if (excess <= 0) break;
      const k = keyOf(s.name);
      if (s.basic || s.share < minShare || (out.get(k) ?? 0) >= s.copy || (fixersOnly && !fixer(s.role))) continue;
      const from = [...out].filter(([x]) => basic(x)).sort((a, b) => b[1] - a[1])[0];
      if (!from) break;
      if (from[1] === 1) out.delete(from[0]);
      else out.set(from[0], from[1] - 1);
      out.set(k, (out.get(k) ?? 0) + 1);
      excess--;
    }
    return out;
  };
  const cycleReplace: Fix = (id, d) => {
    const u = cycleUsual(id, d);
    if (!u) return d;
    const out = new Map([...d].filter(([k]) => !land(k)));
    for (const s of u.slots.slice(0, total(d, land))) out.set(keyOf(s.name), (out.get(keyOf(s.name)) ?? 0) + 1);
    return out;
  };
  const fixes: [string, Fix][] = [
    ["trim", trim(0.25)],
    ["trim50", trim(0.5)],
    ["replace", replace],
    ["cycle-trim", cycleTrim(0.25)],
    ["cycle-replace", cycleReplace],
    ["cycle-trim-fixers", cycleTrim(0.25, true)],
  ];

  const covers = (r: RunRecord, t: string) => r.tests.includes(t) || r.tests.some((x) => sameItems(x, t));
  const runs = latestRuns()
    .finished.filter((r) => r.model === PROTOCOL.model && r.harness === harness && covers(r, "holdout-v2"))
    .map((r) => new Map((JSON.parse(readFileSync(r.file, "utf8")).results as ({ id: string; deck: { main: Line[] } | null } | null)[]).flatMap((x) => (x?.deck ? [[x.id, toCounts(index, x.deck.main)] as const] : []))));
  const landsShared = (id: string, d: Counts) => mean(settled.get(id)!.map((l) => [...d].reduce((a, [k, q]) => a + (land(k) ? Math.min(q, l.get(k) ?? 0) : 0), 0)));
  const scoreOf = (id: string, d: Counts) => ({ ...addedScore(d, settled.get(id)!, earlier.get(id)!, (x) => viewOf(id, x)), lands: landsShared(id, viewOf(id, d)), basics: total(d, basic) });

  console.log(`${harness}: ${runs.length} runs on dev (holdout-v2, ${ids.length} decks). Each fix against the same builds unchanged, paired by deck (95% range).`);
  const before = runs.map((r) => new Map(ids.flatMap((id) => (r.has(id) ? [[id, scoreOf(id, r.get(id)!)] as const] : []))));
  const col = (xs: Map<string, { match: number; added: number; lands: number; basics: number }>[], f: "match" | "added" | "lands" | "basics") => xs.map((m) => new Map([...m].map(([id, s]) => [id, s[f]] as const)));
  const avg = (xs: Map<string, number>[]) => mean(xs.map((m) => mean([...m.values()])));
  console.log(`  unchanged: lands shared ${one(avg(col(before, "lands")))}, match ${one(avg(col(before, "match")))}, Added ${one(avg(col(before, "added")))}, basics ${one(avg(col(before, "basics")))}`);
  for (const [name, fix] of fixes) {
    let changed = 0;
    let swaps = 0;
    let n = 0;
    const after = runs.map(
      (r) =>
        new Map(
          ids.flatMap((id) => {
            if (!r.has(id)) return [];
            const d = r.get(id)!;
            const f = fix(id, d);
            const moved = [...f].reduce((a, [k, q]) => a + Math.max(0, q - (d.get(k) ?? 0)), 0);
            n++;
            if (moved) changed++;
            swaps += moved;
            return [[id, scoreOf(id, f)] as const];
          }),
        ),
    );
    const g = (f: "match" | "added" | "lands") => {
      const p = pairedGain(col(after, f), col(before, f));
      const two = (x: number) => `${x >= 0 ? "+" : ""}${x.toFixed(2)}`;
      return `${one(avg(col(after, f)))}, ${two(p.gain)} (${two(p.lo)} to ${two(p.hi)})`;
    };
    const better = ids.filter((id) => mean(after.flatMap((m) => (m.has(id) ? [m.get(id)!.lands] : []))) > mean(before.flatMap((m) => (m.has(id) ? [m.get(id)!.lands] : [])))).length;
    const worse = ids.filter((id) => mean(after.flatMap((m) => (m.has(id) ? [m.get(id)!.lands] : []))) < mean(before.flatMap((m) => (m.has(id) ? [m.get(id)!.lands] : [])))).length;
    if (arg("detail") === name)
      for (const id of ids) {
        const b = mean(before.flatMap((m) => (m.has(id) ? [m.get(id)!.lands] : [])));
        const a = mean(after.flatMap((m) => (m.has(id) ? [m.get(id)!.lands] : [])));
        const bb = mean(before.flatMap((m) => (m.has(id) ? [m.get(id)!.basics] : [])));
        const ab = mean(after.flatMap((m) => (m.has(id) ? [m.get(id)!.basics] : [])));
        console.log(`      ${id.replace("holdout-", "").padEnd(28)} lands shared ${one(b)} -> ${one(a)} (${signed(a - b)}); basics ${one(bb)} -> ${one(ab)}; real basics ${one(mean(settled.get(id)!.map((l) => total(l, basic))))}`);
      }
    console.log(`  ${name}: changed ${changed} of ${n} builds, ${one(swaps / Math.max(1, changed))} land copies each; basics ${one(avg(col(after, "basics")))}`);
    console.log(`      lands shared ${g("lands")}; match ${g("match")}; Added ${g("added")}; better on ${better} decks, worse on ${worse}`);
  }

  if (show) {
    for (const id of ids.filter((x) => x.includes(show))) {
      const d = runs[0].get(id)!;
      const u = usual(id, colorsOf(d));
      console.log(`\n${id}: colors ${colorsOf(d)}; ${u ? `${u.lists} lists, ${one(u.lands)} lands, ${one(u.basics)} basic` : "fewer than 5 lists in these colors"}`);
      for (const s of u?.slots.slice(0, 12) ?? []) console.log(`   ${Math.round(s.share * 100)}%  copy ${s.i}  ${index.getCard(s.k)?.name ?? s.k}`);
      const cu = cycleUsual(id, d);
      console.log(`  by cycle: colors ${deckColors(index, d).join("")}; ${cu ? `${cu.lists} lists, ${one(cu.avgLands)} lands, ${one(cu.avgBasics)} basic` : "too few lists"}`);
      for (const s of cu?.slots.slice(0, 30) ?? []) console.log(`   ${Math.round(s.share * 100)}%  ${s.name} (copy ${s.copy})`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
