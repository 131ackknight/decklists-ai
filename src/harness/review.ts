import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { CardIndex } from "@/cards/card-index";
import { normalizeName } from "@/cards/names";
import type { DataSource, QtyName } from "@/data/source";
import { costUsd, type ModelConfig, type Usage } from "./models";
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
        problem: z.enum(["wrong role for this plan", "needs a partner this deck lacks", "unneeded package", "outclassed", "other"]),
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
): Promise<{ review: Review; usage: Usage; costUsd: number; evidence: Evidence[] }> {
  const evidence = cardEvidence(deps.index, deps.data, deck.format, deck.main);
  const lands = deck.main.filter((l) => !evidence.some((e) => e.card === (deps.index.getCard(l.name)?.name ?? l.name)));
  const body = [
    `The player asked: ${req.prompt}`,
    `Format: ${deck.format}`,
    `The brewer's plan, in its own words:\n${plan.slice(0, 1500)}`,
    deck.winLine ? `Win line: ${deck.winLine.map((w) => `${w.card} (${w.does})`).join(" -> ")}` : "",
    `Nonland cards, with evidence from the last year of ${deck.format} results (share = % of all lists that play it; home = which decks play it; partners = cards most lists with it also play, that this deck lacks):`,
    ...evidence.map((e) => `- ${e.copies} ${e.card} | ${e.text} | share ${e.sharePct}% | home: ${e.homes} | partners: ${e.partners}`),
    `Lands: ${lands.map((l) => `${l.qty} ${l.name}`).join(", ")}`,
  ]
    .filter(Boolean)
    .join("\n");
  const msg = await client.messages.parse({
    model: model.id,
    max_tokens: 8000,
    system: examples
      ? `${REVIEW_SYSTEM}\n\nHow this player judges decks: their own notes on other brews, each with the request it answered. Learn the kind of objection they make (what a card is really for in a plan, whether the deck has enough of what it needs, whether a card earns its slot), not the specific cards: a card that was wrong in one deck can be right in another.\n${examples}`
      : REVIEW_SYSTEM,
    messages: [{ role: "user", content: body }],
    ...(model.effort ? { output_config: { effort: "high" as const, format: zodOutputFormat(ReviewOutput) } } : { output_config: { format: zodOutputFormat(ReviewOutput) } }),
  });
  const usage: Usage = {
    input: msg.usage.input_tokens,
    output: msg.usage.output_tokens,
    cacheRead: msg.usage.cache_read_input_tokens ?? 0,
    cacheWrite: msg.usage.cache_creation_input_tokens ?? 0,
  };
  return { review: msg.parsed_output ?? { flags: [] }, usage, costUsd: costUsd(model, usage), evidence };
}
