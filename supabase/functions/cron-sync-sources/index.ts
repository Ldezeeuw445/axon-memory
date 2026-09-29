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
import { distillForUser } from "../_shared/distill.ts";

// How many connections to sync per run. Kept modest so one cron tick can
// never run long enough to overlap the next one at this stage of scale.
const BATCH_LIMIT = 100;
// Distillation is the expensive half — a model call per user, against a run
// that has to finish inside the scheduler's window. Capping it keeps a tick
// bounded no matter how many accounts exist; the ordering below is what makes
// sure the ones skipped this time go first next time.
const DISTILL_USERS_PER_RUN = 8;

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
    .select("id, user_id, provider, access_token_encrypted, refresh_token_encrypted, status")
    .in("status", ["connected", "error"])
    // Longest-unsynced first. Without an order Postgres returns whatever it
    // likes, and with more connections than the limit that tends to be the
    // same set every run — so past the hundredth account, the rest would
    // simply never sync. Ordering turns the cap into a rotation.
    .order("last_synced_at", { ascending: true, nullsFirst: true })
    .limit(BATCH_LIMIT);

  if (error) {
    console.error("cron-sync-sources: failed to list connections", error);
    return jsonResponse({ error: "failed to list connections" }, { status: 500 });
  }

  const results = {
    attempted: 0,
    synced_items: 0,
    failed: 0,
    distilled: { users: 0, facts: 0 },
    errors: [] as Array<{ id: string; provider: string; error: string }>,
  };
  // Everyone whose sync ran. Gating this on "brought something new" meant the
  // items already stored before distillation existed were never read at all —
  // a full account could sit there with nothing concluded from it forever.
  // A caught-up user costs one query and no model call, so there is nothing to
  // save by being clever here.
  const touched = new Set<string>();

  for (const conn of connections ?? []) {
    results.attempted += 1;
    const result = await syncOneConnection(admin, conn);
    if (result.ok) {
      results.synced_items += result.synced;
      touched.add(conn.user_id);
    } else {
      results.failed += 1;
      results.errors.push({ id: conn.id, provider: conn.provider, error: result.error });
    }
  }

  // Raw items become facts here rather than on their own schedule: the moment
  // new material lands is exactly when there is something new to conclude, and
  // one job is easier to reason about than two that have to stay in step.
  // In sync order, so the accounts that waited longest are also the ones whose
  // facts get refreshed first.
  for (const userId of [...touched].slice(0, DISTILL_USERS_PER_RUN)) {
    try {
      // Two passes rather than three: a tick has other users to reach, and a
      // large backfill still finishes over a few runs.
      const { written } = await distillForUser(admin, userId, 2);
      results.distilled.users += 1;
      results.distilled.facts += written;
    } catch (err) {
      // Never fails the sync. The items are stored and marked undistilled, so
      // the next run picks up exactly where this one stopped.
      console.error(`cron-sync-sources: distill failed for ${userId}`, err);
    }
  }

  return jsonResponse(results);
});
