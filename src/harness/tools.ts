import { z } from "zod";
import type { CardIndex } from "@/cards/card-index";
import { getFormat } from "@/cards/formats";
import { normalizeName } from "@/cards/names";
import { SearchCardsInput, searchCards } from "@/cards/search";
import { compareToArchetype } from "@/checker/archetype-mana";
import { checkDeck, type CheckResult } from "@/checker/check";
import { cardsSeen, probAtLeast, probEachGroup } from "@/checker/odds";
import type { Card } from "@/cards/types";
import type { DataSource, QtyName } from "@/data/source";
import { goldfish } from "@/sim/goldfish";
import { coachNotes, PlanInput, type CoachNote, type Plan } from "@/coach/coach";

/** State shared by one brew's tool calls. */
export interface ToolContext {
  index: CardIndex;
  data: DataSource;
  /** Normalized names of every card a tool has returned this session. */
  seen: Set<string>;
  submitted: SubmittedDeck | null;
  /** Brew pipeline: the engine plan, once accepted. */
  engine?: EnginePlan | null;
  /** Rules submit_engine and submit_deck enforce in code. */
  lock?: DeckLock;
  /** Harness v4: the declared plan, and how many times the coach has sent a deck back. */
  plan?: Plan | null;
  coachRounds?: number;
  /** The player's message, so the coach never questions cards they named. */
  request?: string;
  /** Harness v10: submit_deck must carry a win line whose cards are all in the deck. */
  requireWinLine?: boolean;
  /** Harness v11: exactly 60 cards in 60-card formats, and build on the shell real decks use for the requested cards (or say why not). */
  strictBrew?: boolean;
  /** The strategy most lists running the requested cards use, from played_with, when it is dominant. */
  dominantShell?: { format: string; strategy: string; lists: number; share: number } | null;
  /** Harness v12: each requested card's enablers must be in the deck in quantity, and outclassed cards get one send-back. */
  requireNeeds?: boolean;
  cardNoteRounds?: number;
}

export interface EnginePlan {
  format: string;
  thesis: string;
  winCondition: string;
  targetTurn: number;
  beats: string[];
  losesTo: string[];
  cards: { name: string; qty: number; role: string }[];
}

export interface DeckLock {
  /** Cards the deck must contain, at least this many copies in the main deck. */
  cards: { name: string; minQty: number }[];
  /** Colors every card's identity must fit inside, from the request. */
  colorsAllowed?: string[] | null;
  /** Format fixed by the request or the engine stage. */
  format?: string | null;
  /** Brews only: reject decks this close to one real list (0-1). */
  maxCopyRate?: number;
  /** Brews only: engine cards must be at least this share of nonland cards (0-1). */
  minEngineShare?: number;
}

export interface SubmittedDeck {
  format: string;
  main: QtyName[];
  side: QtyName[];
  commander: QtyName[];
  label: "stock" | "tuned" | "brew";
  donor: string | null;
  warnings: string[];
  /** Harness v10: the declared line to the win, and how often its cards are all drawn by the declared turn. */
  winLine?: { card: string; does: string }[];
  winTurn?: number;
  winLineDrawnPct?: number;
  /** Harness v12: what each requested card needs, and the cards that provide it. */
  needs?: { for: string; role: string; cards: string[]; copies: number }[];
  cardNotes?: CoachNote[];
  cardNoteResponses?: { id: string; response: string }[];
  /** Harness v4: the plan, the coach's notes on the accepted deck, and the brewer's answers. */
  plan?: Plan | null;
  coach?: { notes: CoachNote[]; responses: { id: string; response: string }[]; rounds: number };
}

interface ToolDef<S extends z.ZodTypeAny> {
  name: string;
  description: string;
  schema: S;
  run: (input: z.infer<S>, ctx: ToolContext) => unknown;
}

const tool = <S extends z.ZodTypeAny>(def: ToolDef<S>) => def;

const Line = z.object({ qty: z.number().int().min(1).max(250), name: z.string().min(1) });

const DeckInput = z.object({
  format: z.string(),
  main: z.array(Line).min(1),
  side: z.array(Line).default([]),
  commander: z.array(Line).default([]).describe("Commander formats only."),
});

function remember(ctx: ToolContext, names: Iterable<string>) {
  for (const n of names) {
    const card = ctx.index.getCard(n);
    ctx.seen.add(normalizeName(card?.name ?? n));
  }
}

