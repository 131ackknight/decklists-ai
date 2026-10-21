import Anthropic from "@anthropic-ai/sdk";
import type { CardIndex } from "@/cards/card-index";
import { getFormat } from "@/cards/formats";
import type { DataSource } from "@/data/source";
import { costUsd, type ModelConfig, type Usage } from "./models";
import { formatMenu } from "./menu";
import { examplesText, loadBrewerLists, type BrewerList } from "./examples";
import { SYSTEM_PROMPT, V4_SYSTEM_PROMPT, V5_SYSTEM_PROMPT, V6_SYSTEM_PROMPT, V7_SYSTEM_PROMPT, V8_SYSTEM_PROMPT, V9_SYSTEM_PROMPT, V10_SYSTEM_PROMPT, V11_SYSTEM_PROMPT, V12_SYSTEM_PROMPT } from "./prompt";
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
      addUsage(usage, {
        input: message.usage.input_tokens,
        output: message.usage.output_tokens,
        cacheRead: message.usage.cache_read_input_tokens ?? 0,
        cacheWrite: message.usage.cache_creation_input_tokens ?? 0,
      });
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
    (examples ? `\n\n${examples}` : "");
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
