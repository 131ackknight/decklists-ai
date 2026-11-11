/**
 * The yardsticks, frozen (owner, 2026-11-07: "We arent very careful with our data are we?").
 * A test never changes under its name: its items, parameters and the items' prompts and
 * cards are fingerprinted, and evals/tests.test.ts fails if any of them change. To change a
 * test, add a new version (tuning-v2) with its own fingerprint; old scores stay comparable
 * with old scores. dataThrough pins the real lists each score reads, so merging newer MTGO
 * data doesn't move an old number.
 */
import { createHash } from "node:crypto";
import type { Round4Item } from "./round4/items";

export interface TestDef {
  id: string;
  kind: "automatic" | "owner" | "diagnostic";
  what: string;
  params: Record<string, string | number | boolean>;
  /** Round 4 item ids, or "item|source" for tests built on pairs of results. */
  items: string[];
  /** sha256 of the definition and the items' content; see fingerprint(). */
  frozen: string;
}

export const TESTS: TestDef[] = [
  {
    id: "holdout-v1",
    kind: "automatic",
    what: "Brew holdout: rebuild 21 decks that appeared from nothing, from the data and cards that existed the day each appeared. Score: mean main deck overlap, out of 60, with up to 50 of the lists players settled on (days 30-90 after it appeared), whole % per deck, mean over decks.",
    params: {"track": "holdout", "windowDays": "30-90", "sample": 50, "score": "overlap of 60, rounded per deck", "dataThrough": "2026-10-20"},
    items: [
      "holdout-standard-reanimator",
      "holdout-standard-temur-harmonizer",
      "holdout-standard-aang",
      "holdout-standard-lessons",
      "holdout-standard-elementals",
      "holdout-standard-dimir-excruciator",
      "holdout-standard-mardu-discard",
      "holdout-standard-4c-control",
      "holdout-standard-boros-dwarves",
      "holdout-standard-jund-sacrifice",
      "holdout-pioneer-golgari-midrange",
      "holdout-pioneer-lessons",
      "holdout-modern-cosmogoyf",
      "holdout-modern-persist",
      "holdout-modern-fanatic-eldrazi",
      "holdout-legacy-creative-technique",
      "holdout-legacy-phoenix",
      "holdout-vintage-sewer-cam-combo",
      "holdout-pauper-metalcraft",
      "holdout-pauper-inside-out",
      "holdout-premodern-living-death",
    ],
    frozen: "752de68a4c967e1e",
  },
  {
    id: "post-v1",
    kind: "automatic",
    what: "Post-cutoff: 6 archetypes first seen after the models' training cutoff (June 2026). Same score as holdout-v1, against every list from a week after each appeared.",
    params: {"track": "post", "windowDays": "7-365", "sample": 50, "score": "overlap of 60, rounded per deck", "dataThrough": "2026-10-20"},
    items: [
      "post-standard-gearhulk",
      "post-standard-boros-dwarves",
      "post-standard-jund-sacrifice",
      "post-standard-boros-planeswalkers",
      "post-pioneer-4c-control",
      "post-pioneer-simic-beanstalk",
    ],
    frozen: "d53dadf17088ea15",
  },
  {
    id: "future-v1",
    kind: "automatic",
    what: "Future test, old score: constructed archetypes first seen since 2026-04-01 that have 3+ lists from a week after they appeared. Same score as holdout-v1.",
    params: {"track": "future", "windowDays": "7-365", "minSettledLists": 3, "sample": 50, "score": "overlap of 60, rounded per deck", "dataThrough": "2026-10-20"},
    items: [
      "future-standard-4c-control",
      "future-standard-gearhulk",
      "future-standard-boros-dwarves",
      "future-standard-jund-sacrifice",
      "future-pioneer-fight-rigging",
      "future-pioneer-boros-aggro",
      "future-pioneer-4c-control",
      "future-modern-persist",
      "future-modern-fanatic-eldrazi",
      "future-legacy-riddlesmith-combo",
      "future-legacy-phoenix",
      "future-pauper-metalcraft",
      "future-pauper-inside-out",
      "future-premodern-rector-combo",
    ],
    frozen: "fe3a6eff1f2a6c2e",
  },
  {
    id: "tuning-v1",
    kind: "automatic",
    what: "Tuning Test: the future-test decks with first-week and later lists. Score: mean overlap with up to 50 lists from a week after the deck appeared, as a share of each real list, mean over decks.",
    params: {"track": "future", "windowDays": "7+", "sample": 50, "score": "share of each real list", "dataThrough": "2026-10-20"},
    items: [
      "future-standard-4c-control",
      "future-standard-gearhulk",
      "future-standard-boros-dwarves",
      "future-standard-jund-sacrifice",
      "future-standard-boros-planeswalkers",
      "future-pioneer-fight-rigging",
      "future-pioneer-boros-aggro",
      "future-pioneer-4c-control",
      "future-pioneer-simic-beanstalk",
      "future-modern-persist",
      "future-modern-fanatic-eldrazi",
      "future-legacy-riddlesmith-combo",
      "future-legacy-phoenix",
      "future-pauper-metalcraft",
      "future-pauper-inside-out",
      "future-premodern-rector-combo",
      "future-premodern-sneak-attack",
    ],
    frozen: "bdf12aad624afe7d",
  },
  {
    id: "brewing-v1",
    kind: "automatic",
    what: "Brewing Test: the future-test decks with 2+ first-week lists. Score: mean overlap with the first-week lists (the inventor's version), as a share of each list. Gems: nonland cards in 80%+ of the first-week lists with under 5% play in the format in the 90 days before, not counting the requested cards.",
    params: {"track": "future", "firstWeekDays": 7, "minFirstWeekLists": 2, "gemCore": 0.8, "gemMaxPriorShare": 0.05, "dataThrough": "2026-10-20"},
    items: [
      "future-standard-4c-control",
      "future-standard-gearhulk",
      "future-standard-boros-dwarves",
      "future-standard-boros-planeswalkers",
      "future-pioneer-fight-rigging",
      "future-pioneer-boros-aggro",
      "future-pioneer-4c-control",
      "future-pioneer-simic-beanstalk",
      "future-modern-fanatic-eldrazi",
      "future-legacy-phoenix",
      "future-pauper-metalcraft",
      "future-pauper-inside-out",
      "future-premodern-rector-combo",
    ],
    frozen: "6c952a11eabf635f",
  },
  {
    id: "panel-v1",
    kind: "owner",
    what: "Blind panel: the owner's 17 frozen prompts. Every version builds all 17 fresh; decks from different versions are shuffled together, decks only, no labels; the owner answers yes or no. Score: yes, of 17.",
    params: {"judge": "owner", "blind": true, "decksOnly": true, "answer": "yes/no"},
    items: [
      "expert2-premodern-rising-waters",
      "expert2-premodern-mind-over-matter",
      "expert2-premodern-phyrexian-processor",
      "expert2-premodern-shapeshifter-phage",
      "expert2-premodern-seismic-assault",
      "expert2-premodern-rofellos",
      "expert2-legacy-oracle-pact",
      "expert2-legacy-glimpse-elves",
      "expert2-legacy-bomberman",
      "expert2-legacy-hypergenesis",
      "expert2-legacy-scapeshift",
      "expert2-legacy-kiki-pestermite",
      "expert3-premodern-wildfire",
      "expert3-premodern-zurs-weirding",
      "expert3-premodern-squandered-balance",
      "expert3-premodern-mill",
      "expert3-premodern-nether-spirit",
    ],
    frozen: "157eb5bf59e3ea38",
  },
  {
    id: "taste-v1",
    kind: "diagnostic",
    what: "Taste test: the tuned real list (the most typical list a week+ after the deck appeared) against the v13 brew for the same request, no request shown, both orders. Score: how often the judge picks the real deck.",
    params: {"real": "tuned list", "requestShown": false, "orders": 2, "brews": "future-v13-claude-opus-5-5.json", "dataThrough": "2026-10-20"},
    items: [
      "future-standard-4c-control",
      "future-standard-gearhulk",
      "future-standard-boros-dwarves",
      "future-standard-jund-sacrifice",
      "future-standard-boros-planeswalkers",
      "future-pioneer-fight-rigging",
      "future-pioneer-boros-aggro",
      "future-pioneer-4c-control",
      "future-pioneer-simic-beanstalk",
      "future-modern-persist",
      "future-modern-fanatic-eldrazi",
      "future-legacy-riddlesmith-combo",
      "future-legacy-phoenix",
      "future-pauper-metalcraft",
      "future-pauper-inside-out",
      "future-premodern-rector-combo",
      "future-premodern-sneak-attack",
    ],
    frozen: "d204410bfb8570ee",
  },
  {
    id: "taste-first-v1",
    kind: "diagnostic",
    what: "Taste test variant: the inventor's first list against the v13 brew, request shown, both orders.",
    params: {"real": "first list", "requestShown": true, "orders": 2, "brews": "future-v13-claude-opus-5-5.json", "dataThrough": "2026-10-20"},
    items: [
      "future-standard-4c-control",
      "future-standard-gearhulk",
      "future-standard-boros-dwarves",
      "future-standard-jund-sacrifice",
      "future-standard-boros-planeswalkers",
      "future-pioneer-fight-rigging",
      "future-pioneer-boros-aggro",
      "future-pioneer-4c-control",
      "future-pioneer-simic-beanstalk",
      "future-pioneer-boros-dragons",
      "future-modern-persist",
      "future-modern-fanatic-eldrazi",
      "future-legacy-riddlesmith-combo",
      "future-legacy-phoenix",
      "future-pauper-metalcraft",
      "future-pauper-inside-out",
      "future-premodern-rector-combo",
      "future-premodern-sneak-attack",
    ],
    frozen: "b7d5055675ba16f8",
  },
  {
    id: "gem-v1",
    kind: "diagnostic",
    what: "Gem test: the inventor's gems mixed with look-alikes (as under-played, legal, in the requested colors, ranked high by the synergy model, under 20% of the real deck's lists), 30 cards per deck, one rating call. Score: chance a gem is rated above a look-alike.",
    params: {"cards": 30, "lookAlikeMaxShare": 0.2, "dataThrough": "2026-10-20"},
    items: [
      "future-standard-4c-control",
      "future-standard-gearhulk",
      "future-standard-boros-dwarves",
      "future-standard-boros-planeswalkers",
      "future-pioneer-fight-rigging",
      "future-pioneer-boros-aggro",
      "future-pioneer-4c-control",
      "future-pioneer-simic-beanstalk",
      "future-pioneer-boros-dragons",
      "future-modern-fanatic-eldrazi",
      "future-legacy-phoenix",
      "future-pauper-metalcraft",
      "future-pauper-inside-out",
      "future-premodern-rector-combo",
    ],
    frozen: "bce4c4b84433a269",
  },
  {
    id: "picker-v1",
    kind: "diagnostic",
    what: "Picker test: pairs of decks for one prompt where the owner said yes to one and no to the other; both orders. Score: how often the picker chooses the owner's yes.",
    params: {"orders": 2},
    items: [
      "expert2-premodern-rising-waters|v2 vs v18",
      "expert2-premodern-mind-over-matter|v2 vs v18",
      "expert2-premodern-phyrexian-processor|v2 vs v18",
      "expert2-premodern-shapeshifter-phage|v2 vs v18",
      "expert2-premodern-seismic-assault|v2 vs v18",
      "expert2-premodern-rofellos|v2 vs v18",
      "expert2-legacy-bomberman|v2 vs v18",
      "expert3-premodern-wildfire|v2 vs v18",
      "expert3-premodern-wildfire|v18 two builds",
      "expert3-premodern-squandered-balance|v2 vs v18",
      "expert3-premodern-mill|v2 vs v18",
      "expert3-premodern-mill|v18 two builds",
      "expert3-premodern-nether-spirit|v18 two builds",
    ],
    frozen: "7b8cf34cd76d6ef6",
  },
  {
    id: "playtest-v1",
    kind: "diagnostic",
    what: "Text playtest: decks the owner wrote a specific complaint about; the AI plays 2 dealt games against the format's most-played deck and lists problems; a grader compares the list with the note. Score: yes / partly / no.",
    params: {"games": 2, "grader": "claude-opus-5-5"},
    items: [
      "expert2-legacy-hypergenesis|expert2-v11-claude-opus-5-5.json",
      "expert2-premodern-seismic-assault|expert2-v11-claude-opus-5-5.json",
      "expert2-premodern-mind-over-matter|expert2-v11-claude-opus-5-5.json",
      "expert2-premodern-rofellos|expert2-v11-claude-opus-5-5.json",
      "expert2-legacy-scapeshift|expert2-v11-claude-opus-5-5.json",
      "expert2-legacy-kiki-pestermite|expert2-v11-claude-opus-5-5.json",
      "expert2-legacy-bomberman|expert2-v12-claude-opus-5-5-partial.json",
      "expert2-legacy-scapeshift|expert2-v12-claude-opus-5-5-partial.json",
      "expert2-premodern-mind-over-matter|expert2-v12-claude-opus-5-5-partial.json",
      "expert3-premodern-wildfire|expert3-v12-claude-opus-5-5.json",
      "expert3-premodern-mill|expert3-v12-claude-opus-5-5.json",
      "expert2-legacy-kiki-pestermite|expert2+expert3-v18-claude-opus-5-5-panel.json",
      "expert2-premodern-mind-over-matter|expert2+expert3-v18-claude-opus-5-5-panel.json",
      "expert2-premodern-seismic-assault|expert2+expert3-v2-claude-opus-5-5-panel.json",
    ],
    frozen: "86ed472123ba3a8c",
  },
  {
    id: "found-squee-v1",
    kind: "diagnostic",
    what: "Found deck: the owner's mono-blue Squee Bouncer list from outside MTGO. Two prompts; score: main deck cards shared with the list, of 60.",
    params: {"list": "evals/round4/lists/found/premodern-mono-blue-squee-bouncer.json"},
    items: [
      "found-premodern-squee-bouncer-a",
      "found-premodern-squee-bouncer-b",
    ],
    frozen: "d022a92cc25cebe3",
  },
];

