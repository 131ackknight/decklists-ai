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
  /** For submit_deck: whether it was accepted. */
  accepted?: boolean;
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

const MAX_STEPS = 30;

/** One brew: a manual tool loop on the Messages API. Append-only history, so thinking blocks replay unchanged. */
export async function brew(
  client: Anthropic,
  model: ModelConfig,
  req: BrewRequest,
  deps: { index: CardIndex; data: DataSource },
  onStep?: (step: number, note: string) => void,
): Promise<BrewResult> {
  const started = Date.now();
  const ctx: ToolContext = { ...deps, seen: new Set(), submitted: null };
  const usage: Usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  const toolCalls: ToolCallRecord[] = [];
  const userText = req.format ? `Format: ${req.format}\n\n${req.prompt}` : req.prompt;
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: userText }];
  const tools = toolParams();
  let text = "";
  let stopReason: string | null = null;
  let error: string | null = null;
  let steps = 0;

  try {
    for (; steps < MAX_STEPS; steps++) {
      const stream = client.messages.stream({
        model: model.id,
        max_tokens: 32000,
        system: SYSTEM_PROMPT,
        tools,
        messages,
        cache_control: { type: "ephemeral" },
        ...(model.effort ? { output_config: { effort: "high" as const } } : {}),
      });
      const message = await stream.finalMessage();
      usage.input += message.usage.input_tokens;
      usage.output += message.usage.output_tokens;
      usage.cacheRead += message.usage.cache_read_input_tokens ?? 0;
      usage.cacheWrite += message.usage.cache_creation_input_tokens ?? 0;
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
        const r = runTool(u.name, u.input, ctx);
        const record: ToolCallRecord = { name: u.name, input: u.input, isError: r.isError };
        if (u.name === "submit_deck" && !r.isError) record.accepted = JSON.parse(r.content).accepted === true;
        toolCalls.push(record);
        return { type: "tool_result", tool_use_id: u.id, content: r.content, is_error: r.isError || undefined };
      });
      onStep?.(steps + 1, uses.map((u) => u.name).join(", "));
      // All results for one turn go back in a single user message.
      messages.push({ role: "user", content: results });
    }
    if (steps === MAX_STEPS) error = `Stopped after ${MAX_STEPS} steps.`;
  } catch (err) {
    error = err instanceof Anthropic.APIError ? `API ${err.status}: ${err.message}` : (err as Error).message;
  }

  return {
    text,
    deck: ctx.submitted,
    toolCalls,
    usage,
    costUsd: Math.round(costUsd(model, usage) * 10000) / 10000,
    steps,
    stopReason,
    error,
    ms: Date.now() - started,
  };
}
