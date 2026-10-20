/**
 * Build the pairwise scorecard: for each prompt both runs answered, the two
 * answers side by side, sides shuffled, no model or harness named.
 *
 *   pnpm exec tsx scripts/build-pairwise-page.ts --out evals/rating/pairwise.html \
 *     --key evals/results/pairwise-key.json \
 *     --pair v1-opus=evals/results/model-comparison/claude-opus-5-5-p1.json,v2-opus=evals/results/harness-v2/claude-opus-5-5-p1.json \
 *     --pair ...
 *
 * --track fresh keeps only round 4 items of that track; --items id,id keeps only those; --title renames the page.
 *
 * The rater picks A, B or tie and answers two yes/no questions per answer.
 * The key (pair id -> which label is left and right) is written beside the
 * results, never into the page.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { RUBRIC_PROMPTS } from "../evals/rubric/prompts";
import { loadCardIndex } from "../src/cards/load";

interface Line {
  qty: number;
  name: string;
}
interface Result {
  id: string;
  /** Rounds 1-3 record the format sent; round 4 records `format`. */
  sentFormat?: string | null;
  format?: string;
  prompt?: string;
  track?: string;
  unsupported?: boolean;
  text?: string;
  errors?: string[];
  deck?: { main: Line[]; side: Line[]; commander?: Line[] } | null;
}

const argv = process.argv.slice(2);
const opt = (name: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const out = opt("out") ?? "evals/rating/pairwise.html";
const keyPath = opt("key") ?? "evals/results/pairwise-key.json";
const template = opt("template") ?? "evals/rating/pairwise-template.html";
const title = opt("title");
const onlyTrack = opt("track");
const onlyItems = opt("items")?.split(",");
const pairSpecs = argv.flatMap((a, i) => (a === "--pair" ? [argv[i + 1]] : []));

const sent = new Map(
  (JSON.parse(readFileSync("evals/rubric/v1-prompts.json", "utf8")) as { id: string; prompt: string }[]).map((p) => [p.id, p.prompt]),
);
const meta = new Map(RUBRIC_PROMPTS.map((p) => [p.id, p]));
const sum = (xs: Line[]) => xs.reduce((n, c) => n + c.qty, 0);
const answer = (r: Result) => ({
  text: r.text ?? "",
  error: Boolean(r.errors && r.errors.length),
  deck: r.deck
    ? {
        commander: (r.deck.commander ?? []).map((c) => ({ qty: c.qty, name: c.name })),
        main: r.deck.main.map((c) => ({ qty: c.qty, name: c.name })),
        side: (r.deck.side ?? []).map((c) => ({ qty: c.qty, name: c.name })),
        mainCount: sum(r.deck.main),
        sideCount: sum(r.deck.side ?? []),
      }
    : null,
});

/** Prompts where a proven list, the player's own list, or an impossibility frames the answer; the rest are brews. */
const NOT_BREW = new Set([
  "premodern-stock-goblins",
  "modern-tribal-brew",
  "pauper-budget-aggro",
  "vintage-restricted",
  "legacy-sideboard-only",
  "premodern-paste-and-tune",
  "legacy-impossible",
  "modern-named-two-cards",
]);

const key: Record<string, { prompt: string; left: string; right: string }> = {};
const extra = new Map<string, { format: string; prompt: string; lookFor: string }>();
const pairs: unknown[] = [];
for (const spec of pairSpecs) {
  const [[labelA, fileA], [labelB, fileB]] = spec.split(",").map((s) => s.split("=") as [string, string]);
  const load = (f: string) => new Map((JSON.parse(readFileSync(f, "utf8")).results as Result[]).map((r) => [r.id, r]));
  const a = load(fileA);
  const b = load(fileB);
  // Rubric prompts in rubric order, then any other ids (round 4) in file order.
  const ids = [...RUBRIC_PROMPTS.map((p) => p.id), ...[...a.keys()].filter((id) => !meta.has(id))];
  for (const pid of ids) {
    const ra = a.get(pid);
    const rb = b.get(pid);
    if (!ra || !rb || ra.unsupported || rb.unsupported || !(ra.sentFormat ?? ra.format) || !(rb.sentFormat ?? rb.format)) continue;
    if (onlyTrack && ra.track !== onlyTrack) continue;
    if (onlyItems && !onlyItems.includes(pid)) continue;
    if (!meta.has(pid)) extra.set(pid, { format: ra.format!, prompt: ra.prompt!, lookFor: "" });
    const p = { id: pid };
    const id = createHash("sha256").update(`${labelA}|${labelB}|${p.id}`).digest("hex").slice(0, 12);
    // Side assignment from the id: stable across rebuilds, unrelated to which run is which.
    const swap = parseInt(id.slice(0, 2), 16) % 2 === 1;
    const [left, right] = swap ? [[labelB, rb], [labelA, ra]] as const : [[labelA, ra], [labelB, rb]] as const;
    key[id] = { prompt: p.id, left: left[0], right: right[0] };
    pairs.push({ id, prompt: p.id, brew: !NOT_BREW.has(p.id), left: answer(left[1]), right: answer(right[1]) });
  }
}

// Interleave so the same prompt's two pairs aren't back to back.
const order = [...pairs].sort((x, y) => ((x as { id: string }).id < (y as { id: string }).id ? -1 : 1));
const prompts = Object.fromEntries(
  [...new Set(order.map((p) => (p as { prompt: string }).prompt))].map((id) => {
    const m = meta.get(id);
    if (!m) return [id, extra.get(id)!];
    return [id, { format: m.format, prompt: sent.get(id) ?? m.prompt, lookFor: m.lookFor }];
  }),
);
// Card facts for the hover popup: artifact pages can't load outside images, so the page shows the card as text.
const index = loadCardIndex();
const cards: Record<string, { cost: string; type: string; text: string; pt?: string }> = {};
for (const p of order as { left: { deck: { main: Line[]; side: Line[]; commander: Line[] } | null }; right: { deck: { main: Line[]; side: Line[]; commander: Line[] } | null } }[]) {
  for (const ans of [p.left, p.right]) {
    for (const l of [...(ans.deck?.main ?? []), ...(ans.deck?.side ?? []), ...(ans.deck?.commander ?? [])]) {
      const c = index.getCard(l.name);
      if (c && !cards[l.name]) cards[l.name] = { cost: c.manaCost, type: c.typeLine, text: c.text, pt: c.power != null ? `${c.power}/${c.toughness}` : undefined };
    }
  }
}
const json = JSON.stringify({ prompts, pairs: order, cards }).replace(/</g, "\\u003c");
let page = readFileSync(template, "utf8").replace("/*DATA*/", () => json);
if (title) page = page.replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`).replace(/<h1>[^<]*<\/h1>/, `<h1>${title}</h1>`);
writeFileSync(out, page);
writeFileSync(keyPath, JSON.stringify(key, null, 1) + "\n");
console.log(`wrote ${out}: ${order.length} pairs across ${Object.keys(prompts).length} prompts`);
