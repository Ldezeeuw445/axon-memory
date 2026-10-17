/**
 * A11-2 — Stripe webhook replay / idempotency / ordering, against the REAL
 * supabase/functions/stripe-webhook/index.ts, run locally.
 *
 *   deno run -A tests/billing/webhook-replay.ts
 *
 * Nothing here touches Stripe or production. The webhook runs as a subprocess
 * with a throwaway signing secret and a dummy Stripe key; SUPABASE_URL points
 * at an in-process mock of PostgREST's `profiles` table. Events are signed the
 * way Stripe signs them (t=…,v1=HMAC-SHA256(secret, "t.payload")).
 *
 * A11-3: the five DEFECTs recorded in A11-2 are fixed (approved 2026-10-17)
 * and now asserted as the correct behaviour, together with the ledger
 * (stripe_events) that makes delivery idempotent. A subscription checkout by
 * a non-Lifetime member calls the Stripe API and stays out of local reach.
 */
const MOCK_PORT = 54399;
const SECRET = "whsec_axon_local_replay_test";
const PRICES = {
  starter: "price_1U1AfvFGBQHVlLfhO8uNIEWX",
  pro: "price_1U1620FGBQHVlLfhBfLCbaZM",
  ultra: "price_1U1AhtFGBQHVlLfhfmRRvtjv",
  lifetime: "price_1U1AjIFGBQHVlLfhwDyO8RZl",
};

type Profile = Record<string, unknown> & { id: string };
let profiles: Profile[] = [];
let ledger = new Map<string, Record<string, unknown>>();
let alerts: Record<string, unknown>[] = [];
let writes = 0;
let failNextProfileWrite = false;

// ── mock PostgREST: profiles (GET/PATCH), stripe_events (upsert/PATCH/DELETE), system_alerts (POST) ──
const RESERVED = new Set(["select", "columns", "limit", "on_conflict", "order"]);
const mock = Deno.serve({ port: MOCK_PORT, onListen: () => {} }, async (req) => {
  const u = new URL(req.url);
  const filters = [...u.searchParams.entries()].filter(([k]) => !RESERVED.has(k));
  const match = (p: Record<string, unknown>) => filters.every(([k, v]) => v.startsWith("eq.") && String(p[k]) === v.slice(3));
  const limit = Number(u.searchParams.get("limit") ?? 0);
  if (u.pathname === "/rest/v1/profiles") {
    if (req.method === "GET") { const hit = profiles.filter(match); return Response.json(limit ? hit.slice(0, limit) : hit); }
    if (req.method === "PATCH") {
      if (failNextProfileWrite) { failNextProfileWrite = false; return Response.json({ message: "simulated outage" }, { status: 503 }); }
      const patch = await req.json();
      const hit = profiles.filter(match);
      for (const p of hit) Object.assign(p, patch);
      writes += hit.length;
      return new Response(null, { status: 204 });
    }
  }
  if (u.pathname === "/rest/v1/stripe_events") {
    if (req.method === "POST") {
      const rows = [].concat(await req.json());
      const ignore = (req.headers.get("prefer") ?? "").includes("ignore-duplicates");
      const inserted = [];
      for (const r of rows as Record<string, unknown>[]) {
        if (ledger.has(String(r.id))) { if (!ignore) return Response.json({ code: "23505" }, { status: 409 }); continue; }
        ledger.set(String(r.id), { ...r }); inserted.push({ id: r.id });
      }
      return Response.json(inserted, { status: 201 });
    }
    if (req.method === "PATCH") { const patch = await req.json(); for (const r of ledger.values()) if (match(r)) Object.assign(r, patch); return new Response(null, { status: 204 }); }
    if (req.method === "DELETE") { for (const [k, r] of ledger) if (match(r)) ledger.delete(k); return new Response(null, { status: 204 }); }
  }
  if (u.pathname === "/rest/v1/system_alerts" && req.method === "POST") { alerts.push(...[].concat(await req.json())); return new Response(null, { status: 201 }); }
  return new Response("not mocked", { status: 404 });
});

