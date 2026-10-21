import type { CardIndex } from "@/cards/card-index";
import { normalizeName } from "@/cards/names";
import type { Card } from "@/cards/types";

/**
 * Feature synergy: which kinds of cards real decks play together, learned from
 * decklists at the level of what cards do (function tags, keywords, types),
 * not which cards they are. Applied to any card, including ones nobody plays
 * yet: a card that "cares about creature power" scores well with cheap big
 * creatures because real decks pair those kinds of cards, whatever the names.
 *
 * Generic by construction (owner, 2026-10-21: "a tool or structure that is
 * generic but grants specific knowledge... not bespoke to specific cards").
 */

export interface SynergyModel {
  features: string[];
  /** Positive pointwise mutual information between feature pairs, sparse. */
  pmi: Map<number, Map<number, number>>;
  featuresOf: (card: Card) => number[];
  lists: number;
}

const isLand = (c: Card) => /\bLand\b/.test(c.typeLine.split(" // ")[0]);

/** The feature vocabulary: tags, keywords, types and subtypes carried by 15+ cards and at most 5% of all cards. */
function vocabulary(index: CardIndex): { features: string[]; raw: (c: Card) => string[] } {
  const raw = (c: Card): string[] => {
    const out = new Set<string>();
    for (const t of c.tags) {
      out.add(`tag:${t}`);
      for (const p of index.getTag(t)?.parents ?? []) out.add(`tag:${p}`);
    }
    for (const k of c.keywords) out.add(`kw:${k.toLowerCase()}`);
    const [types, subtypes] = c.typeLine.split(" // ")[0].split(" — ");
    for (const t of types.split(" ")) if (t && !["Legendary", "Basic", "Snow", "World"].includes(t)) out.add(`type:${t.toLowerCase()}`);
    for (const s of (subtypes ?? "").split(" ")) if (s) out.add(`sub:${s.toLowerCase()}`);
    return [...out];
  };
  const count = new Map<string, number>();
  for (const c of index.cards) for (const f of raw(c)) count.set(f, (count.get(f) ?? 0) + 1);
  const max = index.cards.length * 0.05;
  const features = [...count].filter(([f, n]) => n >= 15 && (n <= max || f.startsWith("type:"))).map(([f]) => f);
  return { features, raw };
}

/**
 * Learn feature co-occurrence from decklists (main deck, nonland cards).
 * `lists` are card-name lists; at most `sample` are used, evenly spaced.
 */
export function trainSynergy(index: CardIndex, lists: string[][], sample = 30_000): SynergyModel {
  const { features, raw } = vocabulary(index);
  const id = new Map(features.map((f, i) => [f, i]));
  const cache = new Map<string, number[]>();
  const featuresOf = (card: Card): number[] => {
    const k = normalizeName(card.name);
    let fs = cache.get(k);
    if (!fs) {
      fs = raw(card).map((f) => id.get(f)).filter((i): i is number => i !== undefined);
      cache.set(k, fs);
    }
    return fs;
  };
  const F = features.length;
  const n = new Uint32Array(F);
  const co = new Uint32Array(F * F);
  const step = Math.max(1, Math.floor(lists.length / sample));
  let used = 0;
  for (let li = 0; li < lists.length; li += step) {
    const present = new Set<number>();
    for (const name of lists[li]) {
      const card = index.getCard(name);
      if (!card || isLand(card)) continue;
      for (const f of featuresOf(card)) present.add(f);
    }
    const ps = [...present];
    for (const a of ps) {
      n[a]++;
      const row = a * F;
      for (const b of ps) if (b !== a) co[row + b]++;
    }
    used++;
  }
  const pmi = new Map<number, Map<number, number>>();
  for (let a = 0; a < F; a++) {
    if (n[a] < 20) continue;
    const row = new Map<number, number>();
    for (let b = 0; b < F; b++) {
      const c = co[a * F + b];
      if (c < 10 || n[b] < 20) continue;
      const v = Math.log((c * used) / (n[a] * n[b]));
      if (v > 0) row.set(b, v);
    }
    if (row.size) pmi.set(a, row);
  }
  return { features, pmi, featuresOf, lists: used };
}

/**
 * How strongly real decks pair this candidate's kinds of card with the
 * requested cards' kinds: summed positive PMI over feature pairs, normalized
 * so cards with many features don't win by volume.
 */
export function synergyScore(model: SynergyModel, requested: Card[], candidate: Card): number {
  const cf = model.featuresOf(candidate);
  if (!cf.length) return 0;
  let total = 0;
  let pairs = 0;
  for (const r of requested) {
    const rf = model.featuresOf(r);
    for (const a of rf) {
      const row = model.pmi.get(a);
      pairs++;
      if (!row) continue;
      for (const b of cf) total += row.get(b) ?? 0;
    }
  }
  return pairs ? total / pairs / Math.sqrt(cf.length) : 0;
}

/** One model per data source: a brew trains once (about 3 seconds) on the data it is allowed to see. */
const models = new WeakMap<object, SynergyModel>();
export function synergyModelFor(index: CardIndex, data: { mainDecks(): string[][] }): SynergyModel {
  let m = models.get(data);
  if (!m) {
    m = trainSynergy(index, data.mainDecks());
    models.set(data, m);
  }
  return m;
}
