import { Redis } from "@upstash/redis";

/** The few Redis operations the guard needs (D-012). Every key carries a TTL. */
export interface Store {
  get(k: string): Promise<string | null>;
  set(k: string, v: string, ttlSec: number): Promise<void>;
  /** Adds one and (re)sets the TTL; returns the new count. */
  incr(k: string, ttlSec: number): Promise<number>;
  decr(k: string): Promise<number>;
}

/** Upstash Redis over REST, from UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN. */
export function upstashStore(url = process.env.UPSTASH_REDIS_REST_URL, token = process.env.UPSTASH_REDIS_REST_TOKEN): Store {
  if (!url || !token) throw new Error("UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are not set.");
  // Values are JSON strings we parse ourselves; the client would otherwise hand back objects.
  const redis = new Redis({ url, token, automaticDeserialization: false, enableTelemetry: false });
  return {
    get: (k) => redis.get<string>(k),
    set: async (k, v, ttlSec) => {
      await redis.set(k, v, { ex: ttlSec });
    },
    incr: async (k, ttlSec) => {
      const [n] = await redis.multi().incr(k).expire(k, ttlSec).exec<[number, 0 | 1]>();
      return n;
    },
    decr: (k) => redis.decr(k),
  };
}

/** An in-process store with the same TTL behavior, for tests and local dev. `now` is in ms. */
export function memoryStore(now: () => number = Date.now): Store {
  const m = new Map<string, { v: string; until: number }>();
  const live = (k: string) => {
    const e = m.get(k);
    if (e && e.until <= now()) m.delete(k);
    return m.get(k);
  };
  return {
    get: async (k) => live(k)?.v ?? null,
    set: async (k, v, ttlSec) => {
      m.set(k, { v, until: now() + ttlSec * 1000 });
    },
    incr: async (k, ttlSec) => {
      const n = Number(live(k)?.v ?? 0) + 1;
      m.set(k, { v: String(n), until: now() + ttlSec * 1000 });
      return n;
    },
    decr: async (k) => {
      const e = live(k);
      const n = Number(e?.v ?? 0) - 1;
      m.set(k, { v: String(n), until: e?.until ?? Infinity });
      return n;
    },
  };
}

let shared: Store | null = null;

/**
 * The route's store: Upstash when its env vars are set; otherwise an in-process store, but only outside
 * production or in fake mode, so a deployed real brewer can never run without its caps.
 */
export function defaultStore(env: NodeJS.ProcessEnv = process.env): Store {
  if (shared) return shared;
  if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) return (shared = upstashStore(env.UPSTASH_REDIS_REST_URL, env.UPSTASH_REDIS_REST_TOKEN));
  if (env.NODE_ENV === "production" && env.BREW_FAKE !== "1") throw new Error("No Upstash store in production: refusing to brew without caps.");
  return (shared = memoryStore());
}