async function hmac(secret: string, msg: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function send(event: unknown, opts: { secret?: string; ageSeconds?: number; noSig?: boolean } = {}) {
  const payload = JSON.stringify(event);
  const t = Math.floor(Date.now() / 1000) - (opts.ageSeconds ?? 0);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (!opts.noSig) headers["Stripe-Signature"] = `t=${t},v1=${await hmac(opts.secret ?? SECRET, `${t}.${payload}`)}`;
  const r = await fetch("http://127.0.0.1:8000/", { method: "POST", headers, body: payload });
  await r.body?.cancel();
  return r.status;
}
let n = 0;
const ev = (type: string, object: Record<string, unknown>, created = Math.floor(Date.now() / 1000)) =>
  ({ id: `evt_local_${++n}`, object: "event", type, created, api_version: "2024-06-20", livemode: false, data: { object } });
const sub = (id: string, customer: string, price: string, extra: Record<string, unknown> = {}) =>
  ({ id, object: "subscription", customer, status: "active", items: { object: "list", data: [{ id: `si_${id}`, price: { id: price } }] }, ...extra });
const lifetimeCheckout = (user: string, customer: string) =>
  ({ id: `cs_${user}`, object: "checkout.session", mode: "payment", client_reference_id: user, customer, metadata: { supabase_user_id: user, plan_tier: "lifetime_founder" } });

// ── start the real webhook ──
const fn = new URL("../../supabase/functions/stripe-webhook/index.ts", import.meta.url).pathname;
const child = new Deno.Command(Deno.execPath(), {
  args: ["run", "-A", "--quiet", fn],
  clearEnv: true,
  env: {
    PATH: Deno.env.get("PATH") ?? "", HOME: Deno.env.get("HOME") ?? "", DENO_DIR: Deno.env.get("DENO_DIR") ?? `${Deno.env.get("HOME")}/.cache/deno`,
    STRIPE_SECRET_KEY: "sk_test_axon_local_dummy", STRIPE_WEBHOOK_SECRET: SECRET,
    SUPABASE_URL: `http://127.0.0.1:${MOCK_PORT}`, SUPABASE_SERVICE_ROLE_KEY: "local-dummy",
  },
  stdout: "null", stderr: "piped",
}).spawn();
for (let i = 0; i < 120; i++) {
  try { const r = await fetch("http://127.0.0.1:8000/", { method: "POST" }); await r.body?.cancel(); break; } catch { await new Promise((r) => setTimeout(r, 500)); }
}

type Result = { name: string; verdict: "ok" | "fixed"; pass: boolean; detail: string };
const results: Result[] = [];
const expect = (name: string, verdict: "ok" | "fixed", cond: boolean, detail = "") => results.push({ name, verdict, pass: cond, detail });
const reset = (rows: Profile[]) => { profiles = structuredClone(rows); writes = 0; ledger = new Map(); alerts = []; };
const get = (id: string) => profiles.find((p) => p.id === id)!;

// 1. Signature handling
reset([]);
expect("unsigned delivery rejected (400)", "ok", (await send(ev("customer.subscription.updated", sub("sub_x", "cus_x", PRICES.pro)), { noSig: true })) === 400);
expect("wrong secret rejected (400)", "ok", (await send(ev("customer.subscription.updated", sub("sub_x", "cus_x", PRICES.pro)), { secret: "whsec_wrong" })) === 400);
expect("stale signature (>5 min) rejected (400): captured deliveries cannot be replayed later", "ok",
  (await send(ev("customer.subscription.updated", sub("sub_x", "cus_x", PRICES.pro)), { ageSeconds: 600 })) === 400);
expect("unknown event type acknowledged without writes", "ok", (await send(ev("charge.refunded", { id: "ch_1" }))) === 200 && writes === 0);

// 2. Lifetime checkout and its replay
reset([{ id: "u1", plan_tier: "starter", stripe_customer_id: null }]);
const lc = ev("checkout.session.completed", lifetimeCheckout("u1", "cus_1"));
const s1 = await send(lc);
const started1 = get("u1").plan_started_at;
expect("lifetime checkout grants lifetime_founder", "ok", s1 === 200 && get("u1").plan_tier === "lifetime_founder" && get("u1").plan_expires_at === null);
await new Promise((r) => setTimeout(r, 15));
const s2 = await send(lc);
expect("replayed lifetime checkout keeps the same tier", "ok", s2 === 200 && get("u1").plan_tier === "lifetime_founder");
expect("replayed checkout is a no-op: the event id is in the ledger, plan_started_at unchanged", "fixed", get("u1").plan_started_at === started1 && writes === 1 && ledger.has(lc.id), `${started1} -> ${get("u1").plan_started_at}, writes ${writes}`);

// 3. Subscription update replay
reset([{ id: "u2", plan_tier: "pro", stripe_customer_id: "cus_2", stripe_subscription_id: "sub_2", stripe_price_id: PRICES.pro }]);
const up = ev("customer.subscription.updated", sub("sub_2", "cus_2", PRICES.ultra));
await send(up); await send(up);
expect("replayed subscription.updated is a no-op in effect", "ok", get("u2").plan_tier === "ultra" && get("u2").stripe_price_id === PRICES.ultra);

// 4. Out-of-order delivery
reset([{ id: "u3", plan_tier: "pro", stripe_customer_id: "cus_3", stripe_subscription_id: "sub_3", stripe_price_id: PRICES.pro }]);
const t0 = Math.floor(Date.now() / 1000);
const newer = ev("customer.subscription.updated", sub("sub_3", "cus_3", PRICES.ultra), t0);
const older = ev("customer.subscription.updated", sub("sub_3", "cus_3", PRICES.pro), t0 - 120);
await send(newer); await send(older);
expect("an older update arriving late is ignored (ordering guard)", "fixed", get("u3").plan_tier === "ultra", `final ${get("u3").plan_tier}`);

// 5. Lifetime member, old subscription ends
reset([{ id: "u4", plan_tier: "lifetime_founder", stripe_customer_id: "cus_4", stripe_subscription_id: null, stripe_price_id: PRICES.lifetime }]);
await send(ev("customer.subscription.deleted", sub("sub_old4", "cus_4", PRICES.pro, { status: "canceled" })));
expect("a Lifetime member keeps Lifetime when an old subscription is deleted", "fixed", get("u4").plan_tier === "lifetime_founder", `final ${get("u4").plan_tier}`);

reset([{ id: "u5", plan_tier: "lifetime_founder", stripe_customer_id: "cus_5", stripe_subscription_id: null, stripe_price_id: PRICES.lifetime }]);
await send(ev("customer.subscription.updated", sub("sub_old5", "cus_5", PRICES.pro, { cancel_at_period_end: true })));
expect("a Lifetime member keeps Lifetime when an old subscription is updated", "fixed", get("u5").plan_tier === "lifetime_founder", `final ${get("u5").plan_tier}`);

// 6. Deleted event for a subscription that is not the current one
reset([{ id: "u6", plan_tier: "ultra", stripe_customer_id: "cus_6", stripe_subscription_id: "sub_new6", stripe_price_id: PRICES.ultra }]);
await send(ev("customer.subscription.deleted", sub("sub_old6", "cus_6", PRICES.pro, { status: "canceled" })));
expect("deleting a previous subscription leaves the current one's plan alone", "fixed", get("u6").plan_tier === "ultra", `final ${get("u6").plan_tier}`);

// 7. Status ignored on update
reset([{ id: "u7", plan_tier: "pro", stripe_customer_id: "cus_7", stripe_subscription_id: "sub_7", stripe_price_id: PRICES.pro }]);
await send(ev("customer.subscription.updated", sub("sub_7", "cus_7", PRICES.pro, { status: "unpaid" })));
expect("an unpaid/canceled status on update keeps the paid tier until the deleted event (by design, documented)", "ok", get("u7").plan_tier === "pro");

// 8. Unknown customer / unknown price
reset([{ id: "u8", plan_tier: "pro", stripe_customer_id: "cus_8" }]);
expect("event for an unknown customer: 200, nothing written", "ok", (await send(ev("customer.subscription.updated", sub("sub_z", "cus_unknown", PRICES.ultra)))) === 200 && writes === 0);
expect("unrecognised price: 200, nothing written", "ok", (await send(ev("customer.subscription.updated", sub("sub_8", "cus_8", "price_not_ours")))) === 200 && writes === 0 && get("u8").plan_tier === "pro");

// 9. Checkout without a user id / lifetime without plan_tier
reset([{ id: "u9", plan_tier: "starter" }]);
expect("checkout with no user id: 200, nothing written", "ok", (await send(ev("checkout.session.completed", { id: "cs_x", object: "checkout.session", mode: "payment", customer: "cus_9", metadata: {} }))) === 200 && writes === 0);
expect("one-time checkout without plan_tier grants nothing", "ok", (await send(ev("checkout.session.completed", { id: "cs_y", object: "checkout.session", mode: "payment", client_reference_id: "u9", customer: "cus_9", metadata: {} }))) === 200 && get("u9").plan_tier === "starter");

// 10. The current subscription really ends → Starter, once
reset([{ id: "u10", plan_tier: "pro", stripe_customer_id: "cus_10", stripe_subscription_id: "sub_10", stripe_price_id: PRICES.pro }]);
const del10 = ev("customer.subscription.deleted", sub("sub_10", "cus_10", PRICES.pro, { status: "canceled" }));
await send(del10); await send(del10);
expect("the current subscription ending moves to Starter, and its redelivery writes nothing more", "ok", get("u10").plan_tier === "starter" && get("u10").stripe_subscription_id === null && writes === 1, `final ${get("u10").plan_tier}, writes ${writes}`);

// 11. A Lifetime member completes a subscription checkout → tier kept, flagged for a refund
reset([{ id: "u11", plan_tier: "lifetime_founder", stripe_customer_id: "cus_11", stripe_subscription_id: null }]);
await send(ev("checkout.session.completed", { id: "cs_11", object: "checkout.session", mode: "subscription", client_reference_id: "u11", customer: "cus_11", subscription: "sub_11", metadata: { supabase_user_id: "u11" } }));
expect("a Lifetime member's subscription checkout keeps Lifetime and raises billing_attention", "fixed", get("u11").plan_tier === "lifetime_founder" && writes === 0 && alerts.some((a) => a.alert_type === "billing_attention"), `alerts ${alerts.length}`);

// 12. A subscriber buys Lifetime → Lifetime, and the still-running subscription is flagged
reset([{ id: "u12", plan_tier: "pro", stripe_customer_id: "cus_12", stripe_subscription_id: "sub_12", stripe_price_id: PRICES.pro }]);
await send(ev("checkout.session.completed", lifetimeCheckout("u12", "cus_12")));
expect("a subscriber who buys Lifetime gets Lifetime; the old subscription is flagged to cancel", "ok", get("u12").plan_tier === "lifetime_founder" && get("u12").stripe_subscription_id === null && alerts.some((a) => String(a.message).includes("sub_12")));
await send(ev("customer.subscription.deleted", sub("sub_12", "cus_12", PRICES.pro, { status: "canceled" })));
expect("…and when that old subscription is later cancelled, Lifetime stays", "fixed", get("u12").plan_tier === "lifetime_founder");

// 13. A failed write releases the claim, so Stripe's retry is applied
reset([{ id: "u13", plan_tier: "pro", stripe_customer_id: "cus_13", stripe_subscription_id: "sub_13", stripe_price_id: PRICES.pro }]);
const up13 = ev("customer.subscription.updated", sub("sub_13", "cus_13", PRICES.ultra));
failNextProfileWrite = true;
const first13 = await send(up13);
const afterFail = ledger.has(up13.id);
const second13 = await send(up13);
expect("a failed write answers 500 and releases the ledger claim; the retry is applied", "ok", first13 === 500 && !afterFail && second13 === 200 && get("u13").plan_tier === "ultra" && ledger.has(up13.id), `first ${first13}, claim kept ${afterFail}, second ${second13}`);

// 14. The ledger records what happened
expect("the ledger records the outcome of each applied event", "ok", String(ledger.get(up13.id)?.outcome ?? "").startsWith("write:"), String(ledger.get(up13.id)?.outcome));

child.kill("SIGTERM");
const stderr = new TextDecoder().decode((await child.output()).stderr);
await mock.shutdown();

let failed = 0;
for (const r of results) {
  if (!r.pass) failed++;
  console.log(`${r.pass ? "✓" : "✗"} [${r.verdict}] ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
}
const fixed = results.filter((r) => r.verdict === "fixed" && r.pass).length;
console.log(`\n${results.length - failed}/${results.length} pass · ${fixed} of them are the A11-2 defects, now fixed`);
console.log("Not covered locally: subscription checkout by a non-Lifetime member (calls stripe.subscriptions.retrieve).");
if (failed) { console.error(stderr.slice(-2000)); Deno.exit(1); }
