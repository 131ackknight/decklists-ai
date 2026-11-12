import { describe, expect, it } from "vitest";
import { FIGURES, num, range, scoreboardData, tablesUnder } from "./figures";

const MD = `# decklists.ai progress

### 2h. The score without lands

Some words.

| Version | Runs | holdout-v2: whole deck | holdout-v2: without lands | holdout-v2: without lands or hidden cards | future-v2: whole deck | future-v2: without lands | future-v2: without lands or hidden cards |
| --- | --- | --- | --- | --- | --- | --- | --- |
| The best possible pile, with hindsight |  | 85.4 | 85.1 | 83.1 | 86.9 | 87.4 | 86.0 |
| A settled list against the other settled lists |  | 78.6 | 77.7 | 74.9 | 80.8 | 81.4 | 79.3 |
| Inventors (the deck's first-week real lists) |  | 65.7 | 63.5 | 60.7 | 72.4 | 72.8 | 71.4 |
| v0 | 3 / 1 | 33.9 | 33.5 | 36.6 | 33.7 | 34.0 | 38.0 |
| v2, Haiku 5.5 | 3 / 0 | 32.8 | 30.9 | 32.7 | not run | not run | not run |
| v13 | 3 / 2 | 42.9 | 40.8 | 43.4 | 48.1 | 48.4 | 48.6 |
| v4 | 1 / 0 | 41.4 (19 decks) | 36.9 (19 decks) | 39.5 (19 decks) | not run | not run | not run |

A second table, which the figures don't read:

| Version | Runs | Whole deck |
| --- | --- | --- |
| v5 | 1 | -1.9 (-5.7 to +1.9) |

### 2i. The idea-named tests

|  | Decks | 3 cards named: whole deck | Every signature card named: whole deck | 3 cards named: without lands | Every signature card named: without lands |
| --- | --- | --- | --- | --- | --- |
| Dev: inventors (the deck's first-week real lists) | 21 | 65.7 | 65.7 | 63.5 | 63.5 |
| Dev: the brewer | 21 | 42.7 | 53.7 | 40.8 | 54.3 |
| Dev: the model alone (v0) | 21 | 33.9 | 46.8 | 33.5 | 51.3 |
| Future test: inventors (the deck's first-week real lists) | 14 | 72.4 | 72.4 | 72.8 | 72.8 |
| Future test: the brewer | 14 | 48.1 | 60.3 | 48.4 | 61.9 |
| Future test: the model alone (v0) | 14 | 33.7 | 50.0 | 34.0 | 56.1 |

|  | Decks | Builds a deck | Whole deck | Without lands | From lands | From the cards the old request hid | From the other spells |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Dev: the brewer | 18 | 1 | +12.8 (+5.2 to +20.5) | +15.8 (+8.6 to +23.0) | +2.4 (-2.0 to +6.7) | +13.7 (+9.5 to +18.0) | -3.3 (-5.9 to -0.7) |
| Dev: the model alone (v0) | 18 | 1 | +15.1 (+10.1 to +20.1) | +20.7 (+14.0 to +27.4) | +1.7 (-1.3 to +4.7) | +15.8 (+11.5 to +20.1) | -2.4 (-4.3 to -0.5) |
| Future test: the brewer | 12 | 1 | +14.3 (+4.0 to +24.6) | +15.7 (+7.4 to +24.0) | +3.8 (-1.9 to +9.4) | +11.9 (+7.2 to +16.6) | -1.4 (-5.6 to +2.8) |
| Future test: the model alone (v0) | 12 | 1 | +19.0 (+13.2 to +24.8) | +25.8 (+19.3 to +32.3) | +1.7 (-1.2 to +4.6) | +16.9 (+11.9 to +22.0) | +0.3 (-3.6 to +4.3) |

| Decks whose request changed | Decks | The model alone: whole deck | The brewer: whole deck | The brewer ahead by |
| --- | --- | --- | --- | --- |
| Dev: all | 18 | 48.3 | 54.4 | +6.2 (+0.8 to +11.6) |

| Test | Deck | Appeared after the model's training | The model alone | The brewer | The brewer ahead by |
| --- | --- | --- | --- | --- | --- |
| Dev | standard-boros-dwarves | yes | 30.9 | 59.1 | +28.2 |
| Future test | standard-gearhulk | yes | 39.0 | 50.7 | +11.7 |
| Future test | pauper-inside-out | no | 71.6 | 68.3 | -3.3 |

## 3. The owner's judging rounds

| Log date | Page |
| --- | --- |
| 10-14 | a page |

### 7a. Harness versions

| Version | Log date | What it added | Status |
| --- | --- | --- | --- |
| v0 | 11-10 | No harness | Reference start, not a candidate |
| v4 | 10-15 | Coach in code | Not kept |
| v13 | 10-21 | Card-quality note fixed | Base 10-21 to 11-10 |
`;

