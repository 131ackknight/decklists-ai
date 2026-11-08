import Anthropic from "@anthropic-ai/sdk";
import type { CardIndex } from "@/cards/card-index";
import { normalizeName } from "@/cards/names";
import { getFormat } from "@/cards/formats";
import type { DataSource } from "@/data/source";
import { costUsd, usageOf, type ModelConfig, type Usage } from "./models";
import { borrowList, borrowText, namedCards } from "./borrow";
import { formatMenu } from "./menu";
import { playtestDeck, type PlaytestReport } from "./playtest";
import { reviewDeck, type Review, type RoleEvidence } from "./review";
import { examplesText, loadBrewerLists, type BrewerList } from "./examples";
import { SYSTEM_PROMPT, V4_SYSTEM_PROMPT, V5_SYSTEM_PROMPT, V6_SYSTEM_PROMPT, V7_SYSTEM_PROMPT, V8_SYSTEM_PROMPT, V9_SYSTEM_PROMPT, V10_SYSTEM_PROMPT, V11_SYSTEM_PROMPT, V12_SYSTEM_PROMPT, V14_SYSTEM_PROMPT, V15_SYSTEM_PROMPT, V16_SYSTEM_PROMPT } from "./prompt";
import { runTool, toolParams, type SubmittedDeck, type ToolContext } from "./tools";

export interface BrewRequest {
  prompt: string;
  /** The format picked in the UI, if any. */
  format?: string | null;
}

export interface ToolCallRecord {
  name: string;
  input: unknown;
  isError: boolean;
  /** For submit_deck and submit_engine: whether it was accepted. */
  accepted?: boolean;
  /** Which pipeline stage made the call. */
  stage?: string;
  /** For rejected submissions: why, so failures can be diagnosed from the results file. */
  rejected?: string[];
}

export interface StageResult {
  text: string;
  toolCalls: ToolCallRecord[];
  usage: Usage;
  steps: number;
  stopReason: string | null;
  error: string | null;
}

export interface BrewResult {
  text: string;
  deck: SubmittedDeck | null;
  /** Harness v17: the reviewer's flags on the first submitted deck, and the deck before revision. */
  review?: { flags: Review["flags"]; firstDeck: SubmittedDeck | null; roles?: RoleEvidence[] };
  /** Harness v19: the playtest's game and top problems, and the deck before revision. */
  playtest?: { opponent: string; seed: number; game: string; problems: PlaytestReport["problems"]; firstDeck: SubmittedDeck | null };
  /** Harness v20: the little-played spells listed up front (borrow.ts). */
  borrow?: string[];
  toolCalls: ToolCallRecord[];
  usage: Usage;
  costUsd: number;
  steps: number;
  stopReason: string | null;
  error: string | null;
  ms: number;
}

export const emptyUsage = (): Usage => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });

export function addUsage(into: Usage, more: Usage) {
  into.input += more.input;
  into.output += more.output;
  into.cacheRead += more.cacheRead;
  into.cacheWrite += more.cacheWrite;
  // A new object, not an update: usage objects are shallow-copied elsewhere ({ ...first.usage }).
  if (more.long) {
    const l = into.long ?? emptyUsage();
    into.long = { input: l.input + more.long.input, output: l.output + more.long.output, cacheRead: l.cacheRead + more.long.cacheRead, cacheWrite: l.cacheWrite + more.long.cacheWrite };
  }
}

/**
 * One tool loop on the Messages API with a given system prompt and toolset.
 * Append-only history, so thinking blocks replay unchanged. Stops when the
 * model answers without calling a tool, or when `done` says the stage's
 * goal is met and the model has written its text.
 */
