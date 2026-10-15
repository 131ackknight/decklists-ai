/**
 * Fetch public Decklist Data deck pages and save each list as JSON.
 *
 *   pnpm exec tsx scripts/fetch-dld-deck.ts <out-dir> <url> [url...]
 *
 * Reads the deck's own snapshot and plain-text list from the page payload
 * (the page also embeds related decks, so the snapshot is matched by URL).
 * Player names are dropped; the saved link is the name-free /deck/<id> form.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

interface Line {
  qty: number;
  name: string;
}

const [outDir, ...urls] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });

const unescape = (s: string) => JSON.parse(`"${s}"`) as string;
// Some stored lists carry junk lines like "29 Cards (48%)" (a Decklist Data scrape artifact).
const JUNK = /^Cards \(\d+%\)$/;
const parseLines = (block: string): Line[] =>
  block
    .split("\n")
    .map((l) => l.match(/^(\d+) (.+)$/))
    .filter((m): m is RegExpMatchArray => Boolean(m))
    .map((m) => ({ qty: Number(m[1]), name: m[2] }))
    .filter((c) => {
      if (JUNK.test(c.name)) console.warn(`  dropped junk line "${c.qty} ${c.name}"`);
      return !JUNK.test(c.name);
    });

async function main() {
for (const url of urls) {
  const pathname = new URL(url).pathname;
  // RSC payload is a JSON string inside a script, so quotes arrive as \" and newlines as \\n.
  const page = (await (await fetch(url)).text()).replace(/\\"/g, '"');
  const snapAt = page.indexOf(`"url":"${pathname}"`);
  if (snapAt < 0) throw new Error(`no snapshot for ${url}`);
  const snapStart = page.lastIndexOf('{"deckId"', snapAt);
  const snapshot = JSON.parse(page.slice(snapStart, page.indexOf("}", snapAt) + 1));
  const text = page.slice(snapAt).match(/"decklistText":"((?:[^"\\]|\\.)*)"/);
  if (!text) throw new Error(`no decklist text for ${url}`);
  const [main, side = ""] = unescape(unescape(text[1])).split(/\n\nSideboard\n/);
  // No player names in our files: keep the name-free link (redirects to the deck page).
  const { handle: _handle, url: _url, ...rest } = snapshot;
  const deck = { ...rest, url: `https://decklistdata.com/deck/${snapshot.deckId}`, main: parseLines(main), side: parseLines(side) };
  const file = path.join(outDir, `${pathname.split("/")[1]}-${pathname.split("/")[3]}-${snapshot.eventDate.slice(0, 10)}.json`);
  writeFileSync(file, JSON.stringify(deck, null, 1) + "\n");
  const n = (xs: Line[]) => xs.reduce((a, c) => a + c.qty, 0);
  console.log(`${file}: ${snapshot.format} ${snapshot.strategy}, ${snapshot.eventName} ${snapshot.record ?? ""}, main ${n(deck.main)}, side ${n(deck.side)}`);
}
}
main();
