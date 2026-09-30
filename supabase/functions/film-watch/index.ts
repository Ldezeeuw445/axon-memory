// POST /functions/v1/film-watch
//
// One row per landing-page film watch. Called once, from `pagehide`, by a
// visitor who has not signed in and never will unless the film works — so it
// takes no auth at all, which is the whole design problem here.
//
// An open write endpoint is a junk-data risk rather than a security one: the
// table holds no personal data, is readable by nobody but the service role, and
// the worst a flood achieves is a wrong average. Still, everything that lands
// in it is clamped rather than trusted — the numbers are bounded to the film
// that exists, the array is capped at the shot count, and the body is refused
// above 4 KB. A field that arrives wrong is dropped to its default instead of
// failing the request: this must never cost a visitor anything, including an
// error in their console.
//
// What it deliberately does not record: no IP, no user agent, no referrer, no
// cookie. See the migration for why that is a product decision and not an
// oversight.
import { handlePublicPreflight as handlePreflight, publicJsonResponse as jsonResponse } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";

// The film is twelve shots. Anything claiming more is not describing this film.
const SHOT_COUNT = 12;
const MAX_BODY = 4096;
// Four hours on one landing page is not a watch, it is a tab somebody forgot.
const MAX_MS = 4 * 60 * 60 * 1000;

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

Deno.serve(async (req: Request) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return jsonResponse({ error: "POST only" }, { status: 405 });

  let body: Record<string, unknown>;
  try {
    const raw = await req.text();
    if (raw.length > MAX_BODY) return jsonResponse({ ok: true, note: "ignored" });
    body = JSON.parse(raw || "{}");
    if (typeof body !== "object" || body === null) throw new Error("not an object");
  } catch {
    // A malformed beacon is not worth a 400 nobody will ever read.
    return jsonResponse({ ok: true, note: "ignored" });
  }

  const deepest = clampInt(body.deepest_shot, 0, SHOT_COUNT - 1, 0);
  const leftAt = clampInt(body.left_at_shot, 0, SHOT_COUNT - 1, deepest);

  const rawMs = Array.isArray(body.shot_ms) ? body.shot_ms : [];
  const shotMs = rawMs.slice(0, SHOT_COUNT).map((v) => clampInt(v, 0, MAX_MS, 0));

  const viewport = body.viewport === "phone" ? "phone" : "desktop";
  const release = typeof body.release === "string" ? body.release.slice(0, 40) : null;

  const { error } = await supabaseAdmin().from("landing_film_watch").insert({
    deepest_shot: deepest,
    left_at_shot: leftAt,
    shot_ms: shotMs,
    total_ms: clampInt(body.total_ms, 0, MAX_MS, 0),
    reduced_motion: body.reduced_motion === true,
    viewport,
    viewport_w: clampInt(body.viewport_w, 0, 32767, 0) || null,
    release,
  });

  if (error) {
    // Counts, not contents — the row is anonymous but the log is still a log.
    console.error("film-watch: insert failed", error.message);
    return jsonResponse({ ok: false }, { status: 500 });
  }

  return jsonResponse({ ok: true });
});
