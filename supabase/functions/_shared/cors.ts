// CORS handling for all Axon Memory edge functions.
// APP_URL is a Supabase project secret, e.g. https://axon-memory.com — set it with:
//   supabase secrets set APP_URL=https://axon-memory.com
const APP_URL = Deno.env.get("APP_URL") ?? "http://localhost:5173";

const ALLOWED_ORIGINS = new Set([APP_URL, "http://localhost:5173"]);

export function corsHeaders(origin: string | null) {
  const allowOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : APP_URL;
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Vary": "Origin",
  };
}

export function handlePreflight(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req.headers.get("origin")) });
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
