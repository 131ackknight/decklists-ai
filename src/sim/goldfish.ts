import type { CardIndex } from "@/cards/card-index";
import type { Card } from "@/cards/types";
import { COLORS, landColors, landWeight, pipsByFace, type Color } from "@/checker/mana";

/**
 * Level 1 goldfish: shuffle and play out the first turns thousands of times
 * with land drops, colored mana and mulligans, but no card abilities beyond
 * making mana. Answers "does the mana work" and "does the engine show up in
 * time and can it be cast," which draw odds alone can't.
 */

export interface SimInput {
  main: { qty: number; name: string }[];
  /** Engine pieces: each group needs at least one card in hand, castable, by the target turn. */
  engine?: { name: string; cards: string[] }[];
  targetTurn?: number;
  onPlay?: boolean;
  games?: number;
  seed?: number;
}

export interface SimResult {
  games: number;
  mulliganRate: number;
  /** Share of games with a land drop on each of turns 1-4. */
  landDropsThroughT4: number;
  /** Two or fewer lands in play on turn 4 (three in 100-card decks). */
  screwRate: number;
  /** Eight or more lands seen (in play or hand) by turn 6 (eleven in 100-card decks). */
  floodRate: number;
  /** Turn-by-turn share of games that could cast every spell in hand they have enough total mana for (colors permitting). */
  colorOkByTurn: number[];
  engineReadyByTarget: number | null;
  engineInHandByTarget: number | null;
  avgLandsInPlayByTurn: number[];
}

interface SimCard {
  name: string;
  land: boolean;
  colors: Set<Color>;
  /** Mana producer that isn't a land: cost, colors it makes, and whether it can tap the turn it arrives. */
  rock: { cost: number; makes: Set<Color>; immediate: boolean } | null;
  cmc: number;
  pips: Partial<Record<Color, number>>;
}

/** Small seeded PRNG so runs are reproducible. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function toSim(card: Card, basicColors: Set<Color>): SimCard {
  const w = landWeight(card);
  const face = pipsByFace(card.manaCost)[0] ?? { cmc: card.cmc, pips: {} };
  const makes = new Set<Color>((card.producedMana ?? []).filter((c): c is Color => (COLORS as readonly string[]).includes(c)));
  const isRock = w === 0 && makes.size > 0 && card.cmc <= 2 && /\b(Artifact|Creature)\b/.test(card.typeLine);
  return {
    name: card.name,
    land: w === 1,
    colors: w === 1 ? landColors(card, basicColors) : new Set(),
    rock: isRock ? { cost: card.cmc, makes, immediate: /\bArtifact\b/.test(card.typeLine) && !/\bCreature\b/.test(card.typeLine) } : null,
    cmc: face.cmc,
    pips: face.pips,
  };
}

/** Can this pool of colored sources pay the spell's colored pips plus generic? */
function canPay(sources: Set<Color>[], spell: SimCard): boolean {
  if (spell.cmc > sources.length) return false;
  const need = (Object.entries(spell.pips) as [Color, number][]).flatMap(([c, n]) => Array(n).fill(c) as Color[]);
  // Greedy: assign the most constrained sources first.
  const pool = [...sources].sort((a, b) => a.size - b.size);
  for (const c of need.sort((a, b) => sources.filter((s) => s.has(a)).length - sources.filter((s) => s.has(b)).length)) {
    const i = pool.findIndex((s) => s.has(c));
    if (i < 0) return false;
    pool.splice(i, 1);
  }
  return true;
}

