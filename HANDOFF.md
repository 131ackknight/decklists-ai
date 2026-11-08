# Handoff (2026-10-21, updated 2026-11-08)

Where decklists.ai stands, for the next session. Full history is in BUILD_LOG.md (summary at the top of the dated entries).

## The goal

An AI that brews Magic decks as well as the best human brewers. The owner judges; the owner writes about the project publicly. Update BUILD_LOG.md at every step and send the owner its link.

## Where we are

- **Base harness: v13** (`brewV13` in `src/harness/run.ts`). It builds a legal, on-plan deck the owner would play for most prompts: 12 of 17 of the owner's prompts after one rebuild; "I'd play neither" on the hardest combos went from 50% to 0%.
- **Future test** (14 decks that appeared since April 2026, so no model has seen them): v13 matches 48.3% / 47.9% of what players actually played (two runs); v2 started at 44.9%. Owner's target: 60%.
- **v17** = v13 plus a reviewer that checks every card against evidence from real decks (play share, home deck, usual partners) and makes the brewer fix or explain each flag. On 8 repeat prompts the owner judged it 6 yes, 2 closer, 0 worse (15 of 17 prompts now playable). Not yet the base: confirm on the future test first.

## Next steps

1. DONE (2026-10-22): owner judged the 8 v17 decks: 6 yes, 2 closer, 0 worse; 15 of 17 prompts now have a deck the owner would play. Page: https://claude.ai/artifact/D3Fjqz8oET59q3i8VN4fmR (answers in its `decks` collection; key `evals/results/round4/play-rejudge-v17-key.json`). Read the answers with ArtifactData list on that URL.
2. DONE: logged in BUILD_LOG.md.
3. If v17 helps: run it twice on the future test (`--track future --harness v17`, about $22), then score with `scripts/score-tests.ts`. Two yardsticks now (owner, 2026-10-22): **Tuning Test** (match with the tuned lists) and **Brewing Test** (match with the inventor's first-week lists, plus gems). v13: Tuning 47.4 / 49.2 (17 decks), Brewing 54.2 / 53.5 (13 decks with 2+ first-week lists), gems 19 / 17 of 52; v2 45.9, 50.3, 16.
4. Then 5 fresh prompts (the owner picks from a proposed list) to check it generalizes.
5. (2026-10-22) v17 on the future test: no gain over v13 (Tuning 47.1 avg vs 48.3, Brewing 51.0 vs 53.9). v13 stays the base. Gem test: the AI rates real gems above look-alikes 81% / 77%.
6. DONE (2026-10-24): owner judged v18 on the 8 repeat prompts: 5 yes, 2 closer, 1 further (Wildfire); about the same as v17. Five prompts now got yes from two fresh builds. Page: https://claude.ai/artifact/2vQczfXUVe2jGXQPdzuruW (ArtifactData list, collection `decks`; key `evals/results/round4/play-rejudge-v18-key.json`).
7. (2026-10-24) **New main yardstick: the blind panel.** Frozen 17 prompts (expert2 + expert3), every version builds all 17 fresh, shuffled with other versions, decks only, owner says yes/no. Round 1 judged (2026-10-24): v2 9 of 17, v18 11 of 17, within noise (the same version's two builds agree on only 5 of 8). Picker test (2026-10-24): the AI picks the owner's yes deck only 54% of the time (prefers 'established shells'), so 'build several, keep the best' was dropped. Next: two builds per version per prompt. Page: https://claude.ai/artifact/MH9Hx8Xynp9LVX548RuGi5 (ArtifactData list, collection `decks`; key `evals/results/round4/play-panel-1-key.json`). Score = % yes per version.
8. (2026-10-24) Owner rejected "three takes" and Forge for now. **Taste test** (`scripts/taste-test.ts --vs settled --no-request`): the AI judge picks the tuned real deck over v13's brew only 53% of the time (with the request shown, 9%: it favors brews that play every requested card as a 4-of). This is the yardstick for judgment. Tried raising it: card evidence (as of that day) 12%, goldfish mana stats 29%, both worse: they describe what the brewer already optimizes. A better judge needs information the builder doesn't have.
9. (2026-10-24) **Text playtest works** (`scripts/playtest.ts`): the AI plays each flagged deck through 2 dealt games and finds the owner's complaint in 4 of 14 decks, partly in 7 (the card-by-card reviewer: 0 of 4). Different-model judges were no better (Fable 44%, Sonnet 0%). Proposed next: v19 = v13 + playtest + revise, on the blind panel.
10. (2026-10-25) **v19** = v13 + one played game + fix the top three problems (`brewV19`; the v17/v18 reviewer is out). Found-deck test (owner's mono-blue Squee list from outside MTGO): 42-57% from two cards, Squee never found when hidden. **Blind panel round 2 judged (2026-10-25): v13 10 of 17, v19 13 of 17** (v19 alone yes on 4 prompts, v13 alone on 1; promising, not proven). Page: https://claude.ai/artifact/D8vgp8z23N22z4ZrzxQKt2 (ArtifactData list, collection `decks`; key `evals/results/round4/play-panel-2-key.json`). Unblind like round 1 (`play-panel-1-answers.json`).
11. (2026-11-07/08) Automatic improvement set up (protocol-v1, below). v19 dropped on dev after one run (-2.1; the game step itself -0.4). The owner's budget is nearly spent: ask before any paid run.

## How the data is kept (2026-11-07, after the owner: "We arent very careful with our data are we?")

- **PROGRESS.md is generated, never edited:** `pnpm exec tsx scripts/scoreboard.ts` after every run or judging round. Its only hand-kept part is `evals/progress-log-only.md` (numbers with no result file).
- **Every paid run records itself** in `evals/runs.jsonl` (started and finished, with commit, cost and result file). A started line with no finished line is a crashed run. Past runs were backfilled from their files (`scripts/backfill-runs.ts`).
- **Results save after every item.** A crashed `run-round4.ts` run is finished with `--resume`; it refuses to overwrite an existing results file.
- **Tests are frozen** in `evals/tests.ts` (items, parameters, data cutoff 2026-10-20, fingerprint). `pnpm test` fails if one changes; a change means a new version (tuning-v2), not an edit.
- **Export every judging round right after the owner finishes:** ArtifactData `list` on the page URL and its collection (`decks`, `pairs` or `ratings`) with `out_dir` `evals/answers/<NN-slug>`, then add the page to `evals/answers/pages.json`. `pnpm test` fails if a key file has no export. Scripts read verdicts through `evals/answers.ts`, never hand-copied.

## Improving the harness automatically (owner, 2026-11-07: "via automated testing, not hand picked. For now.")

- **`evals/protocol.ts` (protocol-v1), frozen:** base v13; try changes on **dev** (holdout-v1, 21 decks), confirm on **test** (tuning-v1, brewing-v1) only after a dev win. 3 dev runs per version (base included), 2 test runs. Kept only if the dev gain's 95% range (paired by deck) is above zero and neither test is clearly worse. PROGRESS.md section 2b applies the rule to every candidate.
- **Data snapshot:** compared runs must use `data/reference-lists-all.jsonl` sha 98511a8b770ce43d and `data/reference-lists.jsonl` 8a4ba5f40938aae8 (recorded per run in the register). **Don't replace them.** New exports go into a copy: `forward-week.ts --history data/reference-lists-all-2026-11-07.jsonl --merge <export>`. The 2026-11-07 export added 5,395 lists, 286 of them dated Oct 20 or earlier (late-scraped), so merging into the main file would have moved frozen scores.
- **Measured noise:** repeat runs differ by about 1.2-1.6 points on these tests, so one run per version can't show a gain; with 3 runs, gains of about 2-2.5 points are detectable.
- **v13 baseline on dev:** 43.0 / 45.3 / 42.0 (SD of a run 1.7; with 3 runs per version a gain of about 2.7 points is detectable).
- **v19, 2026-11-08: dropped after 1 dev run** by a stop rule set before the run (gain 0 or below after run 1 = stop): -2.1 (-5.0 to +0.9). The played game itself, same decks before and after: -0.4 (-1.6 to +0.9), changing 5.9 cards a deck. v17's reviewer measured the same way: -0.5 / -0.7 on Tuning. Revision steps don't move the match. PROGRESS.md section 2c shows this for every run that saved its pre-revision decks.
- **Budget (owner, 2026-11-08): "this is about the last money I want to spend on this though, its getting expensive."** Ask before any paid run; prefer free analyses of the existing result files. Total spend $469.16.
- **Candidate order, if spending resumes:** v14 (mana tool; one dev run +1.4, needs 2 more), then new generic ideas aimed at measurable gaps: colors and lands (47% land match, flat), deck shape (0.7 one-ofs vs real 2.3), the gem rater. Use a stop rule like v19's to save money.

## Rules the owner set (keep to them)

- **Generic tools that give specific knowledge. Never fixes bespoke to one card or engine.**
- **The AI never learns from the owner's notes or verdicts.** It would make the owner's judging circular. The notes in `evals/owner-notes/` are a record only.
- Use the same prompts when checking whether something improved; use fresh prompts to check it generalizes.
- Two runs per version on the future test before believing a difference.
- Plain, simple language with the owner. Short answers. Show data in small tables.
- Keep the Mac awake for runs (`request_keep_awake`); a closed lid kills runs.

## What we learned (one line each)

- Knowledge about these specific cards or this plan helps (v5 format menu, v8 how real decks run the cards, v10 win line, v11 dominant shell, v12 enabler counts).
- Generic additions never helped: extra stages (v3), a coach (v4), copy limits (v6), example brews (v7), a mana-base tool (v14), format staples (v15), a synergy shortlist (v16).
- Lands are flat at 47% match in every version; wrong colors on about half the decks.
- The biggest spell gap is the "hidden gem": the under-played card the human brewer found (16-17 of 51 missing points). The AI skips them even when shown.

## Open ideas, not started

- Make the AI judge each candidate card one by one (does it recognize hidden gems when asked directly?). Cheap test first.
- Playtesting with Forge (open-source rules engine) as a judge: the root fix, about a week of work.
- Sideboards have never been tested.

## Spend

About $469 total as of 2026-11-08 (see Running totals in BUILD_LOG.md). The owner said this is about the last money to spend.