export async function runStage(opts: {
  client: Anthropic;
  model: ModelConfig;
  system: string;
  userText: string;
  tools?: readonly string[];
  ctx: ToolContext;
  stage?: string;
  maxSteps?: number;
  onStep?: (step: number, note: string) => void;
}): Promise<StageResult> {
  const { client, model, system, userText, ctx, stage } = opts;
  const maxSteps = opts.maxSteps ?? 30;
  const usage = emptyUsage();
  const toolCalls: ToolCallRecord[] = [];
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: userText }];
  const tools = toolParams(opts.tools);
  let text = "";
  let stopReason: string | null = null;
  let error: string | null = null;
  let steps = 0;

  try {
    for (; steps < maxSteps; steps++) {
      const stream = opts.client.messages.stream({
        model: model.id,
        max_tokens: 32000,
        system,
        tools,
        messages,
        cache_control: { type: "ephemeral" },
        ...(model.effort ? { output_config: { effort: "high" as const } } : {}),
      });
      const message = await stream.finalMessage();
      addUsage(usage, usageOf(model, message.usage));
      stopReason = message.stop_reason;
      const said = message.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
      if (said) text += (text ? "\n\n" : "") + said;

      if (message.stop_reason === "refusal") {
        error = "The model declined this request.";
        break;
      }
      const uses = message.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      if (uses.length === 0) break;
      if (message.stop_reason === "max_tokens") {
        error = "A tool call was cut off at max_tokens.";
        break;
      }

      messages.push({ role: "assistant", content: message.content });
      const results: Anthropic.ToolResultBlockParam[] = uses.map((u) => {
        const r = runTool(u.name, u.input, ctx, opts.tools);
        const record: ToolCallRecord = { name: u.name, input: u.input, isError: r.isError, stage };
        if ((u.name === "submit_deck" || u.name === "submit_engine" || u.name === "submit_brew" || u.name === "declare_plan") && !r.isError) {
          const body = JSON.parse(r.content);
          record.accepted = body.accepted === true;
          if (!record.accepted) {
            record.rejected = [
              ...(body.errors ?? []),
              ...(body.problems ?? []),
              ...(body.reason ? [body.reason, ...(body.cards ?? [])] : []),
              ...(body.coachNotes ?? []).map((n: { id: string; message: string }) => `coach ${n.id}: ${n.message}`),
              ...(body.cardNotes ?? []).map((n: { id: string; message: string }) => `card ${n.id}: ${n.message}`),
              ...(body.stapleNote ?? []).map((n: string) => `staple: ${n}`),
            ];
          }
        }
        if (r.isError) record.rejected = [r.content.slice(0, 300)];
        toolCalls.push(record);
        return { type: "tool_result", tool_use_id: u.id, content: r.content, is_error: r.isError || undefined };
      });
      opts.onStep?.(steps + 1, uses.map((u) => u.name).join(", "));
      // All results for one turn go back in a single user message.
      messages.push({ role: "user", content: results });
    }
    if (steps === maxSteps) error = `Stopped after ${maxSteps} steps.`;
  } catch (err) {
    error = err instanceof Anthropic.APIError ? `API ${err.status}: ${err.message}` : (err as Error).message;
  }
  return { text, toolCalls, usage, steps, stopReason, error };
}

/** Harness v2: one loop with every tool and the v2 system prompt. */
export async function brew(
  client: Anthropic,
  model: ModelConfig,
  req: BrewRequest,
  deps: { index: CardIndex; data: DataSource },
  onStep?: (step: number, note: string) => void,
): Promise<BrewResult> {
  const started = Date.now();
  const ctx: ToolContext = { ...deps, seen: new Set(), submitted: null };
  const userText = req.format ? `Format: ${req.format}\n\n${req.prompt}` : req.prompt;
  // v2 never had the simulate tool; keep its toolset fixed so v2 runs stay comparable.
  const V2_TOOLS = ["search_cards", "find_tags", "card_info", "meta", "archetype", "reference_list", "draw_odds", "check_deck", "submit_deck"];
  const r = await runStage({ client, model, system: SYSTEM_PROMPT, userText, tools: V2_TOOLS, ctx, onStep });
  return {
    text: r.text,
    deck: ctx.submitted,
    toolCalls: r.toolCalls,
    usage: r.usage,
    costUsd: Math.round(costUsd(model, r.usage) * 10000) / 10000,
    steps: r.steps,
    stopReason: r.stopReason,
    error: r.error,
    ms: Date.now() - started,
  };
}

