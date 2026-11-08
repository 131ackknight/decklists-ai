# decklists.ai progress data, 2026-10-06 to 2026-10-25

Data only. Compiled 2026-11-07.

**Source key:** **file** = recomputed on 2026-11-07 from the saved result files in `evals/results/round4/`. **log** = copied from the BUILD_LOG.md entry of that date. **not run** = never measured. Where the file and the log disagree, both are shown. All automatic scores are Opus 5.5 unless a row says otherwise.

## 1. Harness versions

| Version | Date | What it added | Status |
| --- | --- | --- | --- |
| v1 | before 2026-10-13 | Decklist Data's original builder: one chat loop on Haiku 4.5, Vercel AI SDK v4, 10 tool calls max, 9 tools | Replaced |
| v2 | 2026-10-14 | Official Anthropic SDK loop; card search (32,870 cards, 4,577 tags); deck checker; data tools; draw odds; `submit_deck` refuses cards no tool returned | Base 10-14 to 10-20 |
| v3 | 2026-10-14 | Step 8 pipeline: intent routing, engine / shell / critique stages, novelty check, goldfish simulator | Not kept |
| v4 | 2026-10-15 | Coach in code: `declare_plan`, `coach_check`, `submit_brew` | Not kept |
| v5 | 2026-10-19 | Menu of what's working in the format; sketch three directions | Base 10-20 |
| v6 | 2026-10-19 | Borrow a package, not a deck; copy rate shown; over 65% from one list sent back | Not kept |
| v7 | 2026-10-20 | Annotated example brews (AspiringSpike) in the request | Not kept |
| v8 | 2026-10-20 | `played_with` lookup | Folded into v10 |
| v9 | 2026-10-20 | Mechanism-first step, no lookup | Folded into v10 |
| v10 | 2026-10-20 | v5 + `played_with` + mechanism step + win line checked in the deck | Base 10-20 |
| v11 | 2026-10-20 | Exactly 60 cards; build on the dominant shell | Base 10-20 |
| v12 | 2026-10-20 | Enablers named and counted; card-quality send-back | Base 10-20 to 10-21 |
| v13 | 2026-10-21 | Card-quality note fixed for rare decks; partner hints | **Base, current** |
| v14 | 2026-10-21 | `mana_base` tool | Not kept |
| v15 | 2026-10-21 | `format_staples` tool, staples note, 4-copy rule | Not kept |
| v16 | 2026-10-21 | `synergy_candidates` shortlist (150 cards) | Not kept |
| v17 | 2026-10-21 | Reviewer call with per-card evidence, one revision | Not kept |
| v18 | 2026-10-22 | v17 + role evidence (missing cards) | Not kept |
| v19 | 2026-10-25 | v13 + one dealt game vs the format's most-played deck + fix the top 3 problems | Not decided |

## 2. Automatic scores (match % with real decks)

