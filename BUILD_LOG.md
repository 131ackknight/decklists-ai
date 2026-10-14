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
| Anthropic API spend | About $18.68: v1 baseline $0.63; v1 comparison pass 1 $18.03 (Fable $9.90, Opus $4.05, Sonnet $3.22, Haiku 4.5 $0.75, Haiku 5.5 $0.11); harness v2 smoke test $0.02. Plus one 17-token test call. |
| Real decklists analyzed | 30,102 (last 90 days, 8 formats) |
| Cards indexed | 32,870, with 4,577 function tags and 697 alternate MTGO names |
| Automated tests | 31 passing |
| Decklist Data PRs merged | 4 (#181 export, #182 baseline eval, #183 baseline on `main`, #184 model comparison) |
| Plan steps done | 1, 4, 5 (5 waits on generated decks from step 6); step 2: model comparison pass 1 run, blind-rated (108 answers) and unblinded |

## The story so far (for the post)

1. **The question.** Decklist Data scrapes public MTGO decklists. Its v1 AI deck builder was "okay" at tuning but bad at sideboards and could not brew decks that don't exist yet. What would make a really good one? (Oct 6, with Fable)
2. **The diagnosis.** Sideboards fail for lack of data (what is each card for?); brews fail for lack of search and verification (no way to find cards by function, nothing to check against). Principle: the model proposes, data and code decide.
3. **The decision to make it its own thing.** decklists.ai: a showcase of an AI harness, separate repo and brand, built on Decklist Data through a read-only data boundary. Rule: coherent brews in any format, with or without data.
4. **Card knowledge.** 32,870 cards and 4,577 Scryfall function tags, searchable by what cards do. "Premodern green storm" returns exactly the two real cards.
5. **The checker, and the best finding so far.** Calibrated on 30,102 real tournament lists: zero errors on every real list in 8 formats. Karsten's land formulas flagged most real decks; refitting per format was the wrong shape; the right answer was the archetype itself, where land counts agree to about ±1 land (Premodern Goblins 24.0 ±0.3). The right mana base comes from the closest real deck, not a formula.
6. **Measuring v1 honestly.** The baseline first hit the owner's own takedown (my stale-checkout mistake), then ran: 9 decks for 18 prompts at $0.63, and the memory failure in one line: "Storm is not legal in Premodern" (it is).
7. **Same harness, five models.** v1 on Haiku 4.5, Haiku 5.5, Sonnet 5.5, Opus 5.5 and Fable 5.1, blind-rated by the owner. Pass 1: bigger models finish (17-18 decks vs. 7-9), Haiku 5.5 is the value pick ($0.11), Fable builds the closest mana, and every model leans on the meta data in ways that hurt brews: "not in results" read as "doesn't exist," and brews pulled back toward existing decks (mono green storm built as Elves plus Hunting Pack).
8. **The ratings.** The owner blind-rated all 108 answers. When a list exists, every model scores about 4 and Haiku 4.5 ties Sonnet 5.5; on brews the spread grows to 2.4 points (Haiku 4.5 1.52, Opus 5.5 3.88). Opus 5.5 ranks first overall (3.85), and the most expensive model, Fable 5.1, ranks third at more than twice the cost.
9. **Where it goes next.** The new harness: card search decides what exists, data only informs mana, interaction and the meta, then the same five models again to separate what the model buys from what the harness buys.

Recurring theme for the post: the owner's pushback improved the work at nearly every turn (no bracket scraping, no new database, no Neon credentials, use our own data instead of re-scraping MTGO, every list instead of a sample, fix `main` instead of running an old build, compare models).

## Open decisions

- ~~Passes 2 and 3 of the v1 comparison~~: skipped in favor of building the new harness (owner agreed).
- Harness v2 across the five models: about $59 for one pass of 24 prompts (Fable ~$34 of it).
- A one-line PR so v1 logs the real error behind the four "An error occurred." builds.
- Adding the "distance from the nearest real deck" score and a "copy rate" score to the objective scorer.
- Lesson to apply: any prompt or claim that names a card gets checked against the card index before it is used.

---

## 2026-10-14 · Step 6: harness v2 built

The owner agreed with the recommendation: skip more v1 passes, build the new harness, and run it across the same models (part two of the post). The owner asked that every step be detailed here.

**What was built** (`src/harness/`, `src/data/`, all in the decklists.ai repo):
- **A data source with `as_of` dates** (`src/data/source.ts`). For now it reads the 30,102-list export; the Decklist Data API (plan step 3) will implement the same interface, so the harness won't change. It answers: the meta (share by strategy), how an archetype is built (core and flex cards, sideboard frequency, real land count and colored sources), the latest top list of a strategy, and how often a card is played and by which decks.
- **Nine tools** (`src/harness/tools.ts`), each answering a v1 failure:
  - `search_cards`, `find_tags`, `card_info`: the card pool, the authority on what exists and is legal. v1 could only look cards up by name.
  - `meta`, `archetype`, `reference_list`: tournament results, described to the model as evidence, not limits. Formats without data return the nearest formats to borrow from.
  - `draw_odds`: exact engine odds, so "honest odds" on impossible requests and brew redundancy come from math.
  - `check_deck`: the step 5 checker, plus a comparison against the real archetype whose mana the deck borrows.
  - `submit_deck`: **refuses any card name that no tool returned in this session.** This is the code-level fix for building from memory (v1's "Storm is not legal in Premodern"). It also refuses rule errors and records a stock / tuned / brew label and the donor shell.
- **A system prompt** (`src/harness/prompt.ts`) where each rule answers a failure from pass 1: the card pool decides what exists; results are evidence, and absence from results is not impossibility; honor every explicit constraint (colors, format, named cards); tuning means changes tied to matchups; brews start from the requested cards and must not collapse into an existing deck; pick a format when none is named; every card fact must come from a tool; single message, so no questions back (v1 often asked instead of building).
- **A manual tool loop on the official Anthropic SDK** (`src/harness/run.ts`) instead of the beta tool runner, for control a fair comparison needs: per-step token accounting, a 30-step cap, prompt caching on the system prompt and tools, append-only history so thinking blocks replay unchanged, refusal and max_tokens handling. Effort "high" on every model that supports it; Haiku 4.5 rejects the setting.
- **An eval runner** (`scripts/run-harness-eval.ts`) writing results in the v1 format, so the scorer and blind scorecard read both.
- 31 tests pass, including: `submit_deck` rejects unseen cards until `card_info` looks them up.

**Two deliberate choices.**
- **No automatic model fallback during evals.** The SDK can route a declined request to another model; in a model comparison that would silently mix models. Off for evals; on for the live site.
- **The decklist UI with live progress (part of step 6's original gate) moves to step 9**, where the site is built.

**Smoke test, Haiku 5.5, two prompts, $0.02 total.**
- **Mono green storm: built, labeled a brew.** The same Haiku 5.5 that told v1 "I can't build a mono green storm deck" found Sprouting Vines and Hunting Pack through card search, used Lotus Petal and Mox Diamond as storm fuel, and checked Hunting Pack's draw odds before submitting. Same model, different harness, opposite answer: the first direct evidence for part two of the post. It left the sideboard empty, so the prompt now requires a 15-card sideboard for formats that have one.
- **Stock Goblins:** a 5-0 League list, its source stated, checked against all 151 Goblins lists.
- Prompt caching works: most input tokens come back from cache at a tenth of the price.

**Estimated cost of one 24-prompt pass:** Haiku 5.5 ~$0.40, Haiku 4.5 ~$3.70, Sonnet 5.5 ~$7.40, Opus 5.5 ~$14, Fable 5.1 ~$34; about $59 for all five. The harness answers all 24 prompts, including the six v1 could not (Timeless, Historic, Old School, Penny Dreadful, Commander, Duel Commander).

**Owner's call: run harness v2 on Opus 5.5 and Sonnet 5.5 only** (estimated ~$21), the top two models from the v1 round. Haiku and Fable can be added later if the post needs them.

**Runs started** in parallel, three prompts at a time per model (logs in `evals/results/harness-v2/*-run.log`). First result in: Sonnet 5.5 on stock Goblins, a 60 + 15 stock list in 5 tool calls for $0.05.

**Owner's observation mid-run:** "They do seem always to want to default to what's in the database as the most valid." Why, as best we can tell: to a model a retrieved list is evidence and an invented deck is a guess; models are trained to prefer grounded answers, and a proven 5-0 list is always the safe one. The more the harness pushes grounding (needed for card facts), the more the database pulls. Early v2 signs (31 of 48 answers in): every answer built a deck and brew prompts came back labeled "brew," where v1 often refused or redirected; but on Merfolk and Kiln Fiend the models went to "tuned" versions of existing decks, and a "brew" label alone doesn't prove the deck isn't mostly an existing archetype. Next: measure copy rate (share identical to a list a tool returned) and distance from the nearest real deck on every v2 answer. The structural fix belongs to step 8: classify the request first (stock, tune, brew, impossible) to decide how much data may steer; hide decklist tools from the plan and engine steps of a brew; reject in code a brew that comes back mostly an existing deck's core; and keep the critique step from cutting engine cards.

**The observation, measured** (`scripts/novelty.ts`): for every deck, the highest share of its main deck found card for card in one real list from the last 90 days ("copy rate"), and the share of its spells that are core cards of one real archetype. v1, Opus 5.5 and Sonnet 5.5:

| v1 set | Prompt type | Decks | Avg copy rate | Avg core overlap | Decks 80%+ copied |
| --- | --- | --- | --- | --- | --- |
| Opus 5.5 | an existing deck is fine (5 prompts) | 5 | 99% | 87% | 5 |
| Opus 5.5 | asks for something new (13 prompts) | 12 | **87%** | 73% | **9** |
| Sonnet 5.5 | an existing deck is fine | 5 | 100% | 86% | 5 |
| Sonnet 5.5 | asks for something new | 13 | **78%** | 67% | **8** |

Even when asked for something new, v1's best two models returned decks that were on average 78-87% one real tournament list, and most of their "brews" were 80%+ copies. The v2 run will show whether the new harness breaks the habit or only relabels it.

**Prepared while they run:** round 2 of blind rating gets its own page and answer key, so round 1's ratings stay untouched. The page builder and objective scorer now tag harness v2 results with a "v2-" label (the result files share model names with v1), take v2's exact cost (cached tokens are priced correctly there), and check commander decks with their commander zone.

---

## 2026-10-14 · Pass 1 results, unblinded

The owner finished blind-rating all 108 answers (18 prompts x 6 sets). 102 are the owner's; 6 on the Psychatog tuning prompt are AI-judged or mixed, and the human-only column shows they don't change the ranking. `scripts/analyze-ratings.ts` reproduces every number here.

**Overall (mean of plan, legal, mana, shell, 1-5):**

| Model (v1 harness) | Overall | Human-only | Plan | Legal | Mana | Shell | Decks of 18 | Cost |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Opus 5.5 | **3.85** | 3.79 | 3.89 | 4.00 | 3.78 | 3.72 | 17 | $4.05 |
| Sonnet 5.5 | 3.71 | 3.68 | 3.72 | 3.61 | 3.83 | 3.67 | 18 | $3.22 |
| Fable 5.1 | 3.57 | 3.49 | 3.67 | 3.78 | 3.56 | 3.28 | 15 | $9.90 |
| Haiku 5.5 | 2.94 | 2.94 | 3.17 | 2.94 | 2.94 | 2.72 | 12 | $0.11 |
| Haiku 4.5, as shipped | 2.53 | 2.51 | 2.83 | 2.56 | 2.39 | 2.33 | 9 | $0.63 |
| Haiku 4.5 | 2.46 | 2.37 | 2.72 | 2.61 | 2.17 | 2.33 | 7 | $0.75 |

**By prompt type, the post's central chart:**

| Model | A list exists (4) | Owner's list given (2) | Brew or twist (10) | Impossible as asked (2) |
| --- | --- | --- | --- | --- |
| Opus 5.5 | 3.94 | 4.38 | **3.88** | 3.00 |
| Sonnet 5.5 | 4.13 | 4.13 | 3.55 | 3.25 |
| Fable 5.1 | 4.19 | 4.50 | 3.23 | 3.13 |
| Haiku 5.5 | 4.06 | 3.50 | 2.63 | 1.75 |
| Haiku 4.5, as shipped | 3.50 | 3.38 | 2.02 | 2.25 |
| Haiku 4.5 | 4.13 | 4.00 | **1.52** | 2.25 |

**What the numbers say:**
1. **When a list exists, the model barely matters.** Every model scores about 4 (3.5-4.2). Haiku 4.5 ties Sonnet 5.5 at 4.13. This is the identical-decks finding, now in the owner's own ratings.
2. **On brews and twists, the model is everything.** The spread grows from about 0.7 to 2.4 points: Haiku 4.5 at 1.52, Opus 5.5 at 3.88. The prompts where models differed most were all brews (Replenish without blue, mono green storm, Living End plus Scam).
3. **The most expensive model is not the best.** Fable 5.1 cost $9.90 for 18 prompts and placed third (3.57), behind Opus 5.5 ($4.05, 3.85) and Sonnet 5.5 ($3.22, 3.71). Fable built fewer decks (15) and scored lowest of the three on shell.
4. **Haiku 5.5 is the value story:** about half a point better than Haiku 4.5 for a sixth of the cost ($0.11).
5. **Removing the temperature setting changed nothing measurable:** Haiku 4.5 as shipped 2.53 vs. filtered 2.46.
6. **Everyone is weak on impossible requests** (best 3.25). Catching "this can't be done" and offering the best real alternative is a gap for every model, and a design target for the new harness.

**Caveats for the post:** one pass, 18 prompts, one rater. The gap between the Haiku tier and the Opus/Sonnet/Fable tier is large and consistent across prompt types; the ordering within the top three (3.85 vs. 3.71 vs. 3.57) is within what one pass can't separate. That is what passes 2 and 3 would settle.

---

## 2026-10-14 · Peter Parker's Camera: variety where the data runs out

The owner, rating: "The Peter Parker prompt was most interesting, there were 3 viable options that came out." The answers (still blind):

| Answer | Shell | Cameras | What it copies |
| --- | --- | --- | --- |
| A | Eldrazi Tron | 3 | Cast triggers and activated abilities (Ugin, Karn, Devourer of Destiny); Tron mana pays the {2} |
| C, D, F | Esper Blink | 2 | Enter-the-battlefield triggers (a second Solitude exile, another Flickerwisp blink, Overlord of the Balemurk) |
| E | Amulet Titan | 2 | Land and Titan triggers (Primeval Titan, Urza's Saga, Amulet of Vigor) |
| B | no deck | | |

**The mirror image of the identical-decks finding.** Where a winning list existed (Merfolk, Goblins, Mono-Red), every model returned the same 60. There is no Camera deck to copy, so the models had to reason, and five answers produced three different viable shells. **Variety appears exactly where the data runs out.** Each answer also followed the "proven shell plus a new payoff" approach from Fable's plan without being told to.

Rating guidance: reward "best utilizes" over "tacked on" (all are 2-3 Cameras added to an existing deck; the best answer explains which abilities are worth copying three times); no format penalty, because the prompt names none but v1 forces Modern, a harness limit that hits every answer equally. For the new harness: the format choice should belong to the model when the request leaves it open.

---

## 2026-10-14 · An AI judge on the tuning prompt

Unsure how to rate the Psychatog tunes, the owner asked: "can you score them for me?" Claude Code agreed with a caveat for the post: it is not a neutral judge, because Opus 5.5 is one of the models under test and models tend to prefer answers that sound like their own. So the scores are labeled an AI judgment, made without opening the answer key, and the post can either drop this prompt from the headline or disclose it.

Reading all six replies and checking their card claims against the card index changed the picture. The answers' card choices were similar; **their accuracy about cards was not**:

| | Plan | Legal | Mana | Shell | Deciding factor |
| --- | --- | --- | --- | --- | --- |
| A | 4 | 3 | 5 | 4 | Good matchup reasoning; false claims: Tsabo's Web "2.7% of lists" (76-92%), "Smother is weak vs Stiflenought" (Smother kills Phyrexian Dreadnought, mana value 1) |
| B | 3 | 3 | 5 | 4 | Copies the average sideboard; its text contradicts the deck it submitted |
| C | 4 | 5 | 5 | 5 | Accurate, explained, honest about what it didn't check; conforms more than it reads the meta |
| D | 4 | 3 | 5 | 5 | Best structure (sideboard map per matchup, catches a scorer error) but says Dreadnought has mana value 6, and miscounts lands |
| E | 5 | 5 | 5 | 5 | Accurate, swaps reasoned against specific decks, explains cuts and keeps |
| F | 2 | 2 | 5 | 2 | Cuts staples, maindecks Engineered Plague for "Enchantress tokens," contradicts itself on sweepers |

Order: E > C > D ≈ A > B > F. **Finding for the post: on a tuning prompt the models differ less in which cards they pick than in whether what they say about those cards is true.** A checker can verify a decklist; it cannot yet verify the explanation. That is a gap for the new harness: claims like "mana value 6" or "2.7% of lists" should come from tools, not memory, and be checkable.

**Saved, with provenance.** The owner said "yes save and move on." The owner had already fully rated A and given B a plan score, so human scores were kept: A stays the owner's (the AI scores are attached alongside for reference), B keeps the owner's plan with AI scores for the other three rows, and C-F carry the AI scores. Every row records `by` (owner, mixed, or ai-judge) plus an `aiJudge` copy of the AI's scores, so the analysis can separate human from AI ratings, and any later owner edit shows up as a difference from `aiJudge`. By then the store held 80 ratings, about 74 of them the owner's.

---

## 2026-10-14 · Tuning: one obvious move, then stop

Prompt 13 pastes a real UB Psychatog list (4th place, 4-3, Premodern Challenge 16, Oct 13) and asks to tune it for the current meta. The owner asked whether Control Magic is stock in Psychatog; the data answered it instead of memory: across 104 Psychatog lists from the last 90 days, Control Magic is a flex sideboard card (29%, 1-2 copies, never main). The stock sideboard is Engineered Plague 91%, Hydroblast 91%, Annul 86%, Tsabo's Web 76%.

The owner then noticed: "they aren't making a lot of changes, all the models." Measured (blind, sorted by size of change): all 6 answers returned a deck, changing 0-3 main deck cards and 0-5 sideboard cards. **5 of 6 added Tsabo's Web**, the 76% staple the pasted list was missing, which points to the average-sideboard data. Beyond that one data-backed move, they barely touch the list.

The same shape as the identical stock decks: the data hands the model one obvious move, it makes it, and it stops. A light touch is defensible on a list that just made Top 8, but "for the current meta" asks for reasoned, targeted changes. Rating guidance: Plan 2 no real changes, 3 an obvious add with thin reasoning, 4 targeted swaps each tied to a named matchup, 5 that plus a clear read of the list's weaknesses and why the rest stays. The explanation in the reply is worth a point here.

---

## 2026-10-14 · Rating rule: the impossible request

On "Make a Legacy deck that wins on turn 1 every game," every answer says it's impossible; the owner asked how to tell them apart. Ruling: saying "impossible" is the floor; the score is what comes after. Plan 5 = says so, builds the fastest real deck, gives honest turn 1 odds; 4 = names the fastest options with honest odds or reasoning but no deck; 3 = names options vaguely; 2 = just "impossible"; 1 = claims a deck really does it. Legal marks down false claims (a banned card, a card that doesn't do what's said). Mana and Shell follow the no-deck rule (1 and 1), consistent with the best answer being one that builds. Inflated odds count against Plan like any false claim.

---

## 2026-10-14 · Rating rule: sideboard-only prompts

For the Legacy Dimir Tempo sideboard prompt, the owner planned to give every answer Mana 1, since the owner supplied the main deck. It would not change rankings, but it would drag every model's headline average down for work none of them was asked to do. Ruling: on sideboard-only prompts, Mana means "can the deck cast this sideboard?" (5 all castable in blue-black, 3 awkward costs, 1 off-color cards), and changing the supplied main deck costs points on Plan and Legal unless a small swap is explained. Added to the page's guide along with the general constraint rule from the mono-white prompt.

---

## 2026-10-14 · Rating rule: when the answer changes the colors

On "Make a fun mono white control deck for Modern leagues," the owner asked how to rate an answer that turned it into blue-white. Ruling: changing an explicit color constraint means the answer didn't do what was asked. Legal 1-2 (2 if it explained the switch or only splashed, 1 if it silently became a real two-color deck); Plan 2 ("an idea, but it misses the request"); Mana and Shell judged on the deck itself, keeping "followed instructions" separate from "is the deck good."

Across the six pass 1 answers (still blind): 3 decks classified "Rogue," 1 classified "UW Control," and 2 no-deck answers. UW Control is a real archetype in the Modern data and mono-white control is not, so this looks like the same pull toward an existing deck seen with mono green storm (built as Elves).

---

## 2026-10-14 · Five models, one deck (Merfolk, Mono-Red, Goblins)

While rating "I want a Modern Merfolk deck that can beat the current top decks," the owner noticed: "they all produced identical decks basically." Measured without unblinding:

- **5 of 6 answers built a deck, and all 5 main decks are identical, card for card (100% pairwise overlap).** Sideboards overlap 73-80%. All five were labelled "stock Merfolk." The sixth answer produced no deck.
- **Every one of them called `reference_decklists`,** which returns a recent winning list, and copied it. Decklist Data holds 14 Modern Merfolk lists from the last 90 days.

**Why it matters for the post: on this prompt the harness decided the answer, not the model.** Five models from Haiku to Fable, handed the same tool that returns a finished winning list, all handed it straight back. Model differences only show where the tools stop helping, which matches the owner's read that answers struggle on brews.

Copying a proven list is reasonable for a stock request, but this prompt asked for a deck that beats the current top decks, and only the sideboard adapted. Rating guidance given: Mana and Shell high, Legal 5, Plan about 4 unless a meaningful meta-aimed change was made; judge the differences by whether the sideboard answers the decks it names.

**New metric for the new harness: copy rate,** the share of a deck identical to a list the model was handed. High copy rate is right for "give me stock Goblins" and wrong for "tune this for the meta" or a brew.

**It is a pattern, not a one-off.** The owner then saw the same on Pauper red aggro. Across the three prompts that match a deck in the data:

| Prompt | Decks | Called `reference_decklists` | Main deck overlap | Sideboard overlap | Classified as |
| --- | --- | --- | --- | --- | --- |
| Pauper fast red aggro | 6 | 6 of 6 | 91% | 81% | all Mono-Red Rally, stock |
| Modern Merfolk | 5 | 5 of 6 | 100% | 77% | all Merfolk, stock |
| Premodern stock Goblins | 6 | 6 of 6 | 93% | 78% | all Goblins, stock |

**Finding for the post: when a request matches a deck in the data, every model from the cheapest Haiku to Fable fetches a winning list and returns roughly the same 60.** On those prompts the data and tools set the ceiling and the model barely matters; model differences live on the brews and twists, where there is nothing to copy. Rating guidance: near-identical decks can get near-identical scores; no need to invent differences.

---

## 2026-10-14 · Owner starts the blind rating

The owner began rating pass 1 on the Blind Brew Scorecard: 18 prompts, 108 anonymous answers across six sets, scored 1-5 on plan, legality, mana and shell using the page's "How to rate" anchors. Ratings save to the page's store and will be unblinded with `evals/results/model-comparison/blind-key.json` once pass 1 is complete.

**Early pattern, three prompts in (13 answers rated, still blind):** stock Premodern Goblins scored 4-5 on every check for all six answers; mono green storm got three no-deck answers (all 1s) and decks rated 4, 2 and 4 on plan; the "Replenish without blue" twist opened with mana 1, plan 2. The owner: "starting to see it struggling." That is the predicted split: strong where the request matches a deck in the data, weak once it has to leave the data. Claude Code is holding off on judging specific answers until rating is done, so the ratings stay independent, and suggested one-line notes on standout answers as quotable examples for the post.

**A prompt-writing mistake, found by the owner while rating.** The owner asked how to score an answer to "Build a Modern deck around Thassa's Oracle and Tainted Pact" that left out Tainted Pact. Checking: **Tainted Pact is not legal in Modern** (it is legal in Legacy). Claude Code wrote that prompt on day one without checking legality, the exact "from memory" failure this project exists to fix. The prompt text stays, since changing it mid-comparison would break the comparison, and it becomes an impossible-request test like "turn 1 every game." Its "A good answer" line now says a good answer catches the problem, then builds the closest legal Oracle deck or points to Legacy. Scoring guidance given: caught it and said so = Legal 5; dropped it silently = Legal 3 and Plan 2-3; mana and shell judged on the deck itself. Saved ratings were unaffected. Every other card named in the prompts was then checked against Scryfall legality: all legal where asked.

**Rating rule settled with the owner:** "What if it says it's not legal and produces no deck?" Decided, and added to the page's guide so it applies to every prompt: no deck means Mana 1 and Shell 1; Plan and Legal judge the reply. Catching an illegal or impossible part of the request and saying so earns Legal 5 (quietly dropping it earns 3). A correct "can't be done" with no deck earns Plan 2, or 3 with a concrete next step, because here a real path existed (the combo is legal in Legacy); only a truly impossible request ("turn 1 every game") can score higher without a deck. The owner then asked for the difference between Plan 4 and 5; the guide now carries the full Plan ladder, with a quick test: one or two swaps before playing it is a 4, play it as is is a 5. Pinning the scale down mid-rating matters because these ratings are the post's headline numbers.

---

## 2026-10-14 · Is the bot leaning too hard on the database?

The owner asked, before reading any answers: "Do you think they are relying too much on the structured database? Is that ever going to be a thing we can get rid of? If something really doesn't exist we need to account for that."

Pass 1 already holds the evidence. Ten prompts ask for decks that do not exist yet:

| Set (v1 harness) | Meta/decklist tool calls | Brew decks built (of 10) | Brews labelled stock or tuned | Asked or redirected |
| --- | --- | --- | --- | --- |
| Haiku 4.5, as shipped | 40 | 4 | 2 | 4 |
| Haiku 4.5 | 48 | 2 | 1 | 3 |
| Haiku 5.5 | 74 | 5 | 5 | 3 |
| Sonnet 5.5 | 99 | 10 | 5 | 0 |
| Opus 5.5 | 81 | 9 | 6 | 0 |
| Fable 5.1 | 69 | 7 | 4 | 1 |

**Two failure modes:**
1. **"Not in results" read as "doesn't exist."** Haiku 5.5 on mono green storm: "I can't build a mono green storm deck... Storm isn't a strategy in the last 30 days of Premodern results." Bigger models handle it ("This is a brew... no storm deck shows up in results"), but the harness should not depend on that.
2. **Brews pulled toward an existing deck.** Opus 5.5 and Fable 5.1 both built mono green storm as an Elves deck with Hunting Pack added, and more than half the bigger models' "brews" were labelled stock or tuned. This is the "sanding the brew down into the donor deck" risk from Fable's plan.

Reliance alone is not the problem: Sonnet 5.5 made the most data calls and built all 10 brews.

**Answer: keep the data, change what it may decide.**
- "Does this exist?" is answered only by the complete card pool (Scryfall), which can prove or disprove it. v1 got this wrong from memory ("Storm is not legal in Premodern").
- "What do good players run?" is answered by Decklist Data, as evidence for mana, interaction, and the meta. Never as a gate.

**Design rules for the step 8 pipeline:** thesis and engine come from card search only, with meta data not visible in that step; data enters at the shell step for mana and interaction; the critique step cannot cut engine cards; "can't be done" is allowed only when card search proves it.

**New measurements planned for the post:** a "distance from the nearest real deck" score (share of a brew's nonland cards that are core cards of an existing archetype) and a with-data vs. without-data run of the new harness.

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
