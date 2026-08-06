// POST /functions/v1/cron-sync-sources
// NOT user-facing. Triggered on a schedule by pg_cron + pg_net (see the
// 20260806100000_cron_sync_sources.sql migration) so connected sources
// (Gmail, GitHub, Notion, Slack) get pulled automatically instead of only
// when a user clicks "Sync now". Auth is a shared secret header, not a user
// JWT or Axon Bearer token, since there is no logged-in user in a cron
// context — it's server calling server.
import { jsonResponse } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import { syncOneConnection } from "../_shared/source-sync.ts";

// How many connections to sync per run. Kept modest so one cron tick can
// never run long enough to overlap the next one at this stage of scale.
const BATCH_LIMIT = 100;

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "POST only" }, { status: 405 });
  }

  const expected = Deno.env.get("CRON_SECRET");
  const provided = req.headers.get("x-cron-secret");
  if (!expected || !provided || provided !== expected) {
    return jsonResponse({ error: "unauthorized" }, { status: 401 });
  }

  const admin = supabaseAdmin();

  // Re-sync anything currently marked connected, plus retry anything that
  // errored last time (a transient provider hiccup shouldn't require the
  // user to notice and click "Sync now" themselves).
  const { data: connections, error } = await admin
    .from("source_connections")
    .select("id, user_id, provider, access_token_encrypted, status")
    .in("status", ["connected", "error"])
    .limit(BATCH_LIMIT);

  if (error) {
    console.error("cron-sync-sources: failed to list connections", error);
    return jsonResponse({ error: "failed to list connections" }, { status: 500 });
  }

  const results = { attempted: 0, synced_items: 0, failed: 0, errors: [] as Array<{ id: string; provider: string; error: string }> };

  for (const conn of connections ?? []) {
    results.attempted += 1;
    const result = await syncOneConnection(admin, conn);
    if (result.ok) {
      results.synced_items += result.synced;
    } else {
      results.failed += 1;
      results.errors.push({ id: conn.id, provider: conn.provider, error: result.error });
    }
  }

  return jsonResponse(results);
});
