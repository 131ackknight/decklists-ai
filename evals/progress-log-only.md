## 7. Numbers that exist only in BUILD_LOG.md

This section is the one hand-kept part of PROGRESS.md (`evals/progress-log-only.md`): numbers with no result file to recompute them from, or not yet in the scoreboard. Each is copied from the BUILD_LOG.md entry of the date shown.

### 7a. Harness versions

| Version | Log date | What it added | Status |
| --- | --- | --- | --- |
| v0 | 11-10 | No harness: one call to the same model, no system prompt, tools, data or checks; told only the date (`oneshot.ts`) | Reference start, not a candidate; 3 dev runs and 1 on the other tests, 11-10 (section 2a) |
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
| v13 | 10-21 | Card-quality note fixed for rare decks; partner hints | Base 10-21 to 11-10 |
| v14 | 10-21 | `mana_base` tool | Not kept (10-21); dropped again 11-08 under protocol-v2 after 3 dev runs (Added +1.2, range includes zero) |
| v15 | 10-21 | `format_staples` tool, staples note, 4-copy rule | Not kept |
| v16 | 10-21 | `synergy_candidates` shortlist (150 cards) | Not kept |
| v17 | 10-21 | Reviewer call with per-card evidence, one revision | Not kept |
| v18 | 10-22 | v17 + role evidence (missing cards) | Not kept |
| v19 | 10-25 | v13 + one dealt game vs the format's most-played deck + fix the top 3 problems | Not kept: stopped after 1 dev run by a rule set before it ran (11-08; gain 0 or below after run 1 = stop) |
| v20 | 11-08 | v13 + up to 20 little-played spells real decks run beside the requested cards, listed up front (`borrow.ts`) | Haiku: unclear after 5 runs (Added +1.9, -0.1 to +3.9). Opus: dropped after 3 dev runs (Added +0.3, -1.5 to +2.1) |
| v21 | 11-08 | v20 with only the list's top 5 | Dropped on Haiku after 3 runs (borrowed spells -0.6) |
| v22 | 11-09 | v13 with Standard legality on the deck's date, not today's (`standard.ts`) | **Base, current** since 11-10 (protocol-v4), by the owner's call: not a measured gain (Added +0.6, -2.9 to +4.0, on the 10 Standard dev decks) |
| v23 | 11-10 | v22, then a last step in code: basic lands above the format's usual count are swapped for the color-fixing lands its recent decks play (`lands.ts`); no model call | Not the base. Dev (composed from v22's runs): Added +0.6 (-0.0 to +1.1), no clear gain. On the 6 future-test decks it wasn't picked on: lands shared -0.7 (section 7b) |

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
| 11-08 | List designs on dev and future-test decks, `scripts/candidate-check.ts --colors requested [--test future-v1]` | Right spells in the top 20, dev / future: played with the requested cards 33 / 50%; type link first 35 / 31%; mix of 10 + 10 38 / 38%. Type-link designs dropped (fitted to the dev decks) |
| 11-08 | Land step on saved decks, `scripts/land-step-test.ts` (result file `evals/results/round4/land-step-holdout-v13-claude-opus-5-5.json`; not in the scoreboard) | 21 dev decks, before / after: lands shared 9.9 / 10.1 (+0.2), Added 10.6 / 11.0 (+0.4, -0.3 to +1.1), match 43.0 / 43.5, basics 8.1 / 7.9. Dropped |
| 11-10 | Six code-only land fixes on the saved dev decks (v22, 63 builds), `scripts/land-fix-check.ts` (rerunning it prints these) | Best: swap basics above the usual count for the usual color fixers (now v23's swap): lands shared +0.37 (+0.04 to +0.71), match +0.57 (-0.02 to +1.16), Added +0.56 (-0.02 to +1.13); 29 of 63 builds change. Replacing every land: -0.4 lands |
| 11-10 | Land note test, `scripts/land-note-test.ts` (result file `evals/results/round4/land-note-holdout-v22-claude-opus-5-5.json`; not in the scoreboard) | 21 dev decks (v22 run 1), lands shared: the AI's revision +0.45 (-0.05 to +0.96), the code-only swap +0.56 (+0.04 to +1.08). $0.41 |
| 11-10 | v23's swap on the future test's saved brews (v13, 2 runs), `scripts/land-swap-check.ts` (rerunning it prints these) | All 14 decks (28 builds, 8 changed): lands shared -0.33 (-0.99 to +0.34), match -0.50 (-1.58 to +0.58), Added -1.07 (-2.44 to +0.30). The 6 decks that are not dev archetypes (12 builds, 4 changed): lands -0.74 (-2.57 to +1.10), match -1.17 (-4.17 to +1.83), Added -2.17 (-5.71 to +1.37). Tuning test's score on its 9 non-dev decks: share of the real lists' cards -1.19 (-3.08 to +0.70), of their lands -3.43 (-8.66 to +1.81) |
| 11-10 | Nonbasic lands, `scripts/nonbasic-land-check.ts` (rerunning it prints these) | Dev (v22, 63 builds), per deck: real decks 16.9 nonbasic lands, the brewer 13.2, shared 6.5 (38%; inventors 66%); it plays 6.7 nonbasic lands the real deck doesn't. Missed 10.4: old cards nobody played 3.0 (inventors 1.2), usual for the colors 2.0, in the list it built on 1.7, played a little 1.7, a format staple 1.1, not legal yet 0.5, a new card 0.4. Wrong-color builds share 22%, right-color builds 44%. Future test (v13): 5.9 of 15.3 shared (39%; inventors 65%) |
| 11-10 | Land lookups, `scripts/land-lookup-check.ts` (rerunning it prints these) | Missed nonbasic copies each list holds, and the share of the lands it shows that are right, dev / future test: beside the requested cards 35% / 63%, right 27% / 24%; the list built on 19% / 20%, right 49% / 45%; usual for the build's colors 25% / 19%, right 37% / 26%; format staples 37% / 27%, right 14% / 9%; all four 62% / 80% |
| 11-10 | Lands cut from the list built on, `scripts/land-cut-check.ts`; colors from lists beside the requested cards, `scripts/beside-colors-check.ts` (rerunning them prints these) | Cut nonbasic lands that fit the build's colors, mistakes: dev 44% (3.0 cut a build), the 6 unseen future decks 23% (6.6 cut). Right colors, dev / future test: the brewer 65% / 46%, the requested cards' own mana symbols 67% / 64%, lists beside the requested cards 24% / 21% |
| 11-10 | Sideboards, `scripts/sideboard-check.ts` (rerunning it prints these) | Cards shared with the settled lists' sideboards, of 15, dev (v22) / future test (v13): the brewer 21.6% / 19.4%; inventors 32.3% / 45.8%; a sideboard by vote from data 20.6% / 16.8%; the sideboard of the list it built on 20.0% / 21.9% |
| 11-10 | Mana in play, `scripts/mana-play-check.ts` (opening-turns simulator, 2,000 games a list; rerunning it prints these) | The brewer's builds against the settled real lists, dev: colors work on turn 3 91.7% vs 90.4% (+1.3, -2.5 to +5.0); stuck on two lands on turn 4 21.0% vs 19.6% (+1.4, -1.5 to +4.4); mulligans 14.7% vs 14.2%. Future test (v13): 90.5% vs 88.9%; 26.4% vs 26.3%; 12.6% vs 14.8% |
| 11-10 | The starting deck, `scripts/starting-list-check.ts` (rerunning it prints these) | Match % of the closest earlier list alone, dev / future test / the 6 unseen future decks: the brewer's 32.3 / 35.6 / 36.9; inventors' 36.8 / 42.9 / 51.3; the best with hindsight 42.7 / 49.0 / 54.3. Picked from data: most requested cards 26.9 / 32.3 / 33.7; the colors' top deck 21.7 / 22.2 / 17.8; a perfect pick from the 20 most-played decks' latest lists 30.4 / 30.5 / 29.2 |
| 11-11 | The ceiling and what the prompt hides, `scripts/ceiling-check.ts` (rerunning it prints these) | Dev / future test, match %: the best 60 possible 85.4 / 86.9; from cards legal on the date 83.6 / 85.7; a settled list against the others 78.6 / 80.8; inventors 65.7 / 72.4; the best old list with the requested cards put in 55.4 / 62.2; the brewer 42.7 / 48.1; the model alone 33.9 / 33.7. Signature cards the prompt doesn't name, dev: 18 of 21 decks, 3.7 cards and 9.8 copies a deck, 16.4 points of the real deck (named cards 14.5); the brewer gets 2.7, inventors 12.9. Estimate had the prompt named them: 52.8 / 55.8. Known-idea decks (6): the brewer 49.0, inventors 58.0; the other 15: 40.2 and 68.8 |
| 11-11 | The deck in another format, `scripts/other-format-check.ts --most` (rerunning it prints these) | Decks with lists elsewhere that run all but one requested card: 6 of 21 dev, 4 of 14 future; the latest such list scores 27.7 / 27.1 against the brewer's 49.6 / 56.4 on those decks, and beats it on none |
| 11-11 | The score without lands, `scripts/no-lands-check.ts` (rerunning it prints these; the levels are in section 2h) | The gap to the inventors in points of the whole-deck score, lands / hidden cards / other spells: dev 8.3 / 10.2 / 4.5; future test 7.5 / 7.9 / 9.0; its 6 decks that are not dev archetypes 10.6 / 5.5 / 14.2. The harness over the model alone, the same split: dev +3.8 / +1.4 / +3.6; future test +4.3 / +4.0 / +6.0. v13 over v2, whole deck then without lands: dev +2.1 (-1.2 to +5.4), +4.1 (+0.5 to +7.6); future test +3.2 (-0.9 to +7.4), +4.1 (-0.2 to +8.4). Added without lands, the model alone / the brewer: dev 15.1 / 15.7, gain +0.6 (-3.1 to +4.4); future test 11.7 / 17.7, gain +6.0 (-0.8 to +12.9); with the closest list picked on spells alone, dev +1.2 (-3.0 to +5.3), future test +13.2 (+5.7 to +20.8). A deck's score between runs of v22: 4.7 points on the whole deck, 6.5 without lands |
| 11-08 | Legality gap (proxy, scratch check) | 13 of Opus v13's 30 Standard dev decks play a nonbasic land no Standard list ran in the 90 days before; 2.0 such copies per deck (mostly shock lands) |
| 11-08 | Judge test, `scripts/judge-test.ts` (result file `evals/results/round4/judge-test-v20-lists.json`; not yet in the scoreboard) | Opus rates a right listed spell above a wrong one 78% (66-89%), list order 75% (56-94%), 10 decks; top 3 per deck 13 / 13 right of 30. v20's in-brew picks from the list on those decks: 53 of 128 right (41%) |
| 11-08 | Shown vs played, `scripts/borrow-listed.ts` (reads the Haiku result files; rerunning prints these) | Listed borrowed spells played by Haiku v13 / v20 decks: 30.0 / 41.7% (+11.7, -1.2 to +24.6); other listed spells 9.4 / 13.6% (+4.2, +1.5 to +7.0). v21: 21.4 / 40.5% and 15.4 / 30.5% |

### 7c. Spend

| Item | Value |
| --- | --- |
| BUILD_LOG.md running total (65 cost items listed there, summing to exactly this) | $543.78, plus one 17-token test call |
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
