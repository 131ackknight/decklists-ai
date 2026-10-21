import { z } from "zod";
import type { CardIndex } from "@/cards/card-index";
import { normalizeName } from "@/cards/names";
import type { Card } from "@/cards/types";
import type { DataSource, QtyName, RefList } from "@/data/source";
import { goldfish } from "@/sim/goldfish";

/**
 * Harness v4's coach: plain code, not another model. The brewer declares
 * what kind of deck it is building (the owner's three kinds) and the coach
 * checks that kind with numbers the brewer can't argue with:
 *
 *   synergy  enough of the theme: odds of the payoff plus enough theme cards by a turn
 *   combo    the pieces come together: odds of drawing every piece by a turn
 *   fair     principles and card quality: shortfalls against real decks of the same
 *            style in the format, and which cards real players prefer for each job
 *            (cards too new to have a track record are never flagged)
 *
 * Notes are advice with numbers. The brewer fixes the deck or answers each
 * note; the coach never picks cards or hands over a list.
 */

export const DECK_KINDS = ["synergy", "combo", "fair"] as const;
export type DeckKind = (typeof DECK_KINDS)[number];

export const PlanInput = z.object({
  format: z.string(),
  kind: z.enum(DECK_KINDS).describe("synergy: wins with lots of similar pieces; combo: one build-around card or two cards that combine (prison locks too); fair: aggro, midrange or control on card quality."),
  alsoKind: z.enum(DECK_KINDS).optional().describe("Second kind, if the deck truly mixes two."),
  thesis: z.string().describe("How the deck wins, in two sentences."),
  style: z.enum(["aggro", "midrange", "control"]).optional().describe("Fair decks: which style."),
  pieces: z
    .array(
      z.object({
        role: z.string().describe("e.g. 'payoff', 'theme', 'combo piece', 'tutor or redundancy'"),
        cards: z.array(z.string()).min(1).describe("Cards that fill this role, alternatives and tutors included."),
        need: z.number().int().min(1).max(8).describe("How many of these must be drawn for the deck to work."),
      }),
    )
    .max(4)
    .optional()
    .describe("Synergy and combo decks: what has to come together."),
  byTurn: z.number().int().min(1).max(8).optional().describe("Synergy and combo decks: the turn it should come together."),
});
export type Plan = z.infer<typeof PlanInput>;

export interface CoachNote {
  /** Stable id the brewer answers by, e.g. "combo-odds" or "fair-interaction". */
  id: string;
  message: string;
}

/** Bars below which the coach speaks up. Judgment calls, stated so they can be argued with. */
export const BARS = { combo: 0.5, synergy: 0.6 };

const isLand = (c: Card | undefined) => !!c && /\bLand\b/.test(c.typeLine.split(" // ")[0]);
const pct = (x: number) => Math.round(x * 100);

function piecesNotes(index: CardIndex, kind: "combo" | "synergy", plan: Plan, main: QtyName[]): CoachNote[] {
  const notes: CoachNote[] = [];
  if (!plan.pieces?.length || !plan.byTurn) {
    return [{ id: `${kind}-plan`, message: `A ${kind} deck needs its pieces and a target turn in declare_plan, so the coach can measure how often it comes together.` }];
  }
  const inDeck = new Map<string, number>();
  for (const l of main) {
    const k = normalizeName(index.getCard(l.name)?.name ?? l.name);
    inDeck.set(k, (inDeck.get(k) ?? 0) + l.qty);
  }
  const copies = plan.pieces.map((p) => p.cards.reduce((n, c) => n + (inDeck.get(normalizeName(index.getCard(c)?.name ?? c)) ?? 0), 0));
  plan.pieces.forEach((p, i) => {
    if (copies[i] < p.need) {
      notes.push({ id: `${kind}-missing-${i}`, message: `"${p.role}" needs ${p.need} drawn, but the deck has only ${copies[i]} of those cards.` });
    }
  });
  const sim = goldfish(index, {
    main,
    engine: plan.pieces.map((p) => ({ name: p.role, cards: p.cards, need: p.need })),
    targetTurn: plan.byTurn,
    games: 4000,
  });
  const odds = (sim.engineSeenByTarget ?? 0) / 100;
  const bar = BARS[kind];
  const parts = plan.pieces.map((p, i) => `${p.need}+ ${p.role} (${copies[i]} in the deck)`).join(", ");
  if (odds < bar) {
    notes.push({
      id: `${kind}-odds`,
      message:
        `You draw ${parts} by turn ${plan.byTurn} in ${pct(odds)}% of games (on the play, mulligans included). ` +
        `A ${kind} deck should get there at least ${pct(bar)}% of the time: add copies, redundancy or ways to find the pieces, or move the target turn and say why.`,
    });
  }
  return notes;
}

