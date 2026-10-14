# Build log

A running record of how decklists.ai gets built: decisions, findings, numbers, and course corrections. Newest first. Written to be mined for a public write-up later.

## How this log works

- One entry per working session, newest at the top.
- Each entry: what we did, what we decided and why, what we found (with numbers), and what changed our minds.
- Mistakes and dead ends stay in. They are the interesting part of the story.

---

## 2026-10-14 · Step 4: the bot can search every card by what it does

**Course correction first.** The plan called for read-only access to Decklist Data's production database (for the v1 baseline and the brew holdout set). Setting up a read-only Neon role meant SQL, passwords, and connection strings, and the owner said plainly: "I am confused and I don't like this." Fair. Two changes:
- Database lookups will run the way Decklist Data already runs them: small read-only scripts in GitHub Actions, using the database secret already stored there. No new credentials, nothing for the owner to configure.
- Reordered the work: steps 4 and 5 use only public Scryfall data, so they go first.

**Built.**
- `pnpm cards:build` downloads Scryfall's Oracle Cards and Oracle Tags bulk files and builds a 26 MB card index in about 5 seconds: **32,870 cards** legal in at least one format (out of 38,751 entries; the rest are tokens, art cards, and similar), **4,577 function tags**, 32,671 cards with at least one tag (median 6 tags per card).
- A format registry for 20 formats (Standard to Old School, Duel Commander, Gladiator): deck size, copy limit, sideboard size, commander rules, whether Decklist Data has results, and which formats to borrow from when it does not.
- `search_cards`: filter by format, colors, function tag, type, rules text, keyword, and mana value. Its input schema is the tool contract the model will use in step 6.

**Findings.**
- Scryfall's tags are a tree. "removal" has zero cards of its own and 25 child tags beneath it ("sweeper," "removal-exile"...). Searching a tag has to include everything below it, or the most useful searches return nothing.
- Some obvious tag names do not exist (`board-wipe`, `graveyard-hate`, `wincon`); the real ones are `sweeper` and `hate-graveyard`. The model gets a tag-discovery function instead of guessing.
- **Bug caught by a probe:** "black removal in Pioneer" returned Otawara, Soaring City, a blue land. Lands are colorless, so filtering on card color let it through. Switched to color identity, which also covers what a card's abilities need. Trade-off noted: off-color Phyrexian-mana cards like Dismember now need a search without a color filter.
- Popularity sort uses EDHREC rank for now, which is Commander-skewed (Seedborn Muse tops the Premodern untapper list). Decklist Data play rates replace it in step 6.

**Gate passed.** "Premodern green untappers" returns 41 cards, the same count as Scryfall's own `otag:untapper` search, including Wirewood Symbiote, Quirion Ranger, Vitalize, Early Harvest, and Seedborn Muse. "Premodern green storm" returns exactly Sprouting Vines and Hunting Pack. 12 tests pass.

**Small mistake.** A stray shell command waited for input and hung a probe run for two minutes. Killed it and reran.

---

## 2026-10-14 · Owner adds test prompts

The owner added two prompts to the hand-rated set, bringing it to 22:

- **"Build me a Premodern Dream Halls deck that doesn't win with storm."** A twist on a known engine. Dream Halls lets you cast spells free by discarding a same-color card; the deck has to keep that engine and find a different way to win.
- **"Build a deck that best utilizes Peter Parker's Camera."** A 1-mana artifact from the 2025 Marvel's Spider-Man set that copies an activated or triggered ability, three times. No format named, so the bot has to choose one (it is legal in Standard, Pioneer, Modern, Legacy, and Vintage) and justify it. Checked against Scryfall before adding: both cards are real and the legality is as described.

Then two Commander prompts, bringing it to 24:

- **"Build a Commander deck with Atraxa, Praetors' Voice that's all about proliferate."** Multiplayer, 100 singleton, four-color identity, no Decklist Data coverage.
- **"Build an aggressive Duel Commander deck with a red commander."** One-on-one Commander. Decklist Data already scrapes Duel Commander, so this one has real data behind it.

Commander support is planned for after launch, so both are flagged `afterLaunch` and scored separately. They measure how far off Commander is without dragging down the 60-card headline score.

**Why the hand-rated set matters (asked by the owner).** Each later step changes how decks get built, and AI output is good at looking fine on one or two examples. A fixed set rerun after every step shows whether a change actually helped and catches regressions. To keep the owner's time down: the owner rates three milestone runs (v1 baseline, after step 6, after step 8); an AI judge, calibrated against those ratings, pre-scores the runs in between.

---

## 2026-10-13 · Planning session with Claude Code, then step 1

**Starting point.** Decklist Data (decklistdata.com) scrapes public MTGO decklists into Postgres: about 1,230 commits, seven 60-card formats, archetype classification, metagame and card pages. It already had a v1 "AI deck builder" from 2026-09-06.

### Audit of the v1 builder (Fable's Phase 0 task, done by reading the code)

- One chat loop on Claude Haiku 4.5 through Vercel AI SDK v4. Max 10 tool calls, 60-second limit.
- 9 tools: list strategies, strategy card stats, reference decklists, average sideboard, matchup preview, score sideboard, card lookup, parse list, propose deck.
- Good idea already in place: `propose_deck` is a strict server check (60 main, 15 side max, 4-copy limit, legality, restricted list). Only passing decks reach the user.
- Biggest hole: the card catalog only held cards that had appeared in results or that the model already knew by name. It could not search "cheap black removal legal in Pioneer," so brews fell back to the model's memory.
- Surprise: v1 was not live. `decklistdata.com/ai-deck-builder` and its API both returned 404 even though the code was on `main`.

