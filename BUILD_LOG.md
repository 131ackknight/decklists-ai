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
| Anthropic API spend | v1 baseline $0.63; v1 comparison pass 1 $18.03 (Fable $9.90, Opus $4.05, Sonnet $3.22, Haiku 4.5 $0.75, Haiku 5.5 $0.11); harness v2 smoke test $0.02; harness v2 pass 1 $15.03 (Opus $9.49, Sonnet $5.54); Old School rerun $0.51; intent stage evals $0.25. Total about $34.47. Plus one 17-token test call. |
| Real decklists analyzed | 30,102 (last 90 days, 8 formats) |
| Cards indexed | 32,870, with 4,577 function tags and 697 alternate MTGO names |
| Automated tests | 35 passing |
| Decklist Data PRs merged | 4 (#181 export, #182 baseline eval, #183 baseline on `main`, #184 model comparison) |
| Plan steps done | 1, 4, 5, 6; step 2 rubric baseline done (108 + 48 rated, 36 pairwise judged); next: step 8 |

## The story so far (for the post)

1. **The question.** Decklist Data scrapes public MTGO decklists. Its v1 AI deck builder was "okay" at tuning but bad at sideboards and could not brew decks that don't exist yet. What would make a really good one? (Oct 6, with Fable)
2. **The diagnosis.** Sideboards fail for lack of data (what is each card for?); brews fail for lack of search and verification (no way to find cards by function, nothing to check against). Principle: the model proposes, data and code decide.
3. **The decision to make it its own thing.** decklists.ai: a showcase of an AI harness, separate repo and brand, built on Decklist Data through a read-only data boundary. Rule: coherent brews in any format, with or without data.
4. **Card knowledge.** 32,870 cards and 4,577 Scryfall function tags, searchable by what cards do. "Premodern green storm" returns exactly the two real cards.
5. **The checker, and the best finding so far.** Calibrated on 30,102 real tournament lists: zero errors on every real list in 8 formats. Karsten's land formulas flagged most real decks; refitting per format was the wrong shape; the right answer was the archetype itself, where land counts agree to about ±1 land (Premodern Goblins 24.0 ±0.3). The right mana base comes from the closest real deck, not a formula.
6. **Measuring v1 honestly.** The baseline first hit the owner's own takedown (my stale-checkout mistake), then ran: 9 decks for 18 prompts at $0.63, and the memory failure in one line: "Storm is not legal in Premodern" (it is).
7. **Same harness, five models.** v1 on Haiku 4.5, Haiku 5.5, Sonnet 5.5, Opus 5.5 and Fable 5.1, blind-rated by the owner. Pass 1: bigger models finish (17-18 decks vs. 7-9), Haiku 5.5 is the value pick ($0.11), Fable builds the closest mana, and every model leans on the meta data in ways that hurt brews: "not in results" read as "doesn't exist," and brews pulled back toward existing decks (mono green storm built as Elves plus Hunting Pack).
8. **The ratings.** The owner blind-rated all 108 answers. When a list exists, every model scores about 4 and Haiku 4.5 ties Sonnet 5.5; on brews the spread grows to 2.4 points (Haiku 4.5 1.52, Opus 5.5 3.88). Opus 5.5 ranks first overall (3.85), and the most expensive model, Fable 5.1, ranks third at more than twice the cost.
9. **The new harness, judged head to head.** 36 blind pairs: a draw on quality (v1 8 wins, v2 6, 22 ties) but v2 did what was asked every time (100% vs. 92%) and handled impossible requests honestly. Better tools close the faithfulness gap; they don't close the quality gap.
10. **Where it goes next.** The new harness: card search decides what exists, data only informs mana, interaction and the meta, then the same five models again to separate what the model buys from what the harness buys.

Recurring theme for the post: the owner's pushback improved the work at nearly every turn (no bracket scraping, no new database, no Neon credentials, use our own data instead of re-scraping MTGO, every list instead of a sample, fix `main` instead of running an old build, compare models).

## Open decisions

- ~~Passes 2 and 3 of the v1 comparison~~: skipped in favor of building the new harness (owner agreed).
- Harness v2 across the five models: about $59 for one pass of 24 prompts (Fable ~$34 of it).
- A one-line PR so v1 logs the real error behind the four "An error occurred." builds.
- Adding the "distance from the nearest real deck" score and a "copy rate" score to the objective scorer.
- Lesson to apply: any prompt or claim that names a card gets checked against the card index before it is used.
- ~~Switch to pairwise~~: done; 36 pairs judged (v1 8 wins, v2 6, 22 ties; v2 100% faithful vs. 92%).
- ~~Tainted Pact round 2 ratings~~: owner couldn't recall; excluded and re-judged pairwise.

---

## 2026-10-14 · Step 8, stage 0: reading the request (intent)

The owner approved the plan; step 8 started with the intent stage.

**Built:** `src/pipeline/intent.ts` returns a typed reading of each request through the SDK's structured outputs (`messages.parse` with a zod schema): type (stock, tune, sideboard, brew, impossible), format, named archetype, named cards, color constraints, other hard constraints, whether a list was pasted, and a one-sentence goal. Feasibility is deliberately not decided here: named cards get checked against the card pool in code, so a confident model can't declare a legal card illegal (v1's "Storm is not legal in Premodern"). Hand labels for all 24 prompts live in `evals/intent/labels.ts`; `scripts/eval-intent.ts` grades type, format, named cards and colors.

**Iterations, in order:**
1. First run, Haiku 5.5: **request type right on 24 of 24** for under a cent. Misses were mostly the grader and one wording problem: pasted decklists counted as "named cards," and "Old School" didn't match the registry's "Old School 93/94."
2. Fixes: schema wording; format aliases (Old School, 93/94, EDH, Duel Commander, Penny Dreadful, Pauper EDH); a fairer grader ("exactly white" equals "exclude the other four"; only real cards count as named cards, since "Scam" is a deck, not a card); and three of Claude Code's labels corrected where the models read the prompt better (the Dimir Tempo sideboard is blue-black; "red aggro" may not mean mono red; "a red commander" could be Boros).
3. Two real gaps fixed in code rather than wording, because Haiku kept listing pasted cards even after the wording change: a deck named after a card must contain that card ("a Dream Halls deck"), and cards from a pasted list aren't cards the player named.
4. That rule backfired twice: "Burn" matched the split card Turn // Burn by its face name, and a "Psychatog" tune gained Psychatog as a requirement. Now only a full card name counts, and pasted lists decide their own cards. Tests cover all three cases (35 passing).

**Final, two runs each on 24 prompts:** Sonnet 5.5 perfect both times (96/96 checks); Haiku 5.5 perfect once, one named-card slip the other. **Decision: Sonnet 5.5 for the intent stage.** At about half a cent per request it is negligible next to a brew's 30-50 cents, and a wrong reading sends the whole request down the wrong path. Haiku's run-to-run variation (once calling "fun mono white control" a stock deck) is the kind of noise a router can't afford.

---

## 2026-10-14 · Step 8 scoped; goldfish simulator sized

Step 8 laid out for the owner: an **intent** stage first (request type, hard constraints, strictness; testable against labeled prompts), then a path per type (proven list on a cheap model; tune and sideboard with every change tied to a matchup; impossible: prove it with card search, then build the closest real version; brew: the full pipeline). The brew pipeline: game plan (meta summary only) → engine from card search only, decklist tools hidden → shell borrowed from the nearest real deck → mana set by code from the donor archetype's real numbers → verify (checker, novelty check, simulation) → critique that may not cut engine cards → sideboard → explanation that marks measured facts apart from inferences. Success: keep v2's 100% "did what was asked" and raise "would you play it" above 81%, judged pairwise against v2.

**The owner asked how heavy the goldfish simulator is.** Four levels: (0) exact draw math, already built; (1) Monte Carlo of shuffles, land drops, colored mana and mulligans, no card abilities, about a day; (2) a rough aggro clock that plays creatures and burn, several days and still rough, with per-card rules for cards like Rally at the Hornburg and custom logic per combo deck; (3) a full rules engine (Forge), weeks, a Java integration, and weak at combo by its own docs. **Decision: build level 1 inside step 8** (mana that works, engines that show up, mulligan and flood/screw rates, the likely failure of weak faithful brews); defer level 2 and handle speed claims with honesty rules ("likely one of the fastest, given its curve") until a real clock is needed; skip level 3.

---

## 2026-10-14 · Pairwise results: v2 is more faithful, not better

The owner judged all 36 head-to-head pairs (Opus v1 vs. Opus v2, Sonnet v1 vs. Sonnet v2, 18 prompts). Unblinded with `scripts/analyze-pairwise.ts`:

| | v1 | v2 (new harness) |
| --- | --- | --- |
| Pairs won | **8** | 6 |
| Ties | 22 | 22 |
| "Did it do what was asked?" | 92% | **100%** |
| "Would you play it?" | **83%** | 81% |

By prompt type (wins-ties-losses for v2; yes rates v1 vs. v2):

| Type | v2 record | Did what asked | Would play |
| --- | --- | --- | --- |
| A list exists (4) | 0-6-2 | 100% vs. 100% | 100% vs. 88% |
| Owner's list given (2) | 1-3-0 | 100% vs. 100% | 100% vs. 100% |
| Brew or twist (10) | 3-12-5 | 95% vs. 100% | 75% vs. 80% |
| Impossible as asked (2) | 2-1-1 | **50% vs. 100%** | 75% vs. 50% |

**v2 won:** Dream Halls without storm (both models), Legacy "turn 1 every game" (both), Opus on the Psychatog tune and on Living End plus Scam. **v1 won:** Replenish without blue (both; the faithful v2 decks were "would play: no" both times), Peter Parker's Camera (both), Vintage artifact aggro (both), Opus on mono green storm, Sonnet on Tainted Pact. Owner's notes: "This one is tough for them" (Tainted Pact).

**What it says:**
1. **Overall a draw.** 61% ties; the 14 decisive pairs split 8-6, well within chance. On many prompts both harnesses return essentially the same deck, because they read the same data.
2. **The new harness made the bot reliably do what was asked:** 100% vs. 92%, every request answered (plus the six formats v1 couldn't attempt), impossible requests handled honestly (100% vs. 50%).
3. **It did not make the decks better.** "Would play" is flat. A faithful brew is still often a weaker deck (Replenish without blue).
4. **It settles the drift question.** Round 2's raw 1-5 scores showed v2 slightly below v1, but rater drift made that unreadable. Pairwise picks can't drift between sessions, and they agree: v2 is not better on quality. So the dip was not only drift.
5. **Pairwise worked as a method:** 36 judgments, consistent, and the owner didn't struggle with a scale. It is the method from here on.

**Headline for part two of the post:** better tools and rules close the faithfulness gap and leave the quality gap open. Step 8 targets exactly that: an intent step (the owner's "read it semantically"), brews built around their engine with a borrowed shell so faithful brews are also playable, a goldfish simulator so speed and consistency are measured, and a novelty check in code. Then pairwise again: step 8 vs. v2.

---

## 2026-10-14 · "How does it know it's the fastest?"

Judging the Pauper red aggro pairs, the owner noticed both bots called Mono-Red Rally the fastest deck in Pauper and asked how they could know. **They can't:** no tool or dataset measures speed. MTGO results record finishes, not game length.

| Answer | Claim | What backs it |
| --- | --- | --- |
| v1 Opus | "the fastest red aggro deck in Pauper right now... You can win on turn 3 or 4" | meta share and trophies from tools; "fastest" and "turn 3 or 4" inferred from a curve of mostly 1-mana spells |
| v1 Sonnet | "the fast red deck in the Pauper field" | meta share; a description, not a ranking |
| v2 Opus | "currently Pauper's main fast red aggro deck... a big hasty attack around turn 2 or 3" | "main" backed by 3.5% share and 216 lists; the turn inferred |
| v2 Sonnet | no speed claim | "32 cards cost 1 and 11 cost 2," from the checker's curve |

**A gap in the harness:** the rule "every card fact must come from a tool" doesn't cover claims that aren't card facts, like speed, so the model fills them by reasoning and states them as fact. Rating guidance: unverified superlatives earn no credit; grounded or hedged claims win close pairs.

**Fixes for step 8:** (1) a prompt rule to separate measured facts from inferences and mark inferences; (2) a goldfish simulator (Fable's tier 2 check) that plays a deck against no opponent thousands of times and reports its average kill turn, so "fastest" becomes a number the bot can cite.

---

## 2026-10-14 · Owner's decisions; pairwise judging built

**The owner's answers to the three open questions:**
1. **Switch to pairwise:** yes.
2. **The round 2 Tainted Pact ratings (all 1s on answers that caught the illegal card):** "I can't recall." Both ratings are kept on record but excluded from analysis, marked with the reason; the pairwise round re-judges those answers.
3. **Faithfulness vs. playability:** "I think we probably need to know semantically from the user prompt." That is, read the request's intent and judge by it. This becomes the first stage of the step 8 pipeline: classify the request (proven list, tune, brew, impossible) and how strictly it must be followed, and let that decide how much the data may steer and what a good answer is. The classifier is testable on its own: label the 24 test prompts with their intended type and measure how often it agrees.

**Built: Brew Head-to-Head** (`scripts/build-pairwise-page.ts`, `evals/rating/pairwise-template.html`). For each prompt both runs answered, the two answers sit side by side with sides shuffled and no model or harness named. Per pair: "Did it do what was asked?" and "Would you play this deck, or something close?" for each answer, then "Which answer better serves this request? A, B, or tie," plus an optional one-line reason. The guide line tells the rater to judge each request by what it asks for (a stock list should be proven; a brew should actually be the brew), the owner's semantic-intent principle applied to rating. The key (which run is on which side) stays in the repo.

**First use: v1 vs. v2 re-judged pairwise**, 36 pairs: Opus v1 vs. Opus v2 and Sonnet v1 vs. Sonnet v2 on the 18 prompts both harnesses answered. v1 sits on the left in 19 pairs and v2 in 17. No new API spend. This gives part two of the post a drift-free comparison.

**The owner: "A lot of the good stuff is in the replies of the bot, should I read that?"** Yes, selectively: the reply is part of the product (plan, card reasons, sideboard plan, honesty about limits) and decides tuning, sideboard and impossible-request pairs; on stock requests the deck is the answer. The page now shows the opening of each reply by default (where answers put the plan and caveats) with the rest one click away, and the guide says when to expand.

**The owner asked what "Did it do what was asked?" means.** Defined as faithfulness, separate from strength: Yes when every explicit part of the request is honored (format, colors, named cards, the kind of answer: stock, brew, tune, sideboard only), or when an impossible part is explained and the closest real version built, or when small changes are explained; No when a constraint is quietly dropped, the answer is a different kind than asked (an existing deck with the requested card as a 2-of for a brew request), or it asks a question instead of building. "Would you play it?" judges the deck alone. The split exists so a faithful-but-weak brew and a strong-but-unfaithful stock deck show up as different things. One-line hints now sit under both questions on the page.

---

## 2026-10-14 · Reset: where we are and what's next

The owner asked to reset on status and next steps.

**Done:** setup (1), card knowledge (4), the deck checker (5), harness v2 (6, run on Opus and Sonnet), and the rubric baseline half of step 2 (v1 on five models, 108 answers rated; v2 on two models, 48 rated). Spend so far about $34.

**What we know:**
1. When a winning list exists, every model returns about the same deck and the model barely matters.
2. On brews, the model matters most (Haiku 4.5 1.52 vs. Opus 5.5 3.88 in v1).
3. Models default to the database: even asked for something new, decks averaged 69-87% one real list.
4. The new harness answers everything, including formats with no data, and copies a little less, but prompting alone doesn't break the habit.
5. Faithful brews rate below proven decks with the requested card added: playability and faithfulness pull apart.
6. Absolute 1-5 ratings drift between sessions (anchors: -0.67).

**Decisions waiting on the owner:** switch to pairwise eval; the Tainted Pact round 2 ratings; and what decklists.ai should reward when faithfulness and playability conflict.

**Recommended order:** (1) re-judge v1 vs. v2 pairwise with no new API spend, for a clean part two of the post; (2) build the step 8 brew pipeline, the biggest lever on what we learned; (3) the automated tests that need no rating (sideboard test, brew holdout test, which also calibrates how much a good brew borrows); (4) the Decklist Data API, site and launch.

---

## 2026-10-14 · Round 2 results, rater drift, and a better eval method

The owner rated 48 of the 54 round 2 answers (unrated: Penny Dreadful, the Psychatog tune, and the two Old School reruns), then said: "I think we need to come up with a different eval method next time, I am having a hard time really rating each metric on a 5 point scale."

**Raw comparison on the 18 prompts both harnesses answered:** Opus 5.5 3.85 (v1, round 1) vs. 3.66 (v2, round 2); Sonnet 5.5 3.71 vs. 3.50.

**The anchors say those columns aren't comparable.** The six v1 answers re-rated blind in round 2 scored **0.67 points lower on average** than the same answers in round 1 (mean absolute change 0.75): Opus's Replenish answer 4.75 to 3.50, its mono green storm 4.50 to 3.25. The owner's scale moved between sessions, normal for absolute 1-5 ratings. Without the anchors, the post would have reported "the new harness is worse" with no way to know it was partly drift. Including them was worth it.

**What holds anyway:**
- **Coverage:** v2 answered all 24 prompts; the six formats v1 couldn't attempt averaged 4.0 (Timeless, Historic, Penny Dreadful, Commander, Duel Commander).
- **v2 gained:** Legacy "turn 1 every game" +0.88, Dream Halls without storm +1.5, Golgari midrange +0.5, Peter Parker's Camera +0.38.
- **v2 lost on faithful brews:** mono green storm -1.38, Replenish without blue -1.50, Greasefang -1.00. Within round 2 itself (anchors vs. v2, same session), v1's storm and Replenish answers still outscored v2's.

**The tension, now in the owner's own ratings:** a faithful brew (v2's real mono green storm) is usually weaker than a proven deck with the requested card added (v1's Elves plus Hunting Pack), and the 1-5 scores rewarded playability over doing what was asked. Neither preference is wrong; the eval has to say which it measures.

**A ratings question raised with the owner:** both v2 Tainted Pact answers opened with "Tainted Pact isn't legal in Modern" and built the closest legal version (Opus: Inverter of Truth plus Thassa's Oracle; Sonnet: Spoils of the Vault plus Oracle and Laboratory Maniac). By the rule agreed in round 1 that is Legal 5, yet both were rated 1 on every row, the "no deck" pattern. Asked whether that was intended; the ratings are unchanged until the owner answers.

**Proposed eval method for the next round:**
1. **Pairwise, blind:** "Which answer is better for this request? A, B, or tie." Choosing between two side-by-side answers is easier and more consistent than placing each on a scale, and it doesn't drift between sessions. Results become win rates (and Elo ratings across many models).
2. **Two yes/no questions per answer:** "Did it do what was asked?" (faithfulness) and "Would you play this deck or something close to it?" (quality), so the storm-vs-Elves tension shows up as two numbers instead of one blurred score.
3. **Code scores everything objective:** legality, mana against the real archetype, copy rate, invented cards, cost, time.
4. **An AI judge for volume,** calibrated against the owner's pairwise picks, so the owner rates a sample.

About 10-15 seconds per prompt instead of four judgments per answer.

---

## 2026-10-14 · Old School decks with no lands: a card-data bug

Rating round 2, the owner: "the old school ones didn't add any lands lol." Both models had submitted Old School 93/94 decks with 4 Tolaria and no other lands.

**The cause was Claude Code's card index, not the models.** Scryfall sets Old School legality **per printing** (only 1993-94 printings count), and the index kept the single modern printing from Scryfall's Oracle file. So Island, Plains, Swords to Plowshares, Mishra's Factory and the dual lands all read "not legal" in Old School, leaving 325 legal cards. The step 4 gate never caught it because it only tested Premodern and Modern.

**The models handled bad data well.** Opus 5.5: the pool "looks like a data error, since no format bans basic lands," then it built the best deck the tools would accept and recommended the real list instead. Sonnet 5.5 listed every iconic card it had checked and flagged that it didn't expect its deck to play well. Both said so plainly rather than hiding it, which is the behavior the prompt asks for.

**Fix:** the index build now merges legality across every English printing (a card is legal in a format if any printing is; restricted and banned outrank legal). Regression test added: Island, Swords to Plowshares and Lightning Bolt legal in Old School, Black Lotus restricted, Brainstorm (printed after 1994) still out. 32 tests pass.

**Rerun** of the Old School prompt on both models with the fixed index ($0.51): both built "The Deck," the classic Old School UW control list, with power, dual lands and basics; Opus's with no warnings, Sonnet's 17 lands with a warning to add about 5. The two bugged answers stay in the answer key, marked excluded with the reason, and the owner's ratings of them (plan 1, mana 1) stay on record; they are hidden from the page and left out of the analysis. The two new answers were added to the round 2 page for rating.

**Lesson:** test every format the product claims to support. A gate that only checks the formats you have data for misses the ones you don't.

---

## 2026-10-14 · Harness v2 results (objective) and round 2 rating

Both runs finished: **48 of 48 prompts produced a legal deck** (24 per model), with no errors and no invented cards. The six prompts v1 could not attempt (Timeless, Historic, Old School, Penny Dreadful, Commander, Duel Commander) all got decks, including 99 cards plus Atraxa for the Commander prompt.

| Model | Harness | Decks | Mana warnings | Lands off real archetype | "Something new": avg copy rate | 80%+ copies | Cost | Median time |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Opus 5.5 | v1 | 17 of 18 | 0 | 0.84 | 87% | 9 of 12 | $4.05 | 33 s |
| Opus 5.5 | **v2** | **24 of 24** | 7 | **0.60** | **76%** | **6 of 14** | $9.49 | 93 s |
| Sonnet 5.5 | v1 | 18 of 18 | 1 | 0.89 | 78% | 8 of 13 | $3.22 | 41 s |
| Sonnet 5.5 | **v2** | **24 of 24** | 5 | 1.34 | **69%** | **5 of 14** | $5.54 | 66 s |

**Reading it:**
- **Every prompt now gets a deck,** including all six formats v1 couldn't attempt and every brew v1 refused or redirected.
- **Copying dropped but did not disappear.** On prompts asking for something new, copy rate fell 9-11 points and mostly-copied decks fell from 8-9 to 5-6. The prompt rules helped, which confirms the owner's observation that the models default to the database, and that prompting alone won't break the habit; the structural fixes are step 8.
- **More mana warnings** (0-1 to 5-7) are the expected price of borrowing less; Opus's land counts still sit closest to real archetypes (0.60 off).
- **Cost roughly doubled** ($9.49 vs. $4.05 for Opus) for 24 prompts instead of 18 and more research per prompt; time per prompt roughly doubled to tripled.
- Total for both runs: **$15.03**, under the ~$21 estimate.

**Round 2 blind scorecard published** (separate page and answer key, so round 1 is untouched): 24 prompts, 54 answers: the 48 v2 answers plus **6 anchors**, v1 answers the owner already rated in round 1 (Opus and Sonnet on mono green storm, Merfolk, and Replenish without blue), mixed in unmarked. Re-rating them measures whether the owner's scale drifted between sessions, which matters because the v1-vs-v2 comparison spans two sittings. The page now also shows the commander for Commander decks. Ratings store checked reachable and empty.

---

## 2026-10-14 · Is fetching a deck bad? (a framing for the post)

The owner, thinking aloud: "Is it bad that it does that? It seems like it's less difficult to build something that just fetches a deck from a database than can create one itself."

Where the discussion landed:
- **Fetching is right when the request is a lookup.** "Stock Goblins" or "what's winning in Pauper" are retrieval problems; a proven 5-0 list beats an invented one, and the ratings agree (every model about 4 on those prompts, Haiku 4.5 tied with Sonnet 5.5). Easy problems don't need big models.
- **Fetching is wrong when it drops the request.** A brew request answered with an existing deck plus the requested card as a 2-of is the 78-87% copy rate measured above.
- **Creating from scratch isn't the goal either.** Good human brewers take a proven shell (mana, removal, card flow) and swap in a new engine, which is Fable's donor-shell step. A good brew might be half to two-thirds borrowed. The real question is whether the new part is the part the player asked for.

**Implications:**
1. **Route by request type:** stock and tuning to retrieval on a cheap model; brews to generation on a capable model, where the ratings show the gap (Haiku 4.5 1.52 vs. Opus 5.5 3.88 on brews). Cheaper and better.
2. **Target a band, not zero, for brews:** the requested cards are core, the shell is borrowed. The band can be calibrated with the plan's brew holdout test: decks that started as brews and became archetypes, measured for how much existing-deck core they reused at birth.
3. **Two modes for players:** "proven list" and "brew me something," each judged by its own standard.
4. **The positioning:** Decklist Data already does retrieval. decklists.ai earns its place only if it brews while staying grounded, the gap Fable found no 60-card tool filling.

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
