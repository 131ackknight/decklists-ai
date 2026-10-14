import Anthropic from "@anthropic-ai/sdk";
import type { CardIndex } from "@/cards/card-index";
import { getFormat } from "@/cards/formats";
import type { DataSource } from "@/data/source";
import { costUsd, MODELS, type ModelConfig, type Usage } from "@/harness/models";
import { addUsage, emptyUsage, runStage, type BrewRequest, type BrewResult, type ToolCallRecord } from "@/harness/run";
import type { ToolContext } from "@/harness/tools";
import { classifyIntent, normalizeIntent, type Intent } from "./intent";
import { CRITIQUE_PROMPT, ENGINE_PROMPT, IMPOSSIBLE_PROMPT, SHELL_PROMPT, STOCK_PROMPT, TUNE_PROMPT } from "./prompts";

/** Initial brew thresholds; to calibrate with the brew holdout test. */
export const BREW_MAX_COPY_RATE = 0.6;
export const BREW_MIN_ENGINE_SHARE = 0.25;

const ALL_TOOLS = ["search_cards", "find_tags", "card_info", "meta", "archetype", "reference_list", "draw_odds", "simulate", "check_deck", "submit_deck"];
const ENGINE_TOOLS = ["search_cards", "find_tags", "card_info", "meta", "draw_odds", "submit_engine"];
const SHELL_TOOLS = ALL_TOOLS;
const CRITIQUE_TOOLS = ["meta", "archetype", "card_info", "search_cards", "check_deck", "simulate", "draw_odds", "submit_deck"];

export interface PipelineResult extends BrewResult {
  intent: Intent | null;
  path: string;
  facts: string[];
  engine: ToolContext["engine"];
}

/** Facts checked in code before any stage runs. */
function checkFacts(intent: Intent, index: CardIndex, format: string | null) {
  const facts: string[] = [];
  const illegal: string[] = [];
  for (const name of intent.namedCards) {
    const card = index.getCard(name);
    if (!card) {
      facts.push(`"${name}" doesn't match a card in the card pool; check the spelling with search_cards.`);
      continue;
    }
    if (format) {
      const status = card.legal[format];
      if (status === "legal" || status === "restricted") facts.push(`${card.name} is ${status} in ${format}.`);
      else {
        facts.push(`${card.name} is ${status === "banned" ? "banned" : "not legal"} in ${format}.`);
        illegal.push(card.name);
      }
    }
  }
  return { facts, illegal };
}

export async function runPipeline(
  client: Anthropic,
  model: ModelConfig,
  req: BrewRequest,
  deps: { index: CardIndex; data: DataSource },
  opts: { intentModel?: string; onStage?: (stage: string) => void } = {},
): Promise<PipelineResult> {
  const started = Date.now();
  const usage: Usage = emptyUsage();
  let cost = 0;
  const toolCalls: ToolCallRecord[] = [];
  const ctx: ToolContext = { ...deps, seen: new Set(), submitted: null, engine: null };

  // Stage 0: read the request.
  const intentModel = MODELS[opts.intentModel ?? "claude-sonnet-5-5"];
  const read = await classifyIntent(client, intentModel.id, req);
  const intentUsage = { input: read.usage.input_tokens, output: read.usage.output_tokens, cacheRead: 0, cacheWrite: 0 };
  addUsage(usage, intentUsage);
  cost += costUsd(intentModel, intentUsage);
  if (!read.intent) {
    return { text: "", deck: null, toolCalls, usage, costUsd: cost, steps: 0, stopReason: null, error: "Could not read the request.", ms: Date.now() - started, intent: null, path: "none", facts: [], engine: null };
  }
  const intent = normalizeIntent(read.intent, req.prompt, (n) => deps.index.getCard(n)?.name);
  const format = getFormat(intent.format ?? req.format ?? "")?.key ?? null;
  const { facts, illegal } = checkFacts(intent, deps.index, format);
  const path = illegal.length ? "impossible" : intent.type === "sideboard" ? "tune" : intent.type;

  // Locks from the request: the format, named legal cards, colors.
  const allowed =
    intent.colors.exactly && intent.colors.exactly.length
      ? intent.colors.exactly
      : intent.colors.exclude.length
        ? ["W", "U", "B", "R", "G"].filter((c) => !intent.colors.exclude.includes(c as never))
        : null;
  // Only real, legal cards can be required ("Scam" is a deck, not a card); a tune's colors come from the player's list.
  ctx.lock = {
    format,
    cards:
      path === "tune"
        ? []
        : intent.namedCards
            .map((n) => deps.index.getCard(n)?.name)
            .filter((n): n is string => !!n && !illegal.includes(n))
            .map((name) => ({ name, minQty: 1 })),
    colorsAllowed: path === "tune" ? null : allowed,
  };

  const brief = [
    `Player's request:\n${req.format ? `Format selected: ${req.format}\n` : ""}${req.prompt}`,
    `Reading of the request: ${JSON.stringify({ type: intent.type, format: intent.format, archetype: intent.archetype, namedCards: intent.namedCards, colors: intent.colors, constraints: intent.constraints, goal: intent.goal })}`,
    facts.length ? `Checked facts:\n- ${facts.join("\n- ")}` : "",
    allowed && path !== "tune" ? `Color lock: every card must fit inside ${allowed.join("")}.` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const stages: { name: string; text: string; error: string | null; steps: number; stopReason: string | null }[] = [];
  const run = async (name: string, system: string, userText: string, tools: string[], maxSteps = 30) => {
    opts.onStage?.(name);
    const r = await runStage({ client, model, system, userText, tools, ctx, stage: name, maxSteps });
    addUsage(usage, r.usage);
    cost += costUsd(model, r.usage);
    toolCalls.push(...r.toolCalls);
    stages.push({ name, text: r.text, error: r.error, steps: r.steps, stopReason: r.stopReason });
    return r;
  };

  if (path === "brew") {
    ctx.lock = { ...ctx.lock, maxCopyRate: BREW_MAX_COPY_RATE, minEngineShare: BREW_MIN_ENGINE_SHARE };
    await run("engine", ENGINE_PROMPT, brief, ENGINE_TOOLS, 20);
    if (ctx.engine) {
      const engineBrief = `${brief}\n\nLocked engine (stage 1):\n${JSON.stringify(ctx.engine)}`;
      await run("shell", SHELL_PROMPT, engineBrief, SHELL_TOOLS);
      if (ctx.submitted) {
        await run("critique", CRITIQUE_PROMPT, `${engineBrief}\n\nSubmitted deck:\n${JSON.stringify(ctx.submitted)}`, CRITIQUE_TOOLS, 15);
      }
    }
  } else {
    const system = path === "stock" ? STOCK_PROMPT : path === "tune" ? TUNE_PROMPT : IMPOSSIBLE_PROMPT;
    await run(path, system, brief, ALL_TOOLS);
  }

  const last = stages[stages.length - 1];
  const error = !ctx.submitted ? (stages.find((s) => s.error)?.error ?? "No deck was accepted.") : null;
  return {
    text: last?.text ?? "",
    deck: ctx.submitted,
    toolCalls,
    usage,
    costUsd: Math.round(cost * 10000) / 10000,
    steps: stages.reduce((n, s) => n + s.steps, 0),
    stopReason: last?.stopReason ?? null,
    error,
    ms: Date.now() - started,
    intent,
    path,
    facts,
    engine: ctx.engine ?? null,
  };
}