| Version | Brew holdout, 21 decks | Post-cutoff, 6 decks | Future test, old score, 14 decks | Tuning Test, 17 decks | Brewing Test, 13 decks | Gems found, of 52 | Cost per deck |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Closest earlier list, picked with hindsight | 42.7 (file); 42.6 (log) | 41.8 | 49.0 (log) | not computed | not computed | | |
| v2 | 40.6 / 41.8 (file); 40.6 / 41.9 (log 10-19), 40.6 / 41.8 (log 10-20) | 42.5 | 44.9 | 45.9 | 50.3 | 16 | $0.416 (future); $0.435 (panel) |
| v2, Sonnet 5.5 | 37.8 | not run | not run | not run | not run | not run | |
| v3 | not run | not run | not run | not run | not run | not run | |
| v4 | 41.9, 19 decks (file); 42.7 on 18 decks (log) | not run | not run | not run | not run | not run | |
| v4, Sonnet 5.5 | 36.4, 20 decks (file); 36.2 on 18 decks (log) | not run | not run | not run | not run | not run | |
| v5 | 43.7 / 41.6 | 45.2 | not run | not run | not run | not run | |
| v6 | 42.1 (file); 42.2 (log) | not run | not run | not run | not run | not run | |
| v7 | 40.4 / 43.4 | not run | not run | not run | not run | not run | |
| v8 | not run | not run | not run | not run | not run | not run | |
| v9 | not run | not run | not run | not run | not run | not run | |
| v10 | not run | 45.7 | not run | not run | not run | not run | |
| v11 | not run | 46.8 | not run | not run | not run | not run | |
| v12 | not run | not run | not run | not run | not run | not run | |
| v13 | 43.0 (file; not in log) | 50.0 | 48.3 / 47.9 | 47.4 / 49.2 | 54.2 / 53.5 | 19 / 17 | $0.448 / $0.413 (future); $0.477 (panel) |
| v14 | 44.9 (file; not in log) | 46.2 (file; not in log) | 47.3 | 47.5 | 50.8 | 15 | $0.433 |
| v15 | not run | not run | 44.8 / 46.9 | 46.2 / 47.7 | 47.8 / 51.1 | 17 / 15 | $0.525 / $0.499 |
| v16 | not run | not run | 47.4 (file); 47.3 (log) / 45.9 | 47.3 / 48.3 | 49.9 / 51.7 | 13 / 15 | $0.473 / $0.465 |
| v17 | not run | not run | 47.8 / 45.6 (file; not in log) | 48.3 / 45.9 | 51.6 / 50.4 | 17 / 18 | $0.527 / $0.528 |
| v18 | not run | not run | not run | not run | not run | not run | $0.632 (panel) |
| v19 | not run | not run | not run | not run | not run | not run | $0.758 (panel) |

"a / b" = two runs. Future test, old score = mean overlap with lists from a week after each deck appeared, decks with 3+ such lists. Tuning Test = same lists, all 17 decks, overlap as a share of each real list. Brewing Test = the deck's first-week lists, decks with 2+ of them. Gems = core cards of the first-week lists that had under 5% play before.

### Future-test breakdown (file)

| Run | Tuning, spells | Tuning, lands | Brewing, spells |
| --- | --- | --- | --- |
| v2 | 44.2 | 49.6 | 49.6 |
| v13 | 47.5 | 45.9 | 54.3 |
| v13 r2 | 48.8 | 50.2 | 54.3 |
| v14 | 46.6 | 50.0 | 50.4 |
| v15 | 46.8 | 43.8 | 50.4 |
| v15 r2 | 47.7 | 47.9 | 51.1 |
| v16 | 45.9 | 50.5 | 49.0 |
| v16 r2 | 46.9 | 51.4 | 50.6 |
| v17 | 48.9 | 49.1 | 53.1 |
| v17 r2 | 45.4 | 47.9 | 50.0 |

## 3. Owner's judgments, in order

