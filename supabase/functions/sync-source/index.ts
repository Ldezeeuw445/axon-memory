// POST /functions/v1/sync-source   body: { source_connection_id: string }
// User-triggered "Sync now" — pulls the most recent items from the given
// provider and upserts them as memory_items. The exact same logic also runs
// automatically on a schedule via cron-sync-sources; both call
// _shared/source-sync.ts so manual and automatic sync can never drift apart.
import { handlePreflight, jsonResponse } from "../_shared/cors.ts";
import { getUserFromRequest } from "../_shared/auth.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import { syncOneConnection } from "../_shared/source-sync.ts";

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
  const { data: conn, error: connErr } = await admin
    .from("source_connections")
    .select("*")
    .eq("id", source_connection_id)
    .eq("user_id", auth.user.id)
    .single();

  if (connErr || !conn) return jsonResponse({ error: "Connection not found" }, { status: 404, origin });

  await admin.from("source_connections").update({ status: "syncing" }).eq("id", conn.id);

  const result = await syncOneConnection(admin, conn);
  if (!result.ok) {
    return jsonResponse({ error: "Sync failed", detail: result.error }, { status: 502, origin });
  }
  // Both numbers, so "the provider returned nothing" and "we fetched items but
  // stored none" are distinguishable in the UI instead of both reading as 0.
  return jsonResponse({ synced: result.synced, fetched: result.fetched }, { origin });
});
