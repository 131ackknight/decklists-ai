import { createHash } from "node:crypto";
import type { SiteDeck } from "./events";
import type { Store } from "./store";

/**
 * R-03: before a brew, in this order: screen (D-011), 24 h cache, per-IP limit, site-wide daily cap
 * (D-003). Refusals and cache hits use no slot; `release()` gives a started brew's slots back when it
 * fails, `save()` caches a finished deck. Days are UTC. Keys as in SPEC Data model (D-012).
 */
export type GuardResult =
  | { kind: "cached"; deck: SiteDeck }
  | { kind: "refused"; reason: "off_topic" | "ip_limit" | "daily_cap"; message: string }
  | { kind: "go"; release: () => Promise<void>; save: (d: SiteDeck) => Promise<void> };

export interface GuardDeps {
  store: Store;
  screen: (prompt: string) => Promise<boolean>;
  now: () => Date;
  dailyCap: number;
  perIp: number;
}

export const MESSAGES = {
  off_topic: 'I only brew Magic decks. Try something like "Mono-red burn in Modern".',
  ip_limit: "You've brewed your two decks for today. Come back tomorrow!",
  daily_cap: "The forge is cooling down for today. Come back tomorrow!",
} as const;

const DAY_TTL = 48 * 3600;
const DECK_TTL = 24 * 3600;

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** Lowercased, trimmed, inner whitespace collapsed. */
export const normalizePrompt = (p: string) => p.toLowerCase().trim().replace(/\s+/g, " ");

export const deckKey = (prompt: string, format: string | null) => `deck:${sha256(`${normalizePrompt(prompt)}|${(format ?? "").trim().toLowerCase()}`)}`;
export const capKey = (day: string) => `cap:${day}`;
export const ipKey = (day: string, ip: string) => `ip:${day}:${sha256(ip)}`;

const refused = (reason: keyof typeof MESSAGES): GuardResult => ({ kind: "refused", reason, message: MESSAGES[reason] });

export async function guard(req: { prompt: string; format: string | null }, ip: string, deps: GuardDeps): Promise<GuardResult> {
  const { store } = deps;
  if (!(await deps.screen(req.prompt))) return refused("off_topic");

  const dk = deckKey(req.prompt, req.format);
  const saved = await store.get(dk);
  if (saved) {
    try {
      const e = JSON.parse(saved) as { type: "deck"; deck: SiteDeck };
      if (e.type === "deck" && e.deck) return { kind: "cached", deck: e.deck };
    } catch {
      // A bad entry is treated as a miss and overwritten by the next save.
    }
  }

  const day = deps.now().toISOString().slice(0, 10);
  const ik = ipKey(day, ip);
  const ck = capKey(day);
  if ((await store.incr(ik, DAY_TTL)) > deps.perIp) {
    await store.decr(ik);
    return refused("ip_limit");
  }
  if ((await store.incr(ck, DAY_TTL)) > deps.dailyCap) {
    await store.decr(ck);
    await store.decr(ik);
    return refused("daily_cap");
  }

  let released = false;
  return {
    kind: "go",
    // The day's keys are fixed when the brew starts, so a brew that fails after midnight still returns its own slot.
    release: async () => {
      if (released) return;
      released = true;
      await store.decr(ck);
      await store.decr(ik);
    },
    save: (deck) => store.set(dk, JSON.stringify({ type: "deck", deck, cached: false }), DECK_TTL),
  };
}
