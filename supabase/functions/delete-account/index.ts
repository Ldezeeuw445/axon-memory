// POST /functions/v1/delete-account — permanently deletes the caller's auth user.
// All owned rows (profiles, source_connections, memory_items, api_keys, subscriptions,
// context_pack_logs) cascade-delete via their `on delete cascade` foreign keys.
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

  const admin = supabaseAdmin();
  const { error } = await admin.auth.admin.deleteUser(auth.user.id);
  if (error) return jsonResponse({ error: error.message }, { status: 500, origin });

  return jsonResponse({ ok: true }, { origin });
});
