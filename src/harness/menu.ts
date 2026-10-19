import type { CardIndex } from "@/cards/card-index";
import type { DataSource } from "@/data/source";

/**
 * Harness v5's format menu: what is working in a format right now, as
 * building blocks. The top archetypes by share in the last 30 days of
 * results, each with the nonland cards most of its lists run. It gives the
 * brewer what a player knows from playing the format, so it can borrow a
 * proven package for a new idea instead of dropping the cards into a
 * familiar template (BUILD_LOG.md, 2026-10-19: the menu raised the first
 * idea's match to the original brewers from 36% to 42%).
 */
export function formatMenu(index: CardIndex, data: DataSource, format: string, top = 15): string | null {
  if (!data.hasFormat(format)) return null;
  const nonland = (name: string) => !/\bLand\b/.test(index.getCard(name)?.typeLine.split(" // ")[0] ?? "");
  const lines = data
    .meta(format)
    .slice(0, top)
    .map((m) => {
      const a = data.archetype(format, m.strategy);
      const core = (a?.main ?? [])
        .filter((c) => c.adoption >= 0.7 && nonland(c.name))
        .slice(0, 12)
        .map((c) => `${Math.round(c.avgCopies)} ${c.name}`);
      return `- ${m.strategy} (${Math.round(m.share * 100)}% of the field): ${core.join(", ")}`;
    });
  return lines.length ? lines.join("\n") : null;
}
