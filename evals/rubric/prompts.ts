/**
 * Hand-rated brew prompts (step 2), 24 total. The owner rates every output 1-5 on
 * each dimension; the mean is the rubric score for a run.
 *
 * Mix: formats with Decklist Data coverage and formats without it,
 * named-card brews, archetype twists, stock requests, and one request
 * that cannot be met as asked.
 */

export const RUBRIC_DIMENSIONS = [
  { key: "plan", label: "Coherent plan: clear way to win, cards serve it" },
  { key: "legal", label: "Legal list: right size, copies, and format legality" },
  { key: "mana", label: "Working mana: land count, colored sources, curve" },
  { key: "shell", label: "Current shell: interaction and support the field plays now" },
] as const;

export type RubricDimension = (typeof RUBRIC_DIMENSIONS)[number]["key"];

export interface RubricPrompt {
  id: string;
  format: string;
  /** Whether Decklist Data has results for this format. */
  hasData: boolean;
  prompt: string;
  /** What a good answer must do, for the rater. */
  lookFor: string;
  /**
   * 100-card singleton prompts. Commander support lands after step 10,
   * so these are scored and reported separately from the headline score.
   */
  afterLaunch?: boolean;
}

export const RUBRIC_PROMPTS: RubricPrompt[] = [
  {
    id: "premodern-mono-g-storm",
    format: "Premodern",
    hasData: true,
    prompt: "Make a mono green storm deck in Premodern.",
    lookFor:
      "Uses the green storm cards that exist (Hunting Pack, Sprouting Vines), an elf mana and untap engine, enough payoffs or a second way to win, and says plainly that it is a brew.",
  },
  {
    id: "premodern-stock-goblins",
    format: "Premodern",
    hasData: true,
    prompt: "Give me a stock Goblins list for Premodern.",
    lookFor: "Matches recent winning lists closely. No pet cards.",
  },
  {
    id: "premodern-replenish-twist",
    format: "Premodern",
    hasData: true,
    prompt: "Build a Replenish deck in Premodern that doesn't play blue.",
    lookFor: "Finds a non-blue enchantment engine or says why the request is weak and offers the closest real option.",
  },
  {
    id: "modern-named-two-cards",
    format: "Modern",
    hasData: true,
    prompt: "Build a Modern deck around Thassa's Oracle and Tainted Pact.",
    // Tainted Pact is not legal in Modern (legal in Legacy); this tests catching an impossible request.
    lookFor:
      "Tainted Pact is not legal in Modern. A good answer says so, then builds the closest legal Thassa's Oracle deck or points to Legacy, where the combo is legal.",
  },
  {
    id: "modern-tribal-brew",
    format: "Modern",
    hasData: true,
    prompt: "I want a Modern Merfolk deck that can beat the current top decks.",
    lookFor: "Current Merfolk shell, sideboard aimed at the actual top decks.",
  },
  {
    id: "modern-off-meta-color",
    format: "Modern",
    hasData: true,
    prompt: "Make a fun mono white control deck for Modern leagues.",
    lookFor: "Real win conditions, enough removal and card flow, honest about strength.",
  },
  {
    id: "legacy-sideboard-only",
    format: "Legacy",
    hasData: true,
    prompt: "Here's my Legacy Dimir Tempo main deck, build me a sideboard for the current meta. [main deck pasted in eval]",
    lookFor: "Fifteen cards aimed at the top decks by share, castable in UB, no anti-synergy.",
  },
  {
    id: "pauper-budget-aggro",
    format: "Pauper",
    hasData: true,
    prompt: "Build a fast red aggro deck for Pauper.",
    lookFor: "Commons only, low curve, around 17-19 lands, current burn suite.",
  },
  {
    id: "pioneer-named-card",
    format: "Pioneer",
    hasData: true,
    prompt: "Build a Pioneer deck around Greasefang, Okiba Boss that isn't the usual list.",
    lookFor: "Keeps the engine, changes the shell meaningfully, still assembles reliably.",
  },
  {
    id: "vintage-restricted",
    format: "Vintage",
    hasData: true,
    prompt: "Make a Vintage artifact aggro deck.",
    lookFor: "Respects the restricted list, uses the Moxen and power that fit, real plan.",
  },
  {
    id: "standard-midrange",
    format: "Standard",
    hasData: true,
    prompt: "Give me a strong Golgari midrange list for Standard.",
    lookFor: "Only Standard-legal cards, current removal suite, sound curve.",
  },
  {
    id: "legacy-impossible",
    format: "Legacy",
    hasData: true,
    prompt: "Make a Legacy deck that wins on turn 1 every game.",
    lookFor: "Says this is impossible, offers the fastest real option with honest odds.",
  },
  {
    id: "timeless-no-data",
    format: "Timeless",
    hasData: false,
    prompt: "Build a Timeless reanimator deck.",
    lookFor: "Timeless-legal cards only, labels itself as built from card knowledge, sound mana.",
  },
  {
    id: "historic-no-data",
    format: "Historic",
    hasData: false,
    prompt: "Make an Elves deck for Historic.",
    lookFor: "Historic-legal elves engine, borrows from nearby-format data where it fits, says what is unverified.",
  },
  {
    id: "oldschool-no-data",
    format: "Old School",
    hasData: false,
    prompt: "Build an Old School 93/94 control deck.",
    lookFor: "Era-legal cards, the restricted list, a classic plan. No modern cards.",
  },
  {
    id: "penny-no-data",
    format: "Penny Dreadful",
    hasData: false,
    prompt: "Make a Penny Dreadful burn deck.",
    lookFor: "Only cards legal this season, labels itself as built from card knowledge.",
  },
  {
    id: "premodern-paste-and-tune",
    format: "Premodern",
    hasData: true,
    prompt: "Tune this Premodern list for the current meta. [list pasted in eval]",
    lookFor: "Targeted swaps with reasons, keeps the owner's plan, fixes mana issues.",
  },
  {
    id: "modern-combine-strategies",
    format: "Modern",
    hasData: true,
    prompt: "Combine Living End and Scam into one Modern deck.",
    lookFor: "Says whether the two plans fight, builds the version that works or explains why not.",
  },
  {
    id: "pauper-named-common",
    format: "Pauper",
    hasData: true,
    prompt: "Build a Pauper deck around Kiln Fiend.",
    lookFor: "Cheap spell density, protection, enough payoff redundancy.",
  },
  {
    id: "premodern-dream-halls-no-storm",
    format: "Premodern",
    hasData: true,
    prompt: "Build me a Premodern Dream Halls deck that doesn't win with storm.",
    lookFor:
      "Keeps the Dream Halls engine (free spells by discarding a same-color card) but wins another way, with enough card flow to feed the discards. No storm cards.",
  },
  {
    id: "any-format-peter-parkers-camera",
    format: "Any",
    hasData: true,
    prompt: "Build a deck that best utilizes Peter Parker's Camera.",
    lookFor:
      "Picks a format where the Camera is legal and says why. Finds activated or triggered abilities worth copying three times, enough of them to make a 1-mana artifact matter.",
  },
  {
    id: "commander-atraxa-proliferate",
    format: "Commander",
    hasData: false,
    prompt: "Build a Commander deck with Atraxa, Praetors' Voice that's all about proliferate.",
    lookFor:
      "Exactly 100 singleton cards inside Atraxa's four colors, a real proliferate engine and payoffs, ramp and draw for a multiplayer game, about 36-38 lands.",
    afterLaunch: true,
  },
  {
    id: "duel-commander-red-aggro",
    format: "Duel Commander",
    hasData: true,
    prompt: "Build an aggressive Duel Commander deck with a red commander.",
    lookFor:
      "Picks a commander legal in Duel Commander and says why, 100 singleton, a fast curve for a 1-on-1 game at 20 life, and interaction the Duel Commander field actually plays.",
    afterLaunch: true,
  },
  {
    id: "premodern-vague",
    format: "Premodern",
    hasData: true,
    prompt: "Something weird but competitive for Premodern.",
    lookFor: "Offers distinct directions, picks one, still plays real interaction.",
  },
];
