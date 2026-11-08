## 7. Numbers that exist only in BUILD_LOG.md

This section is the one hand-kept part of PROGRESS.md (`evals/progress-log-only.md`): numbers with no result file to recompute them from, or not yet in the scoreboard. Each is copied from the BUILD_LOG.md entry of the date shown.

### 7a. Harness versions

| Version | Log date | What it added | Status |
| --- | --- | --- | --- |
| v1 | before 10-13 | Decklist Data's original builder: one chat loop on Haiku 4.5, Vercel AI SDK v4, 10 tool calls max, 9 tools | Replaced |
| v2 | 10-14 | Official Anthropic SDK loop; card search (32,870 cards, 4,577 tags); deck checker; data tools; draw odds; `submit_deck` refuses cards no tool returned | Base 10-14 to 10-20 |
| v3 | 10-14 | Step 8 pipeline: intent routing, engine / shell / critique stages, novelty check, goldfish simulator | Not kept |
| v4 | 10-15 | Coach in code: `declare_plan`, `coach_check`, `submit_brew` | Not kept |
| v5 | 10-19 | Menu of what's working in the format; sketch three directions | Base 10-20 |
| v6 | 10-19 | Borrow a package, not a deck; copy rate shown; over 65% from one list sent back | Not kept |
| v7 | 10-20 | Annotated example brews (AspiringSpike) in the request | Not kept |
| v8 | 10-20 | `played_with` lookup | Folded into v10 |
| v9 | 10-20 | Mechanism-first step, no lookup | Folded into v10 |
| v10 | 10-20 | v5 + `played_with` + mechanism step + win line checked in the deck | Base 10-20 |
| v11 | 10-20 | Exactly 60 cards; build on the dominant shell | Base 10-20 |
| v12 | 10-20 | Enablers named and counted; card-quality send-back | Base 10-20 to 10-21 |
| v13 | 10-21 | Card-quality note fixed for rare decks; partner hints | **Base, current** |
| v14 | 10-21 | `mana_base` tool | Not kept (10-21); dropped again 11-08 under protocol-v2 after 3 dev runs (Added +1.2, range includes zero) |
| v15 | 10-21 | `format_staples` tool, staples note, 4-copy rule | Not kept |
| v16 | 10-21 | `synergy_candidates` shortlist (150 cards) | Not kept |
| v17 | 10-21 | Reviewer call with per-card evidence, one revision | Not kept |
| v18 | 10-22 | v17 + role evidence (missing cards) | Not kept |
| v19 | 10-25 | v13 + one dealt game vs the format's most-played deck + fix the top 3 problems | Not kept: stopped after 1 dev run by a rule set before it ran (11-08; gain 0 or below after run 1 = stop) |
| v20 | 11-08 | v13 + up to 20 little-played spells real decks run beside the requested cards, listed up front (`borrow.ts`) | Haiku only: unclear after 5 runs (Added +1.9, -0.1 to +3.9; borrowed spells +3.0, -2.0 to +8.0). Not run on Opus |
| v21 | 11-08 | v20 with only the list's top 5 | Dropped on Haiku after 3 runs (borrowed spells -0.6) |

### 7b. Results with no file, or not yet in the scoreboard