export function goldfish(index: CardIndex, input: SimInput): SimResult {
  const games = input.games ?? 5000;
  const rand = mulberry32(input.seed ?? 1);
  const onPlay = input.onPlay ?? true;
  const target = input.targetTurn ?? 4;
  const turns = Math.max(6, target);

  const basicColors = new Set<Color>();
  const BASIC: Record<string, Color> = { plains: "W", island: "U", swamp: "B", mountain: "R", forest: "G" };
  for (const l of input.main) {
    const b = BASIC[l.name.toLowerCase().replace(/^snow-covered /, "")];
    if (b) basicColors.add(b);
  }
  const deck: SimCard[] = [];
  for (const l of input.main) {
    const card = index.getCard(l.name);
    if (!card) continue;
    const s = toSim(card, basicColors);
    for (let i = 0; i < l.qty; i++) deck.push(s);
  }
  const size = deck.length;
  const engine = (input.engine ?? []).map((g) => new Set(g.cards.map((c) => index.getCard(c)?.name ?? c)));
  // Keep range follows the deck: a 16-land deck keeps one-landers, a 26-land deck wants three.
  const landCount = deck.filter((c) => c.land).length;
  const expected = (7 * landCount) / Math.max(1, size);
  const lowLands = Math.max(1, Math.round(expected) - 1);
  const highLands = Math.min(6, Math.round(expected) + 2);

  let mulligans = 0;
  let allDrops = 0;
  let screw = 0;
  let flood = 0;
  let engineInHand = 0;
  let engineReady = 0;
  const colorOk = Array(turns).fill(0);
  const landsByTurn = Array(turns).fill(0);

  for (let g = 0; g < games; g++) {
    const order = [...deck];
    const shuffle = () => {
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
    };
    // London mulligan, once at most: keep a hand near the deck's land ratio, else draw a new 7 and bottom one.
    shuffle();
    let hand = order.slice(0, 7);
    let next = 7;
    const lands = (h: SimCard[]) => h.filter((c) => c.land).length;
    if (lands(hand) < lowLands || lands(hand) > highLands) {
      mulligans++;
      shuffle();
      hand = order.slice(0, 7);
      // Bottom the card that most hurts the land balance.
      const tooMany = lands(hand) > highLands;
      const i = hand.findIndex((c) => c.land === tooMany);
      hand.splice(i >= 0 ? i : 6, 1);
      next = 7;
    }

    const lands_: SimCard[] = [];
    const rocks: { makes: Set<Color>; ready: boolean }[] = [];
    let drops = 0;
    let landsAtT4 = 0;
    let landsSeenAtT6 = 0;
    let readyAt: number | null = null;
    let inHandAt: number | null = null;

    for (let t = 1; t <= turns; t++) {
      if (!(t === 1 && onPlay)) hand.push(order[next++]);
      for (const r of rocks) r.ready = true;

      // Play the land that adds a color the hand needs most, else any land.
      const handNeeds = new Set<Color>();
      for (const c of hand) for (const k of Object.keys(c.pips) as Color[]) handNeeds.add(k);
      const have = new Set<Color>([...lands_.flatMap((l) => [...l.colors]), ...rocks.flatMap((r) => [...r.makes])]);
      const options = hand.filter((c) => c.land);
      if (options.length) {
        const pick = options.find((l) => [...l.colors].some((c) => handNeeds.has(c) && !have.has(c))) ?? options[0];
        hand.splice(hand.indexOf(pick), 1);
        lands_.push(pick);
        if (t <= 4) drops++;
      }

      // Cast mana producers while affordable, cheapest first.
      const sources = () => [...lands_.map((l) => l.colors), ...rocks.filter((r) => r.ready).map((r) => r.makes)];
      let spent = 0;
      for (const c of hand.filter((x) => x.rock).sort((a, b) => a.cmc - b.cmc)) {
        const avail = sources().slice(spent);
        if (!canPay(avail, c)) continue;
        spent += c.cmc;
        hand.splice(hand.indexOf(c), 1);
        rocks.push({ makes: c.rock!.makes, ready: c.rock!.immediate });
      }

      const pool = sources();
      landsByTurn[t - 1] += lands_.length;
      if (t === 4) landsAtT4 = lands_.length;
      if (t === 6) landsSeenAtT6 = lands_.length + hand.filter((c) => c.land).length;
      // Color check: every spell the total mana could pay for, the colors can too.
      const affordable = hand.filter((c) => !c.land && c.cmc <= pool.length);
      if (affordable.every((c) => canPay(pool, c))) colorOk[t - 1]++;

      if (engine.length && t <= target) {
        const inHand = engine.every((grp) => hand.some((c) => grp.has(c.name)));
        if (inHand && inHandAt == null) inHandAt = t;
        const castable = engine.every((grp) => hand.some((c) => grp.has(c.name) && canPay(pool, c)));
        if (castable && readyAt == null) readyAt = t;
      }
    }

    if (drops === 4) allDrops++;
    if (landsAtT4 <= (size >= 90 ? 3 : 2)) screw++;
    if (landsSeenAtT6 >= (size >= 90 ? 11 : 8)) flood++;
    if (inHandAt != null) engineInHand++;
    if (readyAt != null) engineReady++;
  }

  const r = (n: number) => Math.round((n / games) * 1000) / 10;
  return {
    games,
    mulliganRate: r(mulligans),
    landDropsThroughT4: r(allDrops),
    screwRate: r(screw),
    floodRate: r(flood),
    colorOkByTurn: colorOk.map(r),
    engineReadyByTarget: engine.length ? r(engineReady) : null,
    engineInHandByTarget: engine.length ? r(engineInHand) : null,
    avgLandsInPlayByTurn: landsByTurn.map((n) => Math.round((n / games) * 100) / 100),
  };
}
