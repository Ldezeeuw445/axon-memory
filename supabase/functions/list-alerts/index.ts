// GET /functions/v1/list-alerts
// Owner-only. Backs the in-app admin alerts view (/admin/alerts). Requires a
// real logged-in Supabase session (getUserFromRequest), then additionally
// checks the caller's email against the OWNER_EMAIL secret — this table has
// no per-user scoping (it's operator-facing, not customer-facing), so that
// check is the only thing standing between "any logged-in user" and
// "the product operator." Deliberately fails closed: if OWNER_EMAIL isn't
// set, nobody is authorized, rather than defaulting to open.
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

  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("system_alerts")
    .select("id, alert_type, message, metadata, notified, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return jsonResponse({ error: error.message }, { status: 500, origin });

  return jsonResponse({ alerts: data ?? [] }, { origin });
});