| Log date | Test | Result |
| --- | --- | --- |
| 10-14 | v1 vs v2 vs v3 on the 24 rubric prompts, Opus | decks 17/18, 24/24, 24/24; copy rate on "something new" 87%, 76%, 65%; cost $4.05, $9.49, $18.40 |
| 10-14 | Same, Sonnet | decks 18/18, 24/24, 24/24; copy rate 78%, 69%, 62%; cost $3.22, $5.54, $9.39 |
| 10-14 | v1 model comparison, pass 1, decks of 18 | Haiku 4.5 as shipped 9, Haiku 4.5 7, Haiku 5.5 12, Sonnet 5.5 18, Opus 5.5 17, Fable 5.1 15; cost $0.63, $0.75, $0.11, $3.22, $4.05, $9.90 |
| 10-15 | Round 4 fill in the blanks, average restored of 12 (result files exist; not yet scored here) | most played 7.1, nearest list 6.5, Sonnet v2 6.8 / v3 7.0, Opus v2 7.7 / v3 7.5 |
| 10-15 | Card choice vs win rate within an archetype (scorer v0) | weighted Spearman -0.002 (positive in 50 of 109 archetypes); "stockness" -0.011 (51 of 109) |
| 10-19 | Inventors' first lists vs the settled deck | 70% match; v2's brews 41% to the settled deck, 43% to the first lists |
| 10-19 | One-call brainstorm (result files exist; no cost in them) | Opus first idea 36% (no menu), 42% (menu); best of 5: 40%, 45%; Fable with menu 39%, 44% |
| 10-19 | Share of deck from one earlier list, holdout | v2 50% / 53%, v5 60%, v6 49%, v7 60%; inventors about 49% |
| 10-20 | Running "would play" on the 17 panel prompts, before the blind panel | first pass on v11/v12 9 of 17; after one rebuild 12 of 17; best version per prompt after v17 15 of 17 |
| 10-21 | Synergy model, free | inventors' discoveries in the top 300 of the deck's colors: 14 of 34; median rank 464 (baseline 1,236) |
| 10-21 | Reviewer on 4 criticized decks | evidence only 0 of 4; with owner's notes as examples 2 of 4 |
| 10-24 | Deck shape, v13 brews vs real lists, per deck | one-of spells 0.7 vs 2.3; requested cards as 4-ofs 79% vs 69%; spell mana value 2.3 vs 2.6; lands 20.0 vs 20.1 |
| 10-24 | Text playtest, first 5 of 14 decks (grades only, in `evals/results/round4/logs/playtest.log`) | Hypergenesis partly, Seismic Assault (v11) partly, Mind Over Matter (v11) partly, Rofellos partly, Scapeshift (v11) yes. All 14: yes 4, partly 7, no 3 |
| 11-08 | Candidate check, `scripts/candidate-check.ts` (no result file; rerunning it prints these) | 48 target spells over 17 dev decks. Found in the top 20 / 50 / 100: most-played first 13 / 38 / 52%; v16 synergy 15 / 31 / 52%; played with the requested cards 33 / 52 / 65%; per job 17 / 29 / 52%. Opus v13 decks already contain 15%, v14 20% |
| 11-08 | Shown vs played, `scripts/borrow-listed.ts` (reads the Haiku result files; rerunning prints these) | Listed borrowed spells played by Haiku v13 / v20 decks: 30.0 / 41.7% (+11.7, -1.2 to +24.6); other listed spells 9.4 / 13.6% (+4.2, +1.5 to +7.0). v21: 21.4 / 40.5% and 15.4 / 30.5% |

### 7c. Spend

| Item | Value |
| --- | --- |
| BUILD_LOG.md running total (55 cost items listed there, summing to exactly this) | $496.06, plus one 17-token test call |
| Recorded in the run register | see section 6 |

The scripts' reported costs are all that's visible to Claude Code; the billed amount isn't.

### 7d. Not known

- The found deck's tournament name and date were not recorded.
- Full playtest reports for 5 of the 14 decks were not saved (grades only, above).
- Round 3 pairwise (v2 vs v3) was never finished: 23 of 48 pairs judged.
- The code version behind each backfilled run: the register records only the commit that first added its result file.

### 7e. Log numbers that differ from the files

| Log | Files (sections 2-6) |
| --- | --- |
| v2 holdout run 2: 41.9 (entries of 10-19) and 41.8 (10-20) | 41.8 |
| v6 holdout: 42.2 | 42.1 |
| v16 future-v1 run 1: 47.3 | 47.4 |
| Holdout hindsight list: 42.6 | 42.7 |
| v4 holdout: 42.7 on the 18 decks every run built | 41.9 on the 19 decks this run built |
| Round 2 ratings, v2: Opus 3.66, Sonnet 3.50 (18 prompts v1 also answered, logged 10-14, before the two Tainted Pact ratings were excluded) | 3.66 and 3.50 counting those ratings; 3.83 and 3.66 without them; 3.86 and 3.73 over all 24 prompts (section 3) |
| Before 2026-11-07, never logged: holdout v13 and v14, post-cutoff v14, future-v1 for v17 | computed in section 2 |
