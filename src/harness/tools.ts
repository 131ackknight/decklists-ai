import { z } from "zod";
import type { CardIndex } from "@/cards/card-index";
import { getFormat } from "@/cards/formats";
import { normalizeName } from "@/cards/names";
import { SearchCardsInput, searchCards } from "@/cards/search";
import { compareToArchetype } from "@/checker/archetype-mana";
import { checkDeck, type CheckResult } from "@/checker/check";
import { cardsSeen, probAtLeast, probEachGroup } from "@/checker/odds";
import type { DataSource, QtyName } from "@/data/source";
import { goldfish } from "@/sim/goldfish";

/** State shared by one brew's tool calls. */
export interface ToolContext {
  index: CardIndex;
  data: DataSource;
  /** Normalized names of every card a tool has returned this session. */
  seen: Set<string>;
  submitted: SubmittedDeck | null;
}

export interface SubmittedDeck {
  format: string;
  main: QtyName[];
  side: QtyName[];
  commander: QtyName[];
  label: "stock" | "tuned" | "brew";
  donor: string | null;
  warnings: string[];
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
      const summary = checkSummary(result);
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
    name: "submit_deck",
    description:
      "Submit the final deck. Rejected if it has rule errors or names a card no tool returned this session (look those up with card_info first). Label it stock (a proven list), tuned (a proven list with changes), or brew (built around new ideas).",
    schema: DeckInput.extend({
      label: z.enum(["stock", "tuned", "brew"]),
      donor: z.string().optional().describe("The existing strategy this borrows its shell from, if any."),
    }),
    run: (input, ctx) => {
      const key = formatKey(input.format);
      const unseen = [...input.main, ...input.side, ...input.commander]
        .map((l) => ctx.index.getCard(l.name)?.name ?? l.name)
        .filter((n) => !ctx.seen.has(normalizeName(n)));
      if (unseen.length > 0) {
        return { accepted: false, reason: "These cards were not returned by any tool yet; look them up with card_info.", cards: [...new Set(unseen)] };
      }
      const result = checkDeck(ctx.index, { ...input, format: key });
      if (!result.ok) return { accepted: false, errors: result.errors.map((e) => e.message) };
      ctx.submitted = {
        format: key,
        main: input.main,
        side: input.side,
        commander: input.commander,
        label: input.label,
        donor: input.donor ?? null,
        warnings: result.warnings.map((w) => w.message),
      };
      return { accepted: true, warnings: ctx.submitted.warnings };
    },
  }),
];

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
