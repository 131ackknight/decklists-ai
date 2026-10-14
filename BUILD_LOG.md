# Build log

A running record of how decklists.ai gets built: decisions, findings, numbers, and course corrections. Newest first. Written to be mined for a public write-up later.

## How this log works

- Updated at every iteration (each run, fix, and change of direction), newest at the top.
- Each entry: what we did, what we decided and why, what we found (with numbers), and what changed our minds.
- Mistakes and dead ends stay in, including when the owner overruled Claude Code. They are the interesting part of the story.
- Corrections to earlier entries are added in place as notes, so the original claim stays visible.

## Running totals (as of 2026-10-14)

| Item | Total |
| --- | --- |
| Anthropic API spend | About $18.66: v1 baseline $0.63; comparison pass 1 $18.03 (Fable $9.90, Opus $4.05, Sonnet $3.22, Haiku 4.5 $0.75, Haiku 5.5 $0.11). Plus one 17-token test call. |
| Real decklists analyzed | 30,102 (last 90 days, 8 formats) |
| Cards indexed | 32,870, with 4,577 function tags and 697 alternate MTGO names |
| Automated tests | 27 passing |
| Decklist Data PRs merged | 4 (#181 export, #182 baseline eval, #183 baseline on `main`, #184 model comparison) |
| Plan steps done | 1, 4, 5 (5 waits on generated decks from step 6); step 2: v1 baseline run, owner rating pending |

---

## 2026-10-14 · Model comparison, pass 1

Objective scores only, one pass each, so treat as early signal:

| Model (v1 harness) | Decks of 18 | Pass our checker | Mana warnings | Invented cards | Lands vs. archetype (avg off) | API errors | Cost | Median time |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Haiku 4.5, as shipped | 9 | 9 | 2 | 0 | 1.79 | 0 | $0.63 | 14 s |
| Haiku 4.5 | 7 | 7 | 1 | 0 | 1.04 | 0 | $0.75 | 16 s |
| Haiku 5.5 | 12 | 12 | 1 | 0 | 0.95 | 2 | $0.11 | 18 s |
| Sonnet 5.5 | **18** | 18 | 1 | 0 | 0.89 | 1 | $3.22 | 41 s |
| Opus 5.5 | 17 | 17 | **0** | 0 | **0.84** | 0 | $4.05 | 33 s |
| Fable 5.1 | 15 | 15 | **0** | 0 | **0.71** | 1 | $9.90 | 36 s |

**First observations.**
- **Bigger models finish the job.** The same v1 harness that produced a deck for 7-9 prompts on Haiku 4.5 produced 17-18 on Sonnet 5.5 and Opus 5.5. Most of Haiku's misses were asking a question or running out of tool calls.
- **Haiku 5.5 is the value story:** more decks than Haiku 4.5 (12 vs. 7-9) at about a seventh of the cost ($0.11).
- **Every accepted deck passes the decklists.ai checker, and none invent cards.** v1's own server check already guaranteed legality; the differences are in whether a deck gets built at all and how good it is, which is what the blind ratings measure.
- **Costs ran above estimate** for the big models (Sonnet $3.22 vs. ~$1.30 estimated, Opus $4.05 vs. ~$2.50): they make more tool calls, and the prompt grows with each one.
- **Fable 5.1 builds the closest mana bases** (0.71 lands off the real archetype on average) but produced fewer decks than Sonnet or Opus (15), at the highest cost ($9.90 for 18 prompts).
- **Pass 1 total: $18.03.** At that rate passes 2 and 3 cost about $36 more, so the whole comparison lands near $55, above the $30-40 estimate. Flagged to the owner before spending it.
- **Blind Brew Scorecard published** with pass 1: 18 prompts, 108 anonymous answers (six sets: the five models plus as-shipped Haiku 4.5). Ratings store checked reachable and empty. It replaces the first, non-blind scorecard.
- **The owner asked how to read the scorecard.** Fair: the page had no instructions. Added a "How to rate" box at the top (open on first visit) with a 1/3/5 anchor for each row, so ratings stay consistent across 100+ answers. Two judgment calls written into it: an honest refusal can score well when not building was right ("turn 1 every game"), and Legal mostly measures whether the answer did what was asked, since v1's server already rejects illegal decks.
- **Four mid-build errors** (two Haiku 5.5, one Sonnet 5.5, one Fable 5.1) after several successful tool calls. v1's SDK masks the message as "An error occurred." Next: log the real error before passes 2 and 3.

---

## 2026-10-14 · Research design: comparing models

The owner wants results compared across models as research for a blog post. Decisions (owner's choices from the options offered):

| Choice | Decision |
| --- | --- |
| Models | Haiku 4.5, Haiku 5.5, Sonnet 5.5, Opus 5.5, Fable 5.1 |
| Passes | 3 per model (model output varies run to run; one pass can flip a ranking) |
| Rating | Owner rates everything, blind |

**Making it fair.**
- **Same harness, same settings.** v1's AI SDK always sends `temperature: 0`, which the newer models reject. [PR #184](https://github.com/131ackknight/mtgo-opponent-scout/pull/184) adds an eval-only request filter that drops sampling settings and gives every model the same 16k token limit (models that think by default spend output tokens before answering, and v1's ~4k default could cut them off). v1's prompt, tools, and loop are unchanged. Because this changes Haiku 4.5's settings too, Haiku 4.5 is rerun with the filter; the original run stays on record as "as shipped."
- **Blind rating.** Answers are grouped by prompt and labeled only A, B, C... in random order. The key mapping letters to models lives in the repo, not in the page. The as-shipped Haiku 4.5 run joins as one more anonymous set, which also shows whether dropping temperature changed anything.
- **Objective scores alongside the ratings**: deck produced, step 5 checker result, land count against the real archetype, invented cards, cost, and time.
- **Pass 1 for every model first**, then check real costs and failure modes before spending on passes 2 and 3. Estimated total: $30-40, mostly Fable and Opus.

**The two-part story for the post.** Part one (now): one harness, v1, across five models. Part two (after step 6): the new harness across the same models. Together they separate what better models buy from what a better harness buys.

The workflow runs a model x pass matrix, at most three jobs at a time to keep load on the live database low.

**Pass 1 started** after the owner merged #184: all five models, run 38581025630.

**Built while it ran:**
- `scripts/score-v1-runs.ts`: the objective scorer. On the as-shipped Haiku 4.5 run: 9 decks of 18 prompts, all 9 pass the decklists.ai checker, 2 carry mana warnings, 0 invented card names, land counts average 1.8 off the real archetype, $0.63, median 14 s per prompt.
- **Blind Brew Scorecard** (`scripts/build-blind-page.ts`): one prompt at a time, every answer a lettered card in shuffled order. Hidden on purpose: model names, token counts, and timings, since speed and cost would give a model away. Each answer has a random id; the id-to-model key is a file in the repo, reused on rebuilds so ratings survive adding passes.

---

## 2026-10-14 · Step 2: the v1 baseline is in

v1 on Haiku 4.5, the builder as it shipped, answered the 18 prompts in formats it supports. **Cost: $0.63** (510k input tokens, 24k output). The answers are on a private **Brew Scorecard** page for the owner to rate.

**Raw numbers before rating:**
- **A deck for only 9 of 18 prompts.** Four runs hit v1's 10-tool-call limit mid-build (Replenish twist, mono-white control, Greasefang, Dream Halls); the deck it was fixing never reached a passing state on two of them.
- **The memory failure Fable predicted, verbatim.** Asked for mono green storm in Premodern, v1 said: "Storm is not legal in Premodern. The format's card pool ends before storm was printed." False: storm comes from Scourge, the last Premodern set, and Sprouting Vines and Hunting Pack are legal (step 4's search finds both). A model building from memory, with no way to search cards by what they do, talked itself out of the request.
- **It often asks instead of builds.** For Merfolk, Golgari midrange, and "something weird," v1 replied with a question ("Would you like Jund Sacrifice or a Golgari brew?"). In a one-message test that counts as no deck; it is also how v1 behaves for a real first message.
- **Peter Parker's Camera** went into Modern (v1's default) as a "tuned" Amulet Titan list.
- **"Turn 1 every game" in Legacy** got an honest "no" and a list of the fastest real decks, without building one.

**The scorecard.** One card per prompt: the request, what a good answer does, v1's reply, its deck, and tool-call stats, with 1-5 buttons for plan, legality, mana, and shell. Ratings save to the page's own store as the owner clicks, and only the owner can write. The 4 unsupported 60-card formats score 1 automatically; the 2 Commander prompts are shown but kept out of the headline score. Checked after publishing: the ratings store is reachable and empty.

---

## 2026-10-14 · Step 2: v1 can't run on Haiku 5.5

After PR #183 merged, both baseline runs started in parallel. The Haiku 5.5 run finished first, because every request failed instantly: v1 returned "An error occurred." for all 18 prompts, with no tokens billed.

The AI SDK hides the real error, so Claude Code tested the guess directly with one tiny API call (17 tokens, a fraction of a cent): Haiku 5.5 rejects `temperature: 0` with "`temperature` is deprecated for this model," and the same request without it works. v1's Vercel AI SDK v4 always sends `temperature: 0` when none is set (its own source has a `TODO v5 remove default 0 for temperature`).

**What it means.** v1 cannot use current models without upgrading its SDK, and that would change the harness, not just the model, so "v1 on Haiku 5.5" is not a clean comparison. It is also concrete support for the plan's decision to build decklists.ai on the official Anthropic SDK. The model-versus-harness split will come from the other side instead: the new harness run on Haiku 4.5 against v1 on Haiku 4.5 isolates what the harness buys, and the new harness on newer models shows what the models buy.

Also built while the runs went: the **Brew Scorecard** page generator (`scripts/build-rating-page.ts`), one card per prompt with the reply, the deck, the tool-call stats, and 1-5 buttons for each check. Ratings save to the published page's own storage so they can be read back; only the owner can write. Unsupported formats score 1 automatically; Commander prompts stay out of the headline score.

---

## 2026-10-14 · Step 2: setting up the v1 baseline

The owner added the Anthropic key as a GitHub secret (`ANTHROPIC_KEY`), which lets the old v1 builder run where the database already is: GitHub Actions. [PR #182](https://github.com/131ackknight/mtgo-opponent-scout/pull/182) adds a manual workflow that starts the Decklist Data app in CI, sends v1 each rubric prompt through its real chat API, and saves every answer (text, tool calls, final deck, token usage) for hand rating.

- 18 of the 24 prompts are in formats v1 supports. The other 6 (Timeless, Historic, Old School, Penny Dreadful, two Commander) are recorded as "v1 can't do this," which is itself part of the baseline.
- The two "paste my list" prompts now carry real lists from the export: a Legacy Dimir Tempo 5-0 main deck (sideboard request) and a Premodern UB Psychatog list that went 4-3 in a Challenge (tune request).
- The Peter Parker's Camera prompt names no format; v1 forces one, so it goes to Modern, v1's default.
- The runner was tested against a fake server speaking v1's stream format before spending a CI run on it.
- Expected cost: a few dollars (v1 runs on Haiku 4.5).

**The first run measured nothing.** Every prompt got HTTP 404 and no API money was spent. The cause was Claude Code's mistake: the owner had already taken v1 down on Oct 8 (commit `8f03628`, so bookmarked links could not burn model calls), but the owner's local checkout was behind GitHub, and the session's opening audit read the older code where the builder was still live. The audit's "v1 isn't live" finding was the takedown all along. First fix: run the app from `cc02c18`, the last commit with the builder online. Lesson: before auditing code, check the local branch against the remote.

**The owner overruled that fix:** "why do you want to run on an old build? Shouldn't we just fix it so we can do this properly with main?" Right again. Claude Code had avoided touching `main` to respect the takedown, but there was a way to do both. [PR #183](https://github.com/131ackknight/mtgo-opponent-scout/pull/183) now restores the v1 chat route on `main` behind an off-by-default switch (`DECK_BUILDER_ENABLED=1`). Only the eval workflow sets it, never Vercel, so the live site stays offline exactly as the owner left it. The `src/lib/deck-builder/` code is untouched since the takedown, so the eval measures the builder that shipped, on current `main`, with no old-commit gymnastics.

**Model question from the owner:** "Isn't there a better Haiku now that's even cheaper?" Yes: Haiku 5.5 costs a tenth of Haiku 4.5 ($0.10 vs. $1 per million input tokens). The workflow now takes a model input, so v1 runs twice: on Haiku 4.5 (the true baseline, what shipped) and on Haiku 5.5 (same harness, newer model). The gap between those two runs separates what a better model buys from what a better harness buys.

---

## 2026-10-14 · Step 5: the deck checker, calibrated on 30,102 real lists

**The data.** The owner merged PR #181 and the export ran in GitHub Actions: **30,102 published lists from the last 90 days** (Modern 10,314; Pauper 4,695; Legacy 4,173; Standard 3,908; Pioneer 2,382; Premodern 2,251; Vintage 1,885; Duel Commander 494). The data stays out of git.

**Built.**
- Exact draw odds (hypergeometric), including "at least one of each group" for multi-piece engines. They reproduce the earlier numbers: 52.8% and 79.0% for the storm payoffs, and Fable's 22% and 55% for two-piece engines. Fable's math checks out independently.
- A checker driven by the format registry: deck and sideboard size, copy limits (basics, "any number of cards named," the restricted list), legality, commander rules and color identity, and name suggestions for typos.
- A mana report: land count (modal double-faced cards count as half), colored sources (fetches, Moxen, half credit for one-mana dorks and rocks), curve, and cheap draw/ramp count.
- A calibration runner: every real list through the checker, failures grouped by reason and archetype.

**First run, and what it exposed.** Premodern passed 100% from the start. Elsewhere:
- **38 card names Scryfall's main file didn't know**, all from one cause: MTGO uses "Through the Omenpaths" names for the Marvel cards ("Kavaero, Mind-Bitten" is Superior Spider-Man). Scryfall stores those as `printed_name` on a separate MTGO-only printing. Fixed by reading every printing (the `default_cards` file) and indexing alternate names: 697 cards gained one.
- **Duel Commander failed 100%**: MTGO lists put the commander in the sideboard slot. Fixed with an MTGO adapter.
- **Vintage's restricted list is time-dependent** like bans: The Fantasticar is restricted now, but July lists legally ran four. Restricted counts now follow the same "only for recent lists" rule as legality.
- **Commander edge cases**: Grist (a planeswalker that is a creature off the battlefield), legendary Vehicles with power and toughness (now allowed as commanders), and Backgrounds as a second commander.
- **A wrong accusation, then a correction.** Claude Code reported two Duel Commander lists as corrupted data in Decklist Data ("three copies of Fury in a 15-card sideboard of a singleton format") and suggested a scraper bug. The owner pointed out that Commander lists have no sideboards. Checking properly: no Duel Commander list in the data has a real sideboard. The "corrupted" list came from a sloppy search that matched a **Legacy Painter** deck running Gut, True Soul Zealot in its sideboard. Decklist Data was fine.
- **The real cause of the last two failures: companions.** Both were Lurrus + Nick Fury decks. Lurrus is a companion, which in Duel Commander sits outside the 100, and MTGO puts it in the sideboard slot next to the commander. The MTGO adapter now moves a companion to its own zone.

**After fixes: 100% of real lists pass with zero errors in all 8 formats**, Duel Commander included. Gate met: at least 98%, every failure explained.

**The mana warnings were the interesting part.** Using Karsten's published formulas, only 14% of real Modern decks and 30% of Premodern decks passed without a warning. Real tournament decks routinely break "fair deck" math (Living End, Belcher, Tron). Two attempts:
1. **Refit the land formula per format on the real lists.** It made the warnings usable (90-95% of real decks clean), but the fits were strange: negative mana-value coefficients in Legacy, Pauper, and Vintage, and 95% bands as wide as 12 lands. One formula per format is the wrong shape.
2. **Measured spread within each archetype instead.** This was the finding of the day. Land count spread within one archetype is 3 to 5 times tighter than across a format: standard deviation 0.6-1.3 lands within a strategy versus 2.2-4.8 across the format. Premodern Goblins runs 24.0 lands (±0.3), Stiflenought 17.1, Standstill 26.1 (±0.3). **The right mana base comes from the closest real archetype, not from a formula.** That is data backing for Fable's "borrow the donor shell's mana" step.

**So the checker has two levels:**
- A generic sanity check using the per-format fit, tuned so 95% of real decks pass. It catches gross mistakes in any format, including ones with no data.
- An archetype comparison ("Goblins lists run 24.0 lands; this has 20"): 240 archetype profiles, bands about ±1.5 lands, and 90-96% of real lists sit inside their own archetype's bands. This is the precise check the brew pipeline will use against its donor shell.

27 tests pass. Still open for step 5: the "100 generated decks pass" half of the gate needs the step 6 harness to generate them. Role coverage (removal, threats, card flow) is deferred to step 8, since judging it needs the deck's thesis.

**Small mistakes.** One unit test was wrong (it built a deck with 36 Lightning Bolts and expected it to pass); the checker was right.

---

## 2026-10-14 · Step 5 starts: getting real decklists to test against

The deck checker needs real tournament lists to calibrate against: if a real Challenge Top 8 deck fails the land count or colored-source check, the check is wrong, not the deck.

**Course correction.** Claude Code started writing a scraper for mtgo.com's public decklist pages, to avoid touching Decklist Data's database after the Neon setup went badly. The owner stopped it: "why are you fetching MTGO scraping when we have all that in decklist data?" Right call. Decklist Data's lists are already cleaned and carry archetype labels, which lets the checker be calibrated per deck type (Goblins vs. Storm), and rebuilding a scraper the owner already has is waste. The scraper was deleted before it was committed.

**Instead:** a read-only export script and a manual GitHub Actions workflow in the Decklist Data repo ([PR #181](https://github.com/131ackknight/mtgo-opponent-scout/pull/181)). It pulls up to 50 recent Challenge Top 8 and League 5-0 lists per format, at most 5 per strategy so the set stays varied, with no player handles. It takes an `as_of` date, following the plan's rule that every data query can be rebuilt for a past date. This is also the first piece of step 3's data path. Built in a separate git worktree so the owner's uncommitted work in that repo was never touched.

**Second course correction: from a sample to everything.** The first version exported 50 lists per format, capped at 5 per strategy over 30 days, a number inherited from Fable's plan ("top 50 real lists pass"). The owner pushed twice: "wouldn't more be better?" and then "why not just look at all of the ones we have?" Both fair:
- The checker is plain code. Running it on every list takes seconds and costs nothing.
- The reason given for a small set (reading failures by hand) goes away when failures are grouped by reason instead of read one by one.
- Small samples hide the spread that calibration needs (real Burn decks run anywhere from about 18 to 20 lands) and miss less-played decks entirely, which is where brews live.
- Decklist Data only stores published lists (Challenge finishes and League 5-0s), so every list is a real deck that did well. There is nothing to filter.

The export now streams every published list as JSON Lines. The owner then settled the window: "or at least all of them in last 90." So the default is every list from the last 90 days: current meta, and nearly all still legal, so every deck gets every check including legality (`--days 0` still pulls all history). Two caveats handled: it reads 500 decks at a time with a pause, so the live site is not slowed (the owner had worried about load earlier); and since bans change over time, old lists will be checked for mana, land count, and size but not for today's legality. New gate for step 5: at least 98% of real lists pass, and every failure is explained.

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
  - *Correction (2026-10-14):* the code was not on `main`. The owner had taken the builder down on Oct 8 (commit `8f03628`); this audit read a local checkout that was behind GitHub. See "Step 2: setting up the v1 baseline."

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

### How the Fable plan reached Claude Code

The research and plan from Oct 6 lived in a claude.ai chat with Fable. Claude Code could not find it among local sessions, so the owner shared the chat link; the built-in browser showed a sign-in page, the owner signed in there, and Claude Code read the full conversation, then pulled the "AI Deckbuilder Build Plan" doc through the Claude Docs connector. Two models, two roles: Fable researched and planned, Claude Code checked the plan against the real code and built it.

### The 10-step plan

Fable's six phases, merged with the decisions above (full version in `PLAN.md`, each step with a "done when" gate):

1. Setup: repo, scaffold, API key.
2. Tests and baseline: hand-rated prompts, sideboard test, brew holdout test; score the v1 bot.
3. Decklist Data API with `as_of` dates.
4. Card knowledge: Scryfall cards and function tags, format registry, `search_cards`.
5. Deck checker and mana math.
6. Harness v2: newer models, the new tools, background runs.
7. Sideboard model.
8. Brew pipeline: thesis, engine, shell, counts, odds, critique, sideboard.
9. Site: watch-it-think UI, export, sign-in, daily cap.
10. Launch and cross-promotion.

Rule for every step: rerun the tests; a step counts as done only when its number beats the last one.

### Other questions worth keeping

- **"Should this be its own site?"** Claude Code first said no (SEO, simplicity). The owner wanted its own brand because it is a showcase of building an AI harness, cross-promoting Decklist Data. Claude Code agreed once the goal was clear.
- **"Does my database help even with a new repo?"** Yes, it is the moat. A repo is code; the data lives in Postgres either way. Anyone can connect a model to Scryfall; current, labeled MTGO results for 60-card formats are what make brews playable.
- **"Are you the one building this?"** Yes for the code, tests, data work, and PRs. The owner handles accounts and money, secrets, decisions, Magic judgment (rating the test brews), and playtesting.
- **Naming.** Brainstormed by angle: card names with a double meaning (Tutor, Tinker, Brainstorm), off-meta (Rogue Lab, Off-Meta), brewing (Brewsmith, The Cauldron), deck terms (Seventy-Five). The owner picked the codename **decklists.ai**; a whois check that day returned "Domain not found."
- **API key setup.** The app's file preview turned out to be read-only, so Claude Code opened both `.env.local` files in Cursor at the right line. The first save missed one file; Claude Code verified each key with a free Models API call without ever printing it.

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

### Waiting on (all resolved on 2026-10-14)

- Owner review of the 20 prompts. *Resolved: owner kept them and added 4, for 24.*
- Anthropic API key in `.env.local` (owner sets it). *Resolved.*
- Read-only access to Decklist Data's production data. *Resolved differently: GitHub Actions workflows with the existing secret, after the Neon role setup was dropped.*

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
