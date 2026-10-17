// POST /functions/v1/check-alerts
// NOT user-facing. Triggered every 5 minutes by pg_cron (see the
// 20260806190000_alert_notifications.sql migration) — same shared-secret
// server-to-server pattern as cron-sync-sources. Forwards any un-notified
// system_alerts rows (currently: embedding cost-cap trips) to Slack via an
// incoming webhook, if one is configured.
//
// Deliberately safe-by-default: if SLACK_ALERT_WEBHOOK_URL isn't set yet,
// this is a no-op that leaves rows un-notified (so nothing is lost — set
// the secret later and the backlog delivers on the next tick). Alerts are
// also always visible directly via list-alerts / the in-app admin view
// regardless of delivery status, so a missing webhook never means "invisible."
import { jsonResponse } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import { decide, lastState, probe, TARGETS } from "../_shared/uptime.ts";

const BATCH_LIMIT = 20;

function severityEmoji(alertType: string): string {
  if (alertType.startsWith("embedding_cost_cap")) return "\u{1F6A8}"; // 🚨
  // A source that has been down for a day is a customer whose product is not
  // working, which is a different kind of urgent from a cost cap.
  if (alertType === "source_stuck") return "\u{1F50C}"; // 🔌
  if (alertType === "uptime_down") return "\u{1F534}"; // 🔴
  if (alertType === "uptime_recovered") return "\u{2705}"; // ✅
  return "⚠️"; // ⚠️
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return jsonResponse({ error: "POST only" }, { status: 405 });

  const expected = Deno.env.get("CRON_SECRET");
  const provided = req.headers.get("x-cron-secret");
  if (!expected || !provided || provided !== expected) {
    return jsonResponse({ error: "unauthorized" }, { status: 401 });
  }

  const admin = supabaseAdmin();
  const webhookUrl = Deno.env.get("SLACK_ALERT_WEBHOOK_URL");

  // Uptime watch (§37 step 15): probe the front doors, record outages and
  // recoveries once each. In-app only (list-alerts / admin view) unless
  // UPTIME_ALERTS_DELIVER=1 opts them into the delivery channel below.
  let uptime: { name: string; ok: boolean; ms: number }[] = [];
  try {
    const results = await Promise.all(TARGETS.map((t) => probe(t, fetch)));
    uptime = results.map(({ name, ok, ms }) => ({ name, ok, ms }));
    const { data: recent } = await admin
      .from("system_alerts")
      .select("alert_type, metadata")
      .in("alert_type", ["uptime_down", "uptime_recovered"])
      .order("created_at", { ascending: false })
      .limit(50);
    const fresh = decide(results, lastState(recent ?? []));
    if (fresh.length) {
      const deliver = Deno.env.get("UPTIME_ALERTS_DELIVER") === "1";
      const { error: insertError } = await admin.from("system_alerts").insert(fresh.map((a) => ({ ...a, notified: !deliver })));
      if (insertError) console.error("check-alerts: uptime insert failed", insertError.message);
    }
  } catch (err) {
    console.error("check-alerts: uptime watch failed", err instanceof Error ? err.message : String(err));
  }

  // §35 recall telemetry is kept 30 days (A12-3). Service telemetry only, no user data.
  {
    const { error: purgeError } = await admin.from("recall_events").delete().lt("at", new Date(Date.now() - 30 * 86400e3).toISOString());
    if (purgeError) console.error("check-alerts: recall_events purge failed", purgeError.message);
  }

  const { data: alerts, error } = await admin
    .from("system_alerts")
    .select("id, alert_type, message, metadata, created_at")
    .eq("notified", false)
    .order("created_at", { ascending: true })
    .limit(BATCH_LIMIT);

  if (error) {
    console.error("check-alerts: failed to list alerts", error.message);
    return jsonResponse({ error: "failed to list alerts" }, { status: 500 });
  }

  if (!alerts || alerts.length === 0) {
    return jsonResponse({ ok: true, pending: 0, delivered: 0, uptime, note: "nothing to do" });
  }

  if (!webhookUrl) {
    console.log(`check-alerts: ${alerts.length} alert(s) pending, no SLACK_ALERT_WEBHOOK_URL set — leaving un-notified`);
    return jsonResponse({ ok: true, pending: alerts.length, delivered: 0, uptime, note: "no delivery channel configured" });
  }

  let delivered = 0;
  const failures: string[] = [];

  for (const alert of alerts) {
    try {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: `${severityEmoji(alert.alert_type)} *Axon Memory alert* — \`${alert.alert_type}\`\n${alert.message}`,
        }),
      });
      if (!res.ok) throw new Error(`slack webhook returned ${res.status}`);

      const { error: updateError } = await admin
        .from("system_alerts")
        .update({ notified: true })
        .eq("id", alert.id);
      if (updateError) throw new Error(updateError.message);

      delivered += 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`check-alerts: failed to deliver alert ${alert.id}`, msg);
      failures.push(alert.id);
      // Leave notified=false so it's retried on the next tick.
    }
  }

  return jsonResponse({ ok: true, pending: alerts.length, delivered, failed: failures.length, uptime });
});
