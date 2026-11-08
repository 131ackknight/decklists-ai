import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { CardIndex } from "@/cards/card-index";
import { FORMATS } from "@/cards/formats";
import { normalizeName } from "@/cards/names";
import type { DataSource, QtyName } from "@/data/source";
import { costUsd, usageOf, type ModelConfig, type Usage } from "./models";
import type { SubmittedDeck } from "./tools";

/**
 * Harness v17's reviewer: a fresh call that didn't build the deck, looking at
 * every nonland card with evidence about it from real decks (how often it's
 * played, which deck it usually lives in, what it's usually played beside).
 * It flags cards that don't serve this deck's plan. Generic: no card-specific
 * rules; the evidence is computed the same way for every card.
 *
 * Built for the owner's card-level notes (2026-10-20/21): "3 Vision Charms...
 * usually used to cheat Dreadnought into play", "Traumatize doesn't really work
 * in draw-go control", "the Destined White Mages and Leonardo packages don't
 * seem necessary", "Sakura-Tribe Elder is outclassed".
 */

export const ReviewOutput = z.object({
  flags: z
    .array(
      z.object({
        card: z.string(),
        problem: z.enum(["wrong role for this plan", "needs a partner this deck lacks", "unneeded package", "outclassed", "missing card or role imbalance", "other"]),
        why: z.string().describe("One or two sentences, specific to this deck."),
        fix: z.string().describe("A specific replacement card or 'cut', and what goes in its slot."),
      }),
    )
    .max(6),
});
export type Review = z.infer<typeof ReviewOutput>;

interface Evidence {
  card: string;
  copies: number;
  text: string;
  sharePct: number;
  homes: string;
  partners: string;
}

/** What real decks say about each nonland card in the brew, last year in the format. */
export function cardEvidence(index: CardIndex, data: DataSource, format: string, main: QtyName[]): Evidence[] {
  const canon = (n: string) => normalizeName(index.getCard(n)?.name ?? n);
  const isLand = (n: string) => /\bLand\b/.test(index.getCard(n)?.typeLine.split(" // ")[0] ?? "");
  const lists = data.recentLists(format, { days: 365 }).map((l) => ({ strategy: l.strategy, cards: new Set(l.main.map((c) => canon(c.name))) }));
  const inDeck = new Set(main.map((l) => canon(l.name)));
  const out: Evidence[] = [];
  for (const l of main) {
    if (isLand(l.name)) continue;
    const card = index.getCard(l.name);
    const k = canon(l.name);
    const mine = lists.filter((x) => x.cards.has(k));
    const share = lists.length ? mine.length / lists.length : 0;
    const strat = new Map<string, number>();
    const co = new Map<string, number>();
    for (const x of mine) {
      strat.set(x.strategy, (strat.get(x.strategy) ?? 0) + 1);
      for (const c of x.cards) if (c !== k && !isLand(c) && !inDeck.has(c)) co.set(c, (co.get(c) ?? 0) + 1);
    }
    const homes = [...strat]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([s, n]) => `${s} ${Math.round((n / mine.length) * 100)}%`)
      .join(", ");
    const partners = [...co]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .filter(([, n]) => n / Math.max(1, mine.length) >= 0.6)
      .map(([c, n]) => `${index.getCard(c)?.name ?? c} (${Math.round((n / mine.length) * 100)}%)`)
      .join(", ");
    const text = card ? `${card.manaCost} ${card.typeLine}: ${card.text.length > 160 ? card.text.slice(0, 157) + "..." : card.text}` : "";
    out.push({ card: card?.name ?? l.name, copies: l.qty, text, sharePct: Math.round(share * 1000) / 10, homes: mine.length >= 5 ? homes : "rarely played", partners: mine.length >= 5 ? partners || "none dominant" : "-" });
  }
  return out;
}

export interface RoleEvidence {
  role: string;
  mine: string;
  real: string;
  common: string;
}

const MV_BUCKETS = ["1", "2", "3", "4+"] as const;
const bucket = (cmc: number) => (cmc <= 1 ? 0 : cmc >= 4 ? 3 : Math.round(cmc) - 1);
let tagCounts: Map<string, number> | null = null;

/**
 * Harness v18: what the deck may be missing, not just what's wrong with its
 * cards. For each role the deck leans on (a function tag on 4+ of its copies,
 * specific enough to mean a job: on 20 to 2% of all cards), real decks that
 * lean on the same role (same format if 10+ do, else any format) show how many
 * copies they run at each mana value and which cards with that role they
 * commonly play that this deck doesn't (legal here). Generic: the same
 * computation for every role and deck.
 */