### Open questions from the Fable plan, resolved

- **Does Scryfall publish function tags in bulk?** Yes. `api.scryfall.com/bulk-data` lists `oracle_tags` (6 MB, refreshed daily). Fable could not confirm this from a docs page; one API call did.
- **Does the scraper keep matchup results?** It downloads Top 8 `brackets[]` but never stores them (noted in `src/scraper/parse-event.ts`).

### Decisions (and the reasoning)

| Decision | Why |
| --- | --- |
| Use Fable's 6-phase plan as the backbone | It was more complete than Claude Code's first draft on sideboards and evals. Both drafts agreed on the core idea: model proposes, data and code decide. |
| Own brand and site, codename **decklists.ai** | Owner's call: this is a showcase of building an AI harness, not a feature of a stats site. Claude Code first recommended keeping it on decklistdata.com for SEO and simplicity, then switched once the goal was clear. |
| Separate repo; Decklist Data exposes a read-only data API with `as_of` dates | Keeps the showcase repo pure harness (safe to open-source later) while the valuable part, the data, stays private. The `as_of` date is required for the brew holdout eval. |
| Coherent brews in **any** format, with or without data | Owner's requirement. Coherence comes from rules, card text, and math, which work everywhere. Data makes brews current. Fallback ladder for the shell step: same-format data, nearest-format data filtered by legality, popularity signals, model knowledge marked unverified. |
| 60-card formats first; Commander after launch | 60-card reuses everything; 100-card singleton needs a new checker and different norms. |
| Upgrade the model only after the baseline | Otherwise there is no way to tell which change helped. |
| Private repo now, public later | Secrets never enter git from commit one, so flipping to public stays safe. |

### Course corrections

- **Dropped "start saving Top 8 brackets."** Claude Code proposed it; the owner asked why a brew tool needs matchup history. Correct: a brew has no match history, the sideboard model works from meta share and weak spots, and the data can be backfilled by re-scraping if ever needed.
- **Dropped "create a new database."** Owner asked why. Steps 2 to 5 need only files; when brews need saving, a second database inside the existing Neon project is enough.

### The test case that defined "coherent"

Owner's example: *"Make a mono green storm deck in Premodern."* No such deck exists. Walking through it with real Scryfall queries:

- Premodern has 10 legal storm cards; only 2 are green: Sprouting Vines (3 mana, finds lands) and Hunting Pack (7 mana, a 4/4 per copy).
- The engine exists: 28 legal green mana creatures and untappers like Wirewood Symbiote, Quirion Ranger, Vitalize, Early Harvest, Seedborn Muse, plus Gaea's Cradle.
- Redundancy math: 4 Hunting Packs means drawing one by turn 4 on the play only **52.8%** of the time; 8 effective payoffs gives **79.0%**. Code catches this; a model building from memory would not.
- Donor shell from Decklist Data: Premodern **Cradle Control** (Survival of the Fittest, Gaea's Cradle, elf mana).
- Karsten land formula with a ~1.8 average mana value and ~16 cheap mana pieces: about **18.5 lands**, not 24.

### Built

- Created private repo `131ackknight/decklists-ai`: Next.js, official Anthropic SDK, zod, vitest. Build, typecheck, and tests pass.
- `PLAN.md`: decisions and the 10 steps, each with a "done when" gate.
- Drafted the 20 hand-rated rubric prompts (16 with data, 4 without: Timeless, Historic, Old School, Penny Dreadful), rated 1 to 5 on plan, legality, mana, and shell.

### Waiting on

- Owner review of the 20 prompts.
- Anthropic API key in `.env.local` (owner sets it).
- Read-only access to Decklist Data's production data for the v1 baseline and for picking the brew holdout decks.

---

## 2026-10-06 · Research and plan with Fable (claude.ai)

Owner asked: *what needs to be true to make a really good AI deckbuilding tool?* The v1 proof of concept was "okay" at tuning and combining strategies, but bad at sideboards and could not brew decks with no existing archetype.

**Diagnosis.**
- Sideboards are a missing-data problem: the model never knew what each sideboard card is for.
- Brews are a search-and-verification problem: no archetype to retrieve, no way to search cards by function, nothing to check against.

**Research findings.**
- Scryfall Tagger's community function tags (ramp, removal, sacrifice outlet) make "search by what a card does" possible.
- UrzaGPT (arXiv 2508.08382): adding card ability text to the prompt lowered drafting accuracy, so pass text only for the ~30 cards in play.
- The existing AI deck builders found were Commander-focused. None were found doing this for 60-card formats on tournament data.
- Since February 2026, MTGO Challenges under 64 players publish only Top 8 lists, so fringe decks are thin in the data.

**Plan.** The "AI Deckbuilder Build Plan" doc: six phases with gates (evals first, data layer, validator and mana solver, sideboard model, brew pipeline, ship), about 5.5 weeks. Key design rule: every data query takes an `as_of` date so a brew can be tested on data from before the deck existed.

**Brew pipeline in one line:** thesis → engine → shell → counts and mana → verify odds → critique → sideboard.
