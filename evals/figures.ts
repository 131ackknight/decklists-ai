/**
 * The figures in docs/figures/, drawn from the scoreboard (2026-11-11; owner: "Yes, go on").
 *
 * PROGRESS.md is generated from the result files (scripts/scoreboard.ts). These figures are generated
 * from PROGRESS.md (scripts/figures.ts), so they can be redrawn from the repository alone, and they can
 * never show a number the scoreboard doesn't. Pure functions: markdown tables in, SVG text out. No
 * browser and no text measuring: every label sits in a column wide enough for it.
 */

export type Table = { head: string[]; rows: string[][] };

/** The pipe tables between the heading that starts with `heading` and the next heading of its level or higher. */
export function tablesUnder(md: string, heading: string): Table[] {
  const lines = md.split("\n");
  const start = lines.findIndex((l) => l.startsWith(heading));
  if (start < 0) return [];
  const level = heading.match(/^#+/)?.[0].length ?? 1;
  const tables: Table[] = [];
  let cur: string[][] = [];
  const flush = () => {
    if (cur.length >= 2) tables.push({ head: cur[0], rows: cur.slice(2) });
    cur = [];
  };
  for (const l of lines.slice(start + 1)) {
    const h = l.match(/^(#+) /);
    if (h && h[1].length <= level) break;
    if (l.startsWith("|")) cur.push(l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim()));
    else flush();
  }
  flush();
  return tables;
}

/** The first number in a cell: "41.4 (19 decks)" is 41.4, "not run" is NaN. */
export const num = (cell: string | undefined) => {
  const m = cell?.match(/[+-]?\d+(\.\d+)?/);
  return m ? Number(m[0]) : NaN;
};

/** A gain with its range: "+12.8 (+5.2 to +20.5)". */
export function range(cell: string | undefined) {
  const m = cell?.match(/([+-]?\d+\.\d+) \(([+-]?\d+\.\d+) to ([+-]?\d+\.\d+)\)/);
  return m ? { gain: Number(m[1]), lo: Number(m[2]), hi: Number(m[3]) } : null;
}

type Pair = { whole: number; noLands: number };
export interface ScoreboardData {
  /** The three real-deck yardsticks, whole-deck score. */
  yardsticks: { label: string; short: string; sub: string; dev: number; fut: number }[];
  /** Opus versions in build order, with whether each was the base at some point (section 7a). */
  versions: { name: string; base: boolean; dev: Pair; fut: Pair }[];
  /** Section 2i, per test: the level over every deck on each request, and the gain on the changed decks. */
  idea: { test: string; decks: number; changed: number; inventors: number; alone: { old: number; named: number; gain: ReturnType<typeof range> }; brewer: { old: number; named: number; gain: ReturnType<typeof range> } }[];
  /** Section 2i, per deck, both given every signature card. */
  lead: { test: string; deck: string; after: boolean; alone: number; brewer: number }[];
}

/** Everything the figures show, read from PROGRESS.md sections 2h, 2i and 7a. */
export function scoreboardData(md: string): ScoreboardData {
  const views = tablesUnder(md, "### 2h.")[0];
  const [levels, gains, , perDeck] = tablesUnder(md, "### 2i.");
  if (!views || !levels || !gains || !perDeck) throw new Error("PROGRESS.md has no section 2h or 2i in the shape the figures expect. Rerun scripts/scoreboard.ts.");
  const col = (t: Table, name: string) => {
    const i = t.head.indexOf(name);
    if (i < 0) throw new Error(`PROGRESS.md: no column "${name}"`);
    return i;
  };
  const rowOf = (t: Table, start: string) => t.rows.find((r) => r[0].startsWith(start));
  const yard = (start: string, label: string, short: string, sub: string) => ({ label, short, sub, dev: num(rowOf(views, start)?.[col(views, "holdout-v2: whole deck")]), fut: num(rowOf(views, start)?.[col(views, "future-v2: whole deck")]) });
  const status = new Map((tablesUnder(md, "### 7a.")[0]?.rows ?? []).map((r) => [r[0], r[r.length - 1]] as const));
  const pair = (r: string[], test: string): Pair => ({ whole: num(r[col(views, `${test}: whole deck`)]), noLands: num(r[col(views, `${test}: without lands`)]) });
  return {
    yardsticks: [
      yard("The best possible", "Best possible", "Best", "the best 60 cards, picked with hindsight"),
      yard("A settled list", "A real player's later list", "Later list", "real lists agree with each other this much"),
      yard("Inventors", "The inventors' first lists", "Inventors", "the people who came up with the deck"),
    ],
    versions: views.rows
      .filter((r) => /^v\d+$/.test(r[0]))
      .map((r) => ({ name: r[0], base: /^\**(Base|Reference start)/.test(status.get(r[0]) ?? ""), dev: pair(r, "holdout-v2"), fut: pair(r, "future-v2") }))
      .sort((a, b) => Number(a.name.slice(1)) - Number(b.name.slice(1))),
    idea: ["Dev", "Future test"].map((test) => {
      const who = (name: string) => {
        const level = rowOf(levels, `${test}: ${name}`);
        const gain = rowOf(gains, `${test}: ${name}`);
        return { old: num(level?.[col(levels, "3 cards named: whole deck")]), named: num(level?.[col(levels, "Every signature card named: whole deck")]), gain: range(gain?.[col(gains, "Whole deck")]), decks: num(level?.[1]), changed: num(gain?.[1]) };
      };
      const [alone, brewer] = [who("the model alone"), who("the brewer")];
      return { test, decks: brewer.decks, changed: brewer.changed, inventors: num(rowOf(levels, `${test}: inventors`)?.[col(levels, "3 cards named: whole deck")]), alone, brewer };
    }),
    lead: perDeck.rows.map((r) => ({ test: r[0], deck: r[1], after: r[2] === "yes", alone: num(r[3]), brewer: num(r[4]) })),
  };
}

// ---- drawing ----

const [BG, INK, SEC, MUTED, GRID, AXIS, REF, BLUE, ORANGE] = ["#fcfcfb", "#0b0b0b", "#52514e", "#6f6e69", "#e1e0d9", "#c3c2b7", "#898781", "#2a78d6", "#eb6834"];
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const r1 = (x: number) => Math.round(x * 10) / 10;
const tag = (name: string, a: Record<string, string | number>, inner?: string) =>
  `<${name}${Object.entries(a)
    .map(([k, v]) => ` ${k}="${esc(String(typeof v === "number" ? r1(v) : v))}"`)
    .join("")}${inner === undefined ? "/>" : `>${inner}</${name}>`}`;
type TextOpt = { anchor?: "start" | "middle" | "end"; size?: number; weight?: number; fill?: string; halo?: boolean };
const text = (x: number, y: number, s: string, o: TextOpt = {}) =>
  tag("text", { x, y, "text-anchor": o.anchor ?? "start", "font-size": o.size ?? 12, "font-weight": o.weight ?? 400, fill: o.fill ?? INK, ...(o.halo ? { "paint-order": "stroke", stroke: BG, "stroke-width": 3.5, "stroke-linejoin": "round" } : {}) }, esc(s));
const line = (x1: number, y1: number, x2: number, y2: number, stroke: string, width = 1, dash?: string) => tag("line", { x1, y1, x2, y2, stroke, "stroke-width": width, ...(dash ? { "stroke-dasharray": dash } : {}) });
const circle = (cx: number, cy: number, r: number, fill: string, stroke: string, width: number) => tag("circle", { cx, cy, r, fill, stroke, "stroke-width": width });
const diamond = (cx: number, cy: number, r: number, fill: string, stroke: string, width: number) => tag("path", { d: `M${r1(cx)} ${r1(cy - r)}L${r1(cx + r * 0.8)} ${r1(cy)}L${r1(cx)} ${r1(cy + r)}L${r1(cx - r * 0.8)} ${r1(cy)}Z`, fill, stroke, "stroke-width": width });
const rect = (x: number, y: number, w: number, h: number, fill: string, opacity = 1) => tag("rect", { x, y, width: Math.max(0, w), height: h, rx: 3, fill, ...(opacity < 1 ? { opacity } : {}) });
const one = (x: number) => x.toFixed(1);
const signed = (x: number) => `${x > 0 ? "+" : ""}${x.toFixed(1)}`;
const scale = (d0: number, d1: number, p0: number, p1: number) => (v: number) => p0 + ((v - d0) / (d1 - d0)) * (p1 - p0);
const svg = (w: number, h: number, label: string, body: string[]) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${esc(label)}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif">\n${[tag("rect", { width: w, height: h, fill: BG }), ...body].join("\n")}\n</svg>\n`;
const title = (s: string, sub?: string) => [text(24, 34, s, { size: 18, weight: 600 }), ...(sub ? [text(24, 56, sub, { size: 13, fill: SEC })] : [])];
const deckName = (id: string) => id.split("-").map((w) => (/^\d/.test(w) ? w : w[0].toUpperCase() + w.slice(1))).join(" ");

/** Where every score sits on the dev decks: the model alone and the brewer on each request, and the real-deck yardsticks. */
export function ladderSvg(d: ScoreboardData): string {
  const dev = d.idea.find((t) => t.test === "Dev")!;
  const rows = [
    ...d.yardsticks.map((y) => ({ v: y.dev, kind: "ref", full: true, label: y.label, sub: y.sub })),
    { v: dev.brewer.named, kind: "brewer", full: true, label: "The brewer, told the whole idea", sub: "the request names every key card" },
    { v: dev.alone.named, kind: "alone", full: true, label: "The model alone, told the whole idea", sub: "one call, no tools or data" },
    { v: dev.brewer.old, kind: "brewer", full: false, label: "The brewer, told 3 cards", sub: "the standard test" },
    { v: dev.alone.old, kind: "alone", full: false, label: "The model alone, told 3 cards", sub: "one call, no tools or data" },
  ];
  const [W, H, ax] = [900, 650, 170];
  const y = scale(0, 100, 620, 110);
  const body = [
    ...title(`Where every score sits (${dev.decks} dev decks, whole-deck score)`, "The score is how many of a deck's 60 cards match what real players went on to play."),
    circle(30, 82, 6, BLUE, BG, 0),
    text(42, 86, "The brewer", { fill: SEC }),
    diamond(132, 82, 7, ORANGE, BG, 0),
    text(144, 86, "The model alone", { fill: SEC }),
    circle(264, 82, 5, BG, SEC, 1.5),
    text(276, 86, "Hollow: told 3 cards", { fill: SEC }),
    circle(418, 82, 6, SEC, BG, 0),
    text(430, 86, "Filled: told the whole idea", { fill: SEC }),
    line(606, 82, 624, 82, INK, 2.5),
    text(632, 86, "Real decks, for comparison", { fill: SEC }),
    line(ax, y(0), ax, y(100), AXIS, 2),
    ...[0, 20, 40, 60, 80, 100].flatMap((t) => [line(ax - 6, y(t), ax + 6, y(t), AXIS), text(ax - 14, y(t) + 4, String(t), { anchor: "end", fill: SEC }), text(ax - 50, y(t) + 4, `${t * 0.6} of 60 cards`, { anchor: "end", fill: SEC })]),
    ...rows.flatMap((r) => {
      const yy = y(r.v);
      const c = r.kind === "brewer" ? BLUE : ORANGE;
      return [
        line(ax + 10, yy, ax + 52, yy, GRID),
        r.kind === "ref" ? line(ax - 12, yy, ax + 12, yy, INK, 2.5) : r.kind === "brewer" ? circle(ax, yy, 7, r.full ? c : BG, r.full ? BG : c, 2) : diamond(ax, yy, 9, r.full ? c : BG, r.full ? BG : c, 2),
        text(ax + 60, yy + 5, one(r.v), { size: 15, weight: 600 }),
        text(ax + 108, yy + 5, r.label, { size: 14, weight: 500 }),
        text(ax + 400, yy + 5, r.sub, { fill: MUTED }),
      ];
    }),
  ];
  return svg(W, H, "Where every score sits on the dev decks, from the model alone to the best possible", body);
}

/** The score version by version, whole deck and without lands, on both tests. */
export function versionsSvg(d: ScoreboardData): string {
  const [W, H] = [940, 510];
  const y = scale(26, 90, 450, 138);
  const panel = (label: string, key: "dev" | "fut", left: number, right: number) => {
    const vs = d.versions.filter((v) => Number.isFinite(v[key].whole));
    const x = (i: number) => (vs.length > 1 ? left + 46 + (i * (right - left - 62)) / (vs.length - 1) : (left + right) / 2);
    const step = vs.length > 1 ? (right - left - 62) / (vs.length - 1) : 100;
    const base = vs.map((v, i) => ({ v, i })).filter((p) => p.v.base);
    const path = (f: keyof Pair) => base.map((p, k) => `${k ? "L" : "M"}${r1(x(p.i))} ${r1(y(p.v[key][f]))}`).join("");
    const marks = (kept: boolean) =>
      vs.flatMap((v, i) =>
        v.base === kept
          ? [circle(x(i), y(v[key].whole), kept ? 4.5 : 3.5, kept ? BLUE : BG, kept ? BG : BLUE, kept ? 2 : 1.5), diamond(x(i), y(v[key].noLands), kept ? 6.5 : 5, kept ? ORANGE : BG, kept ? BG : ORANGE, kept ? 2 : 1.5)]
          : [],
      );
    return [
      text(left, 120, label, { size: 14, weight: 600 }),
      ...[30, 40, 50, 60, 70, 80, 90].flatMap((t) => [line(left + 28, y(t), right, y(t), GRID), text(left + 22, y(t) + 4, String(t), { anchor: "end", fill: SEC })]),
      line(left + 28, y(26), right, y(26), AXIS),
      ...d.yardsticks.flatMap((s) => [line(left + 28, y(s[key]), right, y(s[key]), REF, 1, "3 4"), text(right, y(s[key]) - 5, `${s.label} ${one(s[key])}`, { anchor: "end", fill: SEC, halo: true })]),
      tag("path", { d: path("whole"), fill: "none", stroke: BLUE, "stroke-width": 2, "stroke-linejoin": "round" }),
      tag("path", { d: path("noLands"), fill: "none", stroke: ORANGE, "stroke-width": 2, "stroke-dasharray": "5 4", "stroke-linejoin": "round" }),
      ...marks(false),
      ...marks(true),
      ...base.flatMap((p, k) =>
        step < 30 && k !== 0 && k !== base.length - 1 && p.v.name !== "v2"
          ? []
          : [text(x(p.i), y(p.v[key].whole) - 9, one(p.v[key].whole), { anchor: "middle", weight: 600, halo: true }), text(x(p.i), y(p.v[key].noLands) + 18, one(p.v[key].noLands), { anchor: "middle", weight: 600, halo: true })],
      ),
      ...vs.map((v, i) => text(x(i), 470, v.name, { anchor: "middle", fill: SEC })),
    ];
  };
  const body = [
    ...title("The score, version by version", "v0 is the model alone. A filled point was the base brewer at some time; a hollow one was tried and not kept."),
    line(24, 84, 46, 84, BLUE, 2),
    circle(35, 84, 4, BLUE, BG, 0),
    text(52, 88, "Whole deck (number above the point)", { fill: SEC }),
    line(290, 84, 312, 84, ORANGE, 2, "5 4"),
    diamond(301, 84, 6, ORANGE, BG, 0),
    text(318, 88, "Without lands (number below)", { fill: SEC }),
    line(520, 84, 542, 84, REF, 1, "3 4"),
    text(548, 88, "Real decks, for comparison (whole deck)", { fill: SEC }),
    ...panel(`Dev test (${d.idea[0].decks} decks)`, "dev", 24, 456),
    ...panel(`Future test (${d.idea[1].decks} decks)`, "fut", 496, 916),
  ];
  return svg(W, H, "The score version by version, whole deck and without lands, on the dev test and the future test", body);
}

/** What naming every signature card does, on both tests: the level over every deck, and the gain on the changed decks. */
export function ideaSvg(d: ScoreboardData): string {
  const [W, H] = [940, 400];
  const panel = (t: ScoreboardData["idea"][number], left: number) => {
    const x = scale(0, 80, left + 124, left + 400);
    const rows = [
      { name: "The model alone", s: t.alone },
      { name: "The brewer", s: t.brewer },
    ];
    return [
      text(left, 122, `${t.test === "Dev" ? "Dev test" : "Future test"} (${t.decks} decks)`, { size: 14, weight: 600 }),
      ...[0, 20, 40, 60, 80].flatMap((v) => [line(x(v), 150, x(v), 350, GRID), text(x(v), 370, String(v), { anchor: "middle", fill: SEC })]),
      line(x(t.inventors), 150, x(t.inventors), 350, REF, 1, "3 4"),
      text(x(t.inventors), 144, `Inventors ${one(t.inventors)}`, { anchor: "middle", fill: SEC }),
      ...rows.flatMap((r, i) => {
        const y = 166 + i * 96;
        return [
          text(left, y + 24, r.name, { size: 13 }),
          rect(x(0), y, x(r.s.old) - x(0), 16, BLUE, 0.3),
          text(x(r.s.old) + 6, y + 12, one(r.s.old), { weight: 600, halo: true }),
          rect(x(0), y + 22, x(r.s.named) - x(0), 16, BLUE),
          text(x(r.s.named) + 6, y + 34, one(r.s.named), { weight: 600, halo: true }),
          ...(r.s.gain ? [text(x(0), y + 58, `${signed(r.s.gain.gain)} on the ${t.changed} changed decks (${signed(r.s.gain.lo)} to ${signed(r.s.gain.hi)})`, { fill: SEC, halo: true })] : []),
        ];
      }),
    ];
  };
  const body = [
    ...title("Naming the whole idea", "The same decks and scoring. The request names every signature card instead of the first 3. Ranges are 95%."),
    rect(24, 78, 24, 10, BLUE, 0.3),
    text(54, 87, "The request names 3 cards", { fill: SEC }),
    rect(230, 78, 24, 10, BLUE),
    text(260, 87, "The request names every signature card", { fill: SEC }),
    line(510, 83, 532, 83, REF, 1, "3 4"),
    text(538, 87, "The decks' inventors", { fill: SEC }),
    ...panel(d.idea[0], 24),
    ...panel(d.idea[1], 496),
  ];
  return svg(W, H, "The score with 3 cards named and with every signature card named, for the model alone and the brewer, on both tests", body);
}

/** The brewer against the model alone, both given every signature card, deck by deck on the future test. */
export function leadSvg(d: ScoreboardData): string {
  const decks = d.lead.filter((r) => r.test === "Future test");
  const groups = [
    { name: "Appeared after the model's training ended", rows: decks.filter((r) => r.after) },
    { name: "The model could have seen these in training", rows: decks.filter((r) => !r.after) },
  ].map((g) => ({ ...g, rows: [...g.rows].sort((a, b) => b.brewer - b.alone - (a.brewer - a.alone)) }));
  const [W, rowH, headH, top] = [940, 26, 34, 100];
  const H = top + groups.reduce((n, g) => n + headH + g.rows.length * rowH, 0) + 40;
  const x = scale(0, 100, 260, 850);
  const body = [
    ...title("The brewer against the model alone, both told the whole idea", "Future test, whole-deck score, one build each. The number at the right is the brewer's lead."),
    diamond(31, 78, 7, ORANGE, BG, 0),
    text(44, 82, "The model alone", { fill: SEC }),
    circle(166, 78, 6, BLUE, BG, 0),
    text(178, 82, "The brewer", { fill: SEC }),
    ...[0, 20, 40, 60, 80, 100].flatMap((t) => [line(x(t), top, x(t), H - 34, GRID), text(x(t), H - 16, String(t), { anchor: "middle", fill: SEC })]),
  ];
  let y = top;
  for (const g of groups) {
    const mean = g.rows.length ? g.rows.reduce((n, r) => n + r.brewer - r.alone, 0) / g.rows.length : NaN;
    body.push(tag("rect", { x: 20, y: y + 4, width: W - 40, height: headH - 8, fill: BG }), text(24, y + 22, `${g.name}: ${g.rows.length} decks, ${signed(mean)} on average`, { size: 13, weight: 600 }));
    y += headH;
    for (const r of g.rows) {
      const cy = y + rowH / 2;
      body.push(text(24, cy + 4, deckName(r.deck), { size: 13 }), line(x(r.alone), cy, x(r.brewer), cy, REF, 2), diamond(x(r.alone), cy, 7, ORANGE, BG, 1.5), circle(x(r.brewer), cy, 5.5, BLUE, BG, 1.5), text(W - 24, cy + 4, signed(r.brewer - r.alone), { anchor: "end", weight: 600 }));
      y += rowH;
    }
  }
  return svg(W, H, "The brewer's lead over the model alone on each future-test deck, split by whether the deck appeared after the model's training ended", body);
}

export const FIGURES = [
  ["score-ladder.svg", ladderSvg],
  ["score-by-version.svg", versionsSvg],
  ["idea-named.svg", ideaSvg],
  ["brewer-against-model-alone.svg", leadSvg],
] as const;