/** Harness v4: v2's loop and tools, plus declare_plan and the coach (submit_brew in place of submit_deck). */
export async function brewV4(
  client: Anthropic,
  model: ModelConfig,
  req: BrewRequest,
  deps: { index: CardIndex; data: DataSource },
  onStep?: (step: number, note: string) => void,
): Promise<BrewResult> {
  const started = Date.now();
  const ctx: ToolContext = { ...deps, seen: new Set(), submitted: null, plan: null, coachRounds: 0, request: req.prompt };
  const userText = req.format ? `Format: ${req.format}\n\n${req.prompt}` : req.prompt;
  const V4_TOOLS = ["search_cards", "find_tags", "card_info", "meta", "archetype", "reference_list", "draw_odds", "check_deck", "declare_plan", "coach_check", "submit_brew"];
  const r = await runStage({ client, model, system: V4_SYSTEM_PROMPT, userText, tools: V4_TOOLS, ctx, onStep, maxSteps: 40 });
  return {
    text: r.text,
    deck: ctx.submitted,
    toolCalls: r.toolCalls,
    usage: r.usage,
    costUsd: Math.round(costUsd(model, r.usage) * 10000) / 10000,
    steps: r.steps,
    stopReason: r.stopReason,
    error: r.error,
    ms: Date.now() - started,
  };
}

/** Most of a brew that may be one existing list in v6: about where the holdout's human brewers topped out. */
export const V6_MAX_COPY_RATE = 0.65;

/** Harness v5: v2's loop and tools, plus the format menu in the request and three directions before building. */
export async function brewV5(
  client: Anthropic,
  model: ModelConfig,
  req: BrewRequest,
  deps: { index: CardIndex; data: DataSource },
  onStep?: (step: number, note: string) => void,
  variant: {
    system: string;
    maxCopyRate?: number;
    examples?: { lists: BrewerList[]; before: string };
    extraTools?: string[];
    requireWinLine?: boolean;
    strictBrew?: boolean;
    requireNeeds?: boolean;
    cardChecksV2?: boolean;
    spellChecks?: boolean;
    /** Harness v20: more text for the first message (borrow.ts's list). */
    extraText?: string;
  } = { system: V5_SYSTEM_PROMPT },
): Promise<BrewResult> {
  const started = Date.now();
  const ctx: ToolContext = {
    ...deps,
    seen: new Set(),
    submitted: null,
    requireWinLine: variant.requireWinLine,
    strictBrew: variant.strictBrew,
    requireNeeds: variant.requireNeeds,
    cardChecksV2: variant.cardChecksV2,
    spellChecks: variant.spellChecks,
    stapleRounds: 0,
    cardNoteRounds: 0,
    request: req.prompt,
  };
  if (variant.maxCopyRate != null) ctx.lock = { cards: [], maxCopyRate: variant.maxCopyRate };
  const key = req.format ? getFormat(req.format)?.key : undefined;
  const menu = key ? formatMenu(deps.index, deps.data, key) : null;
  const examples = variant.examples ? examplesText(deps.index, deps.data, variant.examples.lists, variant.examples.before) : null;
  const userText =
    (req.format ? `Format: ${req.format}\n\n${req.prompt}` : req.prompt) +
    (menu ? `\n\nWhat is working in ${req.format} right now (last 30 days of results):\n${menu}` : "") +
    (examples ? `\n\n${examples}` : "") +
    (variant.extraText ? `\n\n${variant.extraText}` : "");
  const V5_TOOLS = ["search_cards", "find_tags", "card_info", "meta", "archetype", "reference_list", "draw_odds", "check_deck", "submit_deck", ...(variant.extraTools ?? [])];
  const r = await runStage({ client, model, system: variant.system, userText, tools: V5_TOOLS, ctx, onStep });
  return {
    text: r.text,
    deck: ctx.submitted,
    toolCalls: r.toolCalls,
    usage: r.usage,
    costUsd: Math.round(costUsd(model, r.usage) * 10000) / 10000,
    steps: r.steps,
    stopReason: r.stopReason,
    error: r.error,
    ms: Date.now() - started,
  };
}

