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

## Status

- [x] Step 1: repo and scaffold
- [ ] Step 1: Anthropic API key in `.env.local` (owner)
- [ ] Step 2 (24 rubric prompts drafted, 2 Commander scored separately; database parts wait on a GitHub Actions query path)
- [x] Step 4: card index (`pnpm cards:build`), format registry, `search_cards`

Build history: [BUILD_LOG.md](./BUILD_LOG.md)
