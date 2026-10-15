# decklists.ai build plan

decklists.ai turns a request like "mono green storm in Premodern" into a coherent, legal, strategically sound 60 and 15, then explains it. It is a showcase of an AI harness: the model proposes, data and plain code decide.

Origin: the "AI Deckbuilder Build Plan" doc (Fable chat, 2026-10-06) plus the decisions below.

## Decisions

| Decision | Choice |
| --- | --- |
| Brand | Own site and brand, codename decklists.ai. Cross-promotes decklistdata.com. |
| Data | Decklist Data supplies what gets played, through a read-only API where every endpoint takes `as_of`. This repo never touches Decklist Data's database. |
| Card knowledge | Scryfall `oracle_cards` + `oracle_tags` bulk files, plus combos. Works in every format Scryfall tracks. |
| Formats | Any 60-card format works from card knowledge alone. Tune first on Premodern and Modern. 100-card singleton comes after step 10. |
| No-data formats | Shell fallback: that format's data, then the nearest format's data filtered by legality, then popularity signals, then model knowledge marked unverified. Every brew says which it used. |
| Models | Baseline the v1 bot first. Then Opus 5.5 for judgment steps and Haiku 5.5 for bulk labeling, on the official Anthropic SDK. |
| Storage | Files only through step 5. A second database in the existing Neon project once brews are saved. |
| Repo | Private for now. Secrets never enter git; scan history before going public. |

## Steps

Each step ends by rerunning the tests. A step is done only when its number beats the last one.

| # | Step | Where | Done when |
| --- | --- | --- | --- |
| 1 | Setup: repo, scaffold, API key | here | Empty site builds |
| 2 | Tests and baseline: 24 hand-rated prompts (incl. no-data formats and Premodern storm), sideboard test on ~200 real lists, 15-20 brew-holdout decks. Score the v1 bot. | here | Baseline saved; rerun is one command |
| 3 | Decklist Data API v1: wrap existing stats, add main/side, core/flex, profiles, card pairs; `as_of` everywhere | decklistdata | Endpoints return correct past data quickly |
| 4 | Card knowledge: Scryfall cards and tags, combos, format registry, `search_cards` | here | "Premodern green untappers" returns the right cards |
| 5 | Deck checker and mana math: format rules, land count, sources, curve, roles, engine odds, fixable errors | here | Top 50 real lists per format pass; 100 generated decks pass |
| 6 | Harness v2: Opus 5.5, new tools, background runs with progress, reject cards no tool returned | here | Beats v1 on both tests; zero illegal or made-up cards in 100 decks |
| 7 | Sideboard model: card target labels, deck weak spots, 15-slot allocator, in/out guide | here | Beats step 6; owner prefers or ties at least half of blind comparisons |
| 8 | Brew pipeline: thesis, engine, shell, counts, odds, critique, sideboard | here | Holdout and hand ratings beat step 6; Premodern storm rated 4+ |
| 9 | Site: watch-it-think UI, MTGO export, card links to Decklist Data, Google sign-in, daily cap, cost log, feedback | here | Cost per brew known; 5 outside players tried it |
| 10 | Launch: public test-score page, write-up, "Brew with this card" links on Decklist Data | both | Live, and scores hold |

## Status (2026-10-15)

| # | Step | Status |
| --- | --- | --- |
| 1 | Setup | Done |
| 2 | Tests and baseline | Done and replaced: rounds 1-3 on the 24 rubric prompts (retired: v3 was tuned on them). Round 4 is owner-written: fill in the blanks (diagnostic), brew to archetype, owner Quick Pick. Sideboard test not built. |
| 3 | Decklist Data API | Not started. The harness reads exports through `src/data/source.ts`, now with full history and date cuts. |
| 4 | Card knowledge | Done, plus first-printing dates for historical runs |
| 5 | Deck checker | Done: 100% of 30,102 real lists error-free in 8 formats; 240 archetype mana profiles. |
| 6 | Harness v2 | Done. Still the best harness: v3 has not beaten it in any round. |
| 7 | Sideboard model | Not started |
| 8 | Brew pipeline (v3) | Built and judged in rounds 3 and 4: more original, not better. |
| 8b | Harness v4 | Designed 2026-10-15 (below); not built. |
| 9 | Site | Not started |
| 10 | Launch | Not started |

## Harness v4 design (2026-10-15)

What every test so far agrees on: the harness made the bot reliable (real cards, legal decks, does what was asked) but not better at choosing cards. v4 targets card choice without turning brewing into copying. Two modes, chosen by the kind of deck:

- **Fair decks (aggro, midrange):** principles measured across all real lists (how many threats, removal, card draw; how low the curve runs for this kind of deck) and which cards real players prefer for each job, across decks and formats. Principles and card quality, never a list to copy.
- **Specialist decks (combo, prison, synergy):** the model's own idea, checked in code. It states its engine exactly ("wins with Helm of Awakening + 2 Medallions + Brain Freeze"; "the lock is Winter Orb + Icy Manipulator, and my deck works under it because..."), quotes the card text it relies on, and the simulator measures how often the engine or lock is assembled by a given turn.
- **Both:** several drafts, keep the one that best passes the checks.

Main test: brew to archetype at scale (every deck that appeared from nothing in Decklist Data's history, with that deck and its near-copies hidden). Fill in the blanks is a diagnostic only: it rewards matching existing lists. Final word: the owner's Quick Pick on new brew prompts.

Build history: [BUILD_LOG.md](./BUILD_LOG.md)