/** Harness v6: v5 with "borrow a package, not a deck" and a copy limit on brews. */
export function brewV6(
  client: Anthropic,
  model: ModelConfig,
  req: BrewRequest,
  deps: { index: CardIndex; data: DataSource },
  onStep?: (step: number, note: string) => void,
): Promise<BrewResult> {
  return brewV5(client, model, req, deps, onStep, { system: V6_SYSTEM_PROMPT, maxCopyRate: V6_MAX_COPY_RATE });
}

/** Where the worked examples come from: a strong brewer's public lists, saved by scripts/fetch-dld-deck.ts. */
export const EXAMPLE_BREWER_DIR = "evals/brewers/lists/aspiringspike";
let exampleLists: BrewerList[] | null = null;

/**
 * Harness v7: v5 plus annotated examples of a strong brewer's brews, dated
 * before `before` (today when not given) so a historical run sees nothing
 * from after its cutoff. Returns to plain v5 when fewer than two examples qualify.
 */
export function brewV7(
  client: Anthropic,
  model: ModelConfig,
  req: BrewRequest,
  deps: { index: CardIndex; data: DataSource },
  onStep?: (step: number, note: string) => void,
  before: string = new Date().toISOString().slice(0, 10),
): Promise<BrewResult> {
  exampleLists ??= loadBrewerLists(EXAMPLE_BREWER_DIR);
  return brewV5(client, model, req, deps, onStep, { system: V7_SYSTEM_PROMPT, examples: { lists: exampleLists, before } });
}

/** Harness v8: v5 plus played_with, so a brew learns a combo's mechanism from the decks that run it. */
export function brewV8(
  client: Anthropic,
  model: ModelConfig,
  req: BrewRequest,
  deps: { index: CardIndex; data: DataSource },
  onStep?: (step: number, note: string) => void,
): Promise<BrewResult> {
  return brewV5(client, model, req, deps, onStep, { system: V8_SYSTEM_PROMPT, extraTools: ["played_with"] });
}

/** Harness v9: v5 plus a mechanism-first step, no played_with (the control for v8). */
export function brewV9(
  client: Anthropic,
  model: ModelConfig,
  req: BrewRequest,
  deps: { index: CardIndex; data: DataSource },
  onStep?: (step: number, note: string) => void,
): Promise<BrewResult> {
  return brewV5(client, model, req, deps, onStep, { system: V9_SYSTEM_PROMPT });
}

/** Harness v10: lookup, mechanism step, and a win line the checker verifies. */
export function brewV10(
  client: Anthropic,
  model: ModelConfig,
  req: BrewRequest,
  deps: { index: CardIndex; data: DataSource },
  onStep?: (step: number, note: string) => void,
): Promise<BrewResult> {
  return brewV5(client, model, req, deps, onStep, { system: V10_SYSTEM_PROMPT, extraTools: ["played_with"], requireWinLine: true });
}

/** Harness v11: v10 plus exactly-60 and build-on-the-dominant-shell rules. */
export function brewV11(
  client: Anthropic,
  model: ModelConfig,
  req: BrewRequest,
  deps: { index: CardIndex; data: DataSource },
  onStep?: (step: number, note: string) => void,
): Promise<BrewResult> {
  return brewV5(client, model, req, deps, onStep, { system: V11_SYSTEM_PROMPT, extraTools: ["played_with"], requireWinLine: true, strictBrew: true });
}

/** Harness v12: v11 plus enablers in quantity for each requested card, and one send-back for outclassed cards. */
export function brewV12(
  client: Anthropic,
  model: ModelConfig,
  req: BrewRequest,
  deps: { index: CardIndex; data: DataSource },
  onStep?: (step: number, note: string) => void,
): Promise<BrewResult> {
  return brewV5(client, model, req, deps, onStep, { system: V12_SYSTEM_PROMPT, extraTools: ["played_with"], requireWinLine: true, strictBrew: true, requireNeeds: true });
}

/**
 * Harness v13: v12 with the card-quality note fixed (a rare deck's own staples
 * are not "outclassed") and partner hints attached for the reader. Same prompt as v12.
 */
