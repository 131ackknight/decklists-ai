import { createReadStream, existsSync } from "node:fs";
import { createInterface } from "node:readline";
import type { CardIndex } from "@/cards/card-index";
import { normalizeName } from "@/cards/names";
import { buildProfile, type ArchetypeManaProfile } from "@/checker/archetype-mana";
import { analyzeMana, type Entry } from "@/checker/mana";
import { fromMtgoList } from "@/checker/mtgo";

/**
 * What good players run: Decklist Data's published results. Every query
 * takes an `asOf` date so an answer can be rebuilt from data that existed
 * then. This file-backed source reads the export; the Decklist Data API
 * (plan step 3) will implement the same interface.
 */
export interface DataSource {
  hasFormat(format: string): boolean;
  meta(format: string, opts?: Window): StrategyShare[];
  archetype(format: string, strategy: string, opts?: Window): ArchetypeStats | null;
  referenceList(format: string, strategy: string, opts?: Window): RefList | null;
  cardPlayRate(format: string, cardName: string, opts?: Window): CardPlay | null;
  /** Highest share of this main deck found card for card in one real list. */
  copyRate(format: string, main: QtyName[], opts?: Window): CopyRate | null;
  /** Every list in the window (default 90 days), for measuring what decks of a kind look like. */
  recentLists(format: string, opts?: Window): RefList[];
}

export interface CopyRate {
  /** 0-1: share of the deck's main cards (by copies) found in the closest real list. */
  rate: number;
  closest: { strategy: string; event: string; date: string };
}

export interface Window {
  /** Last event date to include (YYYY-MM-DD). Defaults to the newest date in the data. */
  asOf?: string;
  days?: number;
}

export interface QtyName {
  qty: number;
  name: string;
}

export interface RefList {
  format: string;
  date: string;
  event: string;
  place: number | null;
  record: string | null;
  strategy: string;
  main: QtyName[];
  side: QtyName[];
  commander: QtyName[];
}

export interface StrategyShare {
  strategy: string;
  lists: number;
  share: number;
}

export interface CardRate {
  name: string;
  /** Share of lists that play it in this zone. */
  adoption: number;
  avgCopies: number;
}

export interface ArchetypeStats {
  format: string;
  strategy: string;
  lists: number;
  main: CardRate[];
  side: CardRate[];
  mana: ArchetypeManaProfile | null;
}

export interface CardPlay {
  name: string;
  lists: number;
  share: number;
  topStrategies: { strategy: string; lists: number }[];
}

const DAY = 86_400_000;

/** MTGO's sideboard breakdown widget ("Cards (48%)"), stored as cards in some Dec 2025 - May 2026 lists. */
const WIDGET_ROW = /^Cards?\s*\(\d+%?\)\s*$/i;

export class FileDataSource implements DataSource {
  private constructor(
    private readonly lists: RefList[],
    private readonly index: CardIndex,
    private readonly newest: string,
  ) {}

  /** `before` (YYYY-MM-DD) drops every list from that day on, so nothing after a past moment can leak into an eval. */
  static async load(file: string, index: CardIndex, opts: { before?: string } = {}): Promise<FileDataSource> {
    const lists: RefList[] = [];
    if (existsSync(file)) {
      for await (const line of createInterface({ input: createReadStream(file) })) {
        if (!line.trim()) continue;
        const list = JSON.parse(line) as RefList;
        if (opts.before && list.date >= opts.before) continue;
        list.side = list.side.filter((c) => !WIDGET_ROW.test(c.name));
        list.main = list.main.filter((c) => !WIDGET_ROW.test(c.name));
        lists.push(list);
      }
    }
    const newest = lists.reduce((d, l) => (l.date > d ? l.date : d), "0000-00-00");
    return new FileDataSource(lists, index, newest);
  }

  /** The same data without lists from `before` (YYYY-MM-DD) on, and without any list `drop` matches. */
  cut(before: string, index: CardIndex = this.index, drop: (l: RefList) => boolean = () => false): FileDataSource {
    const lists = this.lists.filter((l) => l.date < before && !drop(l));
    return new FileDataSource(lists, index, lists.reduce((d, l) => (l.date > d ? l.date : d), "0000-00-00"));
  }

  /** Normalized names of every card in a list dated `date` or earlier, any format: proof a card was on MTGO by then. */
  cardsPlayedThrough(date: string): Set<string> {
    const out = new Set<string>();
    for (const l of this.lists) {
      if (l.date > date) continue;
      for (const c of [...l.main, ...l.side, ...(l.commander ?? [])]) out.add(normalizeName(this.index.getCard(c.name)?.name ?? c.name));
    }
    return out;
  }

  hasFormat(format: string): boolean {
    return this.lists.some((l) => l.format === format);
  }

