import { describe, expect, it } from "vitest";
import { CardIndex } from "./card-index";
import { standardEnds, standardLegalOn, type StandardWindows } from "./standard";
import type { Card } from "./types";

// Set A rotated (last Standard list 2021-06-01; set B came out 2021-07-01). B and C are in Standard today.
const windows: StandardWindows = {
  sets: {
    a: { released: "2020-01-01", legalToday: false, lastSeen: "2021-06-01" },
    b: { released: "2021-07-01", legalToday: true, lastSeen: "2026-01-01" },
    c: { released: "2026-01-23", legalToday: true, lastSeen: "2026-10-01" },
    d: { released: "2026-03-06", legalToday: true, lastSeen: "2026-10-01" },
  },
  cards: { "old card": ["a"], reprint: ["a", "c"], basic: ["a", "b", "c"], "new card": ["d"] },
};
const ends = standardEnds(windows);

describe("standardLegalOn", () => {
  it("ends a rotated set the day before the next set after its last Standard list", () => {
    expect(ends.get("a")).toBe("2021-06-30");
    expect(ends.get("b")).toBeNull();
  });

  it("follows each set's window", () => {
    expect(standardLegalOn(windows, ends, "Old Card", "2021-01-01")).toBe(true);
    expect(standardLegalOn(windows, ends, "Old Card", "2021-08-01")).toBe(false);
    expect(standardLegalOn(windows, ends, "Reprint", "2025-09-01")).toBe(false);
    expect(standardLegalOn(windows, ends, "Reprint", "2026-02-01")).toBe(true);
    expect(standardLegalOn(windows, ends, "Basic", "2025-09-01")).toBe(true);
    expect(standardLegalOn(windows, ends, "Unknown Card", "2025-09-01")).toBe(false);
  });
});

describe("CardIndex.asOf with Standard windows", () => {
  const card = (name: string, released: string): Card => ({
    oracleId: name,
    name,
    manaCost: "",
    cmc: 0,
    typeLine: "Land",
    text: "",
    colors: [],
    identity: [],
    keywords: [],
    legal: { standard: "legal", modern: "legal" },
    tags: [],
    released,
  });
  const index = new CardIndex({ cards: [card("Reprint", "2020-01-01"), card("New Card", "2026-03-06")], tags: [] });

  it("uses Standard legality on the date and leaves other formats alone", () => {
    const before = index.asOf("2025-09-01", new Set(), windows).getCard("Reprint")!;
    expect(before.legal.standard).toBeUndefined();
    expect(before.legal.modern).toBe("legal");
    expect(index.asOf("2026-02-01", new Set(), windows).getCard("Reprint")!.legal.standard).toBe("legal");
    expect(index.asOf("2025-09-01").getCard("Reprint")!.legal.standard).toBe("legal");
  });

  it("counts a card already played whose set came out within 30 days", () => {
    expect(index.asOf("2026-03-01", new Set(["new card"]), windows).getCard("New Card")!.legal.standard).toBe("legal");
    expect(index.asOf("2026-03-01", new Set(), windows).getCard("New Card")).toBeUndefined();
  });
});