export function brewV13(
  client: Anthropic,
  model: ModelConfig,
  req: BrewRequest,
  deps: { index: CardIndex; data: DataSource },
  onStep?: (step: number, note: string) => void,
): Promise<BrewResult> {
  return brewV5(client, model, req, deps, onStep, {
    system: V12_SYSTEM_PROMPT,
    extraTools: ["played_with"],
    requireWinLine: true,
    strictBrew: true,
    requireNeeds: true,
    cardChecksV2: true,
  });
}

/**
 * Harness v20 (2026-11-08): v13, plus a list of the little-played spells real decks run alongside the
 * requested cards, in the first message (borrow.ts). Aimed at Added: inventors borrow such spells from
 * other decks and most stay; the AI borrows fewer and most don't. Owner: "Yes, Haiku first".
 */
export function brewV20(
  client: Anthropic,
  model: ModelConfig,
  req: BrewRequest,
  deps: { index: CardIndex; data: DataSource },
  onStep?: (step: number, note: string) => void,
): Promise<BrewResult> {
  return brewWithBorrowList(client, model, req, deps, onStep, 20);
}

/**
 * Harness v21 (2026-11-08): v20 with only the list's top 5. On the dev decks the top 5 hold 21% of the
 * spells inventors borrowed against 33% for the top 20, at four times the density; Haiku played 2.4
 * listed cards per deck under v20 and 10% of them were borrowed spells.
 */
export function brewV21(
  client: Anthropic,
  model: ModelConfig,
  req: BrewRequest,
  deps: { index: CardIndex; data: DataSource },
  onStep?: (step: number, note: string) => void,
): Promise<BrewResult> {
  return brewWithBorrowList(client, model, req, deps, onStep, 5);
}

async function brewWithBorrowList(
  client: Anthropic,
  model: ModelConfig,
  req: BrewRequest,
  deps: { index: CardIndex; data: DataSource },
  onStep: ((step: number, note: string) => void) | undefined,
  size: number,
): Promise<BrewResult> {
  const key = req.format ? getFormat(req.format)?.key : undefined;
  const borrow = key ? borrowList(deps.index, deps.data, key, namedCards(deps.index, req.prompt), size) : [];
  const r = await brewV5(client, model, req, deps, onStep, {
    system: V12_SYSTEM_PROMPT,
    extraTools: ["played_with"],
    requireWinLine: true,
    strictBrew: true,
    requireNeeds: true,
    cardChecksV2: true,
    extraText: borrowText(req.format ?? "", borrow) ?? undefined,
  });
  return { ...r, borrow: borrow.map((c) => c.name) };
}

/** Harness v14: v13 plus mana_base, lands from real decks in the same colors. */
export function brewV14(
  client: Anthropic,
  model: ModelConfig,
  req: BrewRequest,
  deps: { index: CardIndex; data: DataSource },
  onStep?: (step: number, note: string) => void,
): Promise<BrewResult> {
  return brewV5(client, model, req, deps, onStep, {
    system: V14_SYSTEM_PROMPT,
    extraTools: ["played_with", "mana_base"],
    requireWinLine: true,
    strictBrew: true,
    requireNeeds: true,
    cardChecksV2: true,
  });
}

/** Harness v15: v13 plus format staples in the deck's colors and 4 copies of the cards the plan rests on. */
export function brewV15(
  client: Anthropic,
  model: ModelConfig,
  req: BrewRequest,
  deps: { index: CardIndex; data: DataSource },
  onStep?: (step: number, note: string) => void,
): Promise<BrewResult> {
  return brewV5(client, model, req, deps, onStep, {
    system: V15_SYSTEM_PROMPT,
    extraTools: ["played_with", "format_staples"],
    requireWinLine: true,
    strictBrew: true,
    requireNeeds: true,
    cardChecksV2: true,
    spellChecks: true,
  });
}

/** Harness v16: v13 plus the synergy shortlist tool. */
export function brewV16(
  client: Anthropic,
  model: ModelConfig,
  req: BrewRequest,
  deps: { index: CardIndex; data: DataSource },
  onStep?: (step: number, note: string) => void,
): Promise<BrewResult> {
  return brewV5(client, model, req, deps, onStep, {
    system: V16_SYSTEM_PROMPT,
    extraTools: ["played_with", "synergy_candidates"],
    requireWinLine: true,
    strictBrew: true,
    requireNeeds: true,
    cardChecksV2: true,
  });
}

