# Build log

A running record of how decklists.ai gets built: decisions, findings, numbers, and course corrections. Newest first. Written to be mined for a public write-up later.

## How this log works

- Updated at every iteration (each run, fix, and change of direction), newest at the top.
- Each entry: what we did, what we decided and why, what we found (with numbers), and what changed our minds.
- Mistakes and dead ends stay in, including when the owner overruled Claude Code. They are the interesting part of the story.
- Corrections to earlier entries are added in place as notes, so the original claim stays visible.

## What we're building (Claude Code's answer, 2026-10-15)

The owner asked, mid-round 4: "What are we building, would you say? overall." The answer, kept because the owner found it interesting:

Three things, and the third is turning out to be the most interesting.

1. **The product: a brewer.** Ask for any deck in any format ("mono black City of Traitors in Premodern") and get a legal, playable 75 with a plan you could take to a League. That's decklists.ai, the visible part.
2. **The harness under it.** The day one rule was "the model proposes; data and code decide." So most of what got built is checking, not prompting: the card pool (what exists and is legal), the checker and mana model fit to 143k real lists, the goldfish simulator, and data that can be rewound to any date. Every claim the model makes is checked against something real.
3. **A way to measure deck-building skill.** This has become the core of the project. Rounds 1-3 kept giving the same result: better tools and more structure make the bot more reliable and more original, but not better. Faithfulness went to 100% and copy rate fell from 87% to 65%, yet "would you play it" didn't move. The owner's judgment caught that, but it can't scale. Round 4 grades against what real players actually did, with the future and near-copies hidden, plus no-AI baselines the bot has to beat.

**In one line:** a lab that tests whether a harness can give a model judgment it doesn't have. The answer so far: the harness buys reliability, not judgment, and judgment has to come from search plus a scorer grounded in real results. Round 4 is the first test that can show whether that's true.

**A side effect worth a paragraph:** building this keeps improving Decklist Data itself. On the day of this answer, 34k lists got their junk sideboard lines removed.

## Running totals (as of 2026-10-21)

