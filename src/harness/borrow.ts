/**
 * Harness v20 (2026-11-08): a short list of the little-played spells real decks run alongside the
 * requested cards, given up front. Inventors' first lists borrow about 10 copies of spells from other decks,
 * mostly little-played ones, and 58% stay in the settled deck; the AI borrows 4 and 17% stay (PROGRESS.md
 * section 2g). Of the candidate lists tried (scripts/candidate-check.ts), only this kind ranks those spells
 * well: in the requested cards' colors, its top 20 hold a third of the spells inventors borrowed. The
 * existing played_with tool can't show them: it needs lists with all the requested cards together and
 * returns the 25 most common partners. Generic: any prompt, real-deck data only.
 */
import type { CardIndex } from "@/cards/card-index";
import { normalizeName } from "@/cards/names";
import type { Card } from "@/cards/types";
import type { DataSource } from "@/data/source";

/**
 * Cards whose full name (or a face's name) appears in the text, in order of appearance. Case-sensitive,
 * whole words, longest names first so "Ardyn, the Usurper" wins over a shorter name inside it; names of
 * three letters or fewer are skipped.
 */
export function namedCards(index: CardIndex, text: string): Card[] {
  const names = index.cards.flatMap((card) => [card.name, ...(card.faces ?? [])].filter((n) => n.length > 3).map((n) => ({ card, n })));
  names.sort((a, b) => b.n.length - a.n.length);
  const found: { card: Card; start: number; end: number }[] = [];
  for (const { card, n } of names) {
    for (let i = text.indexOf(n); i >= 0; i = text.indexOf(n, i + 1)) {
      const end = i + n.length;
      const whole = !/\w/.test(text[i - 1] ?? "") && !/\w/.test(text[end] ?? "");
      if (whole && !found.some((f) => i < f.end && end > f.start)) {
        found.push({ card, start: i, end });
        break;
      }
    }
  }
  return [...new Map(found.sort((a, b) => a.start - b.start).map((f) => [f.card.name, f.card])).values()];
}

export interface BorrowCard {
  name: string;
  /** Share of the format's lists in the last 90 days that run it. */
  playRate: number;
  /** Earlier decks, any format, that run it beside one of the named cards. */
  alongside: number;
}

/**
 * Nonland spells in under 10% of the format's lists of the last 90 days, castable in the named cards'
 * colors, ranked by how many earlier decks (any format) run them beside one of the named cards.
 */
export function borrowList(index: CardIndex, data: DataSource, format: string, named: Card[], n = 20): BorrowCard[] {
  const recent = data.recentLists(format);
  if (!recent.length || !named.length) return [];
  const canon = (name: string) => normalizeName(index.getCard(name)?.name ?? name);
  const rate = new Map<string, number>();
  for (const l of recent) for (const k of new Set(l.main.map((c) => canon(c.name)))) rate.set(k, (rate.get(k) ?? 0) + 1 / recent.length);
  const asked = new Set(named.map((c) => normalizeName(c.name)));
  const colors = new Set(named.flatMap((c) => c.colors));
  const alongside = new Map<string, number>();
  for (const deck of data.mainDecks()) {
    const cards = new Set(deck.map(canon));
    if (![...asked].some((a) => cards.has(a))) continue;
    for (const k of cards) alongside.set(k, (alongside.get(k) ?? 0) + 1);
  }
  return [...rate]
    .filter(([k, r]) => r < 0.1 && !asked.has(k) && (alongside.get(k) ?? 0) > 0)
    .flatMap(([k, r]) => {
      const card = index.getCard(k);
      const castable = card && !/\bLand\b/.test(card.typeLine.split(" // ")[0]) && (colors.size === 0 || card.colors.every((c) => colors.has(c)));
      return castable ? [{ name: card.name, playRate: r, alongside: alongside.get(k)! }] : [];
    })
    .sort((a, b) => b.alongside - a.alongside || a.playRate - b.playRate || a.name.localeCompare(b.name))
    .slice(0, n);
}

/** The list as it goes in the first message, or null when there is nothing to show. */
export function borrowText(format: string, list: BorrowCard[]): string | null {
  if (!list.length) return null;
  const pct = (r: number) => `${Math.round(r * 1000) / 10}%`;
  return [
    `Little-played spells that real decks run alongside the requested cards, in their colors (each in under 10% of recent ${format} lists; most often alongside first):`,
    ...list.map((c) => `- ${c.name}: in ${pct(c.playRate)} of recent lists; beside a requested card in ${c.alongside} earlier decks`),
    "Inventors of new decks usually take a few cards like these from other decks, and most of this list won't fit yours. Look up any you'd use with card_info, and take only the ones that make the plan better.",
  ].join("\n");
}