/**
 * Harness v17: v13, then a reviewer that didn't build the deck flags cards
 * that don't serve the plan (wrong role, missing partner, unneeded package,
 * outclassed) using evidence from real decks about each card; the brewer then
 * fixes each flag or says why the card stays, and resubmits. Once.
 */
export async function brewV17(
  client: Anthropic,
  model: ModelConfig,
  req: BrewRequest,
  deps: { index: CardIndex; data: DataSource },
  onStep?: (step: number, note: string) => void,
  /** v18: the reviewer also sees role evidence and may flag missing cards. */
  roles = false,
): Promise<BrewResult> {
  const started = Date.now();
  const first = await brewV13(client, model, req, deps, onStep);
  if (!first.deck) return first;
  const usage = { ...first.usage };
  let cost = first.costUsd;
  let reviewed: Awaited<ReturnType<typeof reviewDeck>>;
  try {
    reviewed = await reviewDeck(client, model, req, first.deck, deps, first.text, undefined, roles);
  } catch (err) {
    return { ...first, error: `review failed: ${(err as Error).message}` };
  }
  addUsage(usage, reviewed.usage);
  cost += reviewed.costUsd;
  const flags = reviewed.review.flags;
  if (!flags.length) return { ...first, usage, costUsd: Math.round(cost * 10000) / 10000, review: { flags, firstDeck: first.deck }, ms: Date.now() - started };

  const { stage: revised, deck } = await reviseBrew(
    client,
    model,
    req,
    deps,
    first.deck,
    `A reviewer who didn't build it flagged these cards${roles ? ' (for "missing card or role imbalance", the card named is one to add)' : ""}:\n${flags.map((f, i) => `${i + 1}. ${f.card} (${f.problem}): ${f.why} Suggested fix: ${f.fix}`).join("\n")}`,
    "For each flag, either make the fix (or a better one) or keep the card and say why in one line. Look up any new card with card_info. Then resubmit the whole deck with submit_deck (same rules: winLine, winTurn, needs, exactly 60). Final answer: what you changed and why, in a few lines.",
    onStep,
  );
  addUsage(usage, revised.usage);
  cost += costUsd(model, revised.usage);
  return {
    text: `${first.text}\n\n--- After review ---\n${revised.text}`,
    deck: deck ?? first.deck,
    toolCalls: [...first.toolCalls, ...revised.toolCalls.map((c) => ({ ...c, stage: "revise" }))],
    usage,
    costUsd: Math.round(cost * 10000) / 10000,
    steps: first.steps + revised.steps,
    stopReason: revised.stopReason,
    error: revised.error,
    ms: Date.now() - started,
    review: { flags, firstDeck: first.deck, ...(reviewed.roles ? { roles: reviewed.roles } : {}) },
  };
}

/**
 * Harness v18 (2026-10-22): v17, with the reviewer also seeing how the deck's
 * roles compare with real decks that lean on them (copies by mana value, and
 * the role's common cards this deck lacks), so it can flag what's missing, not
 * only what's wrong. Owner's Scapeshift note was the prompt for it; nothing in
 * it is about that deck.
 */
export function brewV18(client: Anthropic, model: ModelConfig, req: BrewRequest, deps: { index: CardIndex; data: DataSource }, onStep?: (step: number, note: string) => void) {
  return brewV17(client, model, req, deps, onStep, true);
}