/**
 * holdout-v2 and future-v2 (2026-11-09; owner: "Yes, fix the test"): the same decks and windows as v1, but
 * a card that wasn't legal in Standard on the deck's date earns nothing, in the deck and in the earlier list
 * Added compares it with (evals/score.ts legalOnDateView). In v1 the settled lists, 1-3 months later, could
 * run cards that became legal in between, so early, illegal picks scored.
 */
const LEGAL_ON_DATE: Record<string, { from: string; frozen: string }> = {
  "holdout-v2": { from: "holdout-v1", frozen: "b5aa178ea64f7a21" },
  "future-v2": { from: "future-v1", frozen: "bca69e33270f1205" },
};
for (const [id, { from, frozen }] of Object.entries(LEGAL_ON_DATE)) {
  const base = TESTS.find((t) => t.id === from)!;
  TESTS.push({
    ...base,
    id,
    what: `${base.what} Cards not legal in Standard on the deck's date (src/cards/standard.ts) earn nothing, in the deck and in the earlier list Added compares it with.`,
    params: { ...base.params, legality: "Standard on the deck's date" },
    items: [...base.items],
    frozen,
  });
}

/**
 * holdout-idea-v1 (2026-11-11; owner: "Yes, run it"): holdout-v2's decks, dates, windows and scoring, with
 * prompts that name every signature card of the deck, not only the first 3 (evals/round4/items.ts ideaItems,
 * evals/brew-holdout/idea-signatures.json). holdout-v2 asks the brewer to guess the idea from 3 cards and
 * build it; this one gives the idea and asks only for the build. The two are never mixed: a version has a
 * score on each.
 */
{
  const base = TESTS.find((t) => t.id === "holdout-v2")!;
  TESTS.push({
    ...base,
    id: "holdout-idea-v1",
    what: `${base.what} The prompt names every signature card of the deck (in 80% of its first 10 lists, in 5% or less of the format's lists before), not only the first 3.`,
    params: { ...base.params, track: "idea", prompt: "names every signature card" },
    items: base.items.map((id) => `idea-${id}`),
    frozen: "d51959d4ac6ecaea",
  });
}