export function roleEvidence(index: CardIndex, data: DataSource, format: string, main: QtyName[]): RoleEvidence[] {
  if (!tagCounts) {
    tagCounts = new Map();
    for (const c of index.cards) for (const t of c.tags) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
  }
  const counts = tagCounts;
  // A role is a function tag: it sits under a broader one in Scryfall's tree (land-ramp under ramp). Trivia
  // tags (meme, type-errata, real-life-animal-name) have no parent; old card types sit under deprecated-card-types.
  const functional = (t: string) => {
    const parents = index.getTag(t)?.parents ?? [];
    return parents.length > 0 && !parents.includes("deprecated-card-types");
  };
  const specific = (t: string) => (counts.get(t) ?? 0) >= 20 && (counts.get(t) ?? 0) <= index.cards.length * 0.02 && functional(t);
  const canon = (n: string) => normalizeName(index.getCard(n)?.name ?? n);
  const isLand = (n: string) => /\bLand\b/.test(index.getCard(n)?.typeLine.split(" // ")[0] ?? "");
  const roleCopies = (cards: { name: string; qty: number }[], t: string) => {
    const byMv = [0, 0, 0, 0];
    for (const c of cards) {
      const card = index.getCard(c.name);
      if (card && !isLand(c.name) && card.tags.includes(t)) byMv[bucket(card.cmc)] += c.qty;
    }
    return byMv;
  };

  const mine = main.filter((l) => !isLand(l.name));
  const inDeck = new Set(mine.map((l) => canon(l.name)));
  const roles = new Map<string, number>();
  for (const l of mine) for (const t of index.getCard(l.name)?.tags ?? []) if (specific(t)) roles.set(t, (roles.get(t) ?? 0) + l.qty);
  const leaned = [...roles].filter(([, n]) => n >= 4).sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (!leaned.length) return [];

  const formats = FORMATS.filter((f) => f.hasData && f.key !== "duel").map((f) => f.key);
  const lists = formats.flatMap((f) => data.recentLists(f, { days: 365 }).map((l) => ({ format: f, main: l.main.filter((c) => !isLand(c.name)) })));
  const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  const out: RoleEvidence[] = [];
  for (const [t, n] of leaned) {
    const leanOn = (l: { main: QtyName[] }) => roleCopies(l.main, t).reduce((a, b) => a + b, 0) >= Math.max(4, Math.ceil(n / 2));
    const here = lists.filter((l) => l.format === format && leanOn(l));
    const real = here.length >= 10 ? here : lists.filter(leanOn);
    if (real.length < 10) continue;
    const byMv = real.map((l) => roleCopies(l.main, t));
    const where = [...new Set(real.map((l) => l.format))];
    const share = new Map<string, number>();
    for (const l of real) for (const k of new Set(l.main.filter((c) => index.getCard(c.name)?.tags.includes(t)).map((c) => canon(c.name)))) share.set(k, (share.get(k) ?? 0) + 1 / real.length);
    const common = [...share]
      .filter(([k, s]) => s >= 0.2 && !inDeck.has(k) && ["legal", "restricted"].includes(index.getCard(k)?.legal[format] ?? ""))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([k, s]) => `${index.getCard(k)!.name} (${index.getCard(k)!.cmc} mana, in ${Math.round(s * 100)}%)`);
    const yours = roleCopies(mine, t);
    const theirs = MV_BUCKETS.map((_, i) => median(byMv.map((m) => m[i])));
    // Only roles where the deck looks unlike real decks: 3+ copies apart at some mana value, or a card most of them run.
    if (!yours.some((y, i) => Math.abs(y - theirs[i]) >= 3) && ![...share].some(([k, s]) => s >= 0.5 && !inDeck.has(k))) continue;
    const split = (mv: number[]) => MV_BUCKETS.map((b, i) => `${b}-mana ${mv[i]}`).join(", ");
    out.push({
      role: t,
      mine: `${n} copies: ${split(yours)}`,
      real: `${real.length} lists (${where.length > 1 ? "any format" : format}): median ${median(byMv.map((m) => m.reduce((a, b) => a + b, 0)))} copies: ${split(theirs)}`,
      common: common.join(", ") || "none missing",
    });
  }
  return out;
}

