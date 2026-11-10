/**
 * Where the missing points are, on dev (2026-11-10). Free: reads result files. Owner: "if we were to
 * deconstruct where the harness can improve, is it lands, spells, creatures, the removal, etc...".
 *
 *   pnpm exec tsx scripts/point-breakdown.ts [--harness v22,v0] [--json out.json]
 *
 * For each dev deck (holdout-v2: in Standard, cards not legal on the deck's date earn nothing) and each
 * settled list it is scored against, every card of the settled list is either matched by the deck or
 * missed. Missed copies / 60 = points lost, so the groups add up to 100 minus the match %. Each version
 * is averaged over its runs per deck, then over decks; the inventors' row is the deck's first-week real
 * lists, scored the same way.
 *
 * Groups, each card in exactly one:
 *   lands (basic, other); then for other cards the first job that fits, from Scryfall function tags
 *   (src/coach/coach.ts RoleReader): removal, counterspell, discard, card advantage, mana (ramp, mana
 *   creatures and rocks); then creatures with none of those jobs; then every other spell.
 * Also: by card type, by whether the prompt named the card, by how much the format played the card in
 * the 90 days before, by whether the deck has the settled lists' colors, and per deck.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { loadCardIndex } from "../src/cards/load";
import { loadStandardWindows } from "../src/cards/standard";
import { RoleReader } from "../src/coach/coach";
import { FileDataSource } from "../src/data/source";
import { latestRuns, type RunRecord } from "../evals/register";
import { isLand, round4Items, toCounts, type Line } from "../evals/round4/items";
import { PROTOCOL } from "../evals/protocol";
import { addedScore, earlierLists, legalOnDateView, loadLists, settledLists, type Counts, type RefList } from "../evals/score";
import { sameItems, testById } from "../evals/tests";

const DAY = 86_400_000;
const arg = (name: string) => (process.argv.includes(`--${name}`) ? process.argv[process.argv.indexOf(`--${name}`) + 1] : undefined);
const harnesses = (arg("harness") ?? `${PROTOCOL.base},v0`).split(",");

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
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const total = (m: Counts) => [...m.values()].reduce((a, b) => a + b, 0);
const one = (x: number) => x.toFixed(1);
const pct = (x: number) => `${Math.round(x * 100)}%`;
const table = (head: string[], rows: (string | number)[][]) => [`| ${head.join(" | ")} |`, `| ${head.map(() => "---").join(" | ")} |`, ...rows.map((r) => `| ${r.join(" | ")} |`)].join("\n");

// The groups.
const reader = new RoleReader(index);
const mana = new Set(["ramp", "mana-dork", "mana-rock"].flatMap((t) => [...index.tagWithDescendants(t)]));
const land = (k: string) => isLand(index, k);
const typeLine = (k: string) => index.getCard(k)?.typeLine.split(" // ")[0] ?? "";
const JOBS = ["Lands: basic", "Lands: other", "Removal", "Counterspells", "Discard", "Card advantage", "Mana (ramp)", "Other creatures", "Other spells"] as const;
const jobOf = (k: string): (typeof JOBS)[number] => {
  const c = index.getCard(k);
  if (land(k)) return /\bBasic\b/.test(typeLine(k)) ? "Lands: basic" : "Lands: other";
  const job = c ? reader.job(c) : null;
  if (job === "removal") return "Removal";
  if (job === "counterspell") return "Counterspells";
  if (job === "discard") return "Discard";
  if (job === "card advantage") return "Card advantage";
  if (c?.tags.some((t) => mana.has(t))) return "Mana (ramp)";
  return /\bCreature\b/.test(typeLine(k)) ? "Other creatures" : "Other spells";
};
const TYPES = ["Lands", "Creatures", "Instants and sorceries", "Other permanents"] as const;
const typeOf = (k: string): (typeof TYPES)[number] =>
  land(k) ? "Lands" : /\bCreature\b/.test(typeLine(k)) ? "Creatures" : /\b(Instant|Sorcery)\b/.test(typeLine(k)) ? "Instants and sorceries" : "Other permanents";
const asked = new Map(ids.map((id) => [id, new Set((items.get(id)!.keyCards ?? []).map((n) => [...toCounts(index, [{ qty: 1, name: n }]).keys()][0]))] as const));
const ASKED = ["Cards the prompt names", "Other spells and creatures", "Lands"] as const;
const askedOf = (id: string) => (k: string): (typeof ASKED)[number] => (land(k) ? "Lands" : asked.get(id)!.has(k) ? "Cards the prompt names" : "Other spells and creatures");

async function main() {
  // How much the format played each card in the 90 days before the deck's date, and what the AI could reach.
  const history = await FileDataSource.load("data/reference-lists-all.jsonl", index);
  const windows = loadStandardWindows();
  const ctx = new Map(
    ids.map((id) => {
      const it = items.get(id)!;
      const t = it.target!;
      const cut = Date.parse(dateOf(id));
      const recent = lists.filter((l) => l.format === t.format && Date.parse(l.date) < cut && Date.parse(l.date) >= cut - 90 * DAY);
      const rate = new Map<string, number>();
      for (const l of recent) for (const k of countsOf(l).keys()) rate.set(k, (rate.get(k) ?? 0) + 1 / recent.length);
      const pool = index.asOf(dateOf(id), history.cardsPlayedThrough(dateOf(id)), windows);
      const first = Date.parse(t.firstSeen);
      const firstWeek = lists.filter((l) => l.format === t.format && l.strategy === t.strategy && Date.parse(l.date) >= first && Date.parse(l.date) < first + 7 * DAY).map(countsOf);
      const earlier = earlierLists(lists, t.format, dateOf(id), countsOf);
      return [id, { rate, pool, firstWeek, earlier, recent, format: t.format }] as const;
    }),
  );
  const REACH = ["Not in the card pool then", "Not legal in the format (today's list, or Standard on the date)", "In 10%+ of the format's lists", "In 2-10%", "In under 2%", "In none of the format's lists"] as const;
  const reachOf = (id: string) => (k: string): (typeof REACH)[number] => {
    const c = ctx.get(id)!;
    const card = c.pool.getCard(k);
    if (!card) return REACH[0];
    const status = card.legal[c.format];
    if (status !== "legal" && status !== "restricted") return REACH[1];
    const r = c.rate.get(k) ?? 0;
    return r >= 0.1 ? REACH[2] : r >= 0.02 ? REACH[3] : r > 0 ? REACH[4] : REACH[5];
  };

  /** Colors on at least 4 nonland cards, copies counted (as PROGRESS.md section 2e). */
  const colorsOf = (m: Counts) => {
    const n = new Map<string, number>();
    for (const [k, q] of m) if (!land(k)) for (const c of index.getCard(k)?.colors ?? []) n.set(c, (n.get(c) ?? 0) + q);
    return [...n].filter(([, q]) => q >= 4).map(([c]) => c).sort().join("") || "C";
  };
  const realColors = new Map(
    ids.map((id) => {
      const n = new Map<string, number>();
      for (const l of settled.get(id)!) n.set(colorsOf(l), (n.get(colorsOf(l)) ?? 0) + 1);
      return [id, [...n].sort((a, b) => b[1] - a[1])[0][0]] as const;
    }),
  );

  type Tally = { real: number; ours: number; matched: number };
  /** One deck against its settled lists, split by `group`: copies in the settled list, in the deck, and shared. */
  function split<G extends string>(id: string, deck: Counts, groups: readonly G[], group: (k: string) => G): Record<G, Tally> {
    const out = Object.fromEntries(groups.map((g) => [g, { real: 0, ours: 0, matched: 0 }])) as Record<G, Tally>;
    const s = settled.get(id)!;
    for (const [k, q] of deck) out[group(k)].ours += q;
    for (const l of s)
      for (const [k, q] of l) {
        const t = out[group(k)];
        t.real += q / s.length;
        t.matched += Math.min(q, deck.get(k) ?? 0) / s.length;
      }
    return out;
  }
  const avgTally = <G extends string>(groups: readonly G[], xs: Record<G, Tally>[]) =>
    Object.fromEntries(groups.map((g) => [g, { real: mean(xs.map((x) => x[g].real)), ours: mean(xs.map((x) => x[g].ours)), matched: mean(xs.map((x) => x[g].matched)) }])) as Record<G, Tally>;

  // The decks: each version's runs on the protocol's model, and the inventors' first-week lists.
  const covers = (r: RunRecord, t: string) => r.tests.includes(t) || r.tests.some((x) => sameItems(x, t));
  const runs = latestRuns().finished.filter((r) => r.model === PROTOCOL.model && covers(r, "holdout-v2"));
  const decksOfRun = (r: RunRecord) =>
    new Map((JSON.parse(readFileSync(r.file, "utf8")).results as ({ id: string; deck: { main: Line[] } | null } | null)[]).flatMap((x) => (x?.deck ? [[x.id, viewOf(x.id, toCounts(index, x.deck.main))] as const] : [])));
  type Side = { label: string; runs: number; decks: Map<string, Counts[]> };
  const sides: Side[] = harnesses.map((h) => {
    const rs = runs.filter((r) => r.harness === h);
    const perRun = rs.map(decksOfRun);
    return { label: h, runs: rs.length, decks: new Map(ids.map((id) => [id, perRun.flatMap((m) => (m.has(id) ? [m.get(id)!] : []))] as const)) };
  });
  sides.push({ label: "Inventors (first-week real lists)", runs: 0, decks: new Map(ids.map((id) => [id, ctx.get(id)!.firstWeek] as const)) });

  /** Per deck, the average over that deck's builds; then the average over decks. */
  const tallyOf = <G extends string>(side: Side, groups: readonly G[], group: (id: string) => (k: string) => G, keep: (id: string) => boolean = () => true) =>
    avgTally(
      groups,
      ids.filter((id) => keep(id) && side.decks.get(id)!.length).map((id) => avgTally(groups, side.decks.get(id)!.map((d) => split(id, d, groups, group(id))))),
    );
  const matchOf = (side: Side, keep: (id: string) => boolean = () => true) => {
    const t = tallyOf(side, ["all"] as const, () => () => "all", keep).all;
    return (t.matched / 60) * 100;
  };

  const out: string[] = [];
  const json: Record<string, unknown> = {};
  const base = sides[0];
  const inventors = sides[sides.length - 1];
  out.push(`Dev (holdout-v2, ${ids.length} decks). ${sides.map((s) => `${s.label}: ${s.runs ? `${s.runs} runs, ` : ""}match ${one(matchOf(s))}`).join("; ")}.`, "");

  const section = <G extends string>(title: string, groups: readonly G[], group: (id: string) => (k: string) => G) => {
    const tallies = sides.map((s) => tallyOf(s, groups, group));
    const rows = groups.map((g) => {
      const real = tallies[0][g].real;
      return [
        g,
        one(real),
        ...tallies.flatMap((t, i) => [...(sides[i].runs ? [one(t[g].ours)] : []), `${one(t[g].matched)} (${real ? pct(t[g].matched / real) : "-"})`]),
        one(((real - tallies[0][g].matched) / 60) * 100),
        one(((tallies[tallies.length - 1][g].matched - tallies[0][g].matched) / 60) * 100),
      ];
    });
    const sum = (f: (t: Tally) => number, t: Record<G, Tally>) => groups.reduce((a, g) => a + f(t[g]), 0);
    rows.push([
      "**All**",
      one(sum((t) => t.real, tallies[0])),
      ...tallies.flatMap((t, i) => [...(sides[i].runs ? [one(sum((x) => x.ours, t))] : []), `${one(sum((x) => x.matched, t))}`]),
      one(((sum((t) => t.real, tallies[0]) - sum((t) => t.matched, tallies[0])) / 60) * 100),
      one(((sum((t) => t.matched, tallies[tallies.length - 1]) - sum((t) => t.matched, tallies[0])) / 60) * 100),
    ]);
    out.push(`### ${title}`, "");
    out.push(
      table(
        ["Group", "In the real deck", ...sides.flatMap((s) => [...(s.runs ? [`${s.label}: plays`] : []), `${s.label}: matched`]), `Points ${base.label} misses`, `Points the inventors get that ${base.label} doesn't`],
        rows,
      ),
      "",
    );
    json[title] = Object.fromEntries(sides.map((s, i) => [s.label, tallies[i]]));
  };
  section("By job", JOBS, () => jobOf);
  section("By card type", TYPES, () => typeOf);
  section("By whether the prompt names the card", ASKED, askedOf);
  section("By how much the format played the card in the 90 days before", REACH, reachOf);

  // Colors: decks with the settled lists' colors against the rest.
  const colorRows = sides.map((s) => {
    const flags = ids.flatMap((id) => s.decks.get(id)!.map((d) => ({ id, d, right: colorsOf(d) === realColors.get(id) })));
    const scoreOf = (xs: typeof flags, groups: readonly ["Lands", "Spells"]) => {
      const t = avgTally(groups, xs.map((x) => split(x.id, x.d, groups, (k) => (land(k) ? "Lands" : "Spells"))));
      return { match: ((t.Lands.matched + t.Spells.matched) / 60) * 100, lands: t.Lands.matched, spells: t.Spells.matched };
    };
    const [right, wrong] = [flags.filter((f) => f.right), flags.filter((f) => !f.right)].map((xs) => ({ n: xs.length, ...scoreOf(xs, ["Lands", "Spells"]) }));
    return { label: s.label, share: right.n / flags.length, right, wrong };
  });
  out.push("### Decks with the real deck's colors, and decks without", "");
  out.push(
    table(
      ["Version", "Right colors", "Match %, right colors", "Match %, wrong colors", "Lands matched: right / wrong", "Spells matched: right / wrong"],
      colorRows.map((r) => [r.label, pct(r.share), one(r.right.match), r.wrong.n ? one(r.wrong.match) : "-", `${one(r.right.lands)} / ${r.wrong.n ? one(r.wrong.lands) : "-"}`, `${one(r.right.spells)} / ${r.wrong.n ? one(r.wrong.spells) : "-"}`]),
    ),
    "",
  );
  json.colors = colorRows;

  // Missed copies: cards the deck doesn't play at all, against too few copies of a card it does play.
  const SHORT = ["Lands the deck doesn't play", "Lands: too few copies", "Spells the deck doesn't play", "Spells: too few copies"] as const;
  const shortRows = sides.map((s) => {
    const per = ids
      .filter((id) => s.decks.get(id)!.length)
      .map((id) => {
        const builds = s.decks.get(id)!.map((d) => {
          const t = Object.fromEntries(SHORT.map((g) => [g, 0])) as Record<(typeof SHORT)[number], number>;
          const st = settled.get(id)!;
          for (const l of st)
            for (const [k, q] of l) {
              const have = d.get(k) ?? 0;
              if (have >= q) continue;
              t[`${land(k) ? "Lands" : "Spells"}${have ? ": too few copies" : " the deck doesn't play"}` as (typeof SHORT)[number]] += (q - have) / st.length;
            }
          return t;
        });
        return Object.fromEntries(SHORT.map((g) => [g, mean(builds.map((b) => b[g]))])) as Record<(typeof SHORT)[number], number>;
      });
    return { label: s.label, ...(Object.fromEntries(SHORT.map((g) => [g, (mean(per.map((x) => x[g])) / 60) * 100])) as Record<(typeof SHORT)[number], number>) };
  });
  out.push("### Missing points: cards not played at all, and too few copies of a card that is played", "");
  out.push(table(["Version", ...SHORT], shortRows.map((r) => [r.label, ...SHORT.map((g) => one(r[g]))])), "");
  json.short = shortRows;

  // Colors: what the prompt's cards say, and which way the deck's colors are off.
  const set = (c: string) => new Set(c === "C" ? [] : c.split(""));
  const relation = (mine: string, real: string) => {
    const [a, b] = [set(mine), set(real)];
    const extra = [...a].filter((c) => !b.has(c)).length;
    const missing = [...b].filter((c) => !a.has(c)).length;
    return !extra && !missing ? "same" : extra && missing ? "different" : extra ? "too many" : "too few";
  };
  const namedColors = new Map(
    ids.map((id) => {
      const cs = new Set<string>();
      for (const k of asked.get(id)!) if (!land(k)) for (const c of index.getCard(k)?.colors ?? []) cs.add(c);
      return [id, [...cs].sort().join("") || "C"] as const;
    }),
  );
  const REL = ["same", "too few", "too many", "different"] as const;
  const relRow = (label: string, pairs: [string, string][]) => [label, ...REL.map((r) => pct(pairs.filter(([a, b]) => relation(a, b) === r).length / pairs.length))];
  out.push("### Colors against the real deck's", "");
  out.push(
    table(
      ["Colors of", ...REL.map((r) => (r === "same" ? "Same as the real deck" : r === "too few" ? "Misses a color" : r === "too many" ? "Has an extra color" : "Both"))],
      [
        relRow("The cards the prompt names", ids.map((id) => [namedColors.get(id)!, realColors.get(id)!])),
        ...sides.map((s) => relRow(s.label, ids.flatMap((id) => s.decks.get(id)!.map((d) => [colorsOf(d), realColors.get(id)!] as [string, string])))),
      ],
    ),
    "",
  );
  const vsNamed = (s: Side) => ids.flatMap((id) => s.decks.get(id)!.map((d) => ({ id, d, rel: relation(colorsOf(d), namedColors.get(id)!), right: colorsOf(d) === realColors.get(id) })));
  out.push(`${base.label}'s colors against the named cards' colors: ${REL.map((r) => `${r} ${pct(vsNamed(base).filter((x) => x.rel === r).length / vsNamed(base).length)} (right ${pct(vsNamed(base).filter((x) => x.rel === r && x.right).length / Math.max(1, vsNamed(base).filter((x) => x.rel === r).length))})`).join("; ")}.`, "");
  json.namedColors = Object.fromEntries(ids.map((id) => [id, { named: namedColors.get(id), real: realColors.get(id) }]));

  // Lands from data: the usual lands of the format's recent decks in a set of colors, against the settled lists.
  const landsOf = (m: Counts) => new Map([...m].filter(([k]) => land(k)));
  const usualLands = (id: string, colors: string): Counts | null => {
    const same = ctx.get(id)!.recent.map(countsOf).filter((l) => colorsOf(l) === colors);
    if (same.length < 5) return null;
    const slots: { k: string; share: number }[] = [];
    const byLand = new Map<string, number[]>();
    for (const l of same) for (const [k, q] of landsOf(l)) byLand.set(k, [...(byLand.get(k) ?? []), q]);
    for (const [k, qs] of byLand) for (let i = 1; i <= Math.max(...qs); i++) slots.push({ k, share: qs.filter((q) => q >= i).length / same.length });
    const n = Math.round(mean(same.map((l) => total(landsOf(l)))));
    const pick = new Map<string, number>();
    for (const s of slots.sort((a, b) => b.share - a.share).slice(0, n)) pick.set(s.k, (pick.get(s.k) ?? 0) + 1);
    return pick;
  };
  const landMatch = (id: string, lands: Counts) => mean(settled.get(id)!.map((l) => [...lands].reduce((a, [k, q]) => a + Math.min(q, l.get(k) ?? 0), 0)));
  const landRow = (label: string, colorsFor: (id: string) => string) => {
    const got = ids.flatMap((id) => {
      const u = usualLands(id, colorsFor(id));
      return u ? [{ id, usual: landMatch(id, u), own: mean(base.decks.get(id)!.map((d) => landMatch(id, landsOf(d)))) }] : [];
    });
    return [label, `${got.length} of ${ids.length}`, one(mean(got.map((g) => g.usual))), one(mean(got.map((g) => g.own))), `${got.filter((g) => g.usual > g.own).length} of ${got.length}`];
  };
  out.push("### Lands from data: the usual lands of the format's decks in a set of colors (90 days before)", "");
  out.push(
    table(
      ["Colors used", "Decks with 5+ such lists", "Usual lands: matched", `${base.label}'s own lands on those decks: matched`, "Decks where the usual lands do better"],
      [landRow("The real deck's colors (not known when brewing)", (id) => realColors.get(id)!), landRow("The named cards' colors", (id) => namedColors.get(id)!)],
    ),
    "",
  );

  // Lands only, by how much the format played them.
  const LAND_REACH = [...REACH.map((r) => `Lands: ${r[0].toLowerCase()}${r.slice(1)}`), "Spells"];
  section("Lands, by how much the format played them in the 90 days before", LAND_REACH, (id) => (k) => (land(k) ? `Lands: ${reachOf(id)(k)[0].toLowerCase()}${reachOf(id)(k).slice(1)}` : "Spells"));

  // The same deck built with the real deck's colors in some runs and not in others.
  const mixed = ids.flatMap((id) => {
    const ds = base.decks.get(id)!.map((d) => ({ right: colorsOf(d) === realColors.get(id), match: (split(id, d, ["all"] as const, () => "all").all.matched / 60) * 100 }));
    const [r, w] = [ds.filter((x) => x.right), ds.filter((x) => !x.right)];
    return r.length && w.length ? [{ id, right: mean(r.map((x) => x.match)), wrong: mean(w.map((x) => x.match)) }] : [];
  });
  out.push(
    `Decks ${base.label} built with the right colors in some runs and the wrong ones in others: ${mixed.length}. Match with the right colors ${one(mean(mixed.map((m) => m.right)))}, with the wrong ones ${one(mean(mixed.map((m) => m.wrong)))} (${mixed.map((m) => `${m.id.replace("holdout-", "")} ${one(m.right)} vs ${one(m.wrong)}`).join("; ")}).`,
    "",
  );
  json.mixedColors = mixed;

  // Per deck, for the first version.
  const perDeck = ids.map((id) => {
    const ds = base.decks.get(id)!;
    const t = avgTally(["Lands", "Spells"] as const, ds.map((d) => split(id, d, ["Lands", "Spells"] as const, (k) => (land(k) ? "Lands" : "Spells"))));
    const inv = inventors.decks.get(id)!;
    const invT = inv.length ? avgTally(["all"] as const, inv.map((d) => split(id, d, ["all"] as const, () => "all"))).all : null;
    const added = mean(ds.map((d) => addedScore(d, settled.get(id)!, ctx.get(id)!.earlier, (x) => viewOf(id, x)).added));
    const copy = mean(ds.map((d) => addedScore(d, settled.get(id)!, ctx.get(id)!.earlier, (x) => viewOf(id, x)).copy));
    return {
      id,
      match: ((t.Lands.matched + t.Spells.matched) / 60) * 100,
      lands: t.Lands.matched,
      realLands: t.Lands.real,
      spells: t.Spells.matched,
      realSpells: t.Spells.real,
      colors: `${ds.map(colorsOf).join("/")} (real ${realColors.get(id)})`,
      rightColors: ds.filter((d) => colorsOf(d) === realColors.get(id)).length,
      builds: ds.length,
      added,
      copy,
      inventors: invT ? (invT.matched / 60) * 100 : null,
      settledLists: settled.get(id)!.length,
    };
  });
  out.push(`### Per deck (${base.label})`, "");
  out.push(
    table(
      ["Deck", "Match %", "Inventors", "Added", "From one earlier list", "Lands matched", "Spells matched", "Colors by run (real)"],
      [...perDeck].sort((a, b) => a.match - b.match).map((d) => [d.id.replace("holdout-", ""), one(d.match), d.inventors === null ? "-" : one(d.inventors), one(d.added), pct(d.copy), `${one(d.lands)} of ${one(d.realLands)}`, `${one(d.spells)} of ${one(d.realSpells)}`, d.colors]),
    ),
    "",
  );
  json.perDeck = perDeck;

  console.log(out.join("\n"));
  if (arg("json")) writeFileSync(arg("json")!, JSON.stringify(json, null, 1));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