| Log date | Round | Versions | Items | Result | Source |
| --- | --- | --- | --- | --- | --- |
| 10-14 | Pass 1, blind 1-5 ratings | v1 on 6 model sets | 108 answers, 18 prompts | Opus 3.85, Sonnet 3.71, Fable 3.57, Haiku 5.5 2.94, Haiku 4.5 as shipped 2.53, Haiku 4.5 2.46 | log |
| 10-14 | Round 2, blind 1-5 ratings | v2 (Opus, Sonnet) + 6 v1 anchors | 48 of 54 rated | Opus v2 3.66 (v1 3.85), Sonnet v2 3.50 (v1 3.71); anchors re-rated 0.67 lower | log |
| 10-14 | Pairwise | v1 vs v2 | 36 pairs | v1 8, v2 6, ties 22; did what was asked 92% vs 100%; would play 83% vs 81% | log |
| 10-15 | Round 3 pairwise (not completed) | v2 vs v3 | 23 of 48 judged | v2 6, v3 2, ties 15 (brews: v2 5, v3 1). At 17 judged: would play v2 81%, v3 71% | log |
| 10-15 | Round 4, track 3, Quick Pick | v2 vs v3 | 10 pairs | v2 4, v3 3, ties 3 | log |
| 10-20 | Holdout decks, blind | v2, v5, v6 | 15 pairs | v5 vs v2 3-0 (2 ties); v5 vs v6 3-0 (2 ties); v2 vs v6 2-2 (1 tie) | log |
| 10-20 | Expert round | v5 vs v2 | 18 pairs | v5 8, v2 4, same 2, neither 4 | log |
| 10-20 | Combo prompts | v5, v8, v9 | 12 pairs | Living End: v8 > v5, v9 > v5, v8 = v9. Draco: v8 > v5, v9 > v5, v8 > v9. Pande-Burst, Rector: neither in all 6 | log |
| 10-20 | Combo prompts | v10 vs v8 | 3 pairs | Rector v10, Pande-Burst v8, Draco same; neither 0 | log |
| 10-20 | Expert round 2 | v10 vs v5 | 12 pairs | v10 4, v5 3, same 3, neither 2 | log |
| 10-20 | Combo prompts | v11 vs v10 | 3 pairs | Pande-Burst v11, Rofellos v11, Mind Over Matter neither | log |
| 10-20 | Would you play it | v11 | 12 decks | yes 6 of 12 | log |
| 10-20 | Rebuild of the 6 no's | v12 | 6 decks | yes 3, closer 3, further 0 | log |
| 10-20 | Round 3, fresh prompts | v12 | 5 decks | yes 3 of 5 | log |
| 10-22 | Rebuild, 8 prompts | v17 | 8 decks | yes 6, closer 2, further 0 | log; artifact db |
| 10-24 | Rebuild, 8 prompts | v18 | 8 decks | yes 5, closer 2, further 1 | log; artifact db |
| 10-24 | Blind panel round 1 | v2, v18 | 34 decks | v2 9 of 17, v18 11 of 17 | file |
| 10-25 | Blind panel round 2 | v13, v19 | 34 decks | v13 10 of 17, v19 13 of 17 | file |

Running "would play" on the 17 panel prompts before the blind panel (log): first pass on v11/v12 9 of 17; after one rebuild 12 of 17; best version per prompt after v17 15 of 17.

## 4. Blind panel, per prompt (file)

| Prompt | v2 (round 1) | v18 (round 1) | v13 (round 2) | v19 (round 2) |
| --- | --- | --- | --- | --- |
| legacy bomberman | yes | no | no | no |
| legacy glimpse elves | yes | yes | yes | yes |
| legacy hypergenesis | yes | yes | yes | yes |
| legacy kiki pestermite | yes | yes | no | yes |
| legacy oracle pact | yes | yes | yes | yes |
| legacy scapeshift | no | no | yes | no |
| premodern mind over matter | no | yes | yes | yes |
| premodern phyrexian processor | no | yes | no | no |
| premodern rising waters | no | yes | yes | yes |
| premodern rofellos | no | yes | yes | yes |
| premodern seismic assault | yes | no | no | yes |
| premodern shapeshifter phage | yes | no | no | no |
| premodern mill | yes | no | no | yes |
| premodern nether spirit | no | no | yes | yes |
| premodern squandered balance | no | yes | no | yes |
| premodern wildfire | no | yes | yes | yes |
| premodern zurs weirding | yes | yes | yes | yes |
| **Yes, of 17** | **9** | **11** | **10** | **13** |

## 5. Tests of the AI's judgment and knowledge (no harness change)