/** v18 only: the reviewer may also flag what the deck lacks, from the role evidence. */
const ROLE_REVIEW = `Also look for what the deck is missing, using the role evidence: a deck can be wrong by what it lacks as much as by what it plays.
- missing card or role imbalance: compared with real decks that lean on the same role, this deck runs far more or fewer copies of that role at some mana value, or lacks a card most of them play, and that hurts this plan. Name the card to add in "card" and say what it replaces in "fix". Use the role evidence only when the comparison fits this deck's plan: decks from another format or archetype can lean on a role for different reasons.`;

const REVIEW_SYSTEM = `You review Magic: The Gathering brews for a strong player before they see them. You did not build this deck. Your job is to find the cards that don't serve this deck's plan, using the card text and the evidence from real decks.

Flag a card only for one of these reasons:
- wrong role for this plan: it doesn't do what this deck needs from that slot (a slow sorcery-speed finisher in an instant-speed draw-go deck; a card that wins slowly in a deck that needs to win fast).
- needs a partner this deck lacks: real decks almost always play it beside a card this deck doesn't have, because its job depends on that partner. The evidence lists dominant partners; judge whether the job really depends on them (a mana creature doesn't "need" whatever deck it's usually in).
- unneeded package: a group of cards borrowed from another deck that this plan doesn't use (their home deck in the evidence is a hint).
- outclassed: a clearly better card for the same job exists in this format and colors.

Never flag the cards the player asked for, or a card in the win line unless it truly can't do its part. Don't flag reasonable choices you'd merely do differently. At most 6 flags; zero is a fine answer for a good deck. Every flag needs a specific fix: a named replacement, or "cut" plus what goes in the slot.`;

export async function reviewDeck(
  client: Anthropic,
  model: ModelConfig,
  req: { prompt: string; format?: string | null },
  deck: SubmittedDeck,
  deps: { index: CardIndex; data: DataSource },
  plan: string,
  /** Optional: a strong player's past notes on other decks, as examples of how they judge. Never notes on this deck. */
  examples?: string,
  /** v18: also show how the deck's roles compare with real decks that lean on them, so missing cards can be flagged. */
  roles = false,
): Promise<{ review: Review; usage: Usage; costUsd: number; evidence: Evidence[]; roles?: RoleEvidence[] }> {
  const evidence = cardEvidence(deps.index, deps.data, deck.format, deck.main);
  const roleRows = roles ? roleEvidence(deps.index, deps.data, deck.format, deck.main) : [];
  const lands = deck.main.filter((l) => !evidence.some((e) => e.card === (deps.index.getCard(l.name)?.name ?? l.name)));
  const body = [
    `The player asked: ${req.prompt}`,
    `Format: ${deck.format}`,
    `The brewer's plan, in its own words:\n${plan.slice(0, 1500)}`,
    deck.winLine ? `Win line: ${deck.winLine.map((w) => `${w.card} (${w.does})`).join(" -> ")}` : "",
    `Nonland cards, with evidence from the last year of ${deck.format} results (share = % of all lists that play it; home = which decks play it; partners = cards most lists with it also play, that this deck lacks):`,
    ...evidence.map((e) => `- ${e.copies} ${e.card} | ${e.text} | share ${e.sharePct}% | home: ${e.homes} | partners: ${e.partners}`),
    `Lands: ${lands.map((l) => `${l.qty} ${l.name}`).join(", ")}`,
    roleRows.length
      ? `Roles this deck leans on, against real decks from the last year that lean on the same role (copies by mana value; common = cards with that role in 20%+ of those decks that this deck lacks):\n${roleRows.map((r) => `- ${r.role} | this deck: ${r.mine} | real: ${r.real} | common: ${r.common}`).join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
  const msg = await client.messages.parse({
    model: model.id,
    max_tokens: 8000,
    system: examples
      ? `${REVIEW_SYSTEM}${roles ? `\n\n${ROLE_REVIEW}` : ""}\n\nHow this player judges decks: their own notes on other brews, each with the request it answered. Learn the kind of objection they make (what a card is really for in a plan, whether the deck has enough of what it needs, whether a card earns its slot), not the specific cards: a card that was wrong in one deck can be right in another.\n${examples}`
      : `${REVIEW_SYSTEM}${roles ? `\n\n${ROLE_REVIEW}` : ""}`,
    messages: [{ role: "user", content: body }],
    ...(model.effort ? { output_config: { effort: "high" as const, format: zodOutputFormat(ReviewOutput) } } : { output_config: { format: zodOutputFormat(ReviewOutput) } }),
  });
  const usage: Usage = usageOf(model, msg.usage);
  return { review: msg.parsed_output ?? { flags: [] }, usage, costUsd: costUsd(model, usage), evidence, ...(roles ? { roles: roleRows } : {}) };
}
