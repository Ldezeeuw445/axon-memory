// CORS handling for all Axon Memory edge functions.
// APP_URL is a Supabase project secret, e.g. https://axon-memory.com — set it with:
//   supabase secrets set APP_URL=https://axon-memory.com
const APP_URL = Deno.env.get("APP_URL") ?? "http://localhost:5173";

const ALLOWED_ORIGINS = new Set([APP_URL, "http://localhost:5173"]);

/**
 * Two doors, and the difference is who is meant to come through.
 *
 * ## Why anything is open at all
 *
 * The origin allowlist was on every endpoint, and it kept out the callers the
 * product exists for. A desktop app has no web origin worth naming — Tauri
 * reports `tauri://localhost`, which is the same string for every Tauri app
 * ever built, so allowlisting it allows everyone and means nothing. A script
 * holding a personal key has no origin at all. And a developer key is sold as
 * being "for scripts and tools without OAuth", which is precisely the set of
 * callers an origin list cannot describe.
 *
 * The reason it costs nothing to open: CORS protects credentials the BROWSER
 * attaches by itself — cookies, HTTP auth, a session. Axon has none. Checked
 * rather than assumed: no function reads a cookie, nothing anywhere sets
 * Access-Control-Allow-Credentials, and every route authenticates on an
 * `Authorization: Bearer` header the caller has to put there on purpose. A page
 * on some other site cannot obtain somebody's key, and if it had one it would
 * not need a browser to use it. This is how every token-authenticated API works.
 *
 * ## Why it is not opened everywhere
 *
 * Nineteen functions import this file, and most of them are the app talking to
 * itself: delete-account, api-keys-create, disconnect-source, stripe-portal,
 * the consent screen. No third party calls those, so opening them buys nothing
 * and leaves a wider surface if Axon ever does grow a session cookie.
 *
 * So the public door is a list you can read, not a guess about a token. A
 * function that outside tools are meant to call imports the `public*` trio and
 * says so on its import line; everything else keeps the allowlist and is
 * strict by default, which is the direction a default should fail in.
 */
const SHARED = {
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
};

export function corsHeaders(origin: string | null) {
  const allowOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : APP_URL;
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    ...SHARED,
    // The response body differs by origin, so a shared cache must not hand one
    // origin's answer to another.
    "Vary": "Origin",
  };
}

/**
 * For endpoints outside tools are meant to reach. No Vary: the answer is the
 * same for every origin, so there is nothing for a cache to get wrong.
 */
export function publicCorsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    ...SHARED,
  };
}

export function handlePreflight(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req.headers.get("origin")) });
  }
  return null;
}

export function handlePublicPreflight(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: publicCorsHeaders() });
  }
  return null;
}

export function jsonResponse(
  body: unknown,
  init: { status?: number; origin?: string | null } = {},
) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(init.origin ?? null),
    },
  });
}

/**
 * Same shape as jsonResponse on purpose, `origin` included and ignored.
 *
 * The call sites pass it — five functions, dozens of returns — and the answer
 * here is the same for every origin, so there is nothing to do with it. Taking
 * it anyway means switching a function between the two doors is one import
 * line, not a sweep through every return in the file. It also means the wrong
 * one cannot be chosen by accident: they are interchangeable at the call site
 * and differ only where the decision is actually written down.
 */
export function publicJsonResponse(
  body: unknown,
  init: { status?: number; origin?: string | null } = {},
) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: {
      "Content-Type": "application/json",
      ...publicCorsHeaders(),
    },
  });
}
