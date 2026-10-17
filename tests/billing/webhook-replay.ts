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
 * Each case records what the deployed logic DOES. A case marked DEFECT is a
 * behaviour that needs a decision before it is changed (it changes live
 * billing), so it is asserted as-is: the suite stays a true description of
 * production and fails the moment the webhook changes, prompting an update.
 * Paths that call the Stripe API (subscription checkout) are out of reach
 * without Stripe and are listed as not covered.
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
let writes = 0;

// ── mock PostgREST: PATCH /rest/v1/profiles?<col>=eq.<v> ──
const mock = Deno.serve({ port: MOCK_PORT, onListen: () => {} }, async (req) => {
  const u = new URL(req.url);
  if (u.pathname !== "/rest/v1/profiles") return new Response("not mocked", { status: 404 });
  const filters = [...u.searchParams.entries()].filter(([k]) => !["select", "columns"].includes(k));
  const match = (p: Profile) => filters.every(([k, v]) => v.startsWith("eq.") && String(p[k]) === v.slice(3));
  if (req.method === "PATCH") {
    const patch = await req.json();
    const hit = profiles.filter(match);
    for (const p of hit) Object.assign(p, patch);
    writes += hit.length;
    return new Response(null, { status: 204 });
  }
  if (req.method === "GET") return Response.json(profiles.filter(match));
  return new Response("not mocked", { status: 405 });
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

type Result = { name: string; verdict: "ok" | "DEFECT"; pass: boolean; detail: string };
const results: Result[] = [];
const expect = (name: string, verdict: "ok" | "DEFECT", cond: boolean, detail = "") => results.push({ name, verdict, pass: cond, detail });
const reset = (rows: Profile[]) => { profiles = structuredClone(rows); writes = 0; };
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
expect("replayed checkout rewrites plan_started_at (no event-id dedupe)", "DEFECT", get("u1").plan_started_at !== started1, `${started1} -> ${get("u1").plan_started_at}`);

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
expect("an older update arriving late overwrites the newer plan (no ordering check)", "DEFECT", get("u3").plan_tier === "pro", `final ${get("u3").plan_tier}`);

// 5. Lifetime member, old subscription ends
reset([{ id: "u4", plan_tier: "lifetime_founder", stripe_customer_id: "cus_4", stripe_subscription_id: null, stripe_price_id: PRICES.lifetime }]);
await send(ev("customer.subscription.deleted", sub("sub_old4", "cus_4", PRICES.pro, { status: "canceled" })));
expect("a Lifetime member is downgraded to starter when an old subscription is deleted", "DEFECT", get("u4").plan_tier === "starter", `final ${get("u4").plan_tier}`);

reset([{ id: "u5", plan_tier: "lifetime_founder", stripe_customer_id: "cus_5", stripe_subscription_id: null, stripe_price_id: PRICES.lifetime }]);
await send(ev("customer.subscription.updated", sub("sub_old5", "cus_5", PRICES.pro, { cancel_at_period_end: true })));
expect("a Lifetime member is overwritten to pro by an update on an old subscription", "DEFECT", get("u5").plan_tier === "pro", `final ${get("u5").plan_tier}`);

// 6. Deleted event for a subscription that is not the current one
reset([{ id: "u6", plan_tier: "ultra", stripe_customer_id: "cus_6", stripe_subscription_id: "sub_new6", stripe_price_id: PRICES.ultra }]);
await send(ev("customer.subscription.deleted", sub("sub_old6", "cus_6", PRICES.pro, { status: "canceled" })));
expect("deleting a previous subscription downgrades a customer whose current one is active (matches on customer, not subscription)", "DEFECT", get("u6").plan_tier === "starter", `final ${get("u6").plan_tier}`);

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

child.kill("SIGTERM");
const stderr = new TextDecoder().decode((await child.output()).stderr);
await mock.shutdown();

let failed = 0;
for (const r of results) {
  if (!r.pass) failed++;
  console.log(`${r.pass ? "✓" : "✗"} [${r.verdict}] ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
}
const defects = results.filter((r) => r.verdict === "DEFECT" && r.pass).length;
console.log(`\n${results.length - failed}/${results.length} behave as recorded · ${defects} recorded DEFECTs need an approved webhook change`);
console.log("Not covered locally: subscription-mode checkout (calls stripe.subscriptions.retrieve).");
if (failed) { console.error(stderr.slice(-2000)); Deno.exit(1); }