describe("reading the scoreboard for the figures", () => {
  it("finds the tables under a heading and stops at the next heading of its level", () => {
    const t = tablesUnder(MD, "### 2h.");
    expect(t).toHaveLength(2);
    expect(t[0].head[0]).toBe("Version");
    expect(t[0].rows).toHaveLength(7);
    expect(tablesUnder(MD, "### 2i.")).toHaveLength(4);
    expect(tablesUnder(MD, "### 9z.")).toEqual([]);
  });

  it("reads numbers and ranges out of cells", () => {
    expect(num("41.4 (19 decks)")).toBe(41.4);
    expect(num("-3.3")).toBe(-3.3);
    expect(num("not run")).toBeNaN();
    expect(range("+12.8 (+5.2 to +20.5)")).toEqual({ gain: 12.8, lo: 5.2, hi: 20.5 });
    expect(range("-1.4 (-5.6 to +2.8)")).toEqual({ gain: -1.4, lo: -5.6, hi: 2.8 });
    expect(range("+28.2 (2 decks: no range)")).toBeNull();
  });

  it("collects what the figures show", () => {
    const d = scoreboardData(MD);
    expect(d.yardsticks.map((y) => y.dev)).toEqual([85.4, 78.6, 65.7]);
    // Opus versions only, in build order, with the base flag from section 7a.
    expect(d.versions.map((v) => [v.name, v.base])).toEqual([
      ["v0", true],
      ["v4", false],
      ["v13", true],
    ]);
    expect(d.versions[1].dev.whole).toBe(41.4);
    expect(d.versions[1].fut.whole).toBeNaN();
    expect(d.idea[0]).toMatchObject({ test: "Dev", decks: 21, changed: 18, inventors: 65.7, brewer: { old: 42.7, named: 53.7, gain: { gain: 12.8, lo: 5.2, hi: 20.5 } } });
    expect(d.idea[1].alone).toMatchObject({ old: 33.7, named: 50.0 });
    expect(d.lead).toHaveLength(3);
    expect(d.lead[2]).toEqual({ test: "Future test", deck: "pauper-inside-out", after: false, alone: 71.6, brewer: 68.3 });
  });

  it("says so when the scoreboard has no such sections", () => {
    expect(() => scoreboardData("# nothing here")).toThrow(/section 2h or 2i/);
  });
});

describe("the figures", () => {
  const d = scoreboardData(MD);
  it.each(FIGURES.map(([file, draw]) => [file, draw] as const))("%s is one well-formed SVG that prints the scoreboard's numbers", (_, draw) => {
    const s = draw(d);
    expect(s.startsWith("<svg ")).toBe(true);
    expect(s.trimEnd().endsWith("</svg>")).toBe(true);
    expect(s).not.toMatch(/NaN|undefined|Infinity/);
    // Every tag opened is closed: self-closing, or by its end tag.
    for (const name of ["text", "path", "svg"]) expect(s.split(`<${name}`).length - 1).toBe(s.split(`</${name}>`).length - 1 + (s.match(new RegExp(`<${name}[^>]*/>`, "g")) ?? []).length);
  });

  it("puts the scoreboard's numbers on the ladder and the lead chart", () => {
    const ladder = FIGURES[0][1](d);
    for (const n of ["85.4", "78.6", "65.7", "53.7", "46.8", "42.7", "33.9"]) expect(ladder).toContain(`>${n}<`);
    const lead = FIGURES[3][1](d);
    expect(lead).toContain("Standard Gearhulk");
    expect(lead).toContain(">+11.7<");
    expect(lead).toContain(">-3.3<");
    expect(lead).not.toContain("Boros Dwarves"); // the dev deck is not on the future-test chart
  });
});