| Date | Test | Result | Source |
| --- | --- | --- | --- |
| 10-15 | Card choice vs win rate within an archetype (scorer v0) | weighted Spearman -0.002 (positive in 50 of 109 archetypes); "stockness" baseline -0.011 (51 of 109) | log |
| 10-19 | Inventors' first lists vs the settled deck | 70% match; v2's brews 41% to the settled deck, 43% to the first lists | log |
| 10-19 | One-call brainstorm, Opus | first idea 36% (no menu), 42% (menu); best of 5: 40%, 45% | log |
| 10-19 | One-call brainstorm, Fable 5.1, menu | first idea 39%, best of 5 44%; cost $10.12 vs Opus $3.26 | log |
| 10-19/20 | Share of deck from one earlier list, holdout | v2 50% / 53%, v5 60%, v6 49%, v7 60%; inventors about 49%; AspiringSpike's brews about 50% | log |
| 10-21 | Synergy model, free | inventors' discoveries in the top 300 of the deck's colors: 14 of 34 (41%); median rank 464 (similar-cards baseline 1,236) | log |
| 10-21 | Reviewer on 4 criticized decks | evidence only: 0 of 4 complaints found; with owner's notes as examples: 2 of 4 | log |
| 10-22 | Gem test: inventor's gems vs look-alikes, 14 decks | gem rated above look-alike 81.4% / 77.0% (50% = can't tell) | file |
| 10-24 | Picker: which of two decks the owner said yes to | 14 of 26 (54%); picked "A" 11 of 26 | file |
| 10-24 | Taste: inventor's first list vs v13 brew, request shown | real deck picked 10 of 36 (28%) | file |
| 10-24 | Taste: tuned list vs v13 brew, request shown | 3 of 34 (9%) | file |
| 10-24 | Taste: tuned list vs v13 brew, no request | 18 of 34 (53%) | file |
| 10-24 | Same, judge also sees card evidence | 4 of 34 (12%) | file |
| 10-24 | Same, judge also sees goldfish mana stats | 10 of 34 (29%) | file |
| 10-24 | Same, Fable 5.1 as judge | 15 of 34 (44%) | file |
| 10-24 | Same, Sonnet 5.5 as judge | 0 of 34 (0%) | file |
| 10-24 | Deck shape, v13 brews vs real lists, per deck | one-of spells 0.7 vs 2.3; requested cards as 4-ofs 79% vs 69%; spell mana value 2.3 vs 2.6; lands 20.0 vs 20.1 | log |
| 10-24 | Text playtest on 14 decks the owner flagged | owner's complaint found: yes 4, partly 7, no 3 | file (9 decks) + log file (5 decks) |
| 10-25 | v19 revisions, 17 panel decks | 5.9 cards changed per deck on average (3 to 13); opponent Enchantress 11, Dimir Tempo 6 | file |
| 10-25 | Found deck (mono-blue Squee, outside MTGO), prompt A: Bouncer + Squee | v13 27, 27 of 60; v19 27, 23; closest MTGO list 29 | file |
| 10-25 | Found deck, prompt B: mono-blue, Bouncer + Gilded Drake | v13 30, 34 of 60; v19 33, 35; Squee found 0 of 4 | file |

## 6. Round 4, fill in the blanks (2026-10-15, log)

Average hidden cards restored, of 12 (5 decks x 4 hide patterns).

| | Overall | Legacy Tron | Modern Broodscale | Pauper Dimir | Premodern UW Aggro | Vintage Lurrus |
| --- | --- | --- | --- | --- | --- | --- |
| Most played (no AI) | 7.1 | 4.8 | 9.0 | 9.5 | 4.2 | 8.0 |
| Nearest list (no AI) | 6.5 | 5.8 | 6.5 | 5.8 | 8.0 | 6.8 |
| Sonnet v2 / v3 | 6.8 / 7.0 | 5.2 / 4.5 | 6.5 / 8.2 | 10.0 / 9.2 | 7.5 / 7.0 | 4.5 / 6.2 |
| Opus v2 / v3 | 7.7 / 7.5 | 5.2 / 5.5 | 8.0 / 8.5 | 10.2 / 9.8 | 9.2 / 8.2 | 5.8 / 5.8 |

