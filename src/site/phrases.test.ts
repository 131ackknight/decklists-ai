import { describe, expect, it } from "vitest";
import { TOOLS } from "@/harness/tools";
import { FLAVOR_LINES, phraseForStep } from "./phrases";

describe("phraseForStep", () => {
  it("maps every tool in tools.ts to a step phrase, not a flavor line", () => {
    for (const t of TOOLS) {
      const p = phraseForStep(t.name);
      expect(p, t.name).toBeTruthy();
      expect(FLAVOR_LINES, t.name).not.toContain(p);
      expect(p).not.toMatch(new RegExp(`\\b${t.name}\\b`, "i"));
    }
  });

  it("uses the first known tool in a note", () => {
    expect(phraseForStep("meta, search_cards")).toBe("Scouting the metagame");
    expect(phraseForStep("not_a_tool, simulate, check_deck")).toBe("Goldfishing a few hands");
  });

  it("maps an unknown tool or an empty note to a flavor line", () => {
    expect(FLAVOR_LINES).toContain(phraseForStep("brand_new_tool"));
    expect(FLAVOR_LINES).toContain(phraseForStep(""));
  });
});
