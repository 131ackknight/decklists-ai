/**
 * How a harness change is judged, automatically (owner, 2026-11-07: "I want to
 * improve this via automated testing, not hand picked ... and i want data, quant
 * data to show the improvements"). Written down before any candidate is run, and
 * frozen like the tests: evals/protocol.test.ts fails if it changes, so the rule
 * can't be bent to fit a result. A new rule is a new id.
 */
import { createHash } from "node:crypto";

/** protocol-v1, retired 2026-11-08 for protocol-v2 (below). Its content is frozen; verdicts made under it stand. */
export const PROTOCOL_V1 = {
  id: "protocol-v1",
  /** The harness every candidate is compared with. A kept candidate becomes the next protocol's base. */
  base: "v13",
  model: "claude-opus-5-5",
  /** Changes are tried here, as often as needed. */
  dev: "holdout-v1",
  /** Looked at only to confirm a change that already won on dev, so the decision isn't tuned to it. */
  test: ["tuning-v1", "brewing-v1"],
  devRuns: 3,
  testRuns: 2,
  /**
   * The data every compared run must have used (sha256, first 16 hex). Runs record theirs in the
   * register; older runs without a record count if they finished after the file was last changed.
   * New data goes in a copy (forward-week.ts --history) until a new protocol adopts it.
   */
  data: {
    history: { file: "data/reference-lists-all.jsonl", sha256: "98511a8b770ce43d", since: "2026-10-20T14:19:47Z" },
    recent: { file: "data/reference-lists.jsonl", sha256: "8a4ba5f40938aae8", since: "2026-10-14T13:18:53Z" },
  },
  rule:
    "A candidate is kept if, on dev, the 95% range of its gain over the base is above zero, and on each test the top of the 95% range is above zero (not clearly worse). Gain: for each deck, the version's score averaged over its runs, minus the base's; the gain is the mean over decks, with a paired t interval. Both versions need the full number of runs before a verdict.",
  frozen: "5ffaca503a226323",
};

/**
 * protocol-v2 (2026-11-08). Owner: "Yes, use Added". The match % rewards copying the right old deck:
 * from v2 to v13 the match rose 2.2 points on dev while what the decks add beyond their closest earlier
 * list rose 0.3 (PROGRESS.md section 2f). Same base, model, data and run counts as protocol-v1 (Added is
 * about as noisy per deck as the match: 4.7 vs 4.9 between v13's runs). The score is Added; the match %
 * is a guard, so a deck can't gain Added just by being far from every old list.
 */
export const PROTOCOL_V2 = {
  id: "protocol-v2",
  base: "v13",
  model: "claude-opus-5-5",
  /** Per deck: the match % minus the match % of the deck's single closest earlier list (evals/score.ts addedScore). */
  score: "added",
  dev: "holdout-v1",
  test: ["future-v1"],
  devRuns: 3,
  testRuns: 2,
  data: {
    history: { file: "data/reference-lists-all.jsonl", sha256: "98511a8b770ce43d", since: "2026-10-20T14:19:47Z" },
    recent: { file: "data/reference-lists.jsonl", sha256: "8a4ba5f40938aae8", since: "2026-10-14T13:18:53Z" },
  },
  rule:
    "A candidate is kept if, on dev, the 95% range of its gain in Added over the base is above zero and the top of the 95% range of its gain in match % is above zero (match not clearly worse), and on test the top of the 95% range of its gain in Added is above zero (not clearly worse). Added, per deck: the deck's match % minus the match % of its single closest earlier list (most cards shared, among the format's lists from before the deck's date). Gains are paired by deck, each deck's score averaged over a version's runs. Both versions need the full number of runs before a verdict.",
  frozen: "71e17fdd554464fc",
};

/**
 * protocol-v3 (2026-11-09). Owner: "Yes, fix the test". protocol-v2 on holdout-v2 and future-v2: the same
 * decks, but in Standard a card not legal on the deck's date earns nothing (evals/score.ts legalOnDateView).
 * Under v2 the settled lists, 1-3 months later, could run cards reprinted into Standard in between, so a
 * deck that played them early (v13: 2.0 copies per Standard dev deck) scored for them. Runs made for the
 * v1 tests count for the v2 tests: same items, only the scoring differs.
 */
export const PROTOCOL_V3 = {
  ...PROTOCOL_V2,
  id: "protocol-v3",
  dev: "holdout-v2",
  test: ["future-v2"],
  rule:
    "As protocol-v2, on holdout-v2 (dev) and future-v2 (test). A candidate is kept if, on dev, the 95% range of its gain in Added over the base is above zero and the top of the 95% range of its gain in match % is above zero (match not clearly worse), and on test the top of the 95% range of its gain in Added is above zero (not clearly worse). In Standard, cards not legal on the deck's date earn nothing. Gains are paired by deck, each deck's score averaged over a version's runs. Both versions need the full number of runs before a verdict.",
  frozen: "16fe24e836fa7cec",
};

/** The protocol in force. */
export const PROTOCOL = PROTOCOL_V3;
export const PROTOCOLS = [PROTOCOL_V1, PROTOCOL_V2, PROTOCOL_V3];

export function protocolFingerprint(p: { frozen: string } = PROTOCOL): string {
  const { frozen: _, ...rest } = p;
  return createHash("sha256").update(JSON.stringify(rest)).digest("hex").slice(0, 16);
}

/** Two-sided 95% t critical values by degrees of freedom; 1.96 beyond 30. */
const T95: Record<number, number> = { 1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571, 6: 2.447, 7: 2.365, 8: 2.306, 9: 2.262, 10: 2.228, 11: 2.201, 12: 2.179, 13: 2.16, 14: 2.145, 15: 2.131, 16: 2.12, 17: 2.11, 18: 2.101, 19: 2.093, 20: 2.086, 21: 2.08, 22: 2.074, 23: 2.069, 24: 2.064, 25: 2.06, 26: 2.056, 27: 2.052, 28: 2.048, 29: 2.045, 30: 2.042 };

/**
 * The gain of a candidate over the base, paired by deck: each deck's score averaged
 * over a version's runs, candidate minus base, then the mean and a 95% t interval
 * over decks. Decks missing from either side are left out (n says how many count).
 */
export function pairedGain(candidate: Map<string, number>[], base: Map<string, number>[]) {
  const avg = (runs: Map<string, number>[], id: string) => {
    const xs = runs.map((r) => r.get(id)).filter((x): x is number => x !== undefined);
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined;
  };
  const ids = [...new Set(candidate.flatMap((r) => [...r.keys()]))];
  const diffs = ids.flatMap((id) => {
    const [c, b] = [avg(candidate, id), avg(base, id)];
    return c !== undefined && b !== undefined ? [c - b] : [];
  });
  const n = diffs.length;
  const gain = diffs.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(diffs.reduce((a, d) => a + (d - gain) ** 2, 0) / (n - 1));
  const half = (T95[n - 1] ?? 1.96) * (sd / Math.sqrt(n));
  return { n, gain, lo: gain - half, hi: gain + half };
}