## 7. 24 rubric prompts, objective (2026-10-14, log)

| Model | Harness | Decks | Mana warnings | Lands off real archetype | Copy rate on "something new" | 80%+ copies | Cost | Median time |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Opus 5.5 | v1 | 17 of 18 | 0 | 0.84 | 87% | 9 of 12 | $4.05 | 33 s |
| Opus 5.5 | v2 | 24 of 24 | 7 (6 in the 10-14 v3 table) | 0.60 | 76% | 6 of 14 | $9.49 ($9.31 in the v3 table) | 93 s |
| Opus 5.5 | v3 | 24 of 24 | 3 | 1.09 | 65% | 4 of 14 | $18.40 | 105 s |
| Sonnet 5.5 | v1 | 18 of 18 | 1 | 0.89 | 78% | 8 of 13 | $3.22 | 41 s |
| Sonnet 5.5 | v2 | 24 of 24 | 5 | 1.34 | 69% | 5 of 14 | $5.54 ($5.21 in the v3 table) | 66 s |
| Sonnet 5.5 | v3 | 24 of 24 | 4 | 0.85 | 62% | 3 of 14 | $9.39 | 138 s |

v1 model comparison, pass 1 (log): decks of 18: Haiku 4.5 as shipped 9, Haiku 4.5 7, Haiku 5.5 12, Sonnet 5.5 18, Opus 5.5 17, Fable 5.1 15. Cost: $0.63, $0.75, $0.11, $3.22, $4.05, $9.90. Invented cards: 0 for all.

## 8. Infrastructure (log unless noted)

| Item | Value |
| --- | --- |
| Cards indexed | 32,870, with 4,577 function tags and 697 alternate MTGO names |
| Real lists, last 90 days | 30,102 in 8 formats; 100% pass the checker after fixes |
| Full history | 145,131 lists since 2025-07-01 |
| Automated tests | 60 passing (pnpm test, 2026-10-25) |
| Decklist Data PRs merged | 5 (#181, #182, #183, #184, #188); #188 cleaned 34,432 lists |

## 9. Spend (log)

| Item | Value |
| --- | --- |
| Total of the 48 cost items listed in BUILD_LOG.md | $435.92 (the items add up to exactly this) |
| Plus | one 17-token test call |
| Largest items | v14 and future test $41.28; round 4 runs $31.58; v3 full runs $27.08; v5 round $26.72; v15 round $25.87; v7 round $22.79; blind panel round 2 $21.00; v17 future test $19.00 |

These are the costs the scripts reported. Claude Code can't see the Anthropic billing console, so the billed amount is not known here.

## 10. Not known, or not measured

- v3, v8, v9 and v12 were never run on any automatic test; v18 and v19 were not run on the holdout, post-cutoff or future tests.
- v1 was never run on the holdout, post-cutoff or future tests.
- Round 3 pairwise (v2 vs v3) was never finished: 23 of 48 pairs judged.
- Text playtest: full reports for the first 5 of 14 decks were not saved; their grades are in `evals/results/round4/logs/playtest.log` only.
- Found deck: the tournament's name and date were not recorded.
- Never logged before this table (computed 2026-11-07 from existing files): holdout v13 43.0 and v14 44.9; post-cutoff v14 46.2; old future score v17 47.8 / 45.6.
- File vs log mismatches: v2 holdout run 2 41.8 (file) vs 41.9 (two log entries); v6 holdout 42.1 vs 42.2; v16 old future score run 1 47.4 vs 47.3; holdout hindsight list 42.7 vs 42.6; v4 holdout 41.9 on 19 decks (file) vs 42.7 on 18 (log).
- Within the log: v2 rubric-prompt cost and mana warnings differ between the 10-14 v2 table and the 10-14 v3 table (shown in section 7).
