/**
 * Free test of the feature-synergy model, before any brew uses it.
 *
 *   pnpm exec tsx scripts/synergy-eval.ts
 *
 * For each future-test deck: train on lists from before 2026-04-01 (all
 * constructed formats), rank every nonland card legal in the format and in
 * the card pool on that day by synergy with the deck's signature cards, and
 * see where the real deck's core cards land. "Discoveries" are core cards
 * (in 80%+ of the real lists) that almost nobody played in the format before
 * (under 5% of lists): the creative picks the brews miss. Baseline: ranking by
 * plain feature overlap with the signature cards (similar cards, not partners).
 */
import { readFileSync } from "node:fs";
import { loadCardIndex } from "../src/cards/load";
import { normalizeName } from "../src/cards/names";
import { FileDataSource } from "../src/data/source";
import { round4Items, toCounts } from "../evals/round4/items";
import { synergyScore, trainSynergy } from "../src/synergy/feature-synergy";

const W = /^Cards?\s*\(\d+%?\)\s*$/i;
const DAY = 86_400_000;

async function main() {
  const index = loadCardIndex();
  const history = await FileDataSource.load("data/reference-lists-all.jsonl", index);
  const raw = readFileSync("data/reference-lists-all.jsonl", "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as { format: string; date: string; strategy: string; main: { qty: number; name: string }[] });
  const train = raw.filter((l) => l.format !== "duel" && l.date < "2026-04-01").map((l) => l.main.filter((c) => !W.test(c.name)).map((c) => c.name));
  const t0 = Date.now();
  const model = trainSynergy(index, train);
  console.log(`trained on ${model.lists} lists, ${model.features.length} features, ${model.pmi.size} with partners, ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  const isLand = (n: string) => /\bLand\b/.test(index.getCard(n)?.typeLine.split(" // ")[0] ?? "");
  const tally = { synergy: [] as number[], overlap: [] as number[], pools: [] as number[] };
  const rows: string[] = [];
  for (const it of round4Items(index).filter((i) => i.track === "future")) {
    const t = it.target!;
    const first = Date.parse(t.firstSeen);
    const real = raw.filter((l) => l.format === t.format && l.strategy === t.strategy && Date.parse(l.date) >= first + 7 * DAY);
    if (real.length < 3) continue;
    const share = new Map<string, number>();
    for (const l of real) for (const k of new Set(toCounts(index, l.main.filter((c) => !W.test(c.name))).keys())) share.set(k, (share.get(k) ?? 0) + 1 / real.length);
    const before = history.cut(t.firstSeen);
    const pool = index.asOf(t.firstSeen, history.cardsPlayedThrough(t.firstSeen));
    const sig = it.keyCards!.map((k) => index.getCard(k)).filter((c): c is NonNullable<typeof c> => !!c);
    const sigNames = new Set(sig.map((c) => normalizeName(c.name)));
    const fmtShare = (k: string) => before.cardPlayRate(t.format, index.getCard(k)?.name ?? k)?.share ?? 0;
    const discoveries = [...share]
      .filter(([k, s]) => s >= 0.8 && !isLand(k) && !sigNames.has(k) && fmtShare(k) < 0.05)
      .map(([k]) => normalizeName(index.getCard(k)?.name ?? k));
    if (!discoveries.length) continue;
    // --colors: only cards castable in the signature cards' colors (plus colorless), as a brewer would look.
    const sigColors = new Set(sig.flatMap((c) => c.colors));
    const inColors = (c: { colors: string[] }) => !process.argv.includes("--colors") || sigColors.size === 0 || c.colors.every((x) => sigColors.has(x));
    const candidates = pool.cards.filter(
      (c) => !isLand(c.name) && (c.legal[t.format] === "legal" || c.legal[t.format] === "restricted") && !sigNames.has(normalizeName(c.name)) && inColors(c),
    );
    const sigFeatures = new Set(sig.flatMap((c) => model.featuresOf(c)));
    const bySynergy = candidates.map((c) => ({ k: normalizeName(c.name), s: synergyScore(model, sig, c) })).sort((a, b) => b.s - a.s);
    const byOverlap = candidates
      .map((c) => {
        const f = model.featuresOf(c);
        const shared = f.filter((x) => sigFeatures.has(x)).length;
        return { k: normalizeName(c.name), s: f.length ? shared / Math.sqrt(f.length * sigFeatures.size) : 0 };
      })
      .sort((a, b) => b.s - a.s);
    const rank = (list: { k: string }[], k: string) => list.findIndex((x) => x.k === k) + 1;
    const parts = discoveries.filter((d) => bySynergy.some((x) => x.k === d) || !process.argv.includes("--colors")).map((d) => {
      const rs = rank(bySynergy, d);
      const ro = rank(byOverlap, d);
      tally.synergy.push(rs);
      tally.overlap.push(ro);
      tally.pools.push(candidates.length);
      return `${index.getCard(d)?.name ?? d} #${rs} (overlap #${ro})`;
    });
    rows.push(`${it.id.replace("future-", "").padEnd(28)} pool ${String(candidates.length).padStart(5)}: ${parts.join(", ")}`);
  }
  console.log(rows.join("\n"));
  const at = (xs: number[], k: number) => `${xs.filter((r) => r > 0 && r <= k).length}/${xs.length}`;
  const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  const pool = median(tally.pools);
  console.log(`\n${tally.synergy.length} discoveries, median pool ${pool} cards`);
  for (const k of [25, 50, 100, 300]) {
    console.log(`  in the top ${String(k).padStart(3)}: synergy ${at(tally.synergy, k)} | similar-card baseline ${at(tally.overlap, k)} | random would be about ${((k / pool) * tally.synergy.length).toFixed(1)}`);
  }
  console.log(`  median rank: synergy ${median(tally.synergy)} | baseline ${median(tally.overlap)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
