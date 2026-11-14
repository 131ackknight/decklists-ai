import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TOOLS } from "@/harness/tools";
import type { BrewEvent } from "@/site/events";
import fakeDeck from "@/site/fixtures/fake-deck.json";
import { OPTIONS, POST, maxDuration, runtime } from "./route";

const parseEvents = (raw: string) =>
  raw
    .split("\n\n")
    .filter((f) => f.startsWith("data: "))
    .map((f) => JSON.parse(f.slice(6)) as BrewEvent);

function expectNoToolNames(raw: string) {
  for (const t of TOOLS) {
    expect(raw, t.name).not.toMatch(new RegExp(`\\b${t.name}\\b`, "i"));
    expect(raw, t.name).not.toMatch(new RegExp(`\\b${t.name.replace(/_/g, " ")}\\b`, "i"));
  }
}

const post = (body: unknown, headers: Record<string, string> = {}) =>
  POST(new Request("http://localhost:3001/api/brew", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) }));

beforeEach(() => {
  vi.stubEnv("BREW_FAKE", "1");
  // Never reach a real store from tests.
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
  vi.stubEnv("BREW_ALLOWED_ORIGINS", "https://decklists-ai-site.vercel.app, http://localhost:3000");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("POST /api/brew", () => {
  it("is a Node function with 800 s", () => {
    expect(maxDuration).toBe(800);
    expect(runtime).toBe("nodejs");
  });

  it("with BREW_FAKE=1 streams status events then one deck, and leaks no tool names", async () => {
    vi.useFakeTimers();
    const res = await post({ prompt: "Mono white stax in Premodern", format: null }, { origin: "http://localhost:3000" });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    expect(res.headers.get("access-control-allow-origin")).toBe("http://localhost:3000");
    const text = res.text();
    let done = false;
    text.then(() => (done = true));
    for (let i = 0; i < 40 && !done; i++) await vi.advanceTimersByTimeAsync(1000);
    const raw = await text;
    const events = parseEvents(raw);
    expect(events.slice(0, -1).every((e) => e.type === "status")).toBe(true);
    expect(events.length).toBeGreaterThan(3);
    expect(events.at(-1)).toEqual({ type: "deck", deck: fakeDeck, cached: false });
    expectNoToolNames(raw);
  });

  it("rejects a bad body", async () => {
    for (const body of ["not json", {}, { prompt: "" }, { prompt: "x".repeat(501), format: null }, { prompt: "ok", format: 3 }]) {
      const res = await post(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect((await res.json()).type).toBe("error");
    }
  });

  it("refuses a browser on another origin", async () => {
    const res = await post({ prompt: "Burn", format: "modern" }, { origin: "https://evil.example" });
    expect(res.status).toBe(403);
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });
});

/** Reads a whole response, advancing fake timers so the fake brewer's steps run. */
async function drain(res: Response): Promise<string> {
  const text = res.text();
  let done = false;
  text.then(() => (done = true));
  for (let i = 0; i < 40 && !done; i++) await vi.advanceTimersByTimeAsync(1000);
  return text;
}

describe("POST /api/brew guard (fake mode, in-memory store)", () => {
  it("refuses a poem as off_topic, as one SSE event", async () => {
    const res = await post({ prompt: "Write me a poem about Islands", format: null }, { "x-forwarded-for": "203.0.113.1" });
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    expect(parseEvents(await res.text())).toEqual([{ type: "refused", reason: "off_topic", message: 'I only brew Magic decks. Try something like "Mono-red burn in Modern".' }]);
  });

  it("serves a repeat from cache at once with cached: true", async () => {
    vi.useFakeTimers();
    const body = { prompt: "Cache me: Pauper Affinity", format: "Pauper" };
    const first = parseEvents(await drain(await post(body, { "x-forwarded-for": "203.0.113.2" })));
    expect(first.at(-1)).toMatchObject({ type: "deck", cached: false });
    vi.useRealTimers();
    const again = parseEvents(await (await post({ ...body, prompt: "  cache me:  pauper affinity" }, { "x-forwarded-for": "203.0.113.3" })).text());
    expect(again).toEqual([{ type: "deck", deck: fakeDeck, cached: true }]);
  });

  it("reads BREW_PER_IP and BREW_DAILY_CAP, and uses the first x-forwarded-for entry", async () => {
    vi.useFakeTimers();
    vi.stubEnv("BREW_PER_IP", "1");
    const ip = { "x-forwarded-for": "198.51.100.7, 10.0.0.1" };
    expect(parseEvents(await drain(await post({ prompt: "Per-IP one", format: null }, ip))).at(-1)?.type).toBe("deck");
    expect(parseEvents(await drain(await post({ prompt: "Per-IP two", format: null }, { "x-forwarded-for": "198.51.100.7" })))).toEqual([
      { type: "refused", reason: "ip_limit", message: "You've brewed your two decks for today. Come back tomorrow!" },
    ]);
    vi.stubEnv("BREW_PER_IP", "5");
    vi.stubEnv("BREW_DAILY_CAP", "0");
    expect(parseEvents(await drain(await post({ prompt: "Capped", format: null }, { "x-forwarded-for": "198.51.100.8" })))).toEqual([
      { type: "refused", reason: "daily_cap", message: "The forge is cooling down for today. Come back tomorrow!" },
    ]);
  });
});

describe("OPTIONS /api/brew", () => {
  const preflight = (origin: string) => OPTIONS(new Request("http://localhost:3001/api/brew", { method: "OPTIONS", headers: { origin } }));

  it("allows the listed origins", () => {
    for (const o of ["https://decklists-ai-site.vercel.app", "http://localhost:3000"]) {
      const res = preflight(o);
      expect(res.status).toBe(204);
      expect(res.headers.get("access-control-allow-origin")).toBe(o);
      expect(res.headers.get("access-control-allow-methods")).toContain("POST");
      expect(res.headers.get("access-control-allow-headers")).toMatch(/content-type/i);
    }
  });

  it("defaults to localhost:3000 and leaves others out", () => {
    vi.stubEnv("BREW_ALLOWED_ORIGINS", undefined as unknown as string);
    delete process.env.BREW_ALLOWED_ORIGINS;
    expect(preflight("http://localhost:3000").headers.get("access-control-allow-origin")).toBe("http://localhost:3000");
    expect(preflight("https://evil.example").headers.get("access-control-allow-origin")).toBeNull();
  });
});
