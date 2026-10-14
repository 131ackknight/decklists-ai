/**
 * Format registry. `key` is Scryfall's legality key. Construction rules
 * live here so the deck checker (step 5) never hardcodes 60/15/4.
 *
 * `hasData` marks formats Decklist Data scrapes from MTGO. `nearest`
 * is the fallback order for the shell step when a format has no data:
 * borrow from these formats, keeping only cards legal here.
 */

export interface FormatRules {
  key: string;
  name: string;
  /** Exact main deck size for singleton formats, minimum otherwise. */
  mainSize: number;
  mainSizeExact: boolean;
  maxCopies: number;
  sideboardMax: number;
  /** Deck has a commander and cards must fit its color identity. */
  commander: boolean;
  hasData: boolean;
  nearest: string[];
  notes?: string;
}

const constructed = (
  key: string,
  name: string,
  opts: Partial<FormatRules> = {},
): FormatRules => ({
  key,
  name,
  mainSize: 60,
  mainSizeExact: false,
  maxCopies: 4,
  sideboardMax: 15,
  commander: false,
  hasData: false,
  nearest: [],
  ...opts,
});

const singleton = (
  key: string,
  name: string,
  opts: Partial<FormatRules> = {},
): FormatRules => ({
  key,
  name,
  mainSize: 100,
  mainSizeExact: true,
  maxCopies: 1,
  sideboardMax: 0,
  commander: true,
  hasData: false,
  nearest: [],
  ...opts,
});

export const FORMATS: FormatRules[] = [
  constructed("standard", "Standard", { hasData: true }),
  constructed("pioneer", "Pioneer", { hasData: true, nearest: ["standard"] }),
  constructed("modern", "Modern", { hasData: true, nearest: ["pioneer"] }),
  constructed("legacy", "Legacy", { hasData: true, nearest: ["vintage", "modern"] }),
  constructed("vintage", "Vintage", { hasData: true, nearest: ["legacy"] }),
  constructed("pauper", "Pauper", { hasData: true }),
  constructed("premodern", "Premodern", { hasData: true }),
  constructed("historic", "Historic", { nearest: ["pioneer", "standard"] }),
  constructed("timeless", "Timeless", { nearest: ["legacy", "modern", "pioneer"] }),
  constructed("alchemy", "Alchemy", { nearest: ["standard"] }),
  constructed("penny", "Penny Dreadful", {
    nearest: ["pauper", "modern"],
    notes: "Legal list changes each season.",
  }),
  constructed("oldschool", "Old School 93/94", { nearest: ["premodern"] }),
  singleton("duel", "Duel Commander", { hasData: true, notes: "One on one, 20 life." }),
  singleton("commander", "Commander", { nearest: ["duel"], notes: "Multiplayer, 40 life." }),
  singleton("predh", "PreDH", { nearest: ["duel", "premodern"] }),
  singleton("paupercommander", "Pauper Commander", {
    nearest: ["pauper"],
    notes: "Commander is an uncommon creature; the rest are commons.",
  }),
  singleton("brawl", "Brawl", { nearest: ["duel", "historic"] }),
  singleton("standardbrawl", "Standard Brawl", {
    mainSize: 60,
    nearest: ["standard"],
  }),
  singleton("oathbreaker", "Oathbreaker", {
    mainSize: 60,
    nearest: ["duel"],
    notes: "Planeswalker commander plus a signature spell.",
  }),
  singleton("gladiator", "Gladiator", {
    commander: false,
    nearest: ["historic", "pioneer"],
  }),
];

const BY_KEY = new Map(FORMATS.map((f) => [f.key, f]));
const BY_NAME = new Map(
  FORMATS.flatMap((f) => [
    [f.name.toLowerCase(), f],
    [f.key, f],
  ]),
);

export function getFormat(keyOrName: string): FormatRules | undefined {
  const k = keyOrName.trim().toLowerCase();
  return BY_KEY.get(k) ?? BY_NAME.get(k);
}
