// GET /functions/v1/ops-health
// §35 observability (A12-3). Owner-only, exactly like list-alerts: a real
// signed-in session AND the caller's email equal to OWNER_EMAIL (fails closed
// when that secret is unset). Returns public.ops_health_snapshot(): counts and
// timings only, never anyone's content.
import { handlePreflight, jsonResponse } from "../_shared/cors.ts";
import { getUserFromRequest } from "../_shared/auth.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";

Deno.serve(async (req: Request) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  const origin = req.headers.get("origin");
  if (req.method !== "GET") return jsonResponse({ error: "GET only" }, { status: 405, origin });

  const auth = await getUserFromRequest(req);
  if (!auth) return jsonResponse({ error: "Unauthorized" }, { status: 401, origin });
  const ownerEmail = Deno.env.get("OWNER_EMAIL");
  const callerEmail = auth.user.email?.toLowerCase().trim();
  if (!ownerEmail || !callerEmail || callerEmail !== ownerEmail.toLowerCase().trim()) {
    return jsonResponse({ error: "Forbidden" }, { status: 403, origin });
  }

  const t0 = performance.now();
  const { data, error } = await supabaseAdmin().rpc("ops_health_snapshot");
  if (error) return jsonResponse({ error: "snapshot unavailable" }, { status: 503, origin });
  return jsonResponse({ health: data, took_ms: Math.round(performance.now() - t0) }, { origin });
});