function formatKey(raw: string): string {
  const f = getFormat(raw);
  if (!f) throw new Error(`Unknown format "${raw}".`);
  return f.key;
}

const pct = (x: number) => Math.round(x * 1000) / 10;

/** v12: a build-around's enablers, as copies in the deck. One Thran Dynamo is not a plan. */
export const ENABLER_FLOOR = 6;

function checkSummary(result: CheckResult) {
  return {
    ok: result.ok,
    errors: result.errors.map((e) => e.message),
    warnings: result.warnings.map((w) => w.message),
    mana: result.mana && {
      lands: result.mana.lands,
      recommendedLands: result.mana.recommendedLands,
      averageManaValue: result.mana.averageManaValue,
      sources: result.mana.sources,
      curve: result.mana.curve,
    },
  };
}

/** Does a card fit the requested colors? Commander formats use color identity; others the front face's cost, with lands left to the mana checks. */
function fitsColors(card: Card, allowed: string[], format: string): boolean {
  if (getFormat(format)?.commander) return card.identity.every((x) => allowed.includes(x));
  if (/\bLand\b/.test(card.typeLine.split(" // ")[0])) return true;
  const cost = card.manaCost.split(" // ")[0];
  const colors = new Set([...cost.matchAll(/\{([WUBRG])\}/g)].map((m) => m[1]));
  return [...colors].every((x) => allowed.includes(x));
}

const isBasic = (card: Card | undefined) => !!card && /\bBasic\b/.test(card.typeLine);

function lockProblems(ctx: ToolContext, format: string, main: QtyName[], side: QtyName[], commander: QtyName[] = [], label?: string): string[] {
  const lock = ctx.lock;
  if (!lock) return [];
  const problems: string[] = [];
  const count = (name: string) => {
    const want = normalizeName(ctx.index.getCard(name)?.name ?? name);
    return [...main, ...commander].filter((l) => normalizeName(ctx.index.getCard(l.name)?.name ?? l.name) === want).reduce((n, l) => n + l.qty, 0);
  };
  if (lock.format && lock.format !== format) problems.push(`The format is fixed as ${lock.format}.`);
  for (const c of lock.cards) {
    const have = count(c.name);
    if (have < c.minQty) problems.push(`${c.name}: ${have} in the deck; the plan requires at least ${c.minQty}.`);
  }
  if (lock.colorsAllowed) {
    const off = [...main, ...side, ...commander]
      .map((l) => ctx.index.getCard(l.name))
      .filter((c) => c && !fitsColors(c, lock.colorsAllowed!, format))
      .map((c) => c!.name);
    if (off.length) problems.push(`Outside the requested colors (${lock.colorsAllowed.join("") || "colorless"}): ${[...new Set(off)].join(", ")}.`);
  }
  if (lock.minEngineShare != null && ctx.engine) {
    const engineNames = new Set(ctx.engine.cards.map((c) => normalizeName(ctx.index.getCard(c.name)?.name ?? c.name)));
    let spells = 0;
    let engine = 0;
    for (const l of main) {
      const card = ctx.index.getCard(l.name);
      if (!card || /\bLand\b/.test(card.typeLine.split(" // ")[0])) continue;
      spells += l.qty;
      if (engineNames.has(normalizeName(card.name))) engine += l.qty;
    }
    if (spells && engine / spells < lock.minEngineShare) {
      problems.push(`Engine cards are ${engine} of ${spells} nonland cards (${pct(engine / spells)}%); a brew needs at least ${pct(lock.minEngineShare)}% so the requested idea is the deck, not an add-on.`);
    }
  }
  // Copying a proven list is the right answer to a stock request; the limit is for brews.
  if (lock.maxCopyRate != null && label !== "stock") {
    const copy = ctx.data.copyRate(format, main);
    if (copy && copy.rate > lock.maxCopyRate) {
      problems.push(`${pct(copy.rate)}% of this main deck is card for card the ${copy.closest.strategy} list from ${copy.closest.event} (${copy.closest.date}). A brew may borrow a shell but must be at most ${pct(lock.maxCopyRate)}% one existing list.`);
    }
  }
  return problems;
}

