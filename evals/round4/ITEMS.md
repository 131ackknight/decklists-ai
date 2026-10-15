# Round 4: fresh evals (owner-written)

Five items per track, written by the owner. Claude Code has not seen them, so the harness can't be tuned to them.
Owner's items as given on 2026-10-15. Lists are saved under `lists/` (fetched with `scripts/fetch-dld-deck.ts`).

---

## Track 1: Fill in the blanks (automatic)

Pick 5 real, strong decks. I take a recent winning list of each, hide 12 nonland cards, and ask the bot to finish it.
Score: how many hidden cards it restores (partial credit for a card that does the same job), compared with
"just add the archetype's most-played cards." Each deck gets about 4 different sets of hidden cards, so 5 decks give about 20 tests.

Best picks: decks where card choice takes real judgment (flex slots, tech cards), not decks where every list is the same 75.

| # | Format | Deck (archetype name, a Decklist Data link, or paste a list below) | Optional: cards you'd want hidden |
| --- | --- | --- | --- |
| 1 | Modern | Broodscale Combo: https://decklistdata.comhttps://decklistdata.com/deck/cmuscc7r10004w5w727kox05o | |
| 2 | Pauper | Dimir Control: https://decklistdata.comhttps://decklistdata.com/deck/cmv6y8rjg00i8otilgribphgn | |
| 3 | Vintage | Lurrus PO: https://decklistdata.comhttps://decklistdata.com/deck/cmv4pghsj0093roigyt2td159 | |
| 4 | Legacy | Tron: https://decklistdata.comhttps://decklistdata.com/deck/cmusth9d10014uy30jm289nov | |
| 5 | Premodern | UW Aggro: https://decklistdata.comhttps://decklistdata.com/deck/cmv8huf0g000g14euykajsvan | |

---

## Track 2: Brew to archetype (automatic)

Pick 5 decks that started as someone's brew and became a real archetype. The bot gets only the data from before
the deck existed, plus its 2-3 key cards, and has to brew it. Score: how close it gets to the list players settled on.

The month it broke out matters most: I can only hide the future if Decklist Data has lists from before then.
If one is too old for our data, I'll say so and you can swap it.

| # | Format | Deck | Key cards the bot is given (2-3) | Roughly when it broke out |
| --- | --- | --- | --- | --- |
| 1 | Premodern | Frantic Storm: https://decklistdata.comhttps://decklistdata.com/deck/cmpmhudbb09yh621jkm7zk1gg | Sapphire Medallion, Helm of Awakening, Brain Freeze (proposed) | First list ever, 2025-12-18 (Premodern data starts 2025-12-08, so this is a near no-data brew) |
| 2 | Pauper | Dimir Control: https://decklistdata.comhttps://decklistdata.com/deck/cmu02v6mf001f2h80gwpb8t9h | Murmuring Mystic, Thorn of the Black Rose (proposed) | Breakout 2026-09-13 (9 scattered lists before; 88 after) |
| 3 | Legacy | Tron: https://decklistdata.comhttps://decklistdata.com/deck/cmt4n0tib00wileht99fykdu4 | Karn, the Great Creator, The One Ring (proposed) | Archetype existed since data began; this list's new tech: Petrified Hamlet (47% of lists before, 92% after), Chalice of the Void, Cityscape Leveler |
| 4 | Modern | Soultrader Combo: https://decklistdata.comhttps://decklistdata.com/deck/cmuyvioyz004wq96mt8pp9b9z | Warren Soultrader, Gravecrawler, Marionette Apprentice (proposed) | Archetype since 2025-07; this list's new tech: Darklight Phoenix, Buried Alive, Eyetwitch, The Sackville-Bagginses (newest list, none after) |
| 5 | Modern | Fanatic Eldrazi: https://decklistdata.comhttps://decklistdata.com/deck/cmpdf381w0n4oj4ikuth14322 | Fanatic of Rhonas, Slumbering Trudge, Fight Rigging (proposed) | First list ever, 2026-05-15 (386 lists after) |

---

## Track 3: Fresh brews (judged by you, Quick Pick)

5 brew requests, written the way you'd actually ask a friend. Any format, with or without data.
Each one gets a v2 and a v3 answer; you judge 10 pairs with Quick Pick (about 3-4 minutes).

Optional "a good answer would..." note: what you'd look for. It's only used to show you a reminder while judging,
never sent to the bot.

| # | Format | Request (exact words) | Optional: a good answer would... |
| --- | --- | --- | --- |
| 1 | Premodern | Mono red prison but in Premodern? | |
| 2 | Vintage | Most competitive non-power nine vintage deck? | |
| 3 | Modern | Mono black tron in Modern? | |
| 4 | Premodern | City of Traitors mono black premodern deck? | |
| 5 | Premodern | Best 5 color Solution deck in premodern? | |