| Item | Total |
| --- | --- |
| Anthropic API spend | v1 baseline $0.63; v1 comparison pass 1 $18.03 (Fable $9.90, Opus $4.05, Sonnet $3.22, Haiku 4.5 $0.75, Haiku 5.5 $0.11); harness v2 smoke test $0.02; harness v2 pass 1 $15.03 (Opus $9.49, Sonnet $5.54); Old School rerun $0.51; intent stage evals $0.25; pipeline smoke test $1.40; v3 full runs $27.08 and lock-bug reruns $4.71; round 4 smoke test $0.38 and runs $31.58; brew holdout first run $13.16 (discarded, bug) and corrected run $12.81; v4 $15.76; brainstorm diagnostics $9.53; v5 round $26.72; v6 $8.36; forward test $0.74; v7 round $22.79; expert round $14; v8 and v9 on four prompts $3.29; v10 on three $1.20; forward v10 brew $0.38; post-cutoff test $7.33; expert round 2 $9.92; v11 on three $1.37; v11 post-cutoff $2.86; would-you-play round $4.80; v12 on six $2.61; round 3 $1.90; v13 post-cutoff $2.85; v14 and future test $41.28; v15 round $25.87; v16 round $17.46; reviewer checks $0.78; v17 on eight $4.80. v17 future test $19.00; gem test $1.82; v18 on eight $4.92; blind panel round 1 $18.13; picker test $0.69; taste tests $3.06; judge with evidence and goldfish $2.18; Fable and Sonnet judges $4.30; text playtest $4.07. Total about $410.36. Plus one 17-token test call. |
| Real decklists analyzed | 30,102 (last 90 days, 8 formats); full history 145,131 (since 2025-07-01, merged weekly) |
| Cards indexed | 32,870, with 4,577 function tags and 697 alternate MTGO names |
| Automated tests | 57 passing |
| Decklist Data PRs merged | 5 (#181 export, #182 baseline eval, #183 baseline on `main`, #184 model comparison, #188 sideboard junk cleanup: 34,432 lists cleaned) |
| Plan steps done | 1, 4, 5, 6, 8; harness at v13 (15 versions tried); evals: owner's "would you play it?" plus the 18-deck future test |
| Current harness | **v13**: future test 48.3% / 47.9% (two runs), v2 44.9%; owner would play 12 of 17 of their prompts after one rebuild |

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
10. **Structure isn't skill.** The step 8 pipeline (intent routing, staged brews, simulator, novelty rules) made brews more original (copy rate 87% in v1, 76% in v2, 65% in v3) but, in 17 judged pairs, not better: on brews v2 was "would play" 86% vs. v3 50%. The pipeline knows how to brew, not what is good.
11. **Where it goes next.** A scorer built from real tournament results, validated against real records, so construction becomes search judged by data rather than guesses. The new harness: card search decides what exists, data only informs mana, interaction and the meta, then the same five models again to separate what the model buys from what the harness buys.

12. **Not ready to give up.** After four null results the owner pushed on, and a diagnosis replaced guessing: the AI doesn't build an unfinished version of the human's deck, it builds a *different* deck, dropping the requested cards into a familiar template. Giving it what's working in the format (v5) was the first change the owner preferred blind (6-0, then 8-4).
13. **What are we doing wrong?** A hard look at the method: the yardstick rewarded copying, the "humans 70%" baseline was partly circular, versions were built before diagnosing, noise was never measured, and the owner had stopped judging. Fixes: two runs per version, a future test on decks no model has seen, and the owner judging in formats they know cold.
14. **The owner's sentences became checks.** In Premodern and Legacy the owner explained each deck they wouldn't play in one line ("missing a way to win", "one Thran Dynamo", "Tribal Flames is bad here"). Each became a rule the model can't talk its way around: learn how real decks run the cards, say each card's job, name a win line that must be in the deck, build on the shell the data points to, count the enablers. "Neither" on the hardest combos went from 50% to 0%; 12 of 17 prompts reached a deck the owner would play.
15. **Specific beats generic, every time.** Over 15 harness versions, everything that helped was knowledge about *these* cards or *this* plan (v5, v8, v10-v12); everything generic hurt or did nothing (stages, an in-code coach, originality limits, example brews, format staples). On 14 decks that appeared after April, the best version matches 48% of what players settled on (v2: 45%); lands never moved (47% in every version) and the biggest remaining gap is the creative pick, the under-played card a human found.
16. **Generic tools, specific knowledge.** The owner's rule for what to build next: no fixes bespoke to an engine. A first such tool learns which *kinds* of cards real decks pair (by function, not name) and finds 41% of the human brewers' discoveries in a 300-card shortlist from 3,200, for free, before any brew uses it.

Recurring theme for the post: the owner's pushback improved the work at nearly every turn (no bracket scraping, no new database, no Neon credentials, use our own data instead of re-scraping MTGO, every list instead of a sample, fix `main` instead of running an old build, compare models, not ready to give up, judge decks I know intimately, an April cutoff for the future test, generic tools not bespoke fixes).

## Open decisions

- **Next build (proposed 2026-10-21):** v16 = v13 plus a synergy shortlist tool (the feature-synergy model narrows the card pool to the ~150 likeliest partners; the AI picks). Two runs on the future test, about $17.
- **Lands and colors:** flat at 47% land match in every version; wrong colors on about half the decks. Owner: "we can figure out lands later."
- **Owner's 60% target** on the future test: v13 is at 48%; spells 49%, lands 47%.
- **Weekly forward test** with the current base harness; every new constructed archetype joins the future test.
- **Card-level misses the checks can't catch** (Traumatize in draw-go, Vision Charm without Dreadnought): shown to the reader as hints, not enforced.
- ~~Round 4 (fresh evals)~~: done; v3 did not beat v2 on any track.
- ~~v4 (agreed 2026-10-15)~~: built and measured; no change. Superseded by the owner-diagnosis checks (v10-v12).
- **Research direction (agreed in principle):** after round 3, build scorer v0 from the data, validate it against real records and the owner's picks, then add search to the pipeline.
- ~~Passes 2 and 3 of the v1 comparison~~: skipped in favor of building the new harness (owner agreed).
- Harness v2 across the five models: about $59 for one pass of 24 prompts (Fable ~$34 of it).
- A one-line PR so v1 logs the real error behind the four "An error occurred." builds.
- Adding the "distance from the nearest real deck" score and a "copy rate" score to the objective scorer.
- Lesson to apply: any prompt or claim that names a card gets checked against the card index before it is used.
- ~~Switch to pairwise~~: done; 36 pairs judged (v1 8 wins, v2 6, 22 ties; v2 100% faithful vs. 92%).
- ~~Tainted Pact round 2 ratings~~: owner couldn't recall; excluded and re-judged pairwise.

---

## 2026-10-25 · "Is this adding token creep?" Cost per deck by version

Owner, on the proposed v19 (brew, playtest, fix): "is this adding token creep?" Measured from the saved runs (Opus 5.5, cost per deck):

| Version | $/deck | Output tokens/deck | What it added |
| --- | --- | --- | --- |
| v2 | $0.42-0.44 | 9.8k-12.0k | tools and checks |
| v13 | $0.41-0.45 | 9.9k-10.5k | 11 versions of checks, all in code |
| v17 | $0.53 | 13.4k-13.9k | a reviewer call and a revision (+25%) |
| v18 | $0.63 | 17.8k | role evidence for the reviewer (+45% over v2) |
| v19 as proposed, on v18 | about $0.90 | | playtest about $0.27 plus a fix stage |

**Reading:** no creep up to v13. Every gain from v2 to v13 came from checks written in code, which cost almost nothing per deck. The creep started with v17 and v18: extra model calls that cost 25-45% more per deck and didn't move any yardstick. Stacking the playtest on top of them would double the cost of a deck.

**Proposed rule:** a stage that costs tokens stays only if it moves a yardstick; otherwise it comes out. So v19 should be v13 + playtest + fix, with the v17/v18 reviewer removed (the playtest replaces it), and kept lean: one game instead of two, and only the top three problems passed back (which also limits the Enchantress-hate noise). The playtest runs as a separate call and hands back a short list, so the brewer's own context doesn't grow.

---

## 2026-10-24 · Text playtest: playing the deck finds most of the owner's complaints

Owner: "Yes, try the text playtest on the decks I flagged and see if it finds my complaints." `scripts/playtest.ts`: for 14 decks the owner had written a specific complaint about, the AI pilots the deck through 2 games against the format's most-played deck, then lists the problems it hit. Code shuffles and deals the hands and draws (no picking easy hands); the pilot never sees the note. A separate grader call compares each report with the note. About $4.07 (quoted $1.50: each game report ran longer than estimated; one run also stopped on deck 6 when a reply hit the length limit and was resumed, with nothing spent on the failed tries).

| Deck | Owner's complaint | Found? (grader) |
| --- | --- | --- |
| Wildfire (v12) | kills its own creatures; light on removal | **yes**: "the ramp dies to its own payoff: Birds and Wall of Roots are killed by Wildfire" |
| Bomberman (v12) | White Mage + Leonardo packages unnecessary | **yes**: "the lifegain package neither advances the combo nor stops Dimir's flyers" |
| Scapeshift (v11) | Sakura-Tribe Elder outclassed | **yes**: "too fragile against tempo" |
| Mind Over Matter (v12) | an all-in combo shouldn't carry counters | yes (Claude's read: partly; it faulted Mana Leak, not the counter suite) |
| Hypergenesis, Seismic (v11), Mind Over Matter (v11, v18), Rofellos, Mill, Seismic (v2) | various | partly |
| Kiki-Jiki (v11, v18), Scapeshift (v12) | Sneak Attack unneeded; STE | no (Claude's read: v18's report does say "Sneak Attack plus Pestermite is just a hasty 1/1, no Sneak/Show target", which is close to the owner's point) |

**Score: 4 yes, 7 partly, 3 no.** On the four decks the card-by-card reviewer was tested on earlier (it found 0 of 4), the playtest finds Bomberman and Wildfire outright and Mill partly.

**Also:** it found problems no note mentioned that look real. Chalice of the Void counters Bomberman's own looped artifacts; Cunning Wish with no sideboard; Mox Diamond with too few spare lands. One caution: in Premodern the most-played deck is Enchantress, so every Premodern report leans on "no enchantment answers," and acting on all of it could fill decks with hate cards.

**Reading:** this is the first tool that finds the owner's kind of problem: how the cards interact when the deck is played. It gives the brewer information a list can't. Next: v19 = v13 + playtest, then the brewer fixes or answers each problem, measured on the blind panel and the Tuning and Brewing tests.

---

## 2026-10-24 · A different model as judge: no better (Fable 44%, Sonnet 0%)

Is the judge just favoring its own model's brews (Opus judging Opus)? Same taste test (tuned real list vs v13 brew, no request, both orders), other judges. $4.30 (quoted $3; Fable ran longer than estimated).

| Judge | Picked the tuned real deck |
| --- | --- |
| Opus 5.5 | 18 of 34 (53%) |
| Fable 5.1 | 15 of 34 (44%) |
| Sonnet 5.5 | **0 of 34 (0%)** |

**Reading:** not self-preference. No current model prefers the decks players converged on; Sonnet prefers the AI brew every single time. So a different model is not the missing information either. What's left is information from play, which points to the text playtest (or Forge).

---

## 2026-10-24 · "I think you are giving up too easy. What are the problems the AI is having?"

Claude had called judgment "the wall" and proposed writing up. The owner pushed back. A concrete list instead, from the owner's 19 notes across all rounds and a free comparison of v13's brews with the real lists for the 17 future-test decks:

| Problem | Owner's notes | Examples |
| --- | --- | --- |
| **Misreads what a card is for** | 6 | Vision Charm (a Dreadnought enabler), Traumatize in draw-go, Tribal Flames (read Draco's domain cost as a domain theme), Mind Over Matter without the mana to use it, Rector without knowing what to fetch, 4 Craterhoof in Hypergenesis |
| **Adds things the plan doesn't need** | 6 | Sneak Attack in Kiki-Jiki (twice), Gamble in Seismic Assault, White Mage + Leonardo packages, 4 Enlightened Tutor, too many sacrifice outlets |
| **Misses what the plan needs** | 6 | Seismic with no extra-land enablers, Living End not inferred, Rector with no way to win, Wildfire light on removal, Scapeshift's curve (Grazer) |
| **Its own cards fight each other** | 1 | Wildfire kills its own creatures |
| **Dated picks** | 2 | Sakura-Tribe Elder (twice) |

**Deck shape, AI vs real** (average per deck; v13 two runs vs real lists a week+ after each deck appeared):

| | AI | Real |
| --- | --- | --- |
| One-of spells | **0.7** | **2.3** |
| Requested cards played as 4-ofs | 79% | 69% |
| Average mana value of spells | 2.3 | 2.6 |
| Lands | 20.0 | 20.1, but far off on some decks: Sneak Attack 16 vs 22, Metalcraft 18 vs 14, Riddlesmith 13 vs 10, Boros Aggro 17 vs 20 |

Plus two found today: each build is a roll (a third of the owner's verdicts flip between builds of the same version), and the AI can't judge its own work (54% on the owner's picks, 53% on real decks).

**What the first four have in common:** each shows up only when you think through how the deck plays, turn by turn: Wildfire resolving on your own board, Seismic Assault with no lands to throw, Mind Over Matter with nothing to untap for value, Sneak Attack when Kiki-Jiki is one mana away. The Haliya episode was the same: the second combo only showed when traced loop by loop. The brewer and the reviewer both look at cards one at a time, as a list. Nothing in the harness ever plays the deck. Forge would; a cheaper first step is to have the AI play out sample hands in text and report what went wrong, which gives it information a static list doesn't.

---

## 2026-10-24 · Raising the judge's taste: card evidence and goldfish stats both make it worse

Owner: "Yes, try both: card evidence and goldfish stats for the judge." Same setup as the taste-test yardstick (tuned real list vs v13 brew, no request, both orders, 17 decks). $2.18.

| Judge sees | Picked the tuned real deck |
| --- | --- |
| Decks and card text (baseline) | 18 of 34 (53%) |
| + how real decks used each card, up to the deck's first day | **4 of 34 (12%)** |
| + goldfish mana stats (mulligan, screw, flood, castable colors) | **10 of 34 (29%)** |

(The simulator measures mana only, not kill turn, so "goldfish stats" here means mana consistency.)

**Why both backfire:** they describe exactly what the brewer already optimizes. The brew was built from the same play data as of that day, so its cards look well played, while the tuned deck's discoveries look "near-unplayed" (the judge penalized 4 Tablets of Discovery in 4C Control on that ground). And the brew was built with the mana checker, so its goldfish numbers look cleaner. The tuned deck's edge is in what these measures can't see: cards found after the deck appeared, metagame calls, play experience. Giving the judge the brewer's own yardsticks makes it a stricter judge of resemblance, not a better judge of decks.

**The general lesson** (worth a paragraph in the write-up): an AI judge armed with the same data the AI builder used will prefer the builder's output. To judge better than the builder, it needs information the builder doesn't have.

---

## 2026-10-24 · Taste test: the AI judge can't tell real decks from its own brews

Owner, after the picker test, on "three takes" and Forge playtesting: **"No i dont like either of those options."** Claude offered three other directions; the owner took the taste test: an automatic %, like the future test, but for judgment.

**The test** (`scripts/taste-test.ts`): for each future-test deck, a real list against v13's brew for the same request. An Opus judge sees both main decks with card text, unlabeled, in both orders, and picks the one a strong player would rather take to a tournament. A judge with good taste should usually pick the real deck, especially the tuned list players converged on. Three variants, about $1 each:

| Real deck | Judge sees the request? | Picked the real deck |
| --- | --- | --- |
| Inventor's first list | yes | 10 of 36 (28%) |
| Tuned list (most typical list a week+ later) | yes | **3 of 34 (9%)** |
| Tuned list | no | 18 of 34 (53%) |

No position lean in any run (picked "A" 18-20 of 34-36).

**Reading:**
- With the request shown, the judge strongly prefers the AI's brews: they play every requested card as a 4-of with "tight" plans and clean mana, which reads as "does what was asked." Its reasons mark down the real decks' odd one-ofs (Mabel in Boros Dwarves "dilutes the plan"), and those are exactly the inventor's gems.
- Without the request, it's a coin flip: the AI judge can't tell a list that dozens of players adopted from its own brew.
- This matches the picker test (54% on the owner's picks) and explains why AI reviewers (v17, v18) didn't help: the judge in the loop has no reliable sense of what makes a real deck better.

**The new yardstick for judgment:** "picks the tuned real deck over the AI brew, no request shown," now **53%**. A strong player should be well above that. It's automatic, about $1 a run, and doesn't use the owner's notes. If a change raises it, that judge becomes worth putting back in the loop (reviewer, picker), and the owner's blind panel confirms. Caveat: 17 decks, one run each; the 9% and 28% are far from chance, the 53% needs a second run before small changes mean anything.

---

## 2026-10-24 · Picker test: the AI can't pick the deck the owner would play (54%)

Before spending $23 on "build three, keep the best," a cheap check (owner hesitated at the cost; Claude proposed testing the picker first): can the AI tell which of two decks the owner would play? 13 pairs where the owner already said yes to one deck and no to the other (10 from the blind panel's v2 vs v18 splits, 3 from v18's two builds). The picker saw the request and both decks with card text, never replies or notes, and each pair was asked in both orders. `scripts/picker-test.ts`, $0.69.

| | Result |
| --- | --- |
| Picked the owner's yes | **14 of 26 (54%)**; 50% = can't tell |
| Same answer in both orders | 11 of 13 pairs (it is confident, not random) |
| Of those 11, agreed with the owner | 6 |
| Picked deck "A" | 11 of 26 (no position lean) |

**Reading:** at the level of whole decks, the AI's taste doesn't match the owner's. It isn't guessing; it's consistently choosing differently. Its reasons show which way: it prefers "the established shell," "the proven way," "closer to a tuned list" (Rising Waters with mana creatures over the owner's yes with free spells and Dreadnought; the "established mono-red Wildfire shell" over the owner's yes with a Terravore angle; the Mill deck with Vision Charm, the card the owner had called out). The owner rewards fresh angles that work; the AI rewards resemblance to known decks.

**Decisions:**
- **"Build three, keep the best" with an AI picker is dropped:** the picker would choose at about chance. $23 saved.
- It also explains why reviewer versions (v17, v18) didn't move the owner's verdicts: a reviewer judging with this taste pulls decks toward familiar shells.
- Contrast with the gem test: card by card, the AI recognizes the inventor's picks 80% of the time. Judging whole decks is where it parts from a strong player. 13 pairs is a small sample; the direction is clear, the size isn't.

---

## 2026-10-24 · Blind panel round 1: v2 9 of 17, v18 11 of 17, and the rolls are noisier than the gap

The owner judged all 34 decks blind (two hidden versions, shuffled, decks only). Answers: `evals/results/round4/play-panel-1-answers.json`.

| | v2 (first real harness) | v18 (now) |
| --- | --- | --- |
| Would play | **9 of 17 (53%)** | **11 of 17 (65%)** |
| Premodern (11) | 4 | 8 |
| Legacy (6) | 5 | 3 |

Where they differ: v18 alone got yes on 6 prompts (Mind Over Matter, Phyrexian Processor, Rising Waters, Rofellos, Squandered Balance, Wildfire), v2 alone on 4 (Bomberman, Seismic Assault, Shapeshifter Phage, Mill). Both no on Scapeshift and Nether Spirit.

**The catch: one fresh build is a noisy roll.** The same version on the same prompt doesn't get the same verdict. v18's earlier builds of 8 of these prompts and this round's builds agree on only 5 of 8: Mill and Nether Spirit went yes → no, and Wildfire went no → yes. With about a third of verdicts flipping between rolls, 11 vs 9 (6 prompts to 4) is within noise; this round can't say v18 is better than v2. (The earlier rebuild was judged as "better than last time" and this one blind, which may also move a verdict.)

**What this changes:**
- The "five prompts now reliably yes" claim from the v18 rejudge doesn't hold: two of the five went to no on the next roll. Corrected here, the earlier entry left as written.
- Part of the progress the owner saw since v11 likely came from rebuilding failed decks (best of several rolls), not from a better harness. v2 blind at 9 of 17 equals v11/v12's first-pass score (9 of 17).
- For the panel to separate two versions, each needs **two builds per prompt** (34 decks per version), or the difference has to be large.
- It also points at a product fix: if rolls vary this much, **build several decks and keep the best** would raise what a user gets. The gem test showed the AI judges cards well when it compares them; it may judge whole decks well too.

Owner's notes this round: Kiki-Jiki (v18, yes) "I don't think you really need Sneak Attack here, but it is servicable"; Mind Over Matter (v18, yes) "just barely uses mind over matter, more of a dream halls deck though"; Seismic Assault (v2, yes) "Gamble probably has no business being here". Recorded in `evals/owner-notes/` as a record only.

---

## 2026-10-24 · A yardstick that can show progress: the blind panel

Owner: **"We need to find the right yard stick though, to be able to show that we are making progress."** The automatic tests don't show what improved since v13: decks the owner would play every time, including good brews that differ from what players built (v18 Scapeshift: "a really cool brew"), which the Tuning and Brewing tests count as misses. And "better than last time" can't give one number per version: it isn't blind, and only failed decks were rebuilt.

**The yardstick, agreed:**
1. **Frozen panel:** the owner's 17 prompts (12 from expert round 2, 5 from round 3). Never changed.
2. **Every version builds every prompt fresh**, not only the failures.
3. **Blind:** decks from different versions shuffled together, no labels, **decks only** (the reply text gives the version away: v17+ replies end with an "After review" section). Plain yes/no.
4. **Numbers:** % of the 17 the owner would play, per version; later, % where two fresh builds are both yes (reliability).
5. Tuning and Brewing tests stay as guard rails. This round also shows how far they undersell the owner's view.

**Round 1: v2 (the first real harness) vs v18, $18.13** (v2 $7.39, v18 $10.74), 34 decks, all exactly 60. Page: https://claude.ai/artifact/MH9Hx8Xynp9LVX548RuGi5 (answers in its `decks` collection; key `evals/results/round4/play-panel-1-key.json`). `scripts/build-play-page.ts` now takes several `--run` files, `--shuffle` and `--deck-only`.

---

## 2026-10-24 · Owner judged v18: 5 yes, 2 closer, 1 further. "its honestly getting better i think?"

| Deck | v17 | v18 | Owner's note on v18 |
| --- | --- | --- | --- |
| Rising Waters | yes | yes | |
| Mind Over Matter | yes | yes | |
| Mill | yes | yes | |
| Nether Spirit | yes | yes | |
| Zur's Weirding | yes | yes | |
| Scapeshift | closer | closer | "interesting the direction it went, its not strong but it is a really cool brew" |
| Bomberman | closer | closer | |
| Wildfire | yes | **further** | |

**Reading:** v18 judged about the same as v17 (5 yes vs 6), one step back on Wildfire, so the missing-card check doesn't show a gain here. The bigger news is consistency: five prompts got a "yes" from two independent fresh builds (v17 and v18). Those decks are now reliably good, not a lucky roll, which answers the caveat on the v17 entry for those five.

**Is it getting better?** On the owner's judgment, yes, compared with the start: "neither" on the hardest combos went from 50% to 0%, and most prompts now get a playable deck every time. On the Brewing Test, v13 beats v2 by 3.6 points; nothing since has moved it further. So: real progress up to v13, and reliability since, but no new gain in brewing skill after v13.

---

## 2026-10-22 · v18 on the eight repeat prompts: ready for the owner to judge

Same eight prompts as v17, fresh builds, $4.92. Judging page (yes / no but closer / no, further away, compared with the deck judged last time): https://claude.ai/artifact/2vQczfXUVe2jGXQPdzuruW (answers in its `decks` collection; key `evals/results/round4/play-rejudge-v18-key.json`).

**What the reviewer changed** (the brewer accepts or argues each flag):

| Deck | Flags | Change after review |
| --- | --- | --- |
| Rising Waters | Counterspell (wrong role) | 4 Counterspell → 2 Foil, 2 Thwart |
| Mind Over Matter | **missing:** a second Kamahl, Pit Fighter | +1 Kamahl, -1 Mana Leak |
| Bomberman | Agatha's Soul Cauldron (needs a partner) | -3 Cauldron, +1 LED, +2 Enlightened Tutor |
| Scapeshift | none | none |
| Wildfire | Rishadan Port (wrong role) | 3 Port → 2 Mountain, 1 Forest |
| Zur's Weirding | Sylvan Library; **missing:** Naturalize | -3 Library, +2 Naturalize, +1 Words of Worship |
| Mill | **missing:** Powder Keg | +2 Keg, -2 Mana Leak |
| Nether Spirit | Pernicious Deed, Chromatic Sphere, Llanowar Wastes | goes mono-black: +3 Diabolic Edict, +2 Phyrexian Arena, +1 Smother |

**Scapeshift, the case v18 was built for, didn't test it:** this fresh build already played 4 Utopia Sprawl (one-mana ramp) and only 6 two-mana land-ramp cards, so the role evidence showed nothing out of line and the reviewer raised no flags. The fix can't be judged on this deck from one roll. 3 of the 8 reviews used the new "missing card" flag; whether those additions help is for the owner to say.

---

## 2026-10-22 · v18 built: the reviewer can now see what's missing (not run yet)

Owner, on the v17 Scapeshift deck: it "should run Arboreal Grazer because there are too many 2-drop ramp cards. The reviewer only checks cards already in the deck and never finds missing ones." Asked for a generic fix, not a Grazer rule.

**The gap:** v17's reviewer gets evidence only about cards in the deck, so it can flag a bad card but never a missing one. And Legacy has only one Scapeshift list in the data, so "what do real Scapeshift decks play" has no answer.

**v18 = v17 plus role evidence** (`roleEvidence` in `src/harness/review.ts`). For each role the deck leans on (a Scryfall function tag on 4+ copies), it finds real decks from the last year that lean on the same role (same format if 10+ do, else any format) and shows the reviewer:
- the deck's copies of that role by mana value next to the real decks' median;
- cards with that role in 20%+ of those decks that this deck lacks (legal here).

Only roles that look different from real decks are shown (3+ copies apart at some mana value, or a card most of them run). Trivia tags (meme, type-errata) are dropped by keeping only tags that sit under a broader one in Scryfall's tree. The reviewer gets one new kind of flag, "missing card or role imbalance" (name the card to add and what it replaces), and is told to use the comparison only when it fits the deck's plan. Nothing in it names a card. The owner's notes are not used.

**Free check on the eight v17 decks** (evidence only, no model calls):

| Deck | What the evidence shows |
| --- | --- |
| Scapeshift | land-ramp: this deck 14 copies at 2 mana, 0 at 1 mana; 495 real decks (any format) leaning on land-ramp: median 2 at 2 mana. Common cards it lacks include Arboreal Grazer (24%). Real Legacy decks putting lands into play: median 7 at 1 mana (Elvish Reclaimer, Crop Rotation). |
| Mill | mill: this deck 7 at 2 mana; 21 real Premodern mill decks: median 4 at 1 mana, Vision Charm in 100% |
| Nether Spirit | discard matches real decks (8 at 1 mana, 3 at 2); Ravenous Rats (55%) and Hypnotic Specter (49%) missing |
| Bomberman, Wildfire, Zur's Weirding | mostly matches; a few side suggestions (Armageddon, Devastating Dreams) |

**Expectation, stated before running:** it should surface the Scapeshift curve problem; whether the reviewer acts on it, and whether it adds noise elsewhere, is what a run shows.

---

## 2026-10-22 · Gem test: the AI does recognize gems when shown them

The question: when the AI sees the inventor's under-played picks side by side with look-alikes (just as under-played, legal, in the right colors, ranked highly by the synergy tool, but not played by the real deck), can it tell which is which? 14 decks, 30 cards each, one rating call per deck, two runs, $1.82.

| | Run 1 | Run 2 |
| --- | --- | --- |
| Gem rated above a look-alike (50% = can't tell) | **81%** | **77%** |
| Mean rating, gems vs look-alikes (1-5) | 3.3 vs 2.2 | 3.2 vs 2.2 |
| Gems rated 4+ and in the top-5 tier | 25 of 57 | 25 of 57 |

Clearest: Premodern Rector Combo (Pernicious Deed, Krosan Tusker, Innocent Blood: 100% / 85%), Standard 4C Control (96% both). Weakest: Gearhulk (70% / 47%) and Pioneer Boros Aggro (one gem, 66% / 53%).

**Reading:** recognition is not the main gap. Asked directly, the AI picks the real gems over strong look-alikes about 4 times in 5. But it rates them "likely" (3-4), rarely "clearly belongs" (5), and brews include only about 18 of 52. Two things lose them: they never come up while the AI builds (search), and when they do, a safe, well-known card wins the slot (confidence). v16 showed the gems inside a 150-card list and the brewer still skipped them; rating each card one by one is what made the difference here.

**Idea this suggests (generic, not built):** before building, take the synergy tool's top ~100 under-played candidates, have a separate call rate each one (as here, about $0.10-0.30 a deck), and pass only the 4+ rated cards to the brewer as "strong candidates for this plan." The open risk: the gem must be in the shortlist first (the synergy tool's top 300 holds about 41% of them).

---

## 2026-10-22 · v17 on both tests: no gain over v13

Two runs on the future test, $19.00 ($9.49 + $9.51).

| Version | Tuning (17 decks) | Brewing (13 decks) | Brew spells | Gems (of 52) |
| --- | --- | --- | --- | --- |
| v2 | 45.9% | 50.3% | 49.6% | 16 |
| **v13** (2 runs) | 47.4 / 49.2% (avg 48.3) | **54.2 / 53.5% (avg 53.9)** | 54.3 / 54.3% | 19 / 17 |
| v17 (2 runs) | 48.3 / 45.9% (avg 47.1) | 51.6 / 50.4% (avg 51.0) | 53.1 / 50.0% | 17 / 18 |

**Reading:** v17 doesn't beat v13 on either test; Brewing is about 3 points lower in both runs. So the owner's 6 yes / 2 closer on repeat prompts isn't confirmed here: either the reviewer helps on the owner's Premodern and Legacy combo prompts but not on these mostly Standard and Pioneer decks, or the 6 yes were partly a luckier roll. The reviewer pulls decks away from what real players built, which these tests count as a loss even when the change is defensible. **v13 stays the base.** Gem test: see the entry above.

---

## 2026-10-22 · In progress: v17 on both tests, and a gem test

Owner, on the stall since v13 ("I dont like that we are getting worse"): the base didn't get worse (v14-v16 were tried and not kept), but three tries in a row didn't beat it, and gems never moved. All three gave the brewer more to read; v17 instead reviews the finished deck. Owner agreed to run it.

- **v17, two runs on the future test** (about $22), started; logs in `evals/results/round4/logs/future-v17-r*.log`. To score: `scripts/score-tests.ts` on `future-v17-claude-opus-5-5.json` and `-r2.json`.
- **Gem test** (`scripts/gem-test.ts`, about $3 for two runs), started. Owner asked whether showing the AI a pile of cards is really cheap; yes: one call per deck rating 30 cards costs about $0.10, against about $0.60 for a brew. For 14 decks it mixes the inventor's gems with look-alikes that are just as under-played, legal, in the right colors and ranked highly by the synergy tool. Score: how often a gem is rated above a look-alike (50% = can't tell). High means the AI recognizes gems and the problem is search; about 50% means it's a judgment gap that more tools won't fix. Results in `evals/results/round4/gem-test*.json`.

---

## 2026-10-22 · Correction: v2 isn't the better brewer; one-list decks were hiding v13's gain

Owner, on the table below: **"So v2 brewing is just better??? we didnt get any better at all."** The table did suggest v2 at least tied v13 on brewing. The cause: 4 of the 17 decks (Jund Sacrifice, Persist, Riddlesmith Combo, Sneak Attack) have a single first-week list, so their Brewing score is one player's choices, and v2 happened to land close to two of them (Jund Sacrifice 50% vs v13's 18%; Sneak Attack 55% vs 38 / 42%). **Fix:** the Brewing Test now uses only decks with 2+ first-week lists (13 decks). The Tuning Test keeps all 17.

| Version | Tuning (17 decks) | Brewing (13 decks) | Brew spells | Gems (of 52) |
| --- | --- | --- | --- | --- |
| v2 | 45.9% | 50.3% | 49.6% | 16 |
| **v13** (2 runs) | 47.4 / 49.2% | **54.2 / 53.5%** | **54.3 / 54.3%** | 19 / 17 |
| v14 | 47.5% | 50.8% | 50.4% | 15 |
| v15 (2 runs) | 46.2 / 47.7% | 47.8 / 51.1% | 50.4 / 51.1% | 17 / 15 |
| v16 (2 runs) | 47.3 / 48.3% | 49.9 / 51.7% | 49.0 / 50.6% | 13 / 15 |

**Corrected reading:** v13 is the better brewer: +3.6 points on Brewing and +4.7 on brew spells over v2, in both runs, larger than its Tuning gain (+2.4). v14-v16 each gave part of it back, which fits their verdicts (not kept). Gems are still flat (16 vs 18 of 52): the creative pick is still the gap. The section below is kept as first written; its Brewing column and first reading bullet are superseded by this one.

---

## 2026-10-22 · Two yardsticks: a Tuning Test and a Brewing Test

Before spending on v17, the owner stopped to ask: "We need a consistent yard stick to measure success against, what is it? how do we know we are improving." Claude's first answer was the owner's play rate on a frozen panel as the main number and the future test as a guard rail. It also admitted that "15 of 17 playable" overstates progress, because it counts the best of several tries and only failed decks were rebuilt. The owner wanted a % to watch go up, "something like the future test", then asked: **"isn't it more like a tuning test?"**

Yes. The future test hands the AI the deck's key cards and scores it against the lists players settled on after a week or more of tuning by the crowd. That measures predicting the tuned deck, not brewing it. Owner: **"lets have a specific Tuning Test and a Brewing Test."** Owner, while it was being built: "give the AI a prompt to a deck with a cut off a week before the actual new deck shows up?" That is already how every future-test brew runs (data and card pool cut at the day the deck first appeared); only the scoring changes.

**The two tests** (`scripts/score-tests.ts`, same brews, no model calls):
- **Tuning Test:** mean overlap with the lists from a week after the deck appeared onward (the old future test score).
- **Brewing Test:** mean overlap with the deck's **first week** of lists (the inventor's version, before the crowd tuned it), plus **gems**: nonland cards in 80%+ of those first lists that had under 5% play in the format in the 90 days before, not counting the requested cards.

**Free rescore of every past future-test run** (17 decks with both first and later lists; the old future test scored 14, and each overlap is now taken as a share of the real list's size, so the Tuning numbers differ slightly from the 48.3 / 47.9 logged before):

| Version | Tuning Test | Brewing Test | Brew spells | Gems (of 85) |
| --- | --- | --- | --- | --- |
| v2 | 45.9% | 49.0% | 47.7% | 20 |
| v13 (2 runs) | 47.4 / 49.2% | 49.8 / 49.4% | 51.1 / 50.7% | 22 / 21 |
| v14 | 47.5% | 48.1% | 48.7% | 19 |
| v15 (2 runs) | 46.2 / 47.7% | 48.0 / 47.8% | 49.8 / 49.3% | 19 / 20 |
| v16 (2 runs) | 47.3 / 48.3% | 47.4 / 49.2% | 47.3 / 49.4% | 17 / 19 |

**Reading:**
- From v2 to v13, Tuning rose about 2.4 points; Brewing rose about 0.6, and brew spells about 3. The harness work mostly made the AI better at predicting the tuned deck, not at building what the inventor built. That matches the project's running theme: the harness buys reliability, not judgment.
- Gems are the clearest brewing signal and barely move: 20 for v2, about 21.5 for v13, fewer for every version since. No version finds more than a quarter of the inventor's own picks.
- The Brewing Test is noisy: 5 of the 17 decks have only one first-week list (Jund Sacrifice swings from 18% to 50% on one list). It needs more decks before small differences mean anything.

**Decision:** every version now gets both numbers (two runs each). Tuning shows whether the deck comes out right; Brewing and gems show whether the AI finds the ideas. v17 is the next row.

---

## 2026-10-22 · v17 (card-by-card reviewer) on eight prompts judged before: 6 yes, 2 closer, 0 worse

Same prompts as earlier rounds, so the owner could judge "better or worse than last time" (owner: "should we not be using the same prompts to see improvement?"). v17 = v13 plus a reviewer that sees per-card evidence from real decks (no owner notes) and makes the brewer fix or explain each flag. $4.80. The judging page now splits the main deck into creatures, spells and lands (owner's request).

| Deck | Last verdict | v17 | Owner's note |
| --- | --- | --- | --- |
| Mill | no | **yes** | "About as close as it gets for mill in Premodern" |
| Wildfire | no | **yes** | |
| Mind Over Matter | closer | **yes** | |
| Scapeshift | closer | closer | "I wonder why this deck isn't playing Arboreal Grazer"; in chat: "it probably should include it, too many 2 drop ramps in that deck" |
| Bomberman | closer | closer | (the Haliya + White Mage second combo; owner: wrong way to go for Bomberman) |
| Rising Waters | yes | yes | |
| Nether Spirit | yes | yes | "Close enough! Typically the decks want Contamination but I like the brew" |
| Zur's Weirding | yes | yes | |

**Would play, across all 17 of the owner's prompts (best version each): 15 of 17**, up from 12. None of the previously approved decks got worse.

**Caveat:** each rebuild is a fresh attempt, so part of this may be a luckier roll rather than the reviewer (Vision Charm, for instance, disappeared in the fresh build, not by a review flag). The check: v17 twice on the 18-deck future test against v13's 48.3 / 47.9. If it holds, v17 becomes the base.

---

## 2026-10-22 · "Why Haliya?" A combo only visible when you trace it

Owner, reviewing the v17 Bomberman (Auriok Salvagers) deck: "can you find out from the AI who wrote the list why they chose Haliya? Maybe I am missing something."

**The brewer's own reason:** with Agatha's Soul Cauldron, creatures with +1/+1 counters gain Salvagers' ability, and "Haliya, Guided by Light and The Destined White Mage add more [counters]."

**Checked against card text:** Haliya adds no counters by itself (it gains 1 life whenever a creature or artifact enters); White Mage turns life gain into counters. And Cauldron already puts a counter on a creature when it exiles one, so the package isn't needed for the Cauldron line. Claude called it redundant.

**Owner: "I see it's a second combo."** Right: each Lion's Eye Diamond loop makes an artifact enter, Haliya gains a life, White Mage adds a counter, so infinite LED loops give infinite life and an arbitrarily large creature: a second way to win if Walking Ballista and Pyrite Spellbomb are answered. Claude corrected itself. The brewer had the right idea and described the wrong reason.

**Owner's judgment:** "probably still the wrong way to go for a Bomberman build" (seven slots of a lifegain package in a deck built to be lean).

**Lesson for the post:** both the reviewer and Claude judged the cards one at a time and missed the value; it only shows when you trace the combo loop by loop. And whether a valid second line is worth seven slots is a player's call, not a fact a check can verify.

---

## 2026-10-21 · A reviewer for card-level mistakes, and why it won't read the owner's notes

Owner: "Let's fix card-level mistakes and unneeded packages, then run some brews to see if I would play them." Generic approach: **v17** = v13, then a reviewer (a fresh call that didn't build the deck) sees every nonland card with evidence from real decks (play share, which decks it lives in, what it's usually played beside, from `src/harness/review.ts`) and flags cards in the wrong role for the plan, cards missing their usual partner, unneeded packages, and outclassed choices; the brewer fixes each flag or says why the card stays, once.

**Cheap checks first ($0.78), on four decks the owner had criticized:**

| Deck | Owner's complaint | Reviewer, evidence only | Reviewer + owner's notes on other decks |
| --- | --- | --- | --- |
| Bomberman | Destined White Mage + Leonardo packages | Missed (flagged Haliya, Chalice) | **Caught both** |
| Wildfire | Kills its own creatures | Missed (flagged Fellwar Stone) | **Caught** (Wildfire kills Birds) |
| Mill | 3 Vision Charm, Traumatize | Missed (flagged Mishra's Factory) | Missed |
| Scapeshift | Sakura-Tribe Elder | Missed (flagged Loam, Crop Rotation) | Missed |

With the owner's 15 past notes as examples (the note on the same request always hidden), the reviewer went from 0 of 4 to 2 of 4. On four decks the owner approved, it raised 0-4 flags each, some plausible (Pernicious Deed's green under Contamination; four copies of a legendary Serra's Sanctum).

**Owner: "The reviewer shouldn't read my notes, that's just going to plug gaps, yes?"** Yes, for two reasons: it tailors the system to one person's verdicts on specific situations, and it would make the owner's future judging circular (grading a system trained on their own grades), the same trap as tuning on the test. **Decision: the reviewer uses only general per-card evidence.** The notes stay in `evals/owner-notes/` as a record of verdicts, never as input. v17 as built never passed them; only the side test did.

**Expectation, stated before the test:** the evidence-only reviewer caught none of the owner's four complaints but did catch other likely problems. Whether it makes decks the owner would play is what the next batch, judged blind, will show.

---

## 2026-10-21 · v16 (synergy shortlist): no help; the AI doesn't pick the gems even when they're on the list

v16 = v13 plus `synergy_candidates`: before planning, the brewer sees up to 150 cards in its colors that the feature-synergy model ranks as the best partners for the requested cards (trained only on data before each deck's date). Nothing forced. Two runs on the future test ($16.89).

| Future test, 14 decks | Overall | Spells | Hidden gems found (of 41) |
| --- | --- | --- | --- |
| v2 | 44.9% | 44% | 10 |
| v13 | 48.3% / 47.9% | 49% / 49% | 13 / 13 |
| v16 | 47.3% / 45.9% | 47% / 46% | 12 / 11 |

"Hidden gems" = the real deck's core cards (in 80%+ of its lists) that had under 5% play in the format before it appeared, excluding the signature cards.

**Reading:** no gain, slightly worse. The shortlist reached the brewer (it called the tool), and for Boros Dwarves the list contained Dragonfire Blade (#14) and Leyline Axe (#98), but the brew took neither. Two possible reasons, not yet separated: the gems were mixed in with many plausible but wrong partners, so the list didn't stand out; or the model doesn't value under-played cards even when shown them. Either way, giving the AI a better candidate list is not enough by itself, so a stronger ranker (the neural network idea) would not fix this. v13 stays the base.

---

## 2026-10-21 · Summary of the session (Oct 19-21): what we learned

**Progress, version by version** (future test = 14 constructed decks first seen since April 2026, card overlap with what players actually ended up playing; owner = blind judging):

| Version | What it added | Owner's verdict | Objective | Kept |
| --- | --- | --- | --- | --- |
| v2 | Card search, checker, data tools | Tied v1 on quality; faithful 100% vs 92% | Future 44.9% | Base |
| v3, v4 | Staged pipeline; coach in code | Lost to v2 / not judged | No gain | No |
| v5 | What's working in the format | Beat v2 and v6 6-0; expert round 8-4 | Holdout 42.7%, post-cutoff 45.2% | Yes |
| v6, v7 | Copy limit; example brews | v6 lost to v5 3-0 | No gain | No |
| v8, v9 | How real decks run the cards; each card's job | Fixed Living End, Draco | | Yes |
| v10 | Win line checked in the deck | Fixed Rector; "Neither" 50% → 0% on the hardest | | Yes |
| v11 | Exactly 60; dominant shell | Pande-Burst solved; 6/12 would play | Post-cutoff 46.8% | Yes |
| v12 | Enablers in quantity; card notes | 6 no's → 3 yes, 3 closer; fresh prompts 3/5 | | Yes |
| **v13** | Card notes fixed; partner hints | | **Future 48.3% / 47.9%** | **Base** |
| v14, v15 | Mana-base tool; format staples, 4-ofs | | 47.3%; 44.8% / 46.9% | No |

**Five findings, with the data in the entries below:**
1. **Specific knowledge helps; generic advice doesn't.** Every gain came from knowledge about the requested cards or the deck's plan, or from a check aimed at one of the owner's diagnoses. Every generic addition (structure, originality limits, examples, format staples) did nothing or pushed the deck's own cards out.
2. **The owner's one-line diagnoses are the engine.** The loop "owner says what's wrong, Claude turns it into a check the model can't argue with, owner judges blind" fixed 5 of 6 "neither" decks in a day for about $13.
3. **All the gains are in spells; lands are flat** (47% in every version). Wrong colors on about half the decks; with the right colors, 58% land match.
4. **The remaining spell gap is the creative pick.** Of v13's 51 missing spell points: the deck's own under-played discoveries 16-17, common flex cards 13, format staples 8-9 (and "most played in your colors" doesn't recover them: v15), rare choices 6, new cards 3, copies 2-3.
5. **Measurement now works.** The future test widened to an April cutoff (14 scoreable decks, 5 never tuned on, where v13's gain is larger); two runs per version agree within half a point. Earlier mistakes (circular baseline, tuning on the test, no noise estimate) are corrected in place.

**State:** v13 is the base. The owner wants a generic tool that grants specific knowledge rather than engine-specific fixes; the feature-synergy model is the first candidate (41% of discoveries in a 300-card shortlist, free test), proposed as v16. Session spend about $142 (Oct 19-21); project total about $329.

---

## 2026-10-21 · A generic tool that grants specific knowledge: feature synergy, tested for free

Owner: "We need to create a tool or structure that is generic but grants specific knowledge. I don't want to plug gaps about specific engines that are bespoke to specific cards." The tools that worked (v5's menu, v8's played_with) were exactly that, generic code returning specific facts, but both only know cards people already play together, and the missing "discoveries" (16 of the 51 missing spell points) are by definition cards almost nobody plays.

**The idea:** learn at the level of what cards *do*, not which cards they are. `src/synergy/feature-synergy.ts` describes every card by about 1,900 features (Scryfall function tags with their parents, keywords, types, creature types; only features on 15+ cards and at most 5% of all cards) and learns from 37k decklists which features real decks pair (positive pointwise mutual information between features present in the same deck). Any card, played or not, can then be scored against the requested cards. Trains in 3 seconds.

**Free test** (`scripts/synergy-eval.ts`, no API calls): train only on lists before 2026-04-01; for each future-test deck, rank the format's card pool on its first day by synergy with its signature cards, and see where the real deck's discoveries (core cards with under 5% format share beforehand) land. Baseline: rank by plain feature overlap ("similar cards").

| Discoveries found | All colors (pool ~10k) | Deck's colors (pool ~3.2k) |
| --- | --- | --- |
| Top 25 | 1/41 | 2/34 |
| Top 100 | 3/41 | 4/34 |
| Top 300 | 7/41 | **14/34 (41%)** |
| Median rank | 1,048 (baseline 2,587) | **464** (baseline 1,236) |

Hits: Mockingbird #10, Dragonfire Blade #29, Ornithopter #56. Misses: Pernicious Deed, Inside Out. 7 of 41 discoveries are outside the signature cards' colors, which a color filter can never find.

**Reading:** the signal is real and generic (5x random, 2.5x "similar cards"), but it is a coarse filter, not a picker. **Proposed v16:** the tool narrows the pool to the ~150 most likely partners with a line of text each; the AI, which reads mechanisms well (v9 found Living End unprompted), picks from the shortlist. No forced notes, so it can't push generic cards in the way v15 did.

---

## 2026-10-21 · v15 (format staples, 4-ofs): worse, and why

Owner: "How do we get 60% on spells?" Breakdown of v13's missing spell points on the future test (51 of 100): core cards of the real deck absent 28 (format staples 8, the deck's own discoveries 16, brand-new cards 3), core present with too few copies 3, common flex cards absent 13, rare choices 6. Plan: the two cheap parts first.

**v15** = v13 plus a `format_staples` tool (the format's most-played nonland cards in the deck's colors, by job), a one-time note listing the top staples in the deck's colors it skipped (add or answer), and a rule that the requested cards and win-line cards run 4 copies unless legendary, restricted or explained. Two runs each, v13 rerun for a fair baseline ($25.87).

| Future test, 14 decks | Run 1 | Run 2 | Spells |
| --- | --- | --- | --- |
| v13 | 48.3% | 47.9% | 49%, 49% |
| v15 | 44.8% | 46.9% | 46%, 47% |

- **Missing staples didn't shrink** (8.3/9.1 → 9.5/9.1 points). The note pushed the format's most-played cards in the colors (any blue Legacy deck got Brainstorm, Ponder, Force of Will); the real decks used the staples that fit their plan (Thoughtseize in Persist, Sear in 4C Control). Most-played in your colors is not right for this deck.
- **Missing discoveries grew** (16.4/17.3 → 19.3/17.7): the added staples took the deck's own slots.
- **Copies rule: small** (3.4/2.5 → 2.2/2.5 points lost to copies).
- **v13's two runs agree within 0.4 points**, so two runs per version separates differences of about 2 points.

**Dropped.** Same lesson as v6 and v7: generic advice the model can't fit to the deck displaces the deck's own choices. What worked (v5, v8, v10, v11) was knowledge about *these* cards or *this* plan, not the format at large.

---

## 2026-10-21 · The future test, widened to April: v13 48.3%, and the lands never moved

Owner on the 6-deck post-cutoff test: "cutoff can be earlier too like April, why not?" Since 2026-06-15 there were 48 new archetype labels, but 36 were Duel Commander (excluded) and 5 more were an older deck under a new name or had 2 lists. From 2026-04-01: **18 new constructed archetypes, 14 with 3+ lists to score against.** That is the future test now (`future` track; scored against every list from a week after each appeared). Caveats, measured not assumed: April-June decks may be faintly in training data, and 9 of the 14 were in sets Claude developed against (the 21-deck holdout, plus Rector from the expert round).

| Opus, one run each | All 14 | Never tuned on (5) | Tuned on (9) |
| --- | --- | --- | --- |
| Best older list, with hindsight | 49.0% | 54.8% | 45.8% |
| v2 | 44.9% | 43.2% | 45.9% |
| **v13** | **48.3%** | **49.8%** | 47.4% |
| v14 (+ mana_base) | 47.3% | 49.6% | 46.0% |

- **v13 is +3.4 over v2, and the gain is larger on the decks never tuned on (+6.6) than on the ones that were (+1.5).** The opposite of what overfitting would look like.
- **v14's mana_base tool did nothing:** it was called on all 21 holdout decks, and land match stayed at 47% (v2 48%, v5 47%, v13 46%, v14 47%). The owner asked whether lands were a regression: no, they have been flat in every version since v2; every gain came from spells (38% → 43% on the holdout).
- **Why the lands don't match:** the brew picks different colors than the real deck on 11 of 21 holdout decks (land match 42% when colors differ); with the right colors, land match is still only 58%.
- **Single-run noise is large:** Fanatic Eldrazi scored 61% with v13 and 39% with v14. One run per version on 14 decks can't separate v13 from v14.

**Toward the owner's 60% target:** about 12 points to go. Most of the available points are in mana and colors, not card choice: right colors everywhere is worth about +4, real-deck lands within the right colors up to about +10. Fixing those is legitimate (brewers copy mana bases) but is not the interesting part of brewing, and the write-up should say so.

Cost: holdout v13 $8.95 and v14 $8.99; future v2 $7.49, v13 $8.06, v14 $7.79.

---

## 2026-10-21 · v13: one card check fixed, one card check demoted to a hint

Two card-level checks, from the owner's round 2 and 3 notes.

**1. The card-quality note stopped calling a rare deck's own pieces "outclassed."** It compared each card's share across the whole format, so Violent Outburst (Hypergenesis) and Pyrite Spellbomb (Bomberman) looked unplayed because their decks are rare. Now a card that is in 60%+ of some strategy's lists (5+ lists, last year) is never flagged. Checked on the earlier decks: Violent Outburst and Stone Rain stop being flagged. Shipped.

**2. A "card out of context" check, tried and demoted.** Idea from the Mill note (3 Vision Charm, "usually used to cheat Dreadnought into play"): flag a card real lists almost always run with a partner this deck lacks. The loose version caught Vision Charm/Dreadnought exactly, but also told the brewer Birds of Paradise "needs" Squee, because most Birds decks are Survival decks. Tightened (only cards that live in one archetype and have no general job), it lost Vision Charm and still flagged cards in a Glimpse Elves deck the owner had approved. **Co-occurrence can't tell "this card needs that one" from "this card is mostly played in one archetype."** So it ships as a hint attached to the deck for the reader, not a rule the brewer must obey. On a site, "Vision Charm is almost always a Dreadnought card" is useful to a person even when it's sometimes wrong.

**Post-cutoff check (six decks no model has seen), v13 vs v11 vs v2:**

| | Mean | Gearhulk | Dwarves | Jund Sac | Planeswalkers | 4C Control | Beanstalk |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Hindsight oracle | 41.8% | 65 | 29 | 45 | 53 | 29 | 30 |
| v2 | 42.5% | 33 | 50 | 24 | 57 | 41 | 50 |
| v11 | 46.8% | 44 | 57 | 29 | 62 | 44 | 45 |
| **v13** | **50.0%** | 50 | 54 | 22 | 60 | 57 | 57 |

v13 includes v12's enabler rule, which had not been on this test before; most of the jump is 4C Control (44 → 57) and Beanstalk (one list to score against). One run each; the honest reading is "no slip, possibly better," not +3 points. v13 is the base. Cost $2.85.

---

## 2026-10-20 · Round 3, five prompts no rule had seen: 3 of 5

The generality check. Five brand-new Premodern prompts (owner approved, one swapped for "Brew me a mill deck in premodern"), v12 straight through, no reruns ($1.90), judged one at a time.

**Would play: 3 of 5** (Nether Spirit control, Zur's Weirding, Squandered Resources + Natural Balance). The two no's, in the owner's words:
- **Mill:** "Some of the card numbers are a little weird, like 3 Vision Charms (which are kinda bad on their own, and usually used to cheat Dreadnought into play), and Traumatize doesn't really work in draw-go control."
- **Wildfire:** "I think it's OK, but it needs to keep in mind that Wildfire kills a lot of their guys. Also it's sorta light on removal."

**Reading:** first-pass rate on fresh prompts is 3 of 5, against 6 of 12 on the first pass this afternoon: same order, small samples, and these prompts could not have been patched for. The two no's are the same kind as the "closer" notes earlier: the engine is right, specific cards and numbers are off (a card chosen for a job it doesn't do, an own-board effect not thought through, too little removal). Nothing was a "no line to the win" or "wrong shell," which were this morning's failures. The fixes so far look like a method on this evidence, with the remaining gap in card-by-card judgment.

**Running score for the day, first-pass "would play" on v11/v12: 9 of 17 (53%); with one rebuild round, 12 of 17 (71%).**

---

## 2026-10-20 · v12 on the six no's: three became yes, three moved closer, none got worse

v12 = v11 plus two checks from the first "would you play it?" round: each requested card's enablers must be named and counted (under 6 copies is sent back unless justified), and one send-back for cards real players choose far less often than an alternative for the same job. Rerun on the six decks the owner had refused ($2.61); judged on a rebuild page with three answers, yes / no but closer / no, further away (owner's suggestion).

| Deck | Round 1 (v11) | Round 2 (v12) | Owner's note |
| --- | --- | --- | --- |
| Hypergenesis | no | **yes** | |
| Kiki-Pestermite | no | **yes** | |
| Seismic Assault | no | **yes** | |
| Scapeshift | no | closer | "still have Sak Tribes which I don't know if it needs" |
| Bomberman | no | closer | "the Destined White Mages and Leonardo packages don't seem necessary and are kinda bad" |
| Mind Over Matter | no | closer | "it's having some counterspell suite, but this is more of an all-in combo I think, right?" |

**Would play, best version per prompt, across the 12 round-2 prompts: 9 of 12** (6 from v11, 3 more from v12). Nothing moved further away.

**What the enabler rule did:** Seismic Assault got its extra-land engine; Hypergenesis got a backup way to cheat a fatty in. **What the card-quality note did:** it fired on 5 of 6, sometimes rightly (Devastating Dreams), sometimes on a rare deck's own staples (Violent Outburst, Pyrite Spellbomb), which have low play share because the deck is rare, not because they're bad. It needs to compare against lists of the same strategy before calling a card outclassed. The owner's new notes point at two more general things: unneeded packages (Bomberman's extra packages, Scapeshift's Elders) and plan coherence (an all-in combo deck carrying a counterspell suite).

**Generality caveat, stated plainly (the owner asked):** every rule is general code, none knows a deck, but the last three were tested almost only on the decks that inspired them. The test that counts is fresh prompts the rules have never seen, plus the post-cutoff score.

---

## 2026-10-20 · "Would you play it?" on v11: 6 of 12

The question changed from pairs to single decks: twelve v11 brews (expert round 2 prompts, $4.80), one at a time, yes or no, a line on each no (`scripts/build-play-page.ts`, `evals/rating/play-template.html`). All twelve were 60 cards with a deck submitted.

**Would play: 6 of 12.** Premodern 4 of 6 (Rising Waters, Phyrexian Processor, Rofellos, Shapeshifter + Phage); Legacy 2 of 6 (Glimpse Elves, Oracle + Pact). The formats swapped: this morning Premodern was where the brews failed; after the day's fixes it's where they pass, and Legacy, where card quality matters more, is where they fall short.

**The six no's, in the owner's words:**
- Mind Over Matter: "It's not understanding what Mind Over Matter does. It needs to generate a ton of mana, but how does it do this in the list? It has only one Thran Dynamo. You need to put Arcanis and Mind Over Matter in the field at the same time, or something like Lotus Vale. It's close but not quite there."
- Seismic Assault: "Doesn't really have any enablers, you need to play extra lands or ways to get extra lands."
- Scapeshift: "Close, but cards like Sakura-Tribe Elder at this point are outclassed."
- Hypergenesis: "Close, but the creatures it's putting into play seem kind of weird. Why 4 Craterhoof?"
- Kiki-Pestermite: "Close, but I don't think it needs Sneak Attack here since it's just 1 more mana to do Kiki-Jiki."
- Bomberman: no note.
- Rofellos (a yes, with a note): "I don't get the Krosan Tuskers. The numbers between Winter's Grasp and Creeping Mold are a little weird."

**Two patterns in the no's:**
1. **The build-around's enablers aren't there in quantity** (Mind Over Matter, Seismic Assault). The model names what the card needs (the mechanism step) and then plays one copy of it. Same failure the owner named in round 2; no check counts it yet. Candidate check: for each requested card, the brew must name its enabler role and the cards filling it, and code counts copies against a floor, with a stated reason allowed for fewer.
2. **Card quality and odd numbers** (Scapeshift, Hypergenesis, Kiki with Sneak Attack, the Tuskers). Outclassed cards and packages the deck doesn't need. v4's fair-deck card check (cards far below the play share of alternatives for the same job) was aimed at this and was dropped with the coach; it could come back as a note at submit time.

Four of the six no's were "close": the shape is right and specific choices are off, which is a different place from this morning's "no line to the win."

---

## 2026-10-20 · v11 on the backdated future test: 46.8%

Owner: the future test doesn't have to wait; we already have the post-cutoff decks. v11 on the six archetypes that appeared after the models' training cutoff ($2.86):

| Opus, 6 post-cutoff decks | Match to the lists players played |
| --- | --- |
| Best earlier list, with hindsight | 41.8% |
| v2 | 42.5% |
| v5 | 45.2% |
| v10 | 45.7% |
| **v11** | **46.8%** |

Per deck (v2 → v11): Gearhulk 33 → 44, Dwarves 50 → 57, Jund Sacrifice 24 → 29, Planeswalkers 57 → 62, 4C Control 41 → 44, Beanstalk 50 → 45. v11 is the best or near-best on five of six, and it is the first version to move Jund Sacrifice at all. One run, six decks, two of them with 1-2 lists to score against: the direction is consistent with every blind round this week, not proof on its own.

**Standing:** v2 → v11 is +4.3 points on decks no model has seen, and the whole gain came from knowledge and checks aimed at the owner's diagnoses. v11 is the base harness and the one in the forward test.

---

## 2026-10-20 · v11 (exactly 60, build on the dominant shell): Pande-Burst solved, Rofellos better, Mind Over Matter still not

v11 = v10 plus two checks from expert round 2: main decks are exactly 60 in 60-card formats (real lists: Premodern 97.5%, Standard 99%, Modern 96.5%, Legacy 90.8% exactly 60) unless the player asks for more; and when `played_with` shows most real lists running the requested cards are one strategy (60%+ of 5+ lists), a brew sharing under 35% with that strategy's latest list is sent back unless it gives a `shellReason`. 53 tests. Run on the three prompts the owner had diagnosed ($1.37).

**For the first time, Pande-Burst came out as the real deck:** Attunement, Replenish, Intuition, Frantic Search, Parallax Wave, 4 Pandemonium, 4 Saproling Burst. Every earlier version (v5, v8, v9, v10) had chosen an Enchantress shell the owner said can't work. Rofellos came out as a Survival toolbox at 60 cards with Gaea's Cradle. Mind Over Matter went Shallow Grave + Arcanis, still without the rocks and engines the owner asked for.

**Owner's blind picks, v11 vs v10:** Pande-Burst **v11**; Rofellos **v11**; Mind Over Matter neither.

**Tally of the diagnose-then-check loop today:** six prompts the owner had marked "neither" (Pande-Burst, Draco, Living End, Rector, Rofellos, Mind Over Matter); after the fixes, five have a version the owner would pick, one (Mind Over Matter) does not. Each fix was a check the model can't talk around, aimed at one sentence from the owner. Cost of the whole loop, brews and all: about $13.

**v11 is the base harness from here.** Owner's question at the end: "what's the point of comparing these A and Bs?" Answered in chat: the pair tells us whether a change helped without the judge knowing which is new; Neither tells us whether either is any good. Now that the base is settled, single-deck "would you play it?" judging is the better question for the next round.

---

## 2026-10-20 · Expert round 2: twelve fresh prompts, v10 vs v5

Twelve prompts the owner approved (6 Premodern, 6 Legacy), v10 vs v5 on Opus ($9.92), judged blind with Neither.

**Picks: v10 4, v5 3, same 3, neither 2.** Premodern: v10 2, same 2, neither 2. Legacy: v5 3, v10 2, same 1. Reasons given: Kiki-Pestermite (v5, "clearer plan"), Scapeshift (v10, "stronger cards").

- v10 and v5 are even here; the combo fixes didn't tilt fresh prompts either way, and the one combo-heavy format (Legacy, 5 combo prompts) slightly favored v5. The win-line rule helps when the model has the wrong line (Rector); it doesn't add much when both versions already have a line.
- **"Neither" 2 of 12, both Premodern again** (3 of 7 last round, 2 of 6 this round). Owner's lines:
  - **Mind Over Matter:** "Not enough mana rocks or engines to use with the card." Both builds went Show and Tell / Intuition with 2 Thran Dynamo; MoM needs its enablers in quantity.
  - **Rofellos:** "One missed Gaea's Cradle, and it's putting weird cards like Multani and Krosan Tusker. The other deck there had 62 cards. Hurricane doesn't make sense. I think it's confusing what ramp means in different contexts." v5: 0 Cradle, Multani, Tusker. v10: 62 cards, 2 Cradle, Hurricane.

**Two concrete things from this:**
1. **62 cards is a tell.** The checker only enforces the 60 minimum. Real lists are 60 almost without exception (measured below); a brew that submits 62 has not finished choosing. Fix: 60 exactly in 60-card formats unless the player asks otherwise.
2. **A build-around card's requirements aren't counted.** MoM wants rocks and untap engines; Rofellos wants Cradle and a mana-sink plan; the model names the card's job (v9/v10 mechanism step) but doesn't build the quantity the job needs. Same shape as Rector before the win line: the fix is a check, not advice.

---

## 2026-10-20 · The future, today: decks that appeared after the models' training cutoff

Owner: "I don't want a verdict in January, can't we test with the future stuff now?" Yes: the forward test waits for the *data* to settle, but the *models* have their own clock. Their knowledge ends in June 2026, so any archetype that appeared after that is the future to them, even where players have already settled it in our data. `find-new-archetypes.ts` with a 5-list bar finds **6 such decks** (first seen after 2026-06-15): Pioneer 4C Control, Standard Gearhulk, Pioneer Simic Beanstalk, Standard Boros Dwarves, Standard Jund Sacrifice, Standard Boros Planeswalkers. Scored against every list from a week after each appeared (`post` track). Two caveats: Dwarves and Jund were in the 21-deck set used to tune v5 and v6 (clean for the model, not fully for us); Beanstalk and Planeswalkers have 1-2 lists to score against and are noise.

| Opus, 6 post-cutoff decks | Match to the lists players played |
| --- | --- |
| Best earlier list, with hindsight | 41.8% |
| v2 | 42.5% |
| v5 | 45.2% |
| **v10** | **45.7%** |

Per deck (v2 / v5 / v10 vs. oracle): Gearhulk 33 / 47 / 47 vs. 65; Dwarves 50 / 56 / 54 vs. 29; Jund Sacrifice 24 / 22 / 24 vs. 45; 4C Control 41 / 40 / 40 vs. 29.

**Reading:** on decks no model has seen, v5 and v10 are about 3 points above v2 and above the hindsight oracle, the same shape as the holdout, with the same caveat (6 decks, one run; Gearhulk alone moves the mean). v10 did not lose anything against v5 on four fair and synergy decks, which was the open question after today's combo work. Jund Sacrifice is the recurring miss: every version builds a different sacrifice deck from the same three cards.

**What this changes:** the forward test no longer needs 90 days per deck to say anything. Every new archetype is a future deck for the models from the day it appears; the "settled" score firms up over weeks, and the sample grows by one every few weeks. Cost: $7.33 (v2 $2.52, v5 $2.37, v10 about $2.44).

---

## 2026-10-20 · v10 (a win line the checker verifies): no more "neither" on the three hardest prompts

v10 = v5 plus the two things that each fixed a miss earlier today (played_with lookup, mechanism-first step) plus a new rule: `submit_deck` requires a **win line**, the exact sequence of named cards that wins, and sends the deck back if any card in the line is missing from the deck. Code checks presence; the simulator reports how often the whole line is drawn by the declared turn (reported, not enforced, since tutors aren't simulated). 52 tests.

Run on the three Premodern combo prompts the owner had rejected twice ($1.20). What the rule did: for Rector, the brew wrote "Rector → Pattern of Rebirth → Akroma" with Carrion Feeder as the outlet, the Pattern-style line from the owner's first reference, where every earlier version had Rector and interaction and no win. Pande-Burst stayed an Enchantress-Replenish build. Draco kept a single Draco with Worldly Tutor.

**Owner's blind picks, v10 vs v8:** Rector **v10**; Pande-Burst v8; Draco same. Owner: "they were getting better I think." **No "neither" this round**, after 50% "neither" on these prompts this morning: the owner picked a side or called it even on all three.

**Reading:** the win-line rule is the first structural change that moved a combo deck in the owner's eyes, and it worked because it is a check the model can't talk its way around (the cards are in the deck or they aren't), aimed at the exact failure the owner named. Pande-Burst remains the open case: the right line (Replenish with Intuition and Lion's Eye Diamond) is in the data and the model keeps choosing Enchantress.

**Decision:** v10 is the base harness from here. It goes into the forward test alongside v2, and gets a two-run holdout check later to make sure the win-line rule costs nothing on fair and synergy decks.

---

## 2026-10-20 · Owner on the two unfixed combos: "missing a way to win"

Asked what v8's Rector and Pande-Burst decks got wrong with the right cards in front of them, the owner pointed to two real Rector lists (one saved in `evals/expert-refs/`) and summed up: **"it was missing a way to win really, or a focused strategy on how to leverage Rector on top of normal interaction suites."**

The saved reference (Premodern, Aug 2026, "Name Sexy Rector") shows what that means: Rector plus **Pattern of Rebirth** and **Recurring Nightmare** as the engine, **Nantuko Husk** as the sacrifice outlet that makes Rector and Pattern go, and **Form of the Dragon / Worship / Akroma** as what Rector fetches to actually win, on top of Cabal Therapy, Survival and the usual green creature suite. None of the three AI builds had Pattern of Rebirth, Recurring Nightmare or a Rector target that wins the game: they had Rector, the interaction, and no line.

The owner's second reference (Rector Control, saved beside it) is the deck our own data was pointing at: Cabal Therapy, Pernicious Deed, Gaea's Blessing, Fact or Fiction, Innocent Blood, Krosan Tusker, the exact `played_with` list. Its win is **Decree of Silence** fetched by Rector, with **Phyrexian Tower** as the outlet and a Gaea's Blessing loop so it never decks. v8 had that list in front of it and still built neither the Decree nor the Tower: it borrowed the interaction and skipped the win.

This names the gap more precisely than "combo": **the model builds the shell and the interaction but not the win.** It is the same thing the owner saw in Pande-Burst (two combo cards, no plan to resolve them). A plan has a line to the win; the model's brews often stop at "a deck containing the cards."

---

## 2026-10-20 · Lookup vs. reasoning on the four combo misses: each fixes one, neither fixes two

Owner's question before judging: "Are we just plugging gaps in specific combo builds vs fixing the actual AI deck building?" Answer: v8 (a `played_with` tool: what real decks in any format run the requested cards with) is general but supplies knowledge rather than judgment. So a control was added: **v9** = v5 plus a mechanism-first step ("for each requested card: what it is FOR, which part of its text matters, what it needs around it") and no lookup. Four prompts, three versions, 12 blind pairs ($3.29).

| Prompt | v5 vs v8 | v5 vs v9 | v8 vs v9 |
| --- | --- | --- | --- |
| Living End (Legacy) | v8 | v9 | same |
| Draco + Erratic Explosion | v8 | v9 | v8 |
| Pande-Burst | neither | neither | neither |
| Rector Combo | neither | neither | neither |

- **Living End: fixed by either.** Asking the model what the cyclers are *for* was enough; it found Living End with no data. Reasoning that was in the model, unasked.
- **Draco: fixed by lookup, partly by reasoning.** v8 (no Tribal Flames, burn shell) over v9 over v5. v9 still built an odd aggro shell: reasoning got it off "domain" but not onto the right plan.
- **Pande-Burst and Rector: fixed by nothing.** Both Premodern, both decks whose line is specific (Pande-Burst is a Replenish deck with Intuition and Lion's Eye Diamond; Rector is about which enchantment it fetches). The data had both (11 and 14 lists) and v8 saw it: it still chose an Enchantress shell for Pande-Burst, which the owner says can't work. Knowledge on the table, wrong part borrowed.

**Reading for the owner's question:** it's both, and the split is now measurable. The model's own reasoning fixes the "obvious inference" misses when asked (Living End). Lookup fixes misses where the data holds the answer and the model reads it right (Draco). Neither fixes a deck whose plan is specific and the model misreads what to borrow (the two Premodern combos). That last kind is the real ceiling of this approach, and the owner's formats are where it shows.

**Decision:** combine both (mechanism step plus `played_with`) as the base harness going forward, since each fixed something and neither hurt. "Neither" rate on this round's four hardest prompts: 50%.

---

## 2026-10-20 · The owner explains the four "neither" decks: the AI doesn't understand how a combo works

Asked for one line each on the four pairs they wouldn't play, the owner wrote (lightly condensed):
- **Pande-Burst:** "4 Enlightened Tutor is bad, the deck lacks focus: it should either be a stompy deck with the combo, or dedicated combo, but that would require putting the enchantments in the graveyard and Replenishing them." The Enchantress shell "would never really work for this."
- **Erratic Explosion + Draco:** "Tribal Flames in this deck is bad, the AI was playing too much into Draco's domain-matters mana cost, but the deck that wants to Draco-Explode doesn't want domain, it's just for the 16 mana cost."
- **Living End cyclers (Legacy):** both brews built Reanimator with the cyclers as targets. "The prompt suggested a bunch of cycling creatures but didn't say anything about Living End; the AI should probably know to do that."
- **Rector Combo:** "Super misses, it didn't really understand what enchantments the Rector wants to get out, way too many sacrifice outlets."

**One cause behind all four: the model pattern-matches on the surface of the cards, not the mechanism of the combo.** Draco's domain text instead of its 16 mana value; "cycling creatures" as reanimation targets instead of Living End; "sacrifice Rector" as a sac-outlet theme instead of "which enchantment does Rector fetch"; two combo pieces with no plan around them, hedged with tutors. This also explains v4's null result: the coach checked whether the stated combo assembles, never whether it was the right combo.

**Lever:** knowledge again. A public combo database with mechanisms (Commander Spellbook) covers these: plan step 4 listed "combos" under card knowledge and it was never built. Proposed: known-combo lookups in the tools, rerun the four prompts, owner judges four blind pairs against v5 (about $3).

---

## 2026-10-20 · Expert round: the owner judges 18 Premodern and Legacy brews blind

Owner: "I think I need to judge decks that I know intimately." Formats: Premodern and Legacy. 11 fresh prompts (Claude proposed 14, owner cut 3) plus 7 archetypes that appeared this year in those formats (found with a 5-list bar), v2 vs v5 on Opus ($14). A fourth button was added at the owner's request: **Neither** (I wouldn't play either).

**Picks: v5 8, v2 4, same 2, neither 4.**

| | v5 | v2 | same | neither |
| --- | --- | --- | --- | --- |
| Premodern (7) | 3 | 1 | 0 | **3** |
| Legacy (11) | 5 | 3 | 2 | 1 |
| Fresh prompts (11) | 4 | 3 | 2 | 2 |
| History decks (7) | 4 | 1 | 0 | 2 |

- **v5 over v2 again, 2 to 1**, now in formats the owner knows cold. Third blind comparison in a row to favor it (holdout 3-0, this 8-4). The format menu is the one harness change with a consistent human preference behind it.
- **"Neither" is the new number: 4 of 18 (22%).** In Premodern, where the owner is most expert and the data is thinnest (10 months of a small format), **3 of 7 pairs produced nothing they'd play**; in Legacy, 1 of 11. All four were combo decks: Pande-Burst, Erratic Explosion and Draco, Rector Combo, Living End. That is the owner's "specialist" category and the AI's known weak spot, now confirmed by the judge who knows those decks best.
- **Objective score vs. owner on the 7 history decks:** agree 3, disagree 1 (Creative Technique: owner v5, score v2), 3 undecidable. Running tally across both checks: 8 agree, 1 disagree.

**Reading:** on fair and synergy decks in formats with data, the AI produces something the owner would play almost every time, and v5 is the better harness. On Premodern combo it fails about half the time. The next diagnostic is cheap: the owner's one line on what was wrong with each "neither" deck.

**Open offer:** the owner brews two of the fresh prompts themselves for a blind human-vs-AI comparison.

---

## 2026-10-20 · v7 (worked examples) with two runs each: v2, v5 and v7 are indistinguishable on the match score

v7 = v5 plus annotated examples of AspiringSpike's brews in the request (`src/harness/examples.ts`: code marks each example's borrowed shell, new ideas and the rest; only examples dated before the run's cutoff are shown). First comparison with two runs per version.

| Opus, 21 holdout decks, match to settled deck | Run 1 | Run 2 | Mean |
| --- | --- | --- | --- |
| v2 | 40.6% | 41.8% | 41.2% |
| v5 | 43.7% | 41.6% | 42.7% |
| v7 | 40.4% | 43.4% | 41.9% |

- **Within a version, runs differ by 2-3 points. Between versions, the means differ by 0.7-1.5 points.** With this noise, 21 decks and two runs can't tell these three apart. v5's lead over v2 shrank from 2.5 points to 1.5 when its second run landed at 41.6%.
- **The worked examples did nothing measurable.** v7's copy rate (60%) matches v5's; its brews are not more "shell plus new ideas" by the score.
- **What still separates v5:** the owner's blind preference (6-2-2 over v2 and v6), made on v5's run-1 decks. That is one judge on five decks, and it is the only signal we have that v5 is better.

**Reading:** the holdout as a fast test is saturated at this effect size. Four levers that could change that: more decks (lowering the 15-list bar adds archetypes but weaker "settled" targets), more runs per version (cost scales linearly), the owner judging more pairs, and the forward test (slow, but decisive). The cheapest real information per dollar is now the owner's blind picks, not more runs.

Cost: v7 $7.46 + $7.44, v5 run 2 $7.89.

---

## 2026-10-20 · The forward test is live: first brew made before the deck settles

Owner: "Yes" to the forward test (new decks brewed the week they appear, scored when they settle, so nothing can be tuned to them and no model has seen them).

**Built:** `scripts/forward-week.ts` merges a fresh Decklist Data export into the full history, finds archetypes first seen since a date (same rules as the holdout finder, minus the "15+ lists in 90 days" test, which is applied at scoring time; fixed now, before any result), brews each with the data cut the day before it appeared and the card pool as of that day, and appends to `evals/forward/ledger.jsonl`. `scripts/forward-score.ts` scores brews once their archetype is 90 days old. Brews are committed: the git history is the proof they came first.

**Rate of new decks:** 3 in the last two months across all formats (Jund Sacrifice, Aug 22, already in the holdout; Pioneer Boros Dragons, Aug 24, 3 lists, likely to fizzle; Standard Boros Planeswalkers, Oct 5). About one every three weeks, so a meaningful forward sample takes months. The holdout stays the fast test for ideas; the forward test is the verdict.

**First live item: Standard Boros Planeswalkers**, first seen 2026-10-05, 6 lists by 2026-10-20, signature Gideon's Memorial, Solitary Cell, Ajani Unrelenting. Brewed 2026-10-20 with v5 and v2 on Opus ($0.74). Settles 2027-01-03; it counts only if it reaches 15 lists by then. Verdict in January.

**Weekly ritual from here:** export (30 days), merge, detect since last run, brew new candidates with the current base harness plus v2 for comparison, commit.

---

## 2026-10-20 · Owner judges v2 vs v5 vs v6 blind: v5 wins, and the match score agrees with the owner

The check that had to come before any more building (2026-10-19, "what we got wrong"): does the holdout match score track what the owner would actually play? Five holdout decks (Fanatic Eldrazi, Persist, Mardu Discard, Living Death, Inside Out), every pair of v2 (repeat run), v5 and v6 on Opus, 15 blind pairs, one question. The page now shows each card's rules text on hover (artifact pages can't load outside images, so the text comes from the card index).

**Head to head (owner's picks):**

| | Wins | Ties |
| --- | --- | --- |
| v5 vs v2 | **v5 3-0** | 2 |
| v5 vs v6 | **v5 3-0** | 2 |
| v2 vs v6 | 2-2 | 1 |

v5 won 6 pairs, v2 and v6 two each, five ties. The owner preferred v5 on Fanatic Eldrazi (the Eldrazi-package brew), Persist, Inside Out and Living Death.

**Match score vs. owner:** in the 5 pairs where the owner picked a side and the match scores differed by 3+ points, the score picked the same deck **5 of 5 times**, never the opposite. The other 10 pairs were ties or near-equal scores, where the score has no opinion. Small sample, one judge, but no disagreement.

**What this settles:**
1. **The match score is usable as a target**, with the originality floor set where a real brewer sits (about 50-60% from one earlier list, per AspiringSpike), not lower. It tracks the owner's taste where it has an opinion.
2. **v5 is the base to build on.** The owner preferred the version that borrowed more; v6's extra originality bought nothing the owner valued. The "v5 copies too much" worry (already walked back on 2026-10-19 by the brewer profiles) is closed.
3. **Harness changes can matter**: the owner's first clear preference between harnesses since round 3 is for one whose only change was format knowledge in the request. Structure (v3, v4) never won a blind comparison; knowledge did.

**Next:** the forward test (new archetypes brewed the week they appear) as the only honest test set from here, and the worked-examples idea (AspiringSpike's brews as examples of the style) built on v5, measured on the forward set with repeated runs.

---

## 2026-10-19 · Two known good brewers, measured: AspiringSpike and Grantfly

Owner: "we won't get their actual time, but we could review their lists from decklistdata.com." Both are public MTGO players with public results, so their handles can be used. `scripts/brewer-profile.ts` on their player pages' decks (44 and 48 lists; `scripts/fetch-dld-deck.ts` now skips decks that moved to a new URL).

**AspiringSpike (Modern):** a brewer by the data. 15 of 44 lists are brews (under 65% of any one earlier list). His brews borrow about **50%** from other archetypes' lists; his first-ever lists 55%; all his lists 59%. He plays only **1.4 cards per deck that nobody in Modern played in the prior 90 days** (2.2 on brews). He originated **Fanatic Eldrazi** (2026-05-15), one of the 21 holdout decks: the "human brewers' first lists" for that deck are his. So brewing, as a top brewer practices it, is a proven package plus two or three new ideas, not a deck from nowhere.

**Grantfly (Premodern, Pauper):** by this data a strong *player* more than a brewer: 90% of each list is an earlier list, 2 brews in 48. He originated Pattern Combo (Premodern, 2026-04-16), which drew only 2 lists in 90 days, so it isn't in the holdout. Premodern is a small card pool, so copy rates run high there anyway. His lists are a reference for what a settled Premodern deck looks like: the stock and tune side, and sideboards, not brewing.

**Recalibration, and a correction to the v5 entry:** v5's "catch" (60% of each deck from one earlier list) is a known good brewer's normal level (AspiringSpike: 59% overall, 50-55% on brews). v6's 49% is slightly *more* original than his brews. The worry that v5 copied too much was wrong by a real brewer's standard. Target originality for brews: about 50-60% from one earlier list, with a few genuinely new cards, not lower.

**Uses, in order:** (1) the originality target above; (2) AspiringSpike's 15 brews as worked examples of the style in the prompt (package plus new cards), and as a secondary test set, with the caveat that lists before June 2026 may be in the models' training data; (3) Grantfly's lists for the stock, tune and sideboard evals in Premodern.

---

## 2026-10-19 · "What are we doing wrong?" (owner, after switching the session to Fable 5.1)

The owner's question after six harness versions and one small, unreliable gain. Claude's answer, kept in full because it changes what we do next:

1. **We picked a yardstick that measures the wrong thing, then chased it.** The brew holdout asks: given the 3 cards that defined a deck, reproduce the other 57 the crowd ended up with. That is prediction of one historical outcome, not brewing skill. An equally good different deck scores badly, and the score rewards copying: v5 "won" by borrowing more, v6 "lost" by borrowing less.
2. **The 70% "human brewers" baseline (2026-10-19 diagnosis entry) is partly circular.** The settled deck descends from those first lists; they match it because the archetype *is* their deck, refined. A human who brewed the same cards into something else would be labeled a different archetype and never appear in the 70%. So "humans 70%, AI 42%" does not mean humans brew better; it means the AI doesn't reproduce the specific deck that caught on. Claude stated the stronger claim and shouldn't have.
3. **Built before diagnosing, five times out of six.** The one version that moved the number (v5) was the only one preceded by reading the decks and asking what the AI did differently.
4. **Effects this small can't be seen with runs this small.** 21 decks, one run each, about 2.4 points of per-deck noise, one deck swinging the average by 1.3 points. Noise was measured once, this week. Everything from v4 on is inside it.
5. **Tuned on the test again:** v3 on the 24 prompts, then v4-v6 on the same 21 decks.
6. **Stopped using the one judge who knows.** The owner has not seen a v5 or v6 deck and has judged 10 brews since round 3, because numbers were cheaper than their time.

**Changes:**
- No new harness versions until measurement is fixed.
- Owner judges 5 holdout decks blind, v2 vs v5 vs v6 (about 15 pairs). If their picks don't track the match score, the match score is retired as a target.
- Forward test only from here: new archetypes as they appear on MTGO, brewed the same week. No model has seen them; nothing can be tuned to them.
- Several runs per version before any difference is believed.

**Owner's idea: two known good brewers.** Their decklists could help three ways, ranked: as independent judges of blind pairs (the project's weakest link is that only the owner can say what "good" is); as worked examples of a brewer's reasoning in the prompt, if they've written about their decks (never tried: every harness gave the model tools and checks, never taste); and as a cleaner test set ("did it find what a known-good brewer found"), a secondary use with the same one-outcome caveat. Names and privately shared lists stay out of the repo without their say.

---

## 2026-10-19 · v6: borrow a package, not a deck. Originality restored, most of v5's gain gone

Owner: "go for it" (teach v5 to borrow selectively). Per-deck data first: v5's Fanatic Eldrazi win came with 72% of the deck from one earlier list, Persist went to 92% (a Reanimator list with Persist cards), Creative Technique 78%.

**v6** = v5, plus: the prompt says take the 5-12 cards that make a menu deck's engine or mana work and choose the rest yourself; `check_deck` reports how much of the deck is one existing list; a brew above 65% (about where the holdout's human brewers topped out) is sent back. Stock submissions are exempt. 48 tests pass (3 new).

| Opus, 21 decks | Match to settled deck | Match to brewers' cards | From one earlier list |
| --- | --- | --- | --- |
| v2 (two runs) | 40.6%, 41.9% | 41.7%, 42.9% | 50%, 53% |
| v5 | 43.7% | 45.1% | 60% |
| **v6** | **42.2%** | **42.8%** | **49%** |
| Original human brewers | 70% | | about 49% |

- **The copy limit never fired** (0 decks sent back). Telling the model "a package, not a deck" and showing it the copy rate was enough to bring borrowing back to the human brewers' level.
- **Most of v5's gain went with it.** v6 is 0.9 points above the average of the v2 runs, inside the noise. Fanatic Eldrazi fell back to 34% (it didn't borrow the Eldrazi package this time, which is about 20 cards, above the "5-12" the prompt suggested). Persist improved further (50%; 62% of the brewers' cards) with less copying.
- **The clean comparison for the post: at the same originality (about 49% from one earlier list), the original human brewers matched the settled deck 70%; the AI 42%.** That is the real gap in brewing skill.
- **v5's extra points mostly came from borrowing more.** Matching the crowd's deck and being original pull against each other, and the match score rewards borrowing.

**A warning to ourselves:** v4, v5 and v6 have all been tuned and judged on the same 21 holdout decks, the same trap as v3 and the rubric prompts. Gains this small on a reused set can't be trusted. A fresh test set is needed before claiming anything: decks that appear on MTGO from now on can't be in any model's training data or in our tuning.

Cost: $8.36.

---

## 2026-10-19 · v5: the first harness change that moves the number (with a catch)

Owner: run it on the best models, "Opus and Fable," then "Is there a way to slightly reduce cost?" Agreed plan (about $28 instead of about $47): repeat v2 on Opus to measure noise (must be identical, so no savings), v5 on Opus with a short final answer (the deck is locked before the write-up, so scoring is unaffected), and Fable only on the cheap one-call menu test, with a full Fable run only if it beat Opus there.

**v5** = v2's loop and tools, plus (1) a menu of what's working in the format in the request (top 15 archetypes and the nonland cards 70%+ of their lists run, framed as packages to borrow, not decks to copy), (2) sketch three directions, at least one borrowing a package if one truly fits, then pick, (3) short final answer. No coach (v4 didn't help).

**Noise, measured for the first time:** v2 run twice on Opus: 40.6% and 41.9% match to the settled decks. Per deck, runs differ by 2.4 points on average (up to 9).

**Results, 21 holdout decks, Opus:**

| | Match to settled deck | Match to original brewers' cards | Share of deck from one earlier list |
| --- | --- | --- | --- |
| v2, run 1 | 40.6% | 41.7% | 50% |
| v2, run 2 | 41.9% | 42.9% | 53% |
| **v5** | **43.7%** | **45.1%** | **60%** |
| Hindsight oracle (best existing list) | 42.6% | | |
| Original brewers' first lists | 70% | | about 49% |

- **+2.5 points over the average of the two v2 runs, about twice the run-to-run difference.** First time a harness change has beaten the hindsight oracle (43.7% vs. 42.6%). v5 is better on 13 decks, worse on 6.
- **It fixed exactly what the diagnosis found:** Fanatic Eldrazi 33% → **60%** (it borrowed the Eldrazi package, as the human brewers did); Modern Persist 34% → 48%; Pauper Inside Out 43% → 52%. Losses: Mardu Discard 44% → 34%, Pauper Metalcraft 58% → 52%.
- **By kind:** combo +4.5 points, synergy +2.7, fair flat. Fair decks remain the gap.
- **The catch:** v5's decks lean more on existing lists (60% from one earlier list vs. 50-53% for v2 and about 49% for the human brewers). Part of the gain is borrowing more in general, not only borrowing smarter. The owner's goal is brewing, not copying, so this trade-off is the next thing to work on.
- **Without Fanatic Eldrazi, the gain is about 1.3 points:** one big win carries much of the average. Promising, not proven.

**Fable:** on the one-call menu test it was slightly *below* Opus (first idea 39% vs. 42%, best of 5 44% vs. 45%) at about 3x the cost ($10.12 vs. $3.26). No full Fable run, as agreed. Same story as round 1: the most expensive model is not the best brewer.

Cost: v2 repeat $8.54, v5 $7.63 (cheaper than v2's $8.66 thanks to the short write-up), Fable menu test $10.12, v5 smoke test $0.43.

---

## 2026-10-19 · Owner: "I am not ready to give up." Diagnosis: the AI builds a different deck, not an unfinished one

After v4's null result, the owner pushed on. Three free or cheap diagnostics changed the picture.

**1. Real decks were nearly finished on day one.** The players who first brewed the 21 holdout decks posted lists that already matched the settled deck **70%**. The crowd refined them little afterwards. So the AI's gap (41%) is not "missing weeks of games." From the same signature cards, it builds a *different deck* than the original brewer (43% match to their first lists). (Test fairness checked: only 0.7% of the brewers' cards were hidden from the AI's card pool.)

**2. What the difference is.** On the worst misses, the AI dropped the cards into a familiar template; the brewers found the specific trick, usually by borrowing a proven package from the format's top decks:
- Cosmogoyf: brewers went all-in with Serum Powder, Cosmogoyf and Summoner's Pact; the AI built Goryo's Vengeance reanimator and added Thud.
- Fanatic Eldrazi: brewers paired the cards with the Eldrazi package from Modern's top decks (Devourer of Destiny, Emrakul, Sowing Mycospawn); the AI built generic green stompy with Noble Hierarch.
- Dimir Excruciator: brewers went blue-black with Deceit and Superior Spider-Man; the AI made mono-black midrange with Excruciator as a finisher.
- Jund Sacrifice: brewers went Jund; the AI defaulted to Orzhov Aristocrats.

**3. Is the right deck in the AI's head, just not its first idea? Mostly no.** `scripts/brainstorm-shells.ts` asks Opus (no tools, one call) for 5 genuinely different decks per holdout deck and scores each against the brewers' first lists (share of their nonland cards):

| | Without menu | With "what's working" menu |
| --- | --- | --- |
| First idea | 36% | **42%** |
| Best of 5 ideas | 40% | **45%** |
| (v2 Opus, full tool-using brew) | 42% | |

Brainstorming more ideas alone doesn't find the brewers' deck. But giving the model a **menu of what's working in the format that day** (top archetypes and the cards most of their lists run, framed as packages to borrow, not decks to copy) moved its first idea up 6 points, to the level of a full tool-using brew, in one call. Fanatic Eldrazi: one menu idea borrowed the Eldrazi package and matched 55% of the brewers' cards (vs. 27-39% without). This is knowledge, not structure: the knowledge a player gets from playing the format.

**Caveat, and a gap in our method:** single runs vary a lot per deck (Elementals' first idea 40% in one run, 23% in the next). We have never measured run-to-run noise on the holdout, so differences of a few points (including v2 vs. v4) can't be trusted yet. Next run should include a repeat of v2 to measure it.

**Possible training leakage, noted:** the model's knowledge runs to June 2026, so for decks that appeared before then it may have seen them in training. It still didn't reproduce them, which says recall isn't the issue, but the effect can't be ruled out.

**Direction this points to (v5):** give the brewer the format menu up front, have it consider a few directions that borrow packages where they fit the cards, then pick. Measured against a repeated v2 run so the noise is known.

Cost: brainstorm runs $3.43 (no menu), $2.84 (menu run that crashed on one truncated answer), $3.26 (menu, complete).

---

## 2026-10-15 · v4 on the brew holdout: no change, and the brewer argues with the coach

Same 21 decks as the v2 baseline. Compared on the 18 decks where all four runs built a deck (3 v4 runs are still missing; see below):

| | All (18) | Synergy (7) | Combo (5) | Fair (6) |
| --- | --- | --- | --- | --- |
| Best existing list, picked with hindsight | 43.5% | 44.6% | 34.0% | 50.2% |
| Sonnet v2 → v4 | 38.2% → 36.2% | 41.3% → 36.9% | 36.6% → 35.2% | 36.0% → 36.3% |
| Opus v2 → v4 | 42.0% → **42.7%** | 47.4% → 49.4% | 37.6% → 38.2% | 39.3% → 38.7% |

**Reading: within noise.** Opus is up 0.7 points (better on 10 decks, worse on 4); Sonnet is down 2 points, mostly one deck (Pioneer Lessons, 47% → 18%, where it declared a fair prowess deck instead of the Lessons engine). The fair-deck gap is untouched.

**What the coach actually did:**
- The brewer used it a lot: about 1.5 `coach_check` calls per deck, and it declared kinds sensibly (mostly synergy and combo).
- When the coach had notes, the brewer almost always **answered instead of changing the deck**: 11-12 written answers across 40 decks, and only one deck sent back (a fair deck short on interaction). "Fix it or explain" turned into "explain."
- **Consistency did not change on a fair measure.** Measured against each v4 deck's own plan, v4 looked far more consistent (Sonnet 44% → 63%, Opus 49% → 63% of games where the pieces come together). But that comparison is rigged: the plan lists v4's own cards, so v2 is graded on cards it never chose. On a neutral measure, the signature cards both were told to build around (2+ drawn by turn 4), v2 and v4 are identical: 55% vs. 56% (Sonnet) and 58% vs. 58% (Opus), with the same number of copies.

**Why, as far as we can tell:**
1. v2's decks already mostly pass the coach's bars, so the coach has little to say, and when it does, the brewer's explanations are reasonable.
2. The coach checks *consistency*; the score measures *similarity to what players settled on*. What separates the AI's brews from the settled lists is which of many reasonable cards to play, and the crowd settles that through weeks of games. None of v4's checks speak to it.

**Fourth harness change, fourth null result on quality.** Structure keeps making the bot reliable; it doesn't make it choose like the players who refined these decks.

**Infrastructure note:** six v4 runs died with "terminated." The cause was the Mac sleeping (lid closed, on battery) mid-request; keep-awake can't prevent that. Five were rerun alone (one at a time also avoids memory pressure from several processes each holding the 143k-list history); three are still missing (Sonnet Creative Technique, Opus Persist and Fanatic Eldrazi) and need the machine awake.

Cost: v4 runs $14.30, reruns $0.87, smoke test $0.59.

---

## 2026-10-15 · v4 built: the coach is code, and it had to learn not to fight the brew

The owner asked whether the coach is another AI. No, deliberately: v3's AI critique step didn't help, an AI judge shares the brewer's blind spots, and the brewer can argue with an opinion but not with a number. Everything that has worked so far (legality, mana) is a check in code. Owner: "Ok, lets go for it."

**What v4 is:** v2's loop and prompt, word for word, plus three tools (`src/coach/coach.ts`, `declare_plan`, `coach_check`, `submit_brew`):
- **declare_plan:** the brewer says which of the owner's three kinds it is building. Synergy and combo plans list the pieces that must come together, how many must be drawn, and by which turn.
- **The coach**, by kind:
  - *Combo and synergy:* the simulator (now counting cards drawn, with a `need` per piece) measures how often the pieces come together by the target turn, mulligans included. Bars: combo 50%, synergy 60%, stated so they can be argued with.
  - *Fair:* shortfalls against real decks of the same style in the format (too little interaction, too little card advantage for midrange and control, too few creatures for aggro and midrange), and cards real players choose far more often for the same job at a similar cost in the deck's colors.
- **submit_brew:** if the coach has notes, the deck comes back with them. The brewer fixes it or answers each note by id. The coach sends a deck back at most twice.

**Smoke test (Sonnet, 2 decks, $0.59):** Living Death was measured at 49% by turn 4 against the 50% bar; the brewer kept its build and argued its case (Reanimate is another payoff; real Reanimator lists run about 14 lands). That is the intended "fix it or explain it" loop.

**Two coach problems caught before the full run, by replaying the coach on v2's fair decks for free:**
1. **It questioned the cards the deck was built around.** New cards have 0% play share before they exist, so the coach told the brewer to swap Ashling and Resonating Lute for older staples: the opposite of brewing. Fix: never question a card printed in the last 90 days (no track record) or a card the player named. Compare like with like (creatures with creatures).
2. **Style comparisons were noise.** Rough style labels put spell-based combo decks in "control," producing "control decks average 4 creatures and mana value 2.0." Fix: only flag shortfalls with a clear meaning; drop "too many" and mana value comparisons.

After the fixes, the fair coach is quiet and specific: e.g. Lightning Helix (2% of Standard decks) vs. Burst Lightning (35%); Syncopate (0%) vs. Spell Snare (21%). Honest expectation: it fires rarely on fair decks, so it may not close v2's biggest gap (fair decks, 39% vs. 50%).

45 tests pass (4 new: drawn-count odds, combo note, fair card note and named-card protection, the submit_brew loop).

---

## 2026-10-15 · Owner: three kinds of deck, not two

Asked what Claude Code needed from them, the owner refined the v4 design: "I think there might be 3 categories. 1) Synergy - a lot of similar stuff needs to be grouped. 2) Combo - 1 build around me, or 2 cards that need to be combined. 3) Fair (aggro and midrange)."

This splits Claude Code's "specialist" bucket where it should be split, because the two fail differently:
- **Synergy fails on density:** too few of the theme (11 Dwarves where the deck needs 18+). Check: density and "payoff plus enough enablers by turn N."
- **Combo fails on assembly:** the right pieces not found or not protected. Check: the stated combo, quoted card text, and simulated assembly odds by turn 3-4.
- **Fair fails on card quality and curve.** Check: principles and the best card for each job.

The model declares the kind it's building as part of its plan. PLAN.md updated. Claude Code's first labels for the 21 holdout decks (9 synergy, 9 combo, 3 fair, 3 uncertain) are with the owner to correct.

Also explained to the owner, in plain terms, what the holdout's comparison means: the hindsight oracle is the old deck most like what the new deck became, which you could only pick by seeing the future. Opus v2 matches it (40.6% vs. 42.6%): okay, not great, and the first point on a line, not a trend.

---

## 2026-10-15 · Brew holdout, v2 baseline: as close as the best existing list picked with hindsight

21 decks that appeared from nothing, rebuilt from the day each first appeared (corrected run; every signature card was used). Score: how much of the bot's deck matches the lists players settled on 1-3 months later.

| | All 21 | Specialist (10: combo, reanimator, synergy engines) | Other (11) |
| --- | --- | --- | --- |
| Best existing list, picked with hindsight | 42.6% | 38.2% | 46.6% |
| Sonnet 5.5, v2 | 37.8% | 37.8% | 37.8% |
| Opus 5.5, v2 | **40.6%** | 38.6% | 42.5% |

(Specialist vs. other is Claude Code's first guess at labels, pending the owner's.)

**What it means:**
- **Opus brews land about as close to the final deck as the best list that already existed, and that list could only be found with hindsight.** It beats that oracle on 9 of 21 decks. So v2 isn't just copying: its decks share about half their cards with any one earlier list.
- **About 40% overlap means roughly 24 of 60 cards match what players settled on.** There's a lot of room. That is the number v4 has to move.
- **Clear wins:** Boros Dwarves (50-54% vs. 29%), Pauper Metalcraft (59% vs. 42%), Legacy Creative Technique (30% vs. 13%), Vintage Sewer-Cam (43% vs. 31%). These are decks built around a clear new card or engine, where knowing how cards work matters most.
- **Clear misses:** Standard Aang (22%), Jund Sacrifice (21%), Dimir Excruciator (31% vs. 63%), Fanatic Eldrazi (33%). Worth reading these answers: likely the bot built a different deck around the same cards, which is a brewing choice, not necessarily a mistake.
- **Model gap is small here:** Opus 40.6% vs. Sonnet 37.8%, smaller than in the owner's ratings.

**This is the v4 starting line:** v2 Opus 40.6%, Sonnet 37.8% on the holdout. Success for v4 is moving this number, especially on specialist decks, without the decks becoming copies of existing lists.

Cost: Sonnet $4.15, Opus $8.66.

---

## 2026-10-15 · The brew holdout: every deck that appeared from nothing (and a bug that voided the first run)

**The test.** `scripts/find-new-archetypes.ts` searched all 143,721 lists for decks that appeared from nothing: first lists sharing at most 40 of 60 cards with anything earlier, 15+ lists in the first 90 days, first seen at least 45 days into the format's data, and a strategy label rather than a bare color. 24 qualify; 21 have enough settled lists (days 30-90) to score against. The bot gets the data and cards that existed the day the deck first appeared, plus its signature cards, and is scored by overlap with the lists players settled on. Pioneer Lessons is a port of the Standard deck from two months earlier: it tests porting, not pure brewing, and is flagged rather than dropped. The owner's Frantic Storm doesn't qualify (Premodern data starts 10 days before it) and stays in the round 4 set.

**The baseline is an oracle.** "Closest earlier list" is the best list that existed, chosen with hindsight against what the deck became. No brewer could pick it. It ranges from 13% to 64%.

**Bug, caught in the first results.** v2 left out 8 signature cards it was told to build around; for Boros Dwarves, all three. Two causes, both Claude Code's:
1. The card pool hid cards printed after the cutoff using Scryfall's paper release date, but sets reach MTGO days earlier. The Dwarves deck appeared on MTGO on August 12; its cards' paper date was August 14, so the bot was asked to build around cards it couldn't find.
2. Signature cards were taken from a deck's first 90 days, not its first lists. Sear joined Temur Harmonizer two months after the deck appeared.

**Fix:** a card exists on a date if it's printed by then *or* already played in an MTGO list by then (`CardIndex.asOf(date, seen)`, `FileDataSource.cardsPlayedThrough`). Signature cards come from a deck's first 10 lists and must exist on the cutoff day. The first run (Sonnet $4.04, Opus $9.12) is discarded and rerun. The owner's round 4 items were checked and were not affected.

**Lesson for the post:** rebuilding the past has traps that only show up in results. "Did the bot use the cards it was asked to use?" is now a check worth running on every historical eval.

---

## 2026-10-15 · v4 designed, and the owner redirected it twice

After round 4 the owner asked for the clear takeaway. Claude Code's answer: **"we've made the AI reliable; next we have to make it informed."** Every fix that worked was a check the AI can't argue with (the card exists, the deck is legal, the land count matches real decks). Card choice has no such check, which is why it hasn't improved.

**First proposal (Claude Code):** at each card choice, show what real players of similar decks chose and how many of them there are; follow the crowd when it's big, use judgment when it's small; justify any deviation. The best-of-both check on fill in the blanks suggested a cheaper model could beat Opus this way.

**Owner, redirect 1:** "I don't want it to just be reading from the database though, we are trying to get it to brew not just copy from the lists." Correct, and it exposed a trap: fill in the blanks rewards matching existing lists, so a v4 that copies more would have "won" that test while getting worse at brewing. Fill in the blanks is now a diagnostic, not the target.

**Second proposal:** teach what transfers to a new deck instead of lists: the shape of working decks by type (how many threats, removal, card draw; how combo decks find their pieces) and which cards are best at each job across all decks.

**Owner, redirect 2:** "The principles approach might work for standard aggro and midrange, but not specialist stuff like prison, weird combo decks, and decks that require synergy between cards right?" Also correct. Averages describe fair decks; a prison deck is defined by a lock that hurts you less than the opponent, a combo deck by an exact engine. Round 4 already pointed the same way: on Frantic Storm, a synergy combo with almost no data, Opus got 70% of the real list against 37% for anything in the data. Understanding how cards interact is where the model is strongest.

**Agreed design: two modes** (details in PLAN.md):
- **Fair decks:** principles plus "which cards are best at each job."
- **Specialist decks:** the model's own idea, checked in code: it states its engine or lock exactly, quotes the card text it relies on, and the simulator measures how often it assembles by a given turn. This is where brewed combo decks usually fail in practice (too few pieces, too many cute cards), and it's a number the model can't argue with.
- **Both:** several drafts, keep the one that passes the checks best. The harness only checks; the brewing stays with the model.

**Next:** before changing the harness, build brew to archetype at scale (every deck in Decklist Data's history that appeared from nothing) and measure v2 on it honestly.

---

## 2026-10-15 · Round 4, Track 3: the owner's own prompts, judged blind: a coin flip

The owner judged all 10 Quick Pick pairs (their 5 prompts x Sonnet and Opus, v2 vs. v3), this time with both full decklists on the page (the owner asked for them; differing cards highlighted).

**Result: v2 4 wins, v3 3, 3 ties.** By model: Sonnet v2 2-1 (2 ties), Opus 2-2 (1 tie).

| Prompt | Sonnet | Opus |
| --- | --- | --- |
| Mono red prison (Premodern) | v2 (stronger cards, clearer plan) | v2 (closer to the request) |
| City of Traitors mono black (Premodern) | v2 (stronger cards, closer to the request) | v3 (clearer plan) |
| Mono black Tron (Modern) | v3 | v2 |
| 5 color Solution (Premodern) | tie | v3 (stronger cards) |
| Non-power Vintage | tie | tie |

**Reading:** the harness doesn't decide the outcome. On the same prompt, v3 wins with one model and loses with the other, which is what noise looks like. The reasons the owner gave were mostly "stronger cards" (3) and "clearer plan" (2): card quality, the thing neither harness changes. This matches tracks 1 and 2 and rounds 1-3: the pipeline changes the process, not the card choices.

**What this sets up:** the owner pushed back on the obvious conclusion ("I don't want this to just be 'the answer is just bigger models'"). Round 4 points at a harness lever not yet tried: put the evidence (what real players chose, and how many of them) at the moment of each card choice, and tell the model how much to trust it. The best-of-both check on fill in the blanks says the room exists: Sonnet combined with the data rule would score 8.0 of 12, above Opus alone at 7.7. Success test for v4: a cheaper model with the better harness beating Opus on v2.

---

## 2026-10-15 · Round 4, harness v3: the pipeline still doesn't help

Same 30 items through the step 8 pipeline (intent routing, staged brews). Routing was right: all 20 fill-ins went to "tune", all 5 brew items to "brew"; 3 of the owner's 5 fresh prompts were judged to have a list to start from ("stock").

**Fill in the blanks, average correct out of 12:**

| | Overall | Legacy Tron | Modern Broodscale | Pauper Dimir | Premodern UW Aggro | Vintage Lurrus |
| --- | --- | --- | --- | --- | --- | --- |
| Most played (no AI) | 7.1 | 4.8 | 9.0 | 9.5 | 4.2 | 8.0 |
| Sonnet v2 / v3 | 6.8 / 7.0 | 5.2 / 4.5 | 6.5 / 8.2 | 10.0 / 9.2 | 7.5 / 7.0 | 4.5 / 6.2 |
| Opus v2 / v3 | **7.7** / 7.5 | 5.2 / 5.5 | 8.0 / 8.5 | 10.2 / 9.8 | **9.2** / 8.2 | 5.8 / 5.8 |

No answer dropped a card it was given.

**Brew to archetype** (overlap with the owner's linked list): v3 is close to v2 overall. v3 Opus is the best of all four on Frantic Storm (70% vs. 37% for anything in the data), but worse than v2 on Pauper Dimir Control (52% vs. 65%). Every run still landed below "the closest earlier list" on the four decks with data.

**Reading:** the third time the same answer. The pipeline changes how the bot works, not how well it chooses cards: v2 and v3 are within half a card of each other on the fill-in test. The model is the lever (Opus beats Sonnet in both harnesses), and the data-rich vs. data-thin pattern from v2 holds.

**Track 3 (owner judging):** the 5 fresh prompts, v2 vs. v3 for each model, are 10 Quick Pick pairs: https://claude.ai/artifact/QATiJtne8tTWHVM4zWiS3g (built by `build-pairwise-page.ts --track fresh`; key in `evals/results/round4/quickpick-key.json`).

Cost: v3 Sonnet $6.77, v3 Opus $13.60. All four round 4 runs: $31.58.

---

## 2026-10-15 · Round 4, harness v2: the AI wins where the data is thin

**The test, plainly.** Take a real winning list, remove 12 of its spells, and ask the AI to put 12 back. Count how many it gets right. To know whether that number is good, the same slots are also filled with no AI: "add the cards most other players of this deck use" (most played), and "copy from the closest earlier list" (nearest list). Earlier near-copies of the list are hidden from everyone.

**Average correct, out of 12** (5 decks x 4 different sets of hidden cards):

| | Overall | Legacy Tron | Modern Broodscale | Pauper Dimir | Premodern UW Aggro | Vintage Lurrus |
| --- | --- | --- | --- | --- | --- | --- |
| Most played (no AI) | 7.1 | 4.8 | **9.0** | 9.5 | 4.2 | **8.0** |
| Nearest list (no AI) | 6.5 | 5.8 | 6.5 | 5.8 | 8.0 | 6.8 |
| Sonnet 5.5, v2 | 6.8 | 5.2 | 6.5 | 10.0 | 7.5 | 4.5 |
| **Opus 5.5, v2** | **7.7** | 5.2 | 8.0 | **10.2** | **9.2** | 5.8 |

**What it means.** Opus beats the no-AI rule slightly overall (7.7 vs. 7.1), Sonnet doesn't (6.8). The interesting part is where each wins:
- **Popular decks: the crowd wins.** Broodscale has about 1,000 lists; "copy what most people play" gets 9 of 12. The AI gets 8, probably by second-guessing the crowd. Sonnet does worst on Vintage (4.5 vs. 8.0).
- **Rare decks: the AI wins.** Premodern UW Aggro had only 9 earlier lists, too few for the rule (4.2). Opus got 9.2 by knowing which cards make sense.

**Brew to archetype agrees.** Both models landed below "the closest earlier list" on 4 of 5 decks; the exception is Frantic Storm, brewed with almost no data, where they got 58-65% of the real list against 37% for anything in the data.

**Design consequence (first one round 4 has produced):** trust the data when many people play a deck; rely on the model when few do or the idea is new. The second case is exactly when people ask for a brew. This also answers part of "is it even possible": the model's judgment is real, but it is worth most exactly where data runs out.

Cost: Sonnet v2 $3.89, Opus v2 $7.32 (30 items each). Small sample: 20 fill-in items on 5 decks, 5 brew items.

---

## 2026-10-15 · Round 4 runner built, and the first design flaw it caught

**Rebuilding a past moment.** Tracks 1 and 2 must not let the bot see the future. Added: first-printing dates in the card index (`CardIndex.asOf`), and a date cut on the data (`FileDataSource.cut`). A run dated May 15 sees no list from May 15 on and no card printed after it (1,208 of 32,901 cards hidden as of mid-May 2026). The data loader now also drops Decklist Data's "Cards (N%)" junk.

**Owner's privacy call (via Claude's own note):** player names were dropped from the saved lists; decks are linked by id (`decklistdata.com/deck/<id>`), which redirects to the deck page. Earlier commits still contain names; the history scan before going public will cover it.

**The flaw, caught by the baselines before any money was spent.** Two no-model baselines for fill in the blanks: "most played" (add the copies most of the archetype's recent lists run) and "nearest list" (fill from the earlier list closest to what's left). On the first version, "nearest list" restored **all 12 hidden cards** for Tron and Broodscale: near-identical lists had been posted before the owner's picks (429 earlier Broodscale lists within 6 cards of it; Legacy Tron's "new" list had an identical twin 6 days earlier). The test would have measured whether the bot can look up a list, not whether it can choose cards.

**Fix:** every earlier list sharing 54+ of 60 main deck cards with the owner's list is hidden from the bot and from the baselines (`NEAR_COPY`). After that, baselines restore about 4-10 of 12 (Tron and UW Aggro hardest), so there is room to measure judgment.

**Scoring** (`scripts/score-round4.ts`): fill in the blanks counts exact restores plus same-job replacements (sharing a function tag carried by under 2% of cards); brew to archetype measures overlap with the owner's list and with lists posted in the 60 days after, against the closest visible earlier list.

**Smoke test (Sonnet 5.5, harness v2, $0.38):** UW Aggro fill-in restored 9 of 12 (most played 5, nearest list 8). Fanatic Eldrazi brew overlapped the real list 28%, below the 55% the closest earlier list already had. Two items are not a result; they show the runner works.

---

## 2026-10-15 · Round 4 items are in (owner-written)

The owner wrote all 15 items in one message: 5 Decklist Data links for fill in the blanks, 5 for brew to archetype, and 5 brew requests in their own words ("Mono red prison but in Premodern?", "Most competitive non-power nine vintage deck?", "Mono black tron in Modern?", "City of Traitors mono black premodern deck?", "Best 5 color Solution deck in premodern?"). Every named card was checked against the card index first (the Tainted Pact lesson): all legal where named.

**Getting the lists.** `scripts/fetch-dld-deck.ts` reads a public deck page's own plain-text list (pages also embed related decks, so it matches the deck by URL). Saved under `evals/round4/lists/`.

**A Decklist Data bug found on the way.** The 2026-05-15 Fanatic Eldrazi list stores five junk sideboard lines like "29 Cards (48%)", so the site shows a 100-card sideboard. None of the 30,102 lists from the last 90 days have it. Junk lines are dropped with a warning; the fix is queued as a separate Decklist Data task.

> **Update, same day:** the full-history export showed it was far bigger than one list: **34,450 of 143,721 lists (24%)**, every format, Dec 2025 - May 2026. The scraper was fixed in May and duplicate rows were removed then, but the surviving rows kept the junk in stored cards and in the copy/export text. Decklist Data PR #188 adds a dry-run-first cleanup. **Done the same day:** owner merged it; dry run matched the export exactly (34,450); 100 lists cleaned and spot-checked on the live site; the rest in three runs (the first hit the workflow's 60-minute limit; the script resumes where it stopped). 34,432 lists cleaned, about 224,000 junk card rows removed; 18 left on purpose (each a polluted duplicate of a list already stored clean). A final dry run finds nothing else to fix, and the Fanatic Eldrazi list that started it now copies with its real 15-card sideboard. For decklists.ai this matters directly: any analysis over full history must filter these names (the round 4 scripts do).

**Full history export.** Brew to archetype needs data from before each deck existed, so the existing read-only export ran with `days=0`: 143,721 lists (from 2025-07-01; Premodern from 2025-12-08), gitignored. `scripts/archetype-history.ts` finds each archetype's first list, its breakout, and its signature cards.

**What the owner's brew-to-archetype picks turned out to be:**
- **Fanatic Eldrazi (Modern):** the linked list is the archetype's first ever (2026-05-15), with 386 after. The cleanest case.
- **Frantic Storm (Premodern):** also the first ever (2025-12-18), but Premodern data starts only 10 days earlier, so it tests brewing with almost no data.
- **Dimir Control (Pauper):** the linked list is exactly the breakout date (9 scattered lists before, 88 after).
- **Tron (Legacy) and Soultrader Combo (Modern):** existing archetypes; the linked lists are new versions. Tron's added Petrified Hamlet (47% of Tron lists before, 92% in the next 3 weeks), Chalice of the Void and Cityscape Leveler. These test whether the bot finds the next step for a known deck, a different and useful question.

The owner's links matched breakout dates without being told to look for them, which is a small sign their picks carry real knowledge the data can confirm.

---

## 2026-10-15 · Round 4 planned: a fresh eval set, written by the owner

**Why start over.** Four lessons from rounds 1-3:
- Stock requests carry no signal: every model returns the same list, so they end as ties and spend judging time.
- Brews are where models differ, and where quality is still unsolved.
- The owner's judging time is the scarce resource (about 50 pairs per sitting; simpler questions give more accurate picks).
- **We were tuning on the test.** v3's rules were written to fix failures on the same 24 prompts used to judge it. Results on those prompts no longer count as evidence.

**The new set: three tracks, 5 items each, all written by the owner** (owner: "5 evals each, and I can come up with them"). Claude Code doesn't see them before the harness is frozen.
1. **Fill in the blanks (automatic).** Take a winning list, hide 12 nonland cards, and have the bot finish it. Score the hidden cards it restores (partial credit for the same function tag) against a dumb baseline that adds the archetype's most-played cards. If the bot can't beat the baseline, its card judgment adds nothing. About 4 hide patterns per deck, so 5 decks give about 20 tests.
2. **Brew to archetype (automatic).** Decks that began as brews and became archetypes. The bot sees only data from before the deck existed, plus 2-3 key cards; score is closeness to the list players settled on. The only objective test of brewing itself. Needs an export reaching back before each breakout.
3. **Fresh brews (owner-judged).** 5 new brew requests, v2 vs. v3, 10 Quick Pick pairs.

Tracks 1 and 2 grade construction against what real players did without using the owner's time; track 3 keeps a human check on what scores can't see. Template: `evals/round4/ITEMS.md`.

Round 3 (v2 vs. v3 on the old prompts) can still be finished for the record, but it is no longer the deciding test.

---

## 2026-10-15 · Judging simplified again: Quick Pick

After 23 of 48 round 3 pairs (v2 6 wins, v3 2, 15 ties; on brews v2 5, v3 1), the owner: "I think we need to simplify it even more for accurate scoring by me."

**What made it tiring:** reading two full 75-card lists that are mostly the same, then answering five things (two yes/no per answer plus the pick).

**Quick Pick** (`evals/rating/quickpick-template.html`, same page and link, same pair ids, so the 23 earlier picks carry over):
- **Only the cards that differ:** "Only in A" and "Only in B" side by side; shared cards folded into one expandable line. A pair becomes 10-20 card lines to compare instead of about 150.
- **One question:** "Which would you rather play for this request?" A, Same, or B. It is the same pick as before, so round 3 stays comparable; the yes/no questions are dropped for the remaining pairs.
- **Each answer's opening two sentences** stay, so the rater sees what each deck is going for.
- **Optional one-tap reasons:** closer to the request, better mana, stronger cards, clearer plan, fewer odd cards. Cheap qualitative data with no typing.
- **Keys 1/2/3, auto-advance** to the next unjudged brew pair; Previous to change a pick.

The lesson for the post: the judging interface is part of the measurement. Each simplification (1-5 scores, then pairwise with yes/no, then one diff-based question) traded detail for accuracy and stamina, and the owner's comfort was the right signal to follow.

---

## 2026-10-15 · Scorer v0, part 1: card choice doesn't predict results (a negative result)

While the owner judges the remaining brew pairs, the first piece of the scorer: does card choice within an archetype predict results? `scripts/scorer-card-performance.ts`.

**Method, built to avoid fooling ourselves:** train on Challenge and qualifier lists from days 31-90 before the newest event (11,846 lists): for each format, strategy and main deck card with at least 8 lists on each side, the match win rate with the card minus without, shrunk toward zero for small samples. Test on the last 30 days (5,533 lists, 109 archetypes with 10+ lists): within each archetype, does the sum of a list's card effects rank lists by their actual win rate? Baseline: "stockness," the share of the archetype's core a list plays. Leagues are excluded because only 5-0 League lists are published, so they carry no result variance.

**Result: nothing.** Card-effect score vs. actual win rate: weighted Spearman **-0.002**, positive in 50 of 109 archetypes, a coin flip. Stockness: **-0.011**, 51 of 109. The largest training effects (Forth Eorlingas! +6.1 points in Legacy Ocelot Aggro, Dress Down -5.4 in Vintage Lurrus PO) did not carry over and are almost certainly noise.

**Why:** a Challenge list plays about six matches, so one list's win rate swings by roughly 20 points from variance and pilot skill; with about 20 lists on each side, only effects of about 6 points or more are detectable. Real card choices within an archetype likely move results by 1-3 points.

**What it changes:** published MTGO records can't teach card quality within an archetype at this scale. The quality signal has to come from what the field converges on (adoption), structural checks (simulation, roles, synergy), and the owner's judgments, which now carry more weight. Records still help at the archetype level, where samples run to hundreds of lists. A more powerful test would need all history (`--days 0` export) or per-match data MTGO doesn't publish.

**Next scorer pieces:** synergy (co-occurrence across 30,102 lists) and role coverage, validated against the owner's "would play" answers once round 3 is complete.

---

## 2026-10-15 · Round 3, partial: v3 did not beat v2

The owner judged 17 of the 48 round 3 pairs, then: "I did 16 pairs and got a little tired." Unblinded (the analysis script was also generalized: it had hard-coded v1 vs. v2 as the two sides):

| | v2 | v3 (step 8 pipeline) |
| --- | --- | --- |
| Pairs won | **4** | 1 |
| Ties | 12 | 12 |
| Did what was asked | 100% | 94% |
| Would play | **81%** | 71% |
| Brews only (8 pairs) | 3 wins, 86% would play | 0 wins, **50% would play** |

v3 lost Dream Halls without storm (Opus), Old School (Opus), Peter Parker's Camera (Sonnet) and Legacy "turn 1" (Sonnet); won Vintage artifact aggro (Sonnet); the rest tied. The owner marked v3's mono green storm "did not do what was asked."

**Reading, with the caveat that 5 decisive pairs can't settle anything:** pushing for originality made brews more original (copy rate 76% to 65% for Opus) but weaker. The novelty rules (at most 60% one list, engine at least 25% of spells) push the deck away from proven cards, and without a judge of quality the model can't tell a good original choice from a bad one. The pipeline knows *how* to brew but has nothing telling it *what is good*. That is the gap the scorer in the research plan targets, and the honest result for the post: structure alone made brews more faithful and more original, not better.

**The owner's fatigue is a finding too:** about 50 judged pairs, roughly an hour of expert time, is the practical limit for one person. Human judgment doesn't scale; a scorer validated on real results has to carry most of the evaluation.

**Owner's call: finish the brews only.** The remaining 31 pairs are 24 brews and 7 stock/tune/impossible pairs (mostly ties so far). The page gained a "Brews only, not yet judged" toggle that makes Previous/Next skip to unjudged brew pairs; pair ids are unchanged, so earlier picks stayed attached. The scorer's data check started meanwhile: 29,910 of the 30,102 exported lists carry a win-loss record; League lists are all 5-0 (only 5-0s are published), while Challenge lists span 0-3 to 10-0, which is the variance a card-performance measure needs.

**Next:** the owner judges the remaining brew pairs; meanwhile build scorer v0 (card performance, synergy, role coverage from Decklist Data) and validate it against real records (5-0 vs. worse lists within an archetype) and the owner's picks.

---

## 2026-10-14 · v3 objective results and round 3 judging

Opus 5.5 finished the full v3 run at $18.28 (above the ~$15 estimate: its brews run long, up to $1.48 and 7.7 minutes for Dream Halls), with 22 of 24 decks; its two failures were the same lock bugs. Every failed prompt for both models (2 for Opus, 3 for Sonnet) was rerun on the fixed code ($3.69) and all produced decks. The merged results (`evals/results/harness-v3/merged/`, each noting which answers are reruns) give **24 of 24 decks for both models, all passing the checker, no invented cards.**

| Model | Harness | Decks | Mana warnings | Lands off real archetype | "Something new": avg copy rate | 80%+ copies | Cost (24 prompts) | Median time |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Opus 5.5 | v2 | 24 | 6 | 0.60 | 76% | 6 of 14 | $9.31 | 93 s |
| Opus 5.5 | **v3** | 24 | **3** | 1.09 | **65%** | **4 of 14** | $18.40 | 105 s |
| Sonnet 5.5 | v2 | 24 | 5 | 1.34 | 69% | 5 of 14 | $5.21 | 66 s |
| Sonnet 5.5 | **v3** | 24 | **4** | **0.85** | **62%** | **3 of 14** | $9.39 | 138 s |

Copying fell again (Opus 87% in v1, 76% in v2, 65% in v3), and fewer mana warnings despite more original decks, which is the simulator and the shell stage at work. Cost about doubled. A scoring-script slip along the way: the scorer and novelty scripts only recognized v2's folder, so v3 first showed up unlabeled with costs recomputed without caching ($44); fixed to recognize any harness version. Caveat: decks accepted before the lock fixes may have been steered away from cards the over-strict color lock rejected; only the color-locked prompts could be affected.

**Round 3 published: Brew Head-to-Head, Round 3**, 48 blind pairs (v2 vs. v3 for Opus and Sonnet on all 24 prompts; v3 on the left in 25, v2 in 23), same three questions as round 2. v2's Old School answers are its reruns on the fixed card index. Pick store checked reachable and empty.

---

## 2026-10-14 · v3 full run: three lock bugs found and fixed

Sonnet 5.5 finished the v3 run with a deck for **21 of 24** prompts ($8.80). The three failures had submissions rejected by the new code-level locks until the stage ran out of steps. The results file didn't say why, so the runner now records each rejected submission's reasons; a rerun of the three ($1.02) showed **all three were Claude Code's bugs in the locks, not model failures:**
1. **Legacy sideboard-only:** the color lock rejected Tamiyo, Inquisitive Student, because it checked color identity, which counts a transform card's back face and ability costs. That is the Commander rule, not how 60-card colors work. And a tune shouldn't get a color lock at all: the player's list decides its colors.
2. **Living End plus Scam:** the lock required a card named "Scam," a deck name, so it could never be satisfied. Only real cards can be required now. (The model also passed one search filter as a string instead of a list; both are accepted now.)
3. **Atraxa Commander:** the lock counted Atraxa only in the main deck, not the commander zone, and rejected basic lands as "not looked up." The engine stage also allowed 2-of copies in a singleton format, a possible deadlock; it now enforces the format's copy limit.

**Fixes:** 60-card color locks judge the front face's mana cost (lands left to the mana checks), Commander formats keep color identity; tunes get no color lock; required cards must be real cards; locked cards count the commander zone; basic lands never need a lookup; engine copies capped at the format limit. Regression tests for each (41 passing). Small mistake repeated: a stray shell command waited for input and stalled a debug run; stopped and rerun.

Opus 5.5 started before the fixes and hit the same Atraxa failure. Next: rerun every failed prompt for both models on the fixed code and merge the reruns into the comparison, noting which answers are reruns.

---

## 2026-10-14 · The research question: how do models get good at deck construction?

Asked how the work was going, Claude Code flagged that v3 may not beat v2 on quality: code can make a brew faithful and its mana sound, but whether the deck is *good* may depend on how well models understand deck construction. The owner: "How do we fix the 'models figure out deck construction' problem? That is the key thing we are researching."

**Decomposing the skill:**

| Part of deck construction | Who does it well now |
| --- | --- |
| Legality, counts, mana, curve | code (steps 4-5) |
| Which cards exist and what they do | card search |
| What the format plays and how fast | the data |
| How good a card is in this deck | nobody: the model guesses from memory |
| Whether these 60 cards work together | nobody: the model guesses |
| Iterating: try, measure, improve | barely: one critique pass, no real feedback |

**The thesis: separate generating from judging.** Judging a deck is easier than building one. With a scorer that rates a decklist without a human, construction becomes search: generate candidates, score them, keep the best, try swaps, keep improvements. The model proposes; the scorer decides.

**Scorer v0, from Decklist Data:**
1. **Card performance** within an archetype: do lists with card X finish better than lists without it (records, placements, game win rate)? The owner's existing `spike-sideboard-card-winrates.ts` already explored this.
2. **Synergy:** which cards are played together across 30,102 lists, so even a brew's card pairs can be checked against real decks.
3. **Role coverage:** removal, threats, card flow per style, compared with real decks (archetypes agreed on land count within about one land; roles likely agree too).
4. **Simulation:** level 1 now; a rough aggro clock later.

**Validation before trusting it:** within an archetype, does it rank 5-0 lists above 2-3 lists (real results, no AI involved)? Does it agree with the owner's pairwise picks (36 so far, 48 more in round 3)?

**Then:** search in the pipeline (several candidates, swap-by-swap improvement) and a round 4 pairwise against v3; the brew holdout test (decks that began as brews and became archetypes, rebuilt from pre-emergence data) as the generalization check that guards against overfitting v3 to the 24 prompts; an AI judge calibrated on the owner's picks, and eventually a simple model predicting those picks from the scorer's features, which would itself be a finding about what makes a deck good.

**Candidate thesis for the post:** models can't yet build good decks by intuition, but they can when paired with a judge built from real tournament data. The data's real value is as a measure of quality, not a source of lists to copy.

---

## 2026-10-14 · Full v3 run started

The owner asked whether round 3 uses the same eval questions. Yes: "did it do what was asked," "would you play it," and the A/B/tie pick, unchanged so v1 vs. v2 and v2 vs. v3 sit on the same yardstick. A fourth "is it really a brew" question was considered and dropped: "did it do what was asked" already counts an existing deck with the requested card tacked on as a No, and the copy rate measures it in code. **The owner chose to run both Opus 5.5 and Sonnet 5.5 again** (estimated ~$23) on all 24 prompts with the step 8 pipeline (v3), for a blind pairwise round against v2. For the comparison, v2's Old School answers are its reruns on the fixed card index (`evals/results/harness-v2/merged/`), so v2 isn't penalized for the card-data bug.

---

## 2026-10-14 · Step 8: the pipeline, end to end

**Built:**
- **A reusable stage runner** (`runStage` in `src/harness/run.ts`): the v2 loop with a chosen system prompt and toolset per stage. v2 runs on top of it with its original toolset, so v2 results stay comparable.
- **Rules enforced in code, not prompt wording** (`src/harness/tools.ts`):
  - `submit_engine`: the brew's plan (thesis, win condition, target turn, what it beats and loses to) and its engine cards. Rejected unless every card came from a tool, is legal, fits the requested colors, and includes every card the player named. Once accepted, the engine is locked.
  - `submit_deck` locks: locked engine cards at their planned counts; the requested colors; the format; and for brews a **novelty check** (at most 60% of the main deck card for card one real list; engine cards at least 25% of nonland cards). Initial thresholds, to calibrate with the brew holdout test.
  - `copyRate` added to the data source so the novelty check runs against the same 90-day lists.
- **The pipeline** (`src/pipeline/run.ts`, prompts in `src/pipeline/prompts.ts`): stage 0 reads the request (Sonnet 5.5); code checks every named card against the card pool in the target format; named illegal cards send the request down the impossible path. Paths: **stock** (latest top list as the base, changed only for a stated reason), **tune** (keep the player's plan; every change names a matchup; sideboard-only keeps the main deck exactly), **impossible** (say so in the first sentence using the checked facts, then build the closest real deck with honest odds), **brew** in three stages: **engine** (decklist tools hidden), **shell** (borrow mana and interaction from the closest real strategy; check and simulate against it), **critique** (review against the meta; engine locked; one revision). Every path's prompt requires measured claims to cite numbers and judgment to be marked, and bans unmeasured rankings like "the fastest."
- 39 tests pass, including the engine and deck locks.

**Smoke test, Sonnet 5.5, 4 prompts, $1.40:**
- **Stock Goblins** took the stock path: 6 cents.
- **Tainted Pact in Modern** took the impossible path because the code check found Pact illegal. First sentence: "Tainted Pact isn't legal in Modern, so the classic Thassa's Oracle + Tainted Pact combo can't be built." It explained why Spoils of the Vault doesn't substitute, then built the nearest working Oracle deck from a real Song of Creation list, citing "Oracle in only 15.6% of lists (a measured figure)."
- **Mono green storm**, brew path: engine of Hunting Pack, Sprouting Vines, Land Grant, Lotus Petal, Vitalize, Emerald Charm, Rofellos and mana elves (target turn 5), shell borrowed from Elves. The critique stage cut redundant untap effects ("14 untap effects, which is too many") for Birds of Paradise.
- **Replenish without blue**, brew path: a white Lion's Eye Diamond build (discard the hand while Replenish is being cast; Opalescence, Parallax Wave, Worship, Solitary Confinement). **The critique used the simulator to fix its own mana:** "In the simulation of the submitted 21-land list, 21.8% of games were land-screwed," so it went to 22 lands.
- Cost: brews about $0.53-0.62 on Sonnet, roughly 1.8x v2; stock requests got cheaper.

---

## 2026-10-14 · Step 8: the level 1 simulator

**Built:** `src/sim/goldfish.ts` plays a deck's opening turns 5,000 times with a seeded shuffle (reproducible): land drops (choosing the land that adds a color the hand needs), colored mana from lands, Moxen, and cheap mana rocks and creatures (creatures can't tap the turn they arrive), and one London mulligan. No card abilities beyond making mana. It reports mulligan rate, all land drops through turn 4, two-or-fewer lands on turn 4, flood (8+ lands seen by turn 6), whether every affordable spell in hand is castable by color each turn, and how often each engine group is in hand and castable by a target turn. Exposed to the bot as a `simulate` tool, optionally run side by side on a real strategy's latest top list. Tool access can now be limited per pipeline stage.

**Calibrating on real decks, and a fix along the way:**
- First run: Premodern Goblins looked right (15% mulligans; Goblin Lackey castable on turn 1 in 36% of games, against about 40% from exact draw math before mulligans). But low-land decks mulliganed far too often (Mono-Red Rally 31%, Stiflenought 35%), because the keep rule assumed every deck wants 2-5 lands. Real players keep one-landers in a 16-land deck.
- Fix: the keep range now follows the deck's land ratio. After: Goblins 15%, Mono-Red Rally 9%, Living End 11%, Stiflenought 10%, Dimir Tempo 9%.
- Low-land decks still show high "two or fewer lands on turn 4" rates (Stiflenought 37%), and that is fine: those decks are built to run on two lands. So the pipeline judges a brew's numbers **against its donor archetype's numbers**, not fixed thresholds, the same lesson as the land counts in step 5.

37 tests pass, including reproducibility and a color-screw case (blue double-pip spells with mostly red lands).

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
