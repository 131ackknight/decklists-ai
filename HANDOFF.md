# Handoff (2026-10-21)

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

About $347 total (see Running totals in BUILD_LOG.md).
