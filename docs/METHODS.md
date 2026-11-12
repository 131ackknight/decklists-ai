# Methods

How the brewer is tested and how a result is allowed to count. The [findings](FINDINGS.md) say what came out; the [scoreboard](../PROGRESS.md) has every number.

## The test decks

A test deck is a real archetype that appeared from nothing in the history of public Magic Online results (145,131 lists across 8 formats since July 2025). [scripts/find-new-archetypes.ts](../scripts/find-new-archetypes.ts) keeps an archetype when:

- its first list comes at least 45 days after the format's data begins, so there is a real "before";
- it caught on: 15 or more lists in its first 90 days (the future test asks for 3 or more lists from a week after it appeared);
- it was new: its first 5 lists share at most 40 of 60 cards with any earlier list (the median over those lists);
- its label is a strategy, not a bare color pair.

| Test | Decks | First seen | Used for |
| --- | --- | --- | --- |
| Dev (`holdout-v2`) | 21 | September 2025 to August 2026 | Trying changes. Looked at often |
| Future test (`future-v2`) | 14 | Since April 2026 | Checking a change that won on dev. Looked at rarely |
| Post-cutoff (`post-v1`) | 6 | After the model's training cutoff (June 2026) | The model can't have read about these |
| Idea-named (`holdout-idea-v1`, `future-idea-v1`) | The dev and future decks | | The same decks with a fuller request (below) |

6 of the future test's 14 decks are not dev archetypes. They are reported apart, because nothing was ever tuned on them.

## One test, step by step

1. **The request.** One sentence: "Brew me a Modern deck built around A, B and C." The cards are the deck's *signature cards*: in 80% or more of its first 10 lists, in 5% or less of the format's lists before it, and in existence on the day. The standard tests name up to 3. By the same rule the decks have 6.6 on average, and the idea-named tests name them all.
2. **The clock.** The brewer gets the decklists from before the deck's first day and a card pool cut to that day. In Standard it also gets the legality of that day, not today's ([src/cards/standard.ts](../src/cards/standard.ts)).
3. **The build.** The brewer returns 60 cards and a sideboard. Only the 60 are scored.
4. **The answer key.** Up to 50 of the archetype's real lists from after it settled: days 30 to 90 for the dev decks, from day 7 on for the future test.
5. **The score.** For each real list, the cards shared with the build, copy for copy, out of 60. The mean over the lists is the deck's score; the mean over decks is the test's. In Standard, a card that was not legal on the deck's day earns nothing.

## Other views of the same builds

- **Without lands.** Lands are taken out of the build and out of each real list; the score is the cards the two piles share over the average size of the two piles ([evals/score.ts](../evals/score.ts), `partScores`).
- **Points by kind of card.** The whole-deck score split into points from lands, from the signature cards the request didn't name, and from the other spells. The three add up to the score.
- **Added.** The score minus the score of the single closest earlier list. A build that copies an old deck scores what that deck scores and adds nothing; this separates brewing from copying.

## Yardsticks

Every score is read against the same builds of real decks:

| Yardstick | What it is | Dev |
| --- | --- | --- |
| The model alone (`v0`) | One call to the same model, with no tools, data or checks | 33.9 |
| The inventors | The deck's own first-week lists | 65.7 |
| A later real list | One settled list scored against the others | 78.6 |
| Best possible | The 60 copies most settled lists play | 85.4 |

A real list can't score 100 against other real lists, so 100 is not the target ([scripts/ceiling-check.ts](../scripts/ceiling-check.ts)).

## Frozen tests

Each test in [evals/tests.ts](../evals/tests.ts) carries a fingerprint over its decks, requests, cards and settings, and a unit test fails if any of them changes. A test never changes under its name. When a flaw was found (Standard cards scoring before they were legal), the fix was a new version, `holdout-v2`, and the old scores stayed comparable with old scores.

The data is pinned too: every scored run names the files it read by hash, and a newer export goes into a copy.

## When a change is kept

The rule is written in [evals/protocol.ts](../evals/protocol.ts) and has its own fingerprint. In force now (protocol-v4):

- A candidate is compared with the base brewer on the dev decks: 3 runs each, paired deck by deck, with a 95% t interval over decks.
- It is kept only if the range of its gain in Added is above zero and its match % is not clearly worse.
- A dev win is then checked on the future test, where it must not be clearly worse.
- Both versions need their full runs before a verdict.

Earlier protocols are retired, not rewritten: the scoreboard keeps their verdicts as they were.

**Noise.** The same version run twice differs by 1.2 to 1.6 points on a whole test, and one deck's score moves about 5 points between runs. One run per version can't show a gain. With 3 runs each, a gain of about 2.5 points is detectable.

## A rule before the measurement

Since November, each paid run and each analysis starts with a build-log entry that says what will be counted, which result would mean what, and a guess. The entry is committed before the run. Afterwards the guess is scored next to the result. Splits made after seeing a result are labeled as such and treated as leads.

## Runs, cost and the scoreboard

- **The register.** Every paid run appends a line to [evals/runs.jsonl](../evals/runs.jsonl) when it starts and when it finishes: the script, the commit, the data hashes, the result file and the cost. A started line with no finished line is a run that crashed or was stopped. Runs from before the register were added from their result files.
- **Results** are saved after every deck, so a stopped run keeps what it built.
- **The scoreboard** ([PROGRESS.md](../PROGRESS.md)) is written by [scripts/scoreboard.ts](../scripts/scoreboard.ts) from the register, the result files and the owner's exported answers. It is never edited by hand. One section holds numbers that exist only in the log, and says so.
- **The figures** in [docs/figures/](figures/) are drawn by [scripts/figures.ts](../scripts/figures.ts) from the scoreboard, so they show only numbers the scoreboard prints.

## The owner's judging

The automatic score measures likeness to what players played. Whether a deck is one you would play is judged by a person:

- **The blind panel** (`panel-v1`): 17 frozen prompts in Premodern and Legacy, formats the owner knows well. Every version builds all 17 fresh; decks from different versions are shuffled together with no labels; the answer is yes or no.
- **Earlier rounds:** blind ratings and head-to-head pairs. Every answer is exported to [evals/answers/](../evals/answers/).
- The brewer never learns from the owner's notes or verdicts. Early on, the owner's one-line reasons for a "no" were turned into checks in code; that is logged where it happened.

## Known weaknesses

- **Small tests.** 21 and 14 decks. Most ranges are several points wide.
- **Training overlap.** 19 of the 21 dev decks appeared before the model's training ended. The model alone may remember them, which flatters it there.
- **Likeness is not strength.** A build can differ from the real deck and be as good. The simulator says the brewer's mana works as well as the real decks' where it differs.
- **Single builds.** The idea-named tests have one build per deck so far.
- **One wrinkle in the Standard date check:** it marks a few cards as not yet legal that requests name. Legality counts from it are not quoted until that is looked at.
- **One model family.** Every run is on Claude models.
