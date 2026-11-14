import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { NAME_MODEL, fallbackNameBlurb, nameAndBlurb } from "./name-blurb";

const stub = (parse: (...a: unknown[]) => unknown) => ({ messages: { parse: vi.fn(parse) } }) as unknown as Anthropic & { messages: { parse: ReturnType<typeof vi.fn> } };

const NOTES = "I built this as a **brew**.\n\n**The plan:** attack early.\n\n**Mono-White Stax** locks the board.";
const WIN = [
  { card: "Silver Knight", does: "attacks" },
  { card: "Armageddon", does: "resets lands" },
  { card: "Winter Orb", does: "keeps them down" },
];

describe("nameAndBlurb", () => {
  it("returns Haiku's name and blurb", async () => {
    const client = stub(async () => ({ parsed_output: { name: " Orb Lock ", blurb: "It locks the mana. Then it attacks." } }));
    expect(await nameAndBlurb(client, NOTES, WIN)).toEqual({ name: "Orb Lock", blurb: "It locks the mana. Then it attacks." });
    const [params] = client.messages.parse.mock.calls[0] as [{ model: string; messages: { content: string }[] }];
    expect(params.model).toBe(NAME_MODEL);
    expect(NAME_MODEL).toBe("claude-haiku-5-5");
    expect(params.messages[0].content).toContain("Winter Orb: keeps them down");
  });

  it("falls back on an API error", async () => {
    const client = stub(async () => {
      throw new Error("overloaded");
    });
    expect(await nameAndBlurb(client, NOTES, WIN)).toEqual({ name: "Mono-White Stax", blurb: "It wins with Silver Knight, Armageddon and Winter Orb." });
  });

  it("falls back when the reply is empty or too long", async () => {
    expect((await nameAndBlurb(stub(async () => ({ parsed_output: null })), NOTES, WIN)).name).toBe("Mono-White Stax");
    expect((await nameAndBlurb(stub(async () => ({ parsed_output: { name: "x".repeat(80), blurb: "ok" } })), NOTES)).name).toBe("Mono-White Stax");
  });
});

describe("fallbackNameBlurb", () => {
  it("skips label words and headings, and has defaults", () => {
    expect(fallbackNameBlurb("**brew** **Plan:** nothing else")).toEqual({ name: "Your brew", blurb: "Built from real tournament lists." });
    expect(fallbackNameBlurb("**Goblin Pile**", [{ card: "Goblin Ringleader", does: "x" }]).blurb).toBe("It wins with Goblin Ringleader.");
  });
});