  private window(format: string, opts: Window = {}): RefList[] {
    const asOf = opts.asOf ?? this.newest;
    const since = new Date(Date.parse(asOf) - (opts.days ?? 30) * DAY).toISOString().slice(0, 10);
    return this.lists.filter((l) => l.format === format && l.date <= asOf && l.date > since);
  }

  meta(format: string, opts?: Window): StrategyShare[] {
    const lists = this.window(format, opts);
    const counts = new Map<string, number>();
    for (const l of lists) counts.set(l.strategy, (counts.get(l.strategy) ?? 0) + 1);
    return [...counts]
      .map(([strategy, n]) => ({ strategy, lists: n, share: n / lists.length }))
      .sort((a, b) => b.lists - a.lists);
  }

  private ofStrategy(format: string, strategy: string, opts?: Window): RefList[] {
    const want = strategy.trim().toLowerCase();
    return this.window(format, { days: 90, ...opts }).filter((l) => l.strategy.toLowerCase() === want);
  }

  archetype(format: string, strategy: string, opts?: Window): ArchetypeStats | null {
    const lists = this.ofStrategy(format, strategy, opts);
    if (lists.length === 0) return null;
    const rate = (zone: "main" | "side"): CardRate[] => {
      const seen = new Map<string, { lists: number; copies: number; name: string }>();
      for (const l of lists) {
        for (const c of l[zone]) {
          const key = normalizeName(c.name);
          const row = seen.get(key) ?? { lists: 0, copies: 0, name: c.name };
          row.lists++;
          row.copies += c.qty;
          seen.set(key, row);
        }
      }
      return [...seen.values()]
        .map((r) => ({ name: r.name, adoption: r.lists / lists.length, avgCopies: r.copies / r.lists }))
        .sort((a, b) => b.adoption - a.adoption);
    };
    const reports = lists.flatMap((l) => {
      const deck = fromMtgoList(this.index, { format, main: l.main, side: l.side, commander: l.commander });
      const main: Entry[] = [];
      for (const c of deck.main) {
        const card = this.index.getCard(c.name);
        if (!card) return [];
        main.push({ qty: c.qty, card });
      }
      return main.length ? [analyzeMana(this.index, main)] : [];
    });
    return {
      format,
      strategy: lists[0].strategy,
      lists: lists.length,
      main: rate("main"),
      side: rate("side"),
      mana: reports.length >= 3 ? buildProfile(format, lists[0].strategy, reports) : null,
    };
  }

  recentLists(format: string, opts?: Window): RefList[] {
    return this.window(format, { days: 90, ...opts });
  }

  referenceList(format: string, strategy: string, opts?: Window): RefList | null {
    const lists = this.ofStrategy(format, strategy, opts);
    const finished = (l: RefList) => (l.record === "5-0" ? 0 : (l.place ?? 99));
    return [...lists].sort((a, b) => b.date.localeCompare(a.date) || finished(a) - finished(b))[0] ?? null;
  }

  copyRate(format: string, main: QtyName[], opts?: Window): CopyRate | null {
    const lists = this.window(format, { days: 90, ...opts });
    if (lists.length === 0) return null;
    const canon = (n: string) => normalizeName(this.index.getCard(n)?.name ?? n);
    const deck = new Map<string, number>();
    for (const c of main) deck.set(canon(c.name), (deck.get(canon(c.name)) ?? 0) + c.qty);
    const total = [...deck.values()].reduce((a, b) => a + b, 0) || 1;
    let best: CopyRate | null = null;
    for (const l of lists) {
      const real = new Map<string, number>();
      for (const c of l.main) real.set(canon(c.name), (real.get(canon(c.name)) ?? 0) + c.qty);
      let shared = 0;
      for (const [k, q] of deck) shared += Math.min(q, real.get(k) ?? 0);
      if (!best || shared / total > best.rate) {
        best = { rate: shared / total, closest: { strategy: l.strategy, event: l.event, date: l.date } };
      }
    }
    return best;
  }

  cardPlayRate(format: string, cardName: string, opts?: Window): CardPlay | null {
    const lists = this.window(format, { days: 90, ...opts });
    if (lists.length === 0) return null;
    const key = normalizeName(cardName);
    const card = this.index.getCard(cardName);
    const names = new Set([key, ...(card ? [normalizeName(card.name), ...(card.faces ?? []).map(normalizeName), ...(card.aliases ?? []).map(normalizeName)] : [])]);
    const byStrategy = new Map<string, number>();
    let n = 0;
    for (const l of lists) {
      if ([...l.main, ...l.side, ...l.commander].some((c) => names.has(normalizeName(c.name)))) {
        n++;
        byStrategy.set(l.strategy, (byStrategy.get(l.strategy) ?? 0) + 1);
      }
    }
    return {
      name: card?.name ?? cardName,
      lists: n,
      share: n / lists.length,
      topStrategies: [...byStrategy].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([strategy, lists]) => ({ strategy, lists })),
    };
  }
}
