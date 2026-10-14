import Anthropic from "@anthropic-ai/sdk";
import type { CardIndex } from "@/cards/card-index";
import type { DataSource } from "@/data/source";
import { costUsd, type ModelConfig, type Usage } from "./models";
import { SYSTEM_PROMPT } from "./prompt";
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
        if ((u.name === "submit_deck" || u.name === "submit_engine") && !r.isError) {
          const body = JSON.parse(r.content);
          record.accepted = body.accepted === true;
          if (!record.accepted) record.rejected = [...(body.errors ?? []), ...(body.problems ?? []), ...(body.reason ? [body.reason, ...(body.cards ?? [])] : [])];
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
