/** @type {import('next').NextConfig} */
const nextConfig = {
  // D-005: the brew API reads these at run time; trace them into its function bundle.
  outputFileTracingIncludes: {
    "/api/brew": [
      "./data/reference-lists.jsonl",
      "./data/scryfall/card-index.json",
      "./data/scryfall/standard-windows.json",
      "./data/archetype-mana.json",
      "./src/checker/mana-model.json",
    ],
  },
  // The tracer sees the data folder read by path and pulls all of it in (about 730 MB); keep only D-005's files.
  outputFileTracingExcludes: {
    "/api/brew": ["./data/export-*/**", "./data/reference-lists-*.jsonl", "./data/scryfall/*.gz", "./scripts/**", "./evals/**"],
  },
};

export default nextConfig;