/** Tests with exactly the same items: a run that built one built the others (holdout-v1 and holdout-v2). */
export function sameItems(a: string, b: string): boolean {
  const [x, y] = [TESTS.find((t) => t.id === a), TESTS.find((t) => t.id === b)];
  return !!x && !!y && x.items.length === y.items.length && x.items.every((k, i) => k === y.items[i]);
}

export const testById = (id: string) => {
  const t = TESTS.find((x) => x.id === id);
  if (!t) throw new Error(`Unknown test ${id}`);
  return t;
};

/** The automatic and owner tests a run can be scored on: those whose every item the run built. */
export function testsCoveredBy(itemIds: string[]): string[] {
  const have = new Set(itemIds);
  return TESTS.filter((t) => t.kind !== "diagnostic" && t.items.every((key) => have.has(key))).map((t) => t.id);
}

/** sha256 of the test's definition plus, for each item, the prompt, cards and target the brewer gets. */
export function fingerprint(t: TestDef, items: Round4Item[]): string {
  const byId = new Map(items.map((it) => [it.id, it]));
  const content = t.items.map((key) => {
    const it = byId.get(key.split("|")[0]);
    return it ? { key, prompt: it.prompt, keyCards: it.keyCards ?? null, target: it.target ?? null, before: it.before } : { key, missing: true };
  });
  return createHash("sha256").update(JSON.stringify({ id: t.id, kind: t.kind, what: t.what, params: t.params, content })).digest("hex").slice(0, 16);
}
