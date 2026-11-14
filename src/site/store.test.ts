import { describe, expect, it } from "vitest";
import { defaultStore, memoryStore, upstashStore } from "./store";

describe("memoryStore", () => {
  it("counts, expires and stores strings with TTLs", async () => {
    let t = 0;
    const s = memoryStore(() => t);
    expect(await s.incr("c", 10)).toBe(1);
    expect(await s.incr("c", 10)).toBe(2);
    expect(await s.decr("c")).toBe(1);
    await s.set("k", '{"a":1}', 5);
    expect(await s.get("k")).toBe('{"a":1}');
    t = 5_000;
    expect(await s.get("k")).toBeNull();
    t = 10_000;
    expect(await s.incr("c", 10)).toBe(1);
    expect(await s.get("missing")).toBeNull();
  });
});

describe("store selection", () => {
  it("needs both Upstash env vars", () => {
    expect(() => upstashStore("", "")).toThrow();
  });

  it("refuses to run the real brewer in production with no Upstash", () => {
    expect(() => defaultStore({ NODE_ENV: "production" } as NodeJS.ProcessEnv)).toThrow();
  });
});