export const TOOLS = [
  tool({
    name: "search_cards",
    description:
      "Search every real card by what it does. This is the authority on what exists and what is legal: if a search finds nothing, try other tags or rules text before concluding a card doesn't exist.",
    schema: SearchCardsInput,
    run: (input, ctx) => {
      const result = searchCards(ctx.index, input);
      remember(ctx, result.cards.map((c) => c.name));
      return result;
    },
  }),
  tool({
    name: "find_tags",
    description: "Find function tag names for search_cards, e.g. 'removal' finds removal, sweeper, removal-exile.",
    schema: z.object({ query: z.string().min(2) }),
    run: ({ query }, ctx) =>
      ctx.index.findTags(query, 25).map((t) => ({ tag: t.slug, description: t.description })),
  }),
  tool({
    name: "card_info",
    description:
      "Exact rules text, mana cost, type, legality in a format, and how often the card appears in recent results there. Call it on every card you name that you haven't seen in another tool result.",
    schema: z.object({ format: z.string(), names: z.array(z.string()).min(1).max(80) }),
    run: ({ format, names }, ctx) => {
      const key = formatKey(format);
      return names.map((name) => {
        const card = ctx.index.getCard(name);
        if (!card) return { name, found: false };
        remember(ctx, [card.name]);
        const play = ctx.data.hasFormat(key) ? ctx.data.cardPlayRate(key, card.name) : null;
        return {
          name: card.name,
          found: true,
          manaCost: card.manaCost,
          manaValue: card.cmc,
          type: card.typeLine,
          text: card.text,
          power: card.power,
          toughness: card.toughness,
          legality: card.legal[key] ?? "not legal",
          recentResults: play
            ? { listsLast90Days: play.lists, sharePercent: pct(play.share), topStrategies: play.topStrategies }
            : "no results data for this format",
        };
      });
    },
  }),
  tool({
    name: "meta",
    description:
      "The current field in a format from recent tournament results: strategies by share. Evidence about what is played, not a limit on what can be built. Formats without data return the nearest formats to borrow from.",
    schema: z.object({ format: z.string() }),
    run: ({ format }, ctx) => {
      const f = getFormat(format)!;
      if (!ctx.data.hasFormat(f.key)) return { hasData: false, nearest: f.nearest };
      return {
        hasData: true,
        window: "last 30 days",
        strategies: ctx.data.meta(f.key).slice(0, 20).map((s) => ({ ...s, share: pct(s.share) })),
      };
    },
  }),
  tool({
    name: "archetype",
    description:
      "How an existing strategy is built in recent results: core and flex main deck cards, sideboard frequency, and its land count and colored sources. Use it to borrow a proven shell (mana, interaction) or to tune a list, not to replace what the player asked for.",
    schema: z.object({ format: z.string(), strategy: z.string() }),
    run: ({ format, strategy }, ctx) => {
      const a = ctx.data.archetype(formatKey(format), strategy);
      if (!a) return { found: false, hint: "Use a strategy name exactly as the meta tool returns it." };
      const rows = (xs: typeof a.main, n: number) =>
        xs.slice(0, n).map((c) => ({ name: c.name, adoptionPercent: pct(c.adoption), avgCopies: Math.round(c.avgCopies * 10) / 10 }));
      remember(ctx, [...a.main, ...a.side].map((c) => c.name));
      return {
        strategy: a.strategy,
        lists: a.lists,
        mainDeck: rows(a.main, 45),
        sideboard: rows(a.side, 30),
        mana: a.mana && { lands: a.mana.lands, sources: a.mana.sources },
      };
    },
  }),
  tool({
    name: "reference_list",
    description:
      "The most recent top-finishing list of an existing strategy. Right for a stock request; for tuning or a brew, borrow from it rather than returning it unchanged.",
    schema: z.object({ format: z.string(), strategy: z.string() }),
    run: ({ format, strategy }, ctx) => {
      const l = ctx.data.referenceList(formatKey(format), strategy);
      if (!l) return { found: false };
      remember(ctx, [...l.main, ...l.side, ...l.commander].map((c) => c.name));
      return { event: l.event, date: l.date, place: l.place, record: l.record, main: l.main, side: l.side, commander: l.commander };
    },
  }),
  tool({
    name: "played_with",
    description:
      "What real decks in ANY format play alongside these cards (up to 3): how many lists, which formats and strategies, and the nonland cards most often beside them. The fastest way to learn how a combo or engine is actually built, from the players who run it. Pairings from other formats are evidence of the mechanism, not cards you can use: check legality in the requested format with card_info.",
    schema: z.object({ cards: z.array(z.string()).min(1).max(3) }),
    run: ({ cards }, ctx) => {
      const r = ctx.data.playedWith(cards);
      if (!r) return { lists: 0, note: "No published list in the last 400 days plays all of these together." };
      remember(ctx, r.cards.map((c) => c.name));
      // v11: when most of those lists are one strategy, a brew should start from its shell.
      const top = r.strategies[0];
      if (ctx.strictBrew && top && r.lists >= 5 && top.lists / r.lists >= 0.6) {
        ctx.dominantShell = { format: top.format, strategy: top.strategy, lists: top.lists, share: top.lists / r.lists };
      }
      return { ...r, cards: r.cards.map((c) => ({ name: c.name, inPercentOfLists: pct(c.share), avgCopies: c.avgCopies })) };
    },
  }),
  tool({
    name: "draw_odds",
    description:
      "Exact draw odds with no mulligans: chance to have at least one card from each group by a turn. Use it to size engines and to give honest odds.",
    schema: z.object({
      deckSize: z.number().int().min(40).max(250).default(60),
      groups: z.array(z.object({ name: z.string(), copies: z.number().int().min(0) })).min(1).max(4),
      turn: z.number().int().min(1).max(10),
      onPlay: z.boolean().default(true),
    }),
    run: ({ deckSize, groups, turn, onPlay }) => {
      const n = cardsSeen(turn, onPlay);
      return {
        cardsSeen: n,
        each: groups.map((g) => ({ name: g.name, percent: pct(probAtLeast(deckSize, g.copies, n, 1)) })),
        allTogetherPercent: pct(probEachGroup(deckSize, groups.map((g) => g.copies), n)),
      };
    },
  }),
  tool({
    name: "simulate",
    description:
      "Play the deck's opening turns 5,000 times (land drops, colored mana, mulligans; no card abilities beyond making mana). Reports mulligan rate, land drops, color problems, and how often each engine group is in hand and castable by the target turn. Pass compareTo with a real strategy to get the same numbers for its latest top list. Cite these numbers instead of guessing about consistency or speed.",
    schema: z.object({
      format: z.string(),
      main: z.array(Line).min(1),
      engine: z.array(z.object({ name: z.string(), cards: z.array(z.string()).min(1) })).max(4).optional(),
      targetTurn: z.number().int().min(1).max(8).optional(),
      compareTo: z.string().optional(),
    }),
    run: ({ format, main, engine, targetTurn, compareTo }, ctx) => {
      const result = goldfish(ctx.index, { main, engine, targetTurn });
      if (!compareTo) return result;
      const ref = ctx.data.referenceList(formatKey(format), compareTo);
      return {
        ...result,
        realDeck: ref ? { strategy: compareTo, event: ref.event, date: ref.date, ...goldfish(ctx.index, { main: ref.main }) } : "no list for that strategy",
      };
    },
  }),
  tool({
    name: "check_deck",
    description:
      "Check a draft: legality, size, copies, commander rules, land count and colored sources. Pass compareTo with the strategy whose mana you borrowed to compare against real lists of it.",
    schema: DeckInput.extend({ compareTo: z.string().optional() }),
    run: (input, ctx) => {
      const key = formatKey(input.format);
      const result = checkDeck(ctx.index, { ...input, format: key });
      const summary: Record<string, unknown> = checkSummary(result);
      // With a copy limit in force, say how much of the deck is one existing list, so a brew can stay its own.
      if (ctx.lock?.maxCopyRate != null) {
        const copy = ctx.data.copyRate(key, input.main);
        if (copy) {
          summary.copy = {
            percentOfOneExistingList: pct(copy.rate),
            closest: copy.closest,
            brewLimitPercent: pct(ctx.lock.maxCopyRate),
          };
        }
      }
      if (input.compareTo && result.mana) {
        const a = ctx.data.archetype(key, input.compareTo);
        if (a?.mana) {
          return {
            ...summary,
            versusArchetype: {
              strategy: a.strategy,
              lists: a.lists,
              realLands: a.mana.lands,
              realSources: a.mana.sources,
              issues: compareToArchetype(result.mana, a.mana).map((i) => i.message),
            },
          };
        }
      }
      return summary;
    },
  }),
  tool({
    name: "submit_engine",
    description:
      "Brew pipeline: submit the game plan and the engine (enablers, payoffs, redundant copies) before any shell is added. Every card must have come from a tool, be legal, fit the requested colors, and include every card the player named. The engine is locked after this: later stages can't cut it.",
    schema: z.object({
      format: z.string(),
      thesis: z.string().describe("How the deck wins, in two sentences."),
      winCondition: z.string(),
      targetTurn: z.number().int().min(1).max(10).describe("The turn the engine should be assembled and working."),
      beats: z.array(z.string()),
      losesTo: z.array(z.string()),
      cards: z
        .array(z.object({ name: z.string(), qty: z.number().int().min(1).max(4), role: z.enum(["enabler", "payoff", "redundancy", "protection", "other"]) }))
        .min(1)
        .max(30),
    }),
    run: (input, ctx) => {
      const key = formatKey(input.format);
      const problems: string[] = [];
      if (ctx.lock?.format && ctx.lock.format !== key) problems.push(`The format is fixed as ${ctx.lock.format}.`);
      const unseen = input.cards
        .filter((c) => !isBasic(ctx.index.getCard(c.name)))
        .map((c) => ctx.index.getCard(c.name)?.name ?? c.name)
        .filter((n) => !ctx.seen.has(normalizeName(n)));
      if (unseen.length) problems.push(`Look these up first with card_info or search_cards: ${unseen.join(", ")}.`);
      const rules = getFormat(key)!;
      for (const c of input.cards) {
        const card = ctx.index.getCard(c.name);
        const status = card?.legal[key];
        const basic = card && /\bBasic\b/.test(card.typeLine);
        if (card && !basic && c.qty > rules.maxCopies) problems.push(`${card.name}: ${rules.name} allows ${rules.maxCopies} cop${rules.maxCopies === 1 ? "y" : "ies"}.`);
        if (card && status !== "legal" && status !== "restricted") problems.push(`${card.name} is not legal in ${key}.`);
        if (card && status === "restricted" && c.qty > 1) problems.push(`${card.name} is restricted in ${key}: 1 copy.`);
        if (card && ctx.lock?.colorsAllowed && !fitsColors(card, ctx.lock.colorsAllowed, key)) {
          problems.push(`${card.name} is outside the requested colors.`);
        }
      }
      for (const req of ctx.lock?.cards ?? []) {
        const want = normalizeName(ctx.index.getCard(req.name)?.name ?? req.name);
        if (!input.cards.some((c) => normalizeName(ctx.index.getCard(c.name)?.name ?? c.name) === want)) {
          problems.push(`The player named ${req.name}; it must be part of the engine.`);
        }
      }
      if (problems.length) return { accepted: false, problems };
      ctx.engine = { ...input, format: key };
      ctx.lock = {
        ...(ctx.lock ?? { cards: [] }),
        format: key,
        cards: input.cards.map((c) => ({ name: ctx.index.getCard(c.name)?.name ?? c.name, minQty: c.qty })),
      };
      return { accepted: true, locked: ctx.lock.cards };
    },
  }),
  tool({
    name: "declare_plan",
    description:
      "Harness v4: say what kind of deck you are building before you submit it. synergy: lots of similar pieces (tribal, artifacts, spells matter); combo: one build-around card or two cards that combine (prison locks too); fair: aggro, midrange or control. For synergy and combo, list the pieces that must come together and the turn. The coach measures the deck against this plan. Call it again to change the plan.",
    schema: PlanInput,
    run: (input, ctx) => {
      const key = formatKey(input.format);
      if ((input.kind === "synergy" || input.kind === "combo") && (!input.pieces?.length || !input.byTurn)) {
        return { accepted: false, problems: [`A ${input.kind} plan needs pieces (with how many must be drawn) and byTurn.`] };
      }
      ctx.plan = { ...input, format: key };
      return {
        accepted: true,
        checks:
          input.kind === "fair"
            ? "Counts of creatures, interaction, card advantage, mana value and lands against real decks of this style; cards real players choose far more often for the same job."
            : "How often the pieces are drawn by the target turn, mulligans included.",
      };
    },
  }),
  tool({
    name: "coach_check",
    description: "Harness v4: the coach's notes on a draft against the declared plan, without submitting. Each note has an id; fix the deck or answer the note in submit_brew.",
    schema: z.object({ format: z.string(), main: z.array(Line).min(1) }),
    run: ({ format, main }, ctx) => {
      if (!ctx.plan) return { notes: [], problem: "Call declare_plan first." };
      const notes = coachNotes(ctx.index, ctx.data, formatKey(format), ctx.plan, main, ctx.request);
      return { notes, satisfied: notes.length === 0 };
    },
  }),
  tool({
    name: "submit_brew",
    description:
      "Harness v4: submit the final deck. Same rules as a legal submission (every card looked up, no rule errors), and for tuned decks and brews the coach checks it against your declared plan. If the coach has notes, the deck comes back with them: fix the deck, or answer every note by id in coachResponses saying why it doesn't apply. Label it stock, tuned or brew.",
    schema: DeckInput.extend({
      label: z.enum(["stock", "tuned", "brew"]),
      donor: z.string().optional().describe("The existing strategy this borrows its shell from, if any."),
      coachResponses: z
        .array(z.object({ id: z.string(), response: z.string().min(10) }))
        .optional()
        .describe("Your answer to each coach note you chose not to fix, by note id."),
    }),
    run: (input, ctx) => {
      const key = formatKey(input.format);
      const legal = legalSubmission(ctx, key, input);
      if (!legal.ok) return { accepted: false, ...legal.body };
      let notes: CoachNote[] = [];
      const responses = input.coachResponses ?? [];
      if (input.label !== "stock") {
        if (!ctx.plan) return { accepted: false, errors: ["Call declare_plan first: the coach checks the deck against it."] };
        notes = coachNotes(ctx.index, ctx.data, key, ctx.plan, input.main, ctx.request);
        const answered = new Set(responses.map((r) => r.id));
        const open = notes.filter((n) => !answered.has(n.id));
        // The coach sends a deck back at most twice, so a disagreement can't loop forever.
        if (open.length && (ctx.coachRounds ?? 0) < 2) {
          ctx.coachRounds = (ctx.coachRounds ?? 0) + 1;
          return { accepted: false, coachNotes: open, howToProceed: "Fix the deck, or answer each note by id in coachResponses." };
        }
      }
      ctx.submitted = {
        format: key,
        main: input.main,
        side: input.side,
        commander: input.commander,
        label: input.label,
        donor: input.donor ?? null,
        warnings: legal.warnings,
        plan: ctx.plan ?? null,
        coach: { notes, responses, rounds: ctx.coachRounds ?? 0 },
      };
      return { accepted: true, warnings: legal.warnings };
    },
  }),
  tool({
    name: "submit_deck",
    description:
      "Submit the final deck. Rejected if it has rule errors or names a card no tool returned this session (look those up with card_info first). Label it stock (a proven list), tuned (a proven list with changes), or brew (built around new ideas).",
    schema: DeckInput.extend({
      label: z.enum(["stock", "tuned", "brew"]),
      donor: z.string().optional().describe("The existing strategy this borrows its shell from, if any."),
      winLine: z
        .array(z.object({ card: z.string(), does: z.string().min(3) }))
        .min(1)
        .max(8)
        .optional()
        .describe("The exact sequence of named cards from this deck that wins the game, in order, with what each one does in the line."),
      winTurn: z.number().int().min(1).max(10).optional().describe("The turn the line is meant to be complete."),
      shellReason: z.string().optional().describe("If real decks mostly run the requested cards in one strategy and you built something else: why, in one or two sentences."),
      needs: z
        .array(z.object({ for: z.string(), role: z.string().min(3), cards: z.array(z.string()).min(1), copies: z.number().int().min(1) }))
        .max(6)
        .optional()
        .describe("For each card the player asked for: what it needs around it to do its job (the role), the cards in this deck that provide it, and how many copies of them the deck runs."),
      needsReason: z.string().optional().describe("If a requested card's enablers are fewer than the floor: why that is enough here."),
      cardNoteResponses: z.array(z.object({ id: z.string(), response: z.string().min(5) })).optional().describe("Answers to card notes from a previous submission, by id, for cards you kept."),
    }),
    run: (input, ctx) => {
      const key = formatKey(input.format);
      if (ctx.strictBrew && input.label !== "stock") {
        // Exactly 60 in 60-card formats: real lists are 60 cards 91-99% of the time; 62 means the choosing isn't finished.
        const rules = getFormat(key)!;
        const size = input.main.reduce((n, l) => n + l.qty, 0);
        const asked = /\b(6[1-9]|7\d|8\d|9\d|1\d\d) cards?\b/i.test(ctx.request ?? "");
        if (!rules.commander && size > rules.mainSize && !asked) {
          return { accepted: false, errors: [`${size} cards in the main deck. Real ${rules.name} lists are ${rules.mainSize} cards almost without exception: cut to ${rules.mainSize} unless the player asked for more.`] };
        }
        // v12: enablers in quantity. Every card the player named must have a needs entry, its cards in the deck, and enough copies.
        if (ctx.requireNeeds) {
          const asked = (ctx.request ?? "").toLowerCase();
          const named = [...new Set(input.main.map((l) => ctx.index.getCard(l.name)?.name ?? l.name))].filter((n) => n.length > 3 && asked.includes(n.toLowerCase()));
          const needs = input.needs ?? [];
          const canonN = (n: string) => normalizeName(ctx.index.getCard(n)?.name ?? n);
          const missingFor = named.filter((n) => !needs.some((x) => canonN(x.for) === canonN(n)));
          if (!needs.length || missingFor.length) {
            return {
              accepted: false,
              errors: [`State needs for each card the player asked for${missingFor.length ? ` (missing: ${missingFor.join(", ")})` : ""}: the role it needs filled, the cards in this deck that fill it, and their copies.`],
            };
          }
          const count = (name: string) => input.main.filter((l) => canonN(l.name) === canonN(name)).reduce((n, l) => n + l.qty, 0);
          for (const x of needs) {
            const absent = x.cards.filter((c) => count(c) === 0);
            if (absent.length) return { accepted: false, errors: [`needs for ${x.for} (${x.role}) names cards not in the main deck: ${absent.join(", ")}.`] };
            const have = x.cards.reduce((n, c) => n + count(c), 0);
            if (have < ENABLER_FLOOR && !input.needsReason) {
              return {
                accepted: false,
                errors: [`${x.for} needs "${x.role}", and the deck has ${have} cop${have === 1 ? "y" : "ies"} of the cards that provide it (${x.cards.join(", ")}). A build-around's enablers are usually ${ENABLER_FLOOR}+ copies: add some, or resubmit with needsReason saying why ${have} is enough here.`],
              };
            }
          }
          // Card quality, once: cards real players choose far more often for the same job at the same cost.
          const answered = new Set((input.cardNoteResponses ?? []).map((r) => r.id));
          const notes = coachNotes(ctx.index, ctx.data, key, { format: key, kind: "fair", thesis: "", style: "midrange" }, input.main, ctx.request).filter(
            (n) => n.id.startsWith("fair-card-") && !answered.has(n.id),
          );
          if (notes.length && (ctx.cardNoteRounds ?? 0) < 1) {
            ctx.cardNoteRounds = (ctx.cardNoteRounds ?? 0) + 1;
            return { accepted: false, cardNotes: notes, howToProceed: "Swap the card, or resubmit with cardNoteResponses saying why it stays (by note id)." };
          }
        }
        const shell = ctx.dominantShell;
        if (shell && shell.format === key && !input.shellReason) {
          const ref = ctx.data.referenceList(key, shell.strategy);
          if (ref) {
            const canon = (n: string) => normalizeName(ctx.index.getCard(n)?.name ?? n);
            const theirs = new Map<string, number>();
            for (const c of ref.main) theirs.set(canon(c.name), (theirs.get(canon(c.name)) ?? 0) + c.qty);
            let shared = 0;
            for (const l of input.main) shared += Math.min(l.qty, theirs.get(canon(l.name)) ?? 0);
            if (shared / 60 < 0.35) {
              return {
                accepted: false,
                errors: [
                  `${Math.round(shell.share * 100)}% of the real lists that run the requested cards are ${shell.strategy} (${shell.lists} lists), and this deck shares only ${shared} of 60 cards with its latest list. Build on that shell, or resubmit with shellReason saying why this deck should be something else.`,
                ],
                shellList: { strategy: shell.strategy, event: ref.event, date: ref.date, main: ref.main },
              };
            }
          }
        }
      }
      // Harness v10: a brew has to say how it wins, and the line has to be in the deck.
      let winLineDrawnPct: number | undefined;
      if (ctx.requireWinLine && input.label !== "stock") {
        if (!input.winLine?.length) {
          return { accepted: false, errors: ["State the win line: the sequence of named cards from this deck that wins the game, with what each does (winLine), and the turn it is meant to be complete (winTurn)."] };
        }
        const inDeck = (name: string) => {
          const want = normalizeName(ctx.index.getCard(name)?.name ?? name);
          return [...input.main, ...input.commander].some((l) => normalizeName(ctx.index.getCard(l.name)?.name ?? l.name) === want);
        };
        const missing = input.winLine.filter((step) => !inDeck(step.card)).map((step) => step.card);
        if (missing.length) {
          return { accepted: false, errors: [`The win line names cards that are not in the main deck: ${[...new Set(missing)].join(", ")}. Add them or change the line.`] };
        }
        const groups = [...new Set(input.winLine.map((step) => ctx.index.getCard(step.card)?.name ?? step.card))].map((card) => ({ name: card, cards: [card], need: 1 }));
        winLineDrawnPct = goldfish(ctx.index, { main: input.main, engine: groups, targetTurn: input.winTurn ?? 5, games: 3000 }).engineSeenByTarget ?? undefined;
      }
      const unseen = [...input.main, ...input.side, ...input.commander]
        .filter((l) => !isBasic(ctx.index.getCard(l.name)))
        .map((l) => ctx.index.getCard(l.name)?.name ?? l.name)
        .filter((n) => !ctx.seen.has(normalizeName(n)));
      if (unseen.length > 0) {
        return { accepted: false, reason: "These cards were not returned by any tool yet; look them up with card_info.", cards: [...new Set(unseen)] };
      }
      const result = checkDeck(ctx.index, { ...input, format: key });
      const problems = lockProblems(ctx, key, input.main, input.side, input.commander, input.label);
      if (!result.ok || problems.length) {
        return { accepted: false, errors: [...result.errors.map((e) => e.message), ...problems] };
      }
      ctx.submitted = {
        format: key,
        main: input.main,
        side: input.side,
        commander: input.commander,
        label: input.label,
        donor: input.donor ?? null,
        warnings: result.warnings.map((w) => w.message),
        ...(input.winLine ? { winLine: input.winLine, winTurn: input.winTurn, winLineDrawnPct } : {}),
        ...(input.needs ? { needs: input.needs, cardNoteResponses: input.cardNoteResponses } : {}),
      };
      return {
        accepted: true,
        warnings: ctx.submitted.warnings,
        ...(winLineDrawnPct != null
          ? { winLine: { allCardsDrawnByTurnPct: winLineDrawnPct, turn: input.winTurn ?? 5, note: "Share of games (mulligans included) where every card in the line has been drawn by that turn. Tutors and card draw are not simulated; a low number with tutors in the deck may be fine. Reported, not enforced." } }
          : {}),
      };
    },
  }),
];

