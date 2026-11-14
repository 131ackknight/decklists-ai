import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { brewStream, fakeBrewer, realBrewer, type SiteBrewer } from "@/site/brewer";
import { BREW_FIZZLED, sse, type BrewEvent } from "@/site/events";
import { guard, type GuardDeps } from "@/site/guard";
import { fakeScreen, haikuScreen } from "@/site/screen";
import { defaultStore } from "@/site/store";

/** POST /api/brew: one brew as Server-Sent Events (site SPEC, Interfaces; R-02). */
export const runtime = "nodejs";
export const maxDuration = 800;
export const dynamic = "force-dynamic";

const Body = z.object({
  prompt: z.string().trim().min(1).max(500),
  format: z.string().trim().max(40).nullable().default(null),
});

/** D-013: the site's origins, from BREW_ALLOWED_ORIGINS (comma separated). */
function allowedOrigins(): string[] {
  return (process.env.BREW_ALLOWED_ORIGINS ?? "http://localhost:3000")
    .split(",")
    .map((o) => o.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

function cors(origin: string | null): Record<string, string> {
  const base = { Vary: "Origin" };
  return origin && allowedOrigins().includes(origin) ? { ...base, "Access-Control-Allow-Origin": origin } : base;
}

const json = (status: number, body: unknown, headers: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });

const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};

/** A whole-number env setting, or the default when unset or not a number. */
function intEnv(name: string, fallback: number): number {
  const n = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** The visitor's IP: the first `x-forwarded-for` entry (Vercel sets it), else one shared bucket. */
function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip")?.trim() || "unknown";
}

let screenClient: Anthropic | null = null;

function guardDeps(fake: boolean): GuardDeps {
  return {
    store: defaultStore(),
    screen: fake ? fakeScreen : haikuScreen((screenClient ??= new Anthropic())),
    now: () => new Date(),
    dailyCap: intEnv("BREW_DAILY_CAP", 10),
    perIp: intEnv("BREW_PER_IP", 2),
  };
}

export function OPTIONS(request: Request): Response {
  return new Response(null, {
    status: 204,
    headers: {
      ...cors(request.headers.get("origin")),
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}

export async function POST(request: Request): Promise<Response> {
  const origin = request.headers.get("origin");
  const headers = cors(origin);
  // A browser on another site gets nothing to spend; tools with no Origin header (curl) are let through.
  if (origin && !headers["Access-Control-Allow-Origin"]) return json(403, { type: "error", message: "Not allowed from this site." }, headers);
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json(400, { type: "error", message: "Ask for a deck in 1 to 500 characters." }, headers);
  const req = { prompt: parsed.data.prompt, format: parsed.data.format || null };
  const fake = process.env.BREW_FAKE === "1";
  const one = (e: BrewEvent) => new Response(sse(e), { headers: { ...headers, ...SSE_HEADERS } });
  try {
    const g = await guard(req, clientIp(request), guardDeps(fake));
    if (g.kind === "refused") return one({ type: "refused", reason: g.reason, message: g.message });
    if (g.kind === "cached") return one({ type: "deck", deck: g.deck, cached: true });
    const brewer = fake ? fakeBrewer : realBrewer;
    // A failed brew gives its slots back; a finished one is cached for 24 h.
    const guarded: SiteBrewer = async (r, onPhrase) => {
      let deck;
      try {
        deck = await brewer(r, onPhrase);
      } catch (err) {
        await g.release().catch((e) => console.error("release failed:", e));
        throw err;
      }
      await g.save(deck).catch((e) => console.error("cache save failed:", e));
      return deck;
    };
    return new Response(brewStream(guarded, req), { headers: { ...headers, ...SSE_HEADERS } });
  } catch (err) {
    // The guard could not run (store down or missing): fail closed, no brew.
    console.error("guard failed:", err);
    return one({ type: "error", message: BREW_FIZZLED });
  }
}
