// POST /functions/v1/disconnect-source   body: { source_connection_id: string }
// Wipes stored tokens and marks the connection disconnected (soft delete, keeps
// ingested memory_items so nothing the user already has gets destroyed).
import { handlePreflight, jsonResponse } from "../_shared/cors.ts";
import { getUserFromRequest } from "../_shared/auth.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";

Deno.serve(async (req: Request) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  const origin = req.headers.get("origin");

  if (req.method !== "POST") return jsonResponse({ error: "POST only" }, { status: 405, origin });

  const auth = await getUserFromRequest(req);
  if (!auth) return jsonResponse({ error: "Unauthorized" }, { status: 401, origin });

  const { source_connection_id } = await req.json().catch(() => ({}));
  if (!source_connection_id) {
    return jsonResponse({ error: "source_connection_id required" }, { status: 400, origin });
  }

  const admin = supabaseAdmin();
  const { error } = await admin
    .from("source_connections")
    .update({
      status: "disconnected",
      access_token_encrypted: null,
      refresh_token_encrypted: null,
      token_expires_at: null,
    })
    .eq("id", source_connection_id)
    .eq("user_id", auth.user.id);

  if (error) return jsonResponse({ error: error.message }, { status: 500, origin });
  return jsonResponse({ ok: true }, { origin });
});