/** A fresh revision conversation: the deck, what was found wrong with it, and the same tools and checks as the brew. */
async function reviseBrew(
  client: Anthropic,
  model: ModelConfig,
  req: BrewRequest,
  deps: { index: CardIndex; data: DataSource },
  deck: SubmittedDeck,
  findings: string,
  instruction: string,
  onStep?: (step: number, note: string) => void,
): Promise<{ stage: StageResult; deck: SubmittedDeck | null }> {
  const ctx: ToolContext = {
    ...deps,
    seen: new Set(),
    submitted: null,
    requireWinLine: true,
    strictBrew: true,
    requireNeeds: true,
    cardChecksV2: true,
    cardNoteRounds: 1,
    request: req.prompt,
  };
  for (const l of [...deck.main, ...deck.side]) ctx.seen.add(normalizeName(deps.index.getCard(l.name)?.name ?? l.name));
  const lines = (xs: { qty: number; name: string }[]) => xs.map((l) => `${l.qty} ${l.name}`).join("\n");
  const userText = [
    req.format ? `Format: ${req.format}` : "",
    `The player asked: ${req.prompt}`,
    `You built this deck:\n${lines(deck.main)}\n\nSideboard\n${lines(deck.side)}`,
    deck.winLine ? `Its win line: ${deck.winLine.map((w) => `${w.card} (${w.does})`).join(" -> ")}` : "",
    findings,
    instruction,
  ]
    .filter(Boolean)
    .join("\n\n");
  const stage = await runStage({
    client,
    model,
    system: V13_REVISE_SYSTEM,
    userText,
    tools: ["search_cards", "find_tags", "card_info", "played_with", "draw_odds", "check_deck", "submit_deck"],
    ctx,
    onStep,
    maxSteps: 20,
  });
  return { stage, deck: ctx.submitted };
}

/**
 * Harness v19 (2026-10-25): v13, then the AI plays the deck through one dealt
 * game against the format's most-played deck (playtest.ts), and the brewer
 * fixes or answers the top three problems. Replaces the v17/v18 reviewer, which
 * judged cards one at a time and moved no yardstick. Owner: "build the lean v19
 * on v13 (playtest instead of the reviewer, 1 game, top 3 problems)."
 */
export async function brewV19(
  client: Anthropic,
  model: ModelConfig,
  req: BrewRequest,
  deps: { index: CardIndex; data: DataSource },
  onStep?: (step: number, note: string) => void,
): Promise<BrewResult> {
  const started = Date.now();
  const first = await brewV13(client, model, req, deps, onStep);
  if (!first.deck) return first;
  const usage = { ...first.usage };
  let cost = first.costUsd;
  let tested: Awaited<ReturnType<typeof playtestDeck>>;
  try {
    tested = await playtestDeck(client, model, req, first.deck, deps);
  } catch (err) {
    return { ...first, error: `playtest failed: ${(err as Error).message}` };
  }
  addUsage(usage, tested.usage);
  cost += tested.costUsd;
  const problems = tested.report.problems.slice(0, 3);
  const playtest = { opponent: tested.opponent, seed: tested.seed, game: tested.report.game, problems, firstDeck: first.deck };
  if (!problems.length) return { ...first, usage, costUsd: Math.round(cost * 10000) / 10000, playtest, ms: Date.now() - started };

  const { stage: revised, deck } = await reviseBrew(
    client,
    model,
    req,
    deps,
    first.deck,
    `You played it in a test game against ${tested.opponent}, the most-played deck in the format. The problems that hurt it most:\n${problems.map((p, i) => `${i + 1}. ${p.problem} Suggested fix: ${p.fix}`).join("\n")}`,
    "For each problem, either fix it (the suggested fix or a better one) or keep the deck as it is and say why in one line. Fix the deck's own plan first; don't fill it with cards for this one matchup. Look up any new card with card_info. Then resubmit the whole deck with submit_deck (same rules: winLine, winTurn, needs, exactly 60). Final answer: what you changed and why, in a few lines.",
    onStep,
  );
  addUsage(usage, revised.usage);
  cost += costUsd(model, revised.usage);
  return {
    text: `${first.text}\n\n--- After playtest ---\n${revised.text}`,
    deck: deck ?? first.deck,
    toolCalls: [...first.toolCalls, ...revised.toolCalls.map((c) => ({ ...c, stage: "revise" }))],
    usage,
    costUsd: Math.round(cost * 10000) / 10000,
    steps: first.steps + revised.steps,
    stopReason: revised.stopReason,
    error: revised.error,
    ms: Date.now() - started,
    playtest,
  };
}

const V13_REVISE_SYSTEM = `You revise a Magic: The Gathering brew you built, after a review. The player's request and your plan stay the same; you are fixing specific cards. Every card fact you state must come from a tool result. Every card you add must be looked up with card_info first. The deck must stay legal and keep its line to the win.`;