/** The submission rules every harness shares: every card looked up, no rule errors, locks respected. */
function legalSubmission(
  ctx: ToolContext,
  key: string,
  input: { main: QtyName[]; side: QtyName[]; commander: QtyName[] },
): { ok: true; warnings: string[] } | { ok: false; body: Record<string, unknown> } {
  const unseen = [...input.main, ...input.side, ...input.commander]
    .filter((l) => !isBasic(ctx.index.getCard(l.name)))
    .map((l) => ctx.index.getCard(l.name)?.name ?? l.name)
    .filter((n) => !ctx.seen.has(normalizeName(n)));
  if (unseen.length > 0) {
    return { ok: false, body: { reason: "These cards were not returned by any tool yet; look them up with card_info.", cards: [...new Set(unseen)] } };
  }
  const result = checkDeck(ctx.index, { ...input, format: key });
  const problems = lockProblems(ctx, key, input.main, input.side, input.commander);
  if (!result.ok || problems.length) return { ok: false, body: { errors: [...result.errors.map((e) => e.message), ...problems] } };
  return { ok: true, warnings: result.warnings.map((w) => w.message) };
}

export type ToolName = (typeof TOOLS)[number]["name"];

/** Tool definitions for the Messages API, optionally limited to some tools. */
export function toolParams(only?: readonly string[]) {
  return TOOLS.filter((t) => !only || only.includes(t.name)).map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: z.toJSONSchema(t.schema, { io: "input" }) as { type: "object"; [k: string]: unknown },
  }));
}

/** Validate and run one tool call; errors come back as text for the model. */
export function runTool(
  name: string,
  rawInput: unknown,
  ctx: ToolContext,
  only?: readonly string[],
): { content: string; isError: boolean } {
  if (only && !only.includes(name)) return { content: `The ${name} tool is not available at this stage.`, isError: true };
  const t = TOOLS.find((x) => x.name === name);
  if (!t) return { content: `Unknown tool ${name}.`, isError: true };
  const parsed = (t.schema as z.ZodTypeAny).safeParse(rawInput);
  if (!parsed.success) return { content: `Invalid input: ${parsed.error.message}`, isError: true };
  try {
    return { content: JSON.stringify((t.run as (i: unknown, c: ToolContext) => unknown)(parsed.data, ctx)), isError: false };
  } catch (err) {
    return { content: (err as Error).message, isError: true };
  }
}
