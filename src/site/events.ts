/**
 * The brew API's Server-Sent Events contract (site SPEC, Interfaces). Every `data:` line is one
 * BrewEvent as JSON. Only friendly text reaches the page: no tool names, inputs or brewer notes (D-007).
 */
export type CardGroup = "Creature" | "Planeswalker" | "Instant" | "Sorcery" | "Artifact" | "Enchantment" | "Land" | "Other";

export interface SiteDeck {
  name: string;
  /** 2-3 sentences on how the deck wins (D-009). */
  blurb: string;
  /** e.g. "modern". */
  format: string;
  main: { qty: number; name: string; type: CardGroup }[];
  side: { qty: number; name: string; type: CardGroup }[];
}

export type BrewEvent =
  /** `progress` (0 to 1) moves only on real events and never goes back (D-024). */
  | { type: "status"; phrase: string; progress: number }
  | { type: "deck"; deck: SiteDeck; cached: boolean }
  | { type: "refused"; reason: "off_topic" | "ip_limit" | "daily_cap"; message: string }
  | { type: "error"; message: string };

/** One event as an SSE frame. */
export function sse(e: BrewEvent): string {
  return `data: ${JSON.stringify(e)}\n\n`;
}

/** A comment frame; keeps proxies from closing a quiet stream. */
export const SSE_PING = ": ping\n\n";

/** The only error text the page ever sees. */
export const BREW_FIZZLED = "The brew fizzled. Try again in a moment.";