interface Profile {
  creatures: number;
  interaction: number;
  cardAdvantage: number;
  avgManaValue: number;
  lands: number;
}

/**
 * Shortfalls the coach flags, by style. Only "too few" of things a deck of that style
 * needs: style labels on real lists are rough (spell-based combo decks read as
 * control), so "too many" and mana value comparisons were noise in testing.
 * Land counts are the checker's job.
 */
const SHORTFALLS: { key: keyof Profile; label: string; styles: string[] }[] = [
  { key: "interaction", label: "interaction (removal, counters, discard, sweepers)", styles: ["aggro", "midrange", "control"] },
  { key: "cardAdvantage", label: "card advantage", styles: ["midrange", "control"] },
  { key: "creatures", label: "creatures", styles: ["aggro", "midrange"] },
];

/** What a deck is made of, by role, from card types and Scryfall function tags. */
export class RoleReader {
  private readonly interaction: Set<string>;
  private readonly advantage: Set<string>;
  private readonly jobs: { job: string; tags: Set<string> }[];
  private readonly cache = new Map<string, Card | undefined>();

  constructor(private readonly index: CardIndex) {
    const tags = (...slugs: string[]) => new Set(slugs.flatMap((s) => [...index.tagWithDescendants(s)]));
    this.interaction = tags("removal", "sweeper", "counterspell", "hand-disruption");
    this.advantage = tags("card-advantage");
    this.jobs = [
      { job: "removal", tags: tags("removal", "sweeper") },
      { job: "counterspell", tags: tags("counterspell") },
      { job: "discard", tags: tags("hand-disruption") },
      { job: "card advantage", tags: this.advantage },
    ];
  }

  card(name: string): Card | undefined {
    if (!this.cache.has(name)) this.cache.set(name, this.index.getCard(name));
    return this.cache.get(name);
  }

  /** The first job a card does, of the jobs the coach compares. */
  job(card: Card): string | null {
    return this.jobs.find((j) => card.tags.some((t) => j.tags.has(t)))?.job ?? null;
  }

  jobTags(job: string): Set<string> {
    return this.jobs.find((j) => j.job === job)!.tags;
  }

  profile(main: QtyName[]): Profile {
    const p: Profile = { creatures: 0, interaction: 0, cardAdvantage: 0, avgManaValue: 0, lands: 0 };
    let spells = 0;
    let mv = 0;
    for (const l of main) {
      const c = this.card(l.name);
      if (!c) continue;
      if (isLand(c)) {
        p.lands += l.qty;
        continue;
      }
      spells += l.qty;
      mv += c.cmc * l.qty;
      if (/\bCreature\b/.test(c.typeLine.split(" // ")[0])) p.creatures += l.qty;
      if (c.tags.some((t) => this.interaction.has(t))) p.interaction += l.qty;
      if (c.tags.some((t) => this.advantage.has(t))) p.cardAdvantage += l.qty;
    }
    p.avgManaValue = spells ? Math.round((mv / spells) * 100) / 100 : 0;
    return p;
  }
}

