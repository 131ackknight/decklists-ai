# Scripts

66 scripts. Each line below is the first sentence of the script's own header comment, and the header says how to run it. The [build log](../BUILD_LOG.md) has the question each one was written for and what it found.

## Runs that call the model (paid)

Each needs an Anthropic API key and records itself in `evals/runs.jsonl`. `run-round4.ts` is the one that runs the tests.

| Script | What it does |
| --- | --- |
| [brainstorm-shells.ts](brainstorm-shells.ts) | Diagnostic: is the right deck in the model's head, just not its first idea? |
| [brew-one.ts](brew-one.ts) | Brew one deck for a prompt, with today's 90-day data (like round 4's fresh track). |
| [eval-intent.ts](eval-intent.ts) | Grade the intent stage against hand labels. |
| [forward-week.ts](forward-week.ts) | The forward test: brew new decks the week they appear, before anyone (model or us) has seen how they settle. |
| [gem-test.ts](gem-test.ts) | Can the AI recognize a hidden gem when it's shown one? |
| [judge-test.ts](judge-test.ts) | Can Opus tell the right listed spells from the wrong ones when asked directly? |
| [land-note-test.ts](land-note-test.ts) | A land note, with the AI making the swaps, tested on saved decks (2026-11-10). |
| [land-step-test.ts](land-step-test.ts) | The owner's land step, tested on saved decks (2026-11-08): "add a land step, like reads cards if it needs extra lands, and making sure the manabase makes sense." |
| [picker-test.ts](picker-test.ts) | Can the AI pick the deck the owner would play? |
| [playtest.ts](playtest.ts) | Text playtest (2026-10-24): does playing a deck out find what the owner found? |
| [run-harness-eval.ts](run-harness-eval.ts) | Run the decklists.ai harness on the rubric prompts. |
| [run-round4.ts](run-round4.ts) | Run round 4 (owner-written evals) on one harness and model. |
| [taste-test.ts](taste-test.ts) | The taste test (2026-10-24): does the AI value what a strong brewer values? |

## Scoring and reports (free)

`scoreboard.ts` writes PROGRESS.md, and `figures.ts` draws `docs/figures/` from it.

| Script | What it does |
| --- | --- |
| [analyze-pairwise.ts](analyze-pairwise.ts) | Unblind pairwise picks and summarize them. |
| [analyze-ratings.ts](analyze-ratings.ts) | Unblind the owner's ratings and summarize them per model. |
| [compare-runs.ts](compare-runs.ts) | Compare two sets of saved dev runs on the decks they share (2026-11-09). |
| [figures.ts](figures.ts) | Draws the figures in docs/figures/ from the scoreboard. |
| [forward-score.ts](forward-score.ts) | Score forward-test brews once their decks have settled. |
| [idea-test-check.ts](idea-test-check.ts) | The idea-named tests against the 3-card tests, per deck (2026-11-11; owner: "Yes, run it"). |
| [no-lands-check.ts](no-lands-check.ts) | The score without lands (2026-11-11). |
| [novelty.ts](novelty.ts) | How much of each answer is an existing deck? |
| [score-found.ts](score-found.ts) | How close do brews get to a deck the owner found outside MTGO? |
| [score-round4.ts](score-round4.ts) | Score round 4 results against what real players did, plus no-model baselines. |
| [score-tests.ts](score-tests.ts) | The two yardsticks on the future test decks (owner, 2026-10-22: "lets have a specific Tuning Test and a Brewing Test"). |
| [score-v1-runs.ts](score-v1-runs.ts) | Objective scores for v1 eval runs, per model and pass. |
| [scoreboard.ts](scoreboard.ts) | Writes PROGRESS.md from the files, never by hand (2026-11-07, owner: "We arent very careful with our data are we?"). |

## Building the tests, the data files and the judging pages (free)

Most of these read the tournament decklist exports, which are not in the repository.

