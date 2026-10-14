import type { CardIndex } from "@/cards/card-index";
import { getFormat, type FormatRules } from "@/cards/formats";
import { normalizeName } from "@/cards/names";
import type { Card } from "@/cards/types";
import { analyzeMana, type Entry, type LandModel, type ManaReport } from "./mana";
import manaModels from "./mana-model.json";

interface FittedModel extends LandModel {
  lists: number;
  /** Land count residual band holding 95% of real lists. */
  landLow: number;
  landHigh: number;
  /** How far below the on-curve source table 95% of real lists run. */
  sourceSlack: number;
}

const FITTED = manaModels as Record<string, FittedModel>;

/** Formats without Decklist Data: Karsten's regression, tolerances pooled from fitted formats. */
const DEFAULT_LAND_BAND = 4;
const DEFAULT_SOURCE_SLACK = 9;

export interface QtyName {
  qty: number;
  name: string;
}

export interface DeckInput {
  format: string;
  main: QtyName[];
  side?: QtyName[];
  commander?: QtyName[];
  /** Commander formats only: a companion lives outside the deck. In 60-card formats it is in the sideboard. */
  companion?: QtyName[];
}

export interface CheckOptions {
  /** Skip format legality, e.g. for old lists checked against today's banlist. */
  skipLegality?: boolean;
  /** Override the land band (both directions) instead of the fitted one. */
  landTolerance?: number;
  /** Override how far short of the source table a deck may run. */
  sourceTolerance?: number;
}

export type IssueCode =
  | "unknown-card"
  | "main-size"
  | "sideboard-size"
  | "too-many-copies"
  | "not-legal"
  | "commander-missing"
  | "commander-invalid"
  | "outside-identity"
  | "land-count"
  | "colored-sources";

export interface Issue {
  code: IssueCode;
  message: string;
  cards?: string[];
}

export interface CheckResult {
  ok: boolean;
  format: string;
  errors: Issue[];
  warnings: Issue[];
  mana: ManaReport | null;
}

const BASICS = new Set(
  ["plains", "island", "swamp", "mountain", "forest", "wastes"].flatMap((b) => [b, `snow-covered ${b}`]),
);

const WORD_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

function copyLimit(card: Card, format: FormatRules, checkRestricted: boolean): number {
  if (BASICS.has(card.name.toLowerCase())) return Infinity;
  if (/a deck can have any number of cards named/i.test(card.text)) return Infinity;
  const upTo = card.text.match(/a deck can have up to (\w+) cards named/i);
  if (upTo) return WORD_NUMBERS[upTo[1].toLowerCase()] ?? Number(upTo[1]) ?? format.maxCopies;
  if (checkRestricted && card.legal[format.key] === "restricted") return 1;
  return format.maxCopies;
}

/**
 * Can lead a commander deck: legendary creatures, cards that say so,
 * planeswalkers that are creatures off the battlefield (Grist), legendary
 * Vehicles and Spacecraft with power and toughness, and Backgrounds as a
 * second commander.
 */
export function canBeCommander(card: Card): boolean {
  const front = card.typeLine.split(" // ")[0];
  if (!/\bLegendary\b/.test(front)) return /can be your commander/i.test(card.text);
  return (
    /\bCreature\b/.test(front) ||
    /can be your commander/i.test(card.text) ||
    /isn't on the battlefield, it's an? [^.]*\bcreature\b/i.test(card.text) ||
    (/\b(Vehicle|Spacecraft)\b/.test(front) && card.power != null) ||
    /\bBackground\b/.test(front)
  );
}

function levenshtein(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const up = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = up;
    }
  }
  return prev[b.length];
}

function suggest(index: CardIndex, name: string): string[] {
  const target = normalizeName(name);
  return index.cards
    .map((c) => ({ name: c.name, d: levenshtein(target, normalizeName(c.name)) }))
    .filter((x) => x.d <= Math.max(2, Math.floor(target.length / 5)))
    .sort((a, b) => a.d - b.d)
    .slice(0, 3)
    .map((x) => x.name);
}

function resolve(index: CardIndex, lines: QtyName[], errors: Issue[]): Entry[] {
  const byOracle = new Map<string, Entry>();
  for (const line of lines) {
    const card = index.getCard(line.name);
    if (!card) {
      const hints = suggest(index, line.name);
      errors.push({
        code: "unknown-card",
        message: `Unknown card "${line.name}".${hints.length ? ` Did you mean ${hints.join(", ")}?` : ""}`,
        cards: [line.name],
      });
      continue;
    }
    const existing = byOracle.get(card.oracleId);
    if (existing) existing.qty += line.qty;
    else byOracle.set(card.oracleId, { qty: line.qty, card });
  }
  return [...byOracle.values()];
}