/** Style of a real list, from its shape: cheap and creature-heavy is aggro, few creatures is control. */
export function styleOf(p: Profile): "aggro" | "midrange" | "control" {
  if (p.creatures <= 8) return "control";
  if (p.avgManaValue <= 2.3 && p.creatures >= 14) return "aggro";
  return "midrange";
}

const quantile = (xs: number[], q: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * (s.length - 1))))];
};

/** Per data source and format: role profiles of recent lists and main deck play share per card. */
const formatCache = new WeakMap<DataSource, Map<string, { profiles: Profile[]; share: Map<string, number>; newest: string; staples: Set<string> }>>();

function formatStats(reader: RoleReader, index: CardIndex, data: DataSource, format: string) {
  let byFormat = formatCache.get(data);
  if (!byFormat) formatCache.set(data, (byFormat = new Map()));
  const hit = byFormat.get(format);
  if (hit) return hit;
  const lists: RefList[] = data.recentLists(format);
  const profiles = lists.map((l) => reader.profile(l.main));
  const count = new Map<string, number>();
  for (const l of lists) {
    for (const k of new Set(l.main.map((c) => normalizeName(index.getCard(c.name)?.name ?? c.name)))) count.set(k, (count.get(k) ?? 0) + 1);
  }
  const share = new Map([...count].map(([k, n]) => [k, n / Math.max(1, lists.length)]));
  const newest = lists.reduce((d, l) => (l.date > d ? l.date : d), "0000-00-00");
  // Staples: in 60%+ of some strategy's lists (5+ lists) over the last year. A rare deck's own
  // pieces have low format-wide share because the deck is rare, not because they're weak.
  const staples = new Set<string>();
  const byStrategy = new Map<string, RefList[]>();
  for (const l of data.recentLists(format, { days: 365 })) byStrategy.set(l.strategy, [...(byStrategy.get(l.strategy) ?? []), l]);
  for (const ls of byStrategy.values()) {
    if (ls.length < 5) continue;
    const n = new Map<string, number>();
    for (const l of ls) for (const k of new Set(l.main.map((c) => normalizeName(index.getCard(c.name)?.name ?? c.name)))) n.set(k, (n.get(k) ?? 0) + 1);
    for (const [k, c] of n) if (c / ls.length >= 0.6) staples.add(k);
  }
  const stats = { profiles, share, newest, staples };
  byFormat.set(format, stats);
  return stats;
}

