import { describe, expect, it } from "vitest";
import { SYSTEM_PROMPT, V5_SYSTEM_PROMPT, V6_SYSTEM_PROMPT, V7_SYSTEM_PROMPT } from "./prompt";

describe("harness prompts", () => {
  it("v5 keeps v2's rules and swaps only the final answer", () => {
    const rules = SYSTEM_PROMPT.slice(0, SYSTEM_PROMPT.indexOf("Final answer"));
    expect(V5_SYSTEM_PROMPT.startsWith(rules)).toBe(true);
    expect(V5_SYSTEM_PROMPT).toContain("No sideboard guide.");
  });

  it("v6 is v5 with the borrow-a-package rule", () => {
    expect(V6_SYSTEM_PROMPT).not.toBe(V5_SYSTEM_PROMPT);
    expect(V6_SYSTEM_PROMPT).toContain("Borrow a package, not a deck");
  });

  it("v7 is v5 with the worked-examples sentence", () => {
    expect(V7_SYSTEM_PROMPT).not.toBe(V5_SYSTEM_PROMPT);
    expect(V7_SYSTEM_PROMPT).toContain("annotated examples");
  });
});