const count = (entries: Entry[]) => entries.reduce((n, e) => n + e.qty, 0);

/**
 * Deterministic deck check. Errors make a deck unplayable in the format;
 * warnings are fixable weaknesses (mana) the model must address or justify.
 */
export function checkDeck(index: CardIndex, deck: DeckInput, opts: CheckOptions = {}): CheckResult {
  const format = getFormat(deck.format);
  if (!format) throw new Error(`Unknown format "${deck.format}".`);
  const fitted = FITTED[format.key];
  const landLow = opts.landTolerance ?? (fitted ? -fitted.landLow : DEFAULT_LAND_BAND);
  const landHigh = opts.landTolerance ?? (fitted ? fitted.landHigh : DEFAULT_LAND_BAND);
  const sourceTolerance = opts.sourceTolerance ?? fitted?.sourceSlack ?? DEFAULT_SOURCE_SLACK;
  const errors: Issue[] = [];
  const warnings: Issue[] = [];

  const main = resolve(index, deck.main, errors);
  const side = resolve(index, deck.side ?? [], errors);
  const commander = resolve(index, deck.commander ?? [], errors);

  // Size
  const mainCount = count(main) + count(commander);
  if (format.mainSizeExact ? mainCount !== format.mainSize : mainCount < format.mainSize) {
    errors.push({
      code: "main-size",
      message: `Main deck is ${mainCount} cards; ${format.name} needs ${format.mainSizeExact ? "exactly" : "at least"} ${format.mainSize}${format.commander ? " including the commander" : ""}.`,
    });
  }
  const sideCount = count(side);
  if (sideCount > format.sideboardMax) {
    errors.push({
      code: "sideboard-size",
      message: `Sideboard is ${sideCount} cards; ${format.name} allows ${format.sideboardMax}.`,
    });
  }

  // Copies and legality, counted across all zones.
  const totals = new Map<string, Entry>();
  for (const e of [...main, ...side, ...commander]) {
    const t = totals.get(e.card.oracleId);
    if (t) t.qty += e.qty;
    else totals.set(e.card.oracleId, { ...e });
  }
  for (const { qty, card } of totals.values()) {
    // The restricted list changes over time, like bans, so it follows skipLegality.
    const limit = copyLimit(card, format, !opts.skipLegality);
    if (qty > limit) {
      errors.push({
        code: "too-many-copies",
        message: `${card.name}: ${qty} copies; max ${limit}${card.legal[format.key] === "restricted" ? " (restricted)" : ""}.`,
        cards: [card.name],
      });
    }
    if (!opts.skipLegality) {
      const status = card.legal[format.key];
      if (status !== "legal" && status !== "restricted") {
        errors.push({
          code: "not-legal",
          message: `${card.name} is ${status === "banned" ? "banned" : "not legal"} in ${format.name}.`,
          cards: [card.name],
        });
      }
    }
  }

  // Commander and color identity
  if (format.commander) {
    if (commander.length === 0) {
      errors.push({ code: "commander-missing", message: `${format.name} needs a commander.` });
    } else {
      const identity = new Set(commander.flatMap((e) => e.card.identity));
      for (const e of commander) {
        if (!canBeCommander(e.card)) {
          errors.push({
            code: "commander-invalid",
            message: `${e.card.name} can't be a commander.`,
            cards: [e.card.name],
          });
        }
      }
      const outside = [...main, ...side].filter((e) => e.card.identity.some((c) => !identity.has(c)));
      if (outside.length > 0) {
        errors.push({
          code: "outside-identity",
          message: `Outside the commander's colors (${[...identity].join("") || "colorless"}): ${outside.map((e) => e.card.name).join(", ")}.`,
          cards: outside.map((e) => e.card.name),
        });
      }
    }
  }

  // Mana
  const mana = main.length > 0 ? analyzeMana(index, main, fitted) : null;
  if (mana) {
    const diff = mana.lands - mana.recommendedLands;
    if (diff < -landLow || diff > landHigh) {
      warnings.push({
        code: "land-count",
        message: `${mana.lands} lands; ${format.name} decks with an average mana value of ${mana.averageManaValue} and ${mana.cheapAccel} cheap draw or ramp spells run about ${mana.recommendedLands}. ${diff < 0 ? "Add" : "Cut"} about ${Math.round(Math.abs(diff))}.`,
      });
    }
    for (const c of mana.colors) {
      if (c.have + sourceTolerance < c.need) {
        warnings.push({
          code: "colored-sources",
          message: `${c.have} ${c.color} sources; ${c.hardest} wants about ${c.need} to cast on curve.`,
          cards: [c.hardest],
        });
      }
    }
  }

  return { ok: errors.length === 0, format: format.name, errors, warnings, mana };
}
