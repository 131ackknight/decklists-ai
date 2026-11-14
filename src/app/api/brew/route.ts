import { z } from "zod";
import { brewStream, fakeBrewer, realBrewer } from "@/site/brewer";
import { BREW_FIZZLED } from "@/site/events";

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
  const brewer = process.env.BREW_FAKE === "1" ? fakeBrewer : realBrewer;
  try {
    return new Response(brewStream(brewer, { prompt: parsed.data.prompt, format: parsed.data.format || null }), {
      headers: {
        ...headers,
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch {
    return json(500, { type: "error", message: BREW_FIZZLED }, headers);
  }
}
