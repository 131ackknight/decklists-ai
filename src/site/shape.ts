import type { CardIndex } from "@/cards/card-index";
import type { BrewResult } from "@/harness/run";
import type { CardGroup, SiteDeck } from "./events";

/**
 * The group a card is listed under, from the front face's type line. Creature and Planeswalker win over
 * everything (artifact creature = Creature), and Land wins over Artifact and Enchantment (artifact
 * land = Land, Urza's Saga = Land); a modal spell // land is its spell side.
 */
const ORDER: CardGroup[] = ["Creature", "Planeswalker", "Instant", "Sorcery", "Land", "Artifact", "Enchantment"];

export function groupOf(typeLine: string | undefined): CardGroup {
  if (!typeLine) return "Other";
  const front = typeLine.split("//")[0];
  return ORDER.find((g) => new RegExp(`\\b${g}\\b`).test(front)) ?? "Other";
}

/** The submitted deck as the page shows it. Counts and line order are kept; a card not in the index is Other. */
export function toSiteDeck(r: BrewResult, index: CardIndex, nameBlurb: { name: string; blurb: string }): SiteDeck {
  if (!r.deck) throw new Error("The brew submitted no deck.");
  const lines = (xs: { qty: number; name: string }[]) => xs.map((l) => ({ qty: l.qty, name: l.name, type: groupOf(index.getCard(l.name)?.typeLine) }));
  return { name: nameBlurb.name, blurb: nameBlurb.blurb, format: r.deck.format, main: lines(r.deck.main), side: lines(r.deck.side) };
}
