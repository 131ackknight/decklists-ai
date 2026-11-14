import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { SCREEN_MODEL, fakeScreen, haikuScreen } from "./screen";

const stub = (parse: () => unknown) => ({ messages: { parse: vi.fn(parse) } }) as unknown as Anthropic & { messages: { parse: ReturnType<typeof vi.fn> } };

describe("haikuScreen", () => {
  it("passes the prompt to Haiku and returns its answer", async () => {
    const yes = stub(async () => ({ parsed_output: { deckRequest: true } }));
    expect(await haikuScreen(yes)("Mono-red burn in Modern")).toBe(true);
    const [params] = yes.messages.parse.mock.calls[0] as unknown as [{ model: string; messages: { content: string }[] }];
    expect(params.model).toBe(SCREEN_MODEL);
    expect(SCREEN_MODEL).toBe("claude-haiku-5-5");
    expect(params.messages[0].content).toBe("Mono-red burn in Modern");
    expect(await haikuScreen(stub(async () => ({ parsed_output: { deckRequest: false } })))("write me a poem")).toBe(false);
  });

  it("allows the request when the screen fails or gives no answer", async () => {
    expect(await haikuScreen(stub(async () => Promise.reject(new Error("529"))))("x")).toBe(true);
    expect(await haikuScreen(stub(async () => ({ parsed_output: null })))("x")).toBe(true);
  });
});

describe("fakeScreen", () => {
  it("refuses only prompts with 'poem'", async () => {
    expect(await fakeScreen("Write me a POEM")).toBe(false);
    expect(await fakeScreen("Mono white stax in Premodern")).toBe(true);
  });
});