| Script | What it does |
| --- | --- |
| [backfill-runs.ts](backfill-runs.ts) | One-time: record every run that happened before the register existed (2026-11-07), from the result files it left. |
| [build-archetype-profiles.ts](build-archetype-profiles.ts) | Build per-archetype mana profiles (land count and colored sources) from Decklist Data's export, and report how many real lists sit inside their own archetype's bands. |
| [build-blind-page.ts](build-blind-page.ts) | Build the Blind Brew Scorecard from eval result files. |
| [build-card-index.ts](build-card-index.ts) | Download Scryfall's Oracle Cards and Oracle Tags bulk files and build data/scryfall/card-index.json. |
| [build-idea-signatures.ts](build-idea-signatures.ts) | Every signature card of each test deck, for the "idea named" test (2026-11-11; owner: "Yes, run it"). |
| [build-pairwise-page.ts](build-pairwise-page.ts) | Build the pairwise scorecard: for each prompt both runs answered, the two answers side by side, sides shuffled, no model or harness named. |
| [build-play-page.ts](build-play-page.ts) | Build the "would you play it?" page: one deck at a time from one run, yes/no and a line on what's wrong. |
| [build-rating-page.ts](build-rating-page.ts) | Build the Brew Scorecard page from one or more eval result files. |
| [build-standard-windows.ts](build-standard-windows.ts) | When was each card legal in Standard? |
| [calibrate-checker.ts](calibrate-checker.ts) | Run every real decklist from Decklist Data's export through the deck checker and report pass rates, grouped by failure reason and strategy. |
| [compose-baseline.ts](compose-baseline.ts) | v22's full dev baseline, with no new API calls (2026-11-10; owner: "Yes, make it base"). |
| [compose-land-swap.ts](compose-land-swap.ts) | v23's dev runs, with no new API calls (2026-11-10; owner: "Yes, build it"). |
| [export-v1-prompts.ts](export-v1-prompts.ts) | Write the rubric prompts in the shape the v1 builder takes, with the two "[list pasted in eval]" placeholders filled from Decklist Data's export. |
| [fetch-dld-deck.ts](fetch-dld-deck.ts) | Fetch public Decklist Data deck pages and save each list as JSON. |
| [find-new-archetypes.ts](find-new-archetypes.ts) | Find decks that appeared from nothing in Decklist Data's history: the candidates for the brew holdout test (brew to archetype at scale). |
| [fit-mana-model.ts](fit-mana-model.ts) | Refit the land-count model and the warning thresholds on real decklists. |

## One question each, answered from saved builds (free)

Each was written to answer one question in the build log. They read saved builds and the decklist exports, and spend nothing.

| Script | What it does |
| --- | --- |
| [archetype-history.ts](archetype-history.ts) | When did an archetype first appear, and which cards define it? |
| [beside-colors-check.ts](beside-colors-check.ts) | Do the lists that already run the requested cards have the real deck's colors? |
| [borrow-eval.ts](borrow-eval.ts) | v20 against v13 on the dev decks (2026-11-08): do the decks pick more of the spells inventors borrowed (evals/score.ts borrowedSpells) once they are shown the list? |
| [borrow-listed.ts](borrow-listed.ts) | Does showing a spell make the AI play it? |
| [brewer-profile.ts](brewer-profile.ts) | What a known good brewer's public lists tell us. |
| [candidate-check.ts](candidate-check.ts) | Would a candidate list contain the spells inventors borrowed? |
| [ceiling-check.ts](ceiling-check.ts) | What is the best possible score on this test, and what does the prompt hide? |
| [color-rule-check.ts](color-rule-check.ts) | What would a color rule do? |
| [consensus-check.ts](consensus-check.ts) | Would a vote over several builds of the same deck beat one build? |
| [idea-lands-check.ts](idea-lands-check.ts) | Do lands come back when the brewer has the deck's idea? |
| [land-cut-check.ts](land-cut-check.ts) | The lands the brewer cut from, and added to, the list it built on: which were mistakes? |
| [land-fix-check.ts](land-fix-check.ts) | Can code fix the lands from real decks in the deck's own colors? |
| [land-lookup-check.ts](land-lookup-check.ts) | Would a land lookup show the nonbasic lands the brewer misses? |
| [land-swap-check.ts](land-swap-check.ts) | v23's land swap on saved brews of any version, against the same brews unchanged (2026-11-10). |
| [mana-play-check.ts](mana-play-check.ts) | Does the brewer's mana work in play as well as the real decks' mana? |
| [nonbasic-land-check.ts](nonbasic-land-check.ts) | Which nonbasic lands does the brewer miss, and could it have known them? |
| [other-format-check.ts](other-format-check.ts) | Did the deck already exist in another format? |
| [point-breakdown.ts](point-breakdown.ts) | Where the missing points are, on dev (2026-11-10). |
| [probe-search.ts](probe-search.ts) | Spot-check card search against the real index. |
| [scorer-card-performance.ts](scorer-card-performance.ts) | Scorer v0, part 1: does card choice predict results within an archetype? |
| [sideboard-check.ts](sideboard-check.ts) | How good are the brewer's sideboards? |
| [standard-legality-check.ts](standard-legality-check.ts) | Does the Standard-legality-on-a-date rule (src/cards/standard.ts) hold up? |
| [starting-list-check.ts](starting-list-check.ts) | Which old deck does a brew start from, and could data pick a better one? |
| [synergy-eval.ts](synergy-eval.ts) | Free test of the feature-synergy model, before any brew uses it. |
