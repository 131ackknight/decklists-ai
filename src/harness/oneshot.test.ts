import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { MODELS } from "./models";
import { brewV0, oneShotText } from "./oneshot";

/** A client whose one streamed message is `message`; `sent` collects the request parameters. */
const fakeClient = (message: object, sent: Record<string, unknown>[] = []) =>
  ({
    messages: {
      stream: (params: Record<string, unknown>) => {
        sent.push(params);
        return { finalMessage: async () => message };
      },
    },
  }) as unknown as Anthropic;

const opus = MODELS["claude-opus-5-5"];
const req = { prompt: "Brew me a Modern deck built around Persist.", format: "Modern" };

describe("harness v0: one call, no harness", () => {
  it("sends the request as the harness gets it, plus the date", () => {
    expect(oneShotText(req, "2026-03-01")).toBe("It is 2026-03-01.\nFormat: Modern\n\nBrew me a Modern deck built around Persist.\n\nGive the main deck and sideboard.");
    expect(oneShotText({ prompt: "Mono red prison?" })).toBe("Mono red prison?\n\nGive the main deck and sideboard.");
  });

  it("makes one call with no tools, no system prompt and the harness's settings, and keeps the deck as given", async () => {
    const sent: Record<string, unknown>[] = [];
    const answer = { main: [{ qty: 4, name: "Persist" }, { qty: 2, name: "Not A Real Card" }], side: [] };
    const r = await brewV0(fakeClient({ content: [{ type: "text", text: JSON.stringify(answer) }], stop_reason: "end_turn", usage: { input_tokens: 100, output_tokens: 1000 } }, sent), opus, req, "2026-03-01");
    expect(sent).toHaveLength(1);
    expect(sent[0].tools).toBeUndefined();
    expect(sent[0].system).toBeUndefined();
    expect(sent[0].max_tokens).toBe(32000);
    expect((sent[0].output_config as { effort: string }).effort).toBe("high");
    expect(r.deck?.main).toEqual(answer.main);
    expect(r.deck?.side).toEqual([]);
    expect(r.error).toBeNull();
    expect(r.steps).toBe(1);
    expect(r.toolCalls).toEqual([]);
    expect(r.costUsd).toBeCloseTo((100 * 4 + 1000 * 20) / 1e6, 6);
  });

  it("records a refusal or a cut-off answer as an error with no deck", async () => {
    const refused = await brewV0(fakeClient({ content: [], stop_reason: "refusal", usage: { input_tokens: 10, output_tokens: 0 } }), opus, req);
    expect(refused.deck).toBeNull();
    expect(refused.error).toMatch(/declined/);
    const cut = await brewV0(fakeClient({ content: [{ type: "text", text: '{"main": [' }], stop_reason: "max_tokens", usage: { input_tokens: 10, output_tokens: 32000 } }), opus, req);
    expect(cut.deck).toBeNull();
    expect(cut.error).toMatch(/max_tokens/);
  });
});
