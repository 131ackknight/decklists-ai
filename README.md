# decklists.ai

Brew any Magic deck. Ask for "mono green storm in Premodern" and get a coherent 60 and 15 with the reasoning behind every slot.

The model proposes; tournament data from [Decklist Data](https://decklistdata.com) and plain code decide. See [PLAN.md](./PLAN.md).

## Setup

```bash
pnpm install
cp .env.example .env.local   # fill in your own keys
pnpm dev                     # http://localhost:3000
```

`pnpm verify` runs the typecheck and tests.