function fairNotes(index: CardIndex, data: DataSource, format: string, plan: Plan, main: QtyName[], request: string, skipStaples = false): CoachNote[] {
  const reader = new RoleReader(index);
  const stats = formatStats(reader, index, data, format);
  const notes: CoachNote[] = [];
  const style = plan.style ?? "midrange";
  const deck = reader.profile(main);

  // 1. Principles: where this deck sits among real decks of its style in the format.
  let peers = stats.profiles.filter((p) => styleOf(p) === style);
  let peerLabel = `${style} decks in recent ${format} results`;
  if (peers.length < 30) {
    peers = stats.profiles;
    peerLabel = `decks in recent ${format} results (too few ${style} lists to compare by style)`;
  }
  if (peers.length >= 30) {
    for (const m of SHORTFALLS.filter((x) => x.styles.includes(style))) {
      const xs = peers.map((p) => p[m.key]);
      const v = deck[m.key];
      if (v < quantile(xs, 0.1)) {
        notes.push({
          id: `fair-${m.key}`,
          message: `${m.label}: this deck has ${v}; most ${peerLabel} have ${quantile(xs, 0.25)}-${quantile(xs, 0.75)} (${peers.length} lists). Fewer than 9 in 10 of them: add some, or say why this deck needs fewer.`,
        });
      }
    }
  }

  // 2. Card quality: for each job (removal, counters, discard, card advantage), cards real
  // players choose far more often at a similar cost in the deck's colors.
  const deckNames = new Set(main.map((l) => normalizeName(reader.card(l.name)?.name ?? l.name)));
  const colors = new Set<string>();
  for (const l of main) {
    const c = reader.card(l.name);
    if (c && !isLand(c)) for (const m of c.manaCost.split(" // ")[0].matchAll(/\{([WUBRG])/g)) colors.add(m[1]);
  }
  const castable = (c: Card) => [...c.manaCost.split(" // ")[0].matchAll(/\{([WUBRG])/g)].every((m) => colors.has(m[1]));
  // A card printed in the last 90 days has no track record yet: low play share says nothing
  // about it, and new cards are often what a brew is built around.
  const newest = stats.newest;
  const tooNew = (c: Card) => !!c.released && Date.parse(newest) - Date.parse(c.released) < 90 * 86_400_000;
  // Cards the player asked for are the point of the deck, whatever their play share.
  const asked = request.toLowerCase();
  const named = (c: Card) => [c.name, ...(c.faces ?? [])].some((n) => asked.includes(n.toLowerCase()));
  const isCreature = (c: Card) => /\bCreature\b/.test(c.typeLine.split(" // ")[0]);
  const quality: { gap: number; note: CoachNote }[] = [];
  for (const l of main) {
    const card = reader.card(l.name);
    if (!card || isLand(card) || tooNew(card) || named(card)) continue;
    if (skipStaples && stats.staples.has(normalizeName(card.name))) continue;
    const job = reader.job(card);
    if (!job) continue;
    const mine = stats.share.get(normalizeName(card.name)) ?? 0;
    if (mine >= 0.03) continue;
    const tags = reader.jobTags(job);
    const better = index.cards
      .filter((c) => c.name !== card.name && !deckNames.has(normalizeName(c.name)) && !isLand(c))
      .filter((c) => (c.legal[format] === "legal" || c.legal[format] === "restricted") && Math.abs(c.cmc - card.cmc) <= 1 && castable(c))
      // Like for like: a creature that draws a card isn't replaced by a draw spell.
      .filter((c) => isCreature(c) === isCreature(card))
      .filter((c) => c.tags.some((t) => tags.has(t)))
      .map((c) => ({ name: c.name, share: stats.share.get(normalizeName(c.name)) ?? 0 }))
      .filter((c) => c.share >= 0.15)
      .sort((a, b) => b.share - a.share)
      .slice(0, 2);
    if (!better.length) continue;
    quality.push({
      gap: better[0].share - mine,
      note: {
        id: `fair-card-${normalizeName(card.name)}`,
        message: `${card.name} (${job}): in ${pct(mine)}% of recent ${format} decks. At a similar cost in your colors, players choose ${better.map((b) => `${b.name} (${pct(b.share)}%)`).join(" or ")}. Keep it only if it does something specific for this deck, and say what.`,
      },
    });
  }
  quality.sort((a, b) => b.gap - a.gap);
  return [...notes, ...quality.slice(0, 4).map((q) => q.note)];
}

/** Per data source and format: for each card, the indexes of last year's lists that play it. */
const partnerCache = new WeakMap<DataSource, Map<string, { lists: string[][]; strategy: string[]; byCard: Map<string, number[]> }>>();

/**
 * Cards out of context. A card that real lists play almost only alongside a
 * partner (Vision Charm with Phyrexian Dreadnought) is usually doing a job
 * that needs the partner; without it, the card is probably here for the wrong
 * reason. Partners that are generic staples (in a quarter of all lists) don't count.
 */
export function partnerNotes(index: CardIndex, data: DataSource, format: string, main: QtyName[], request = ""): CoachNote[] {
  const canon = (n: string) => normalizeName(index.getCard(n)?.name ?? n);
  const isLandName = (n: string) => isLand(index.getCard(n));
  let byFormat = partnerCache.get(data);
  if (!byFormat) partnerCache.set(data, (byFormat = new Map()));
  let fmt = byFormat.get(format);
  if (!fmt) {
    const raw = data.recentLists(format, { days: 365 });
    const lists = raw.map((l) => [...new Set(l.main.filter((c) => !isLandName(c.name)).map((c) => canon(c.name)))]);
    const byCard = new Map<string, number[]>();
    lists.forEach((l, i) => {
      for (const k of l) {
        const xs = byCard.get(k);
        if (xs) xs.push(i);
        else byCard.set(k, [i]);
      }
    });
    fmt = { lists, strategy: raw.map((l) => l.strategy), byCard };
    byFormat.set(format, fmt);
  }
  const total = Math.max(1, fmt.lists.length);
  const asked = request.toLowerCase();
  const inDeck = new Set(main.map((l) => canon(l.name)));
  // Cards with a general job stand on their own; only narrow cards can be out of context.
  const reader = new RoleReader(index);
  const ramp = new Set([...index.tagWithDescendants("ramp"), ...index.tagWithDescendants("mana-dork"), ...index.tagWithDescendants("mana-rock")]);
  const hasGeneralJob = (c: Card) => reader.job(c) !== null || c.tags.some((t) => ramp.has(t)) || (c.producedMana?.length ?? 0) > 0;
  const notes: CoachNote[] = [];
  for (const l of main) {
    const card = index.getCard(l.name);
    if (!card || isLand(card) || hasGeneralJob(card)) continue;
    if ([card.name, ...(card.faces ?? [])].some((n) => asked.includes(n.toLowerCase()))) continue;
    const mine = fmt.byCard.get(canon(card.name)) ?? [];
    if (mine.length < 8) continue;
    // Only an archetype's own card: 80%+ of the lists that run it are one strategy.
    const strat = new Map<string, number>();
    for (const i of mine) strat.set(fmt.strategy[i], (strat.get(fmt.strategy[i]) ?? 0) + 1);
    const [home, homeCount] = [...strat].sort((a, b) => b[1] - a[1])[0];
    if (homeCount / mine.length < 0.8) continue;
    const co = new Map<string, number>();
    for (const i of mine) for (const k of fmt.lists[i]) if (k !== canon(card.name)) co.set(k, (co.get(k) ?? 0) + 1);
    const partner = [...co]
      .map(([k, n]) => ({ k, given: n / mine.length, base: (fmt!.byCard.get(k)?.length ?? 0) / total }))
      .filter((x) => x.given >= 0.8 && x.base <= 0.25 && x.given / Math.max(x.base, 0.001) >= 3 && !inDeck.has(x.k))
      .sort((a, b) => b.given - a.given)[0];
    if (!partner) continue;
    const pname = index.getCard(partner.k)?.name ?? partner.k;
    notes.push({
      id: `partner-${canon(card.name)}`,
      message: `${card.name}: ${Math.round((homeCount / mine.length) * 100)}% of the ${mine.length} ${format} lists that run it are ${home}, and ${Math.round(partner.given * 100)}% play it alongside ${pname}, which this deck doesn't have. It's usually there for a job that needs ${pname}. Cut it, or say what it does here.`,
    });
  }
  return notes.slice(0, 4);
}

/**
 * Every note the coach has for this deck and plan. Empty means the coach is satisfied.
 * `request` is the player's message: cards it names are never questioned.
 */
export function coachNotes(index: CardIndex, data: DataSource, format: string, plan: Plan, main: QtyName[], request = "", opts: { skipStaples?: boolean } = {}): CoachNote[] {
  const kinds = [plan.kind, ...(plan.alsoKind && plan.alsoKind !== plan.kind ? [plan.alsoKind] : [])];
  return kinds.flatMap((k) =>
    k === "fair" ? (data.hasFormat(format) ? fairNotes(index, data, format, plan, main, request, opts.skipStaples) : []) : piecesNotes(index, k, plan, main),
  );
}
