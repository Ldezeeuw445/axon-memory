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

const BATCH_LIMIT = 20;

function severityEmoji(alertType: string): string {
  if (alertType.startsWith("embedding_cost_cap")) return "\u{1F6A8}"; // 🚨
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
    return jsonResponse({ ok: true, pending: 0, delivered: 0, note: "nothing to do" });
  }

  if (!webhookUrl) {
    console.log(`check-alerts: ${alerts.length} alert(s) pending, no SLACK_ALERT_WEBHOOK_URL set — leaving un-notified`);
    return jsonResponse({ ok: true, pending: alerts.length, delivered: 0, note: "no delivery channel configured" });
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

  return jsonResponse({ ok: true, pending: alerts.length, delivered, failed: failures.length });
});
