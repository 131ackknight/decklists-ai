/** Lowercase, strip accents, unify apostrophes and split-card slashes. */
export function normalizeName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’‘`]/g, "'")
    .replace(/\s*\/\/?\s*/g, " // ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}
