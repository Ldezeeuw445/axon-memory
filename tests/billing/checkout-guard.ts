/**
 * A11-3 + A11-4 — stripe-checkout refuses a checkout that would charge twice.
 * Runs the REAL function locally against two mocks:
 *   - SUPABASE_URL  -> /auth/v1/user and /rest/v1/profiles
 *   - STRIPE_API_BASE -> /v1/customers, /v1/subscriptions, /v1/checkout/sessions
 * Every Stripe request is logged, so "no Stripe call" and "no checkout session
 * created" are checked directly. No real Stripe or Supabase is touched.
 *
 *   deno run -A tests/billing/checkout-guard.ts
 */
const MOCK_PORT = 54398;
const STRIPE_PORT = 54399;
const FN_PORT = 8000; // Deno.serve default; the function takes no port
const PRICE = { starter: "price_1U1AfvFGBQHVlLfhO8uNIEWX", pro: "price_1U1620FGBQHVlLfhBfLCbaZM", ultra: "price_1U1AhtFGBQHVlLfhfmRRvtjv" };
type U = { id: string; plan_tier: string; customer: string | null; subs: { status: string; price: string }[] };
const users: Record<string, U> = {
  "tok-life": { id: "u-life", plan_tier: "lifetime_founder", customer: "cus_life", subs: [] },
  "tok-new": { id: "u-new", plan_tier: "starter", customer: null, subs: [] },
  "tok-pro": { id: "u-pro", plan_tier: "pro", customer: "cus_pro", subs: [{ status: "active", price: PRICE.pro }] },
  "tok-starter-paid": { id: "u-sp", plan_tier: "starter", customer: "cus_sp", subs: [{ status: "active", price: PRICE.starter }] },
  "tok-pastdue": { id: "u-pd", plan_tier: "ultra", customer: "cus_pd", subs: [{ status: "past_due", price: PRICE.ultra }] },
  // Webhook lag: profile still says Starter with no subscription, Stripe already has one.
  "tok-lag": { id: "u-lag", plan_tier: "starter", customer: "cus_lag", subs: [{ status: "trialing", price: PRICE.pro }] },
  "tok-cancelled": { id: "u-cx", plan_tier: "starter", customer: "cus_cx", subs: [{ status: "canceled", price: PRICE.pro }, { status: "incomplete_expired", price: PRICE.ultra }] },
};
const mock = Deno.serve({ port: MOCK_PORT, onListen: () => {} }, (req) => {
  const u = new URL(req.url);
  const tok = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (u.pathname === "/auth/v1/user") {
    const who = users[tok];
    return who ? Response.json({ id: who.id, aud: "authenticated", email: `${who.id}@rls-test.invalid` }) : Response.json({ msg: "bad jwt" }, { status: 401 });
  }
  if (u.pathname === "/rest/v1/profiles") {
    if (req.method === "PATCH") return new Response(null, { status: 204 });
    const id = (u.searchParams.get("id") ?? "").replace(/^eq\./, "");
    const p = Object.values(users).find((x) => x.id === id);
    return p ? Response.json({ id: p.id, stripe_customer_id: p.customer, email: null, plan_tier: p.plan_tier }) : Response.json({ message: "none" }, { status: 406 });
  }
  return new Response("not mocked", { status: 404 });
});
let stripeLog: string[] = [];
const stripeMock = Deno.serve({ port: STRIPE_PORT, onListen: () => {} }, async (req) => {
  const u = new URL(req.url);
  stripeLog.push(`${req.method} ${u.pathname}`);
  await req.body?.cancel();
  if (u.pathname === "/v1/customers" && req.method === "POST") return Response.json({ id: "cus_created", object: "customer" });
  if (u.pathname === "/v1/subscriptions" && req.method === "GET") {
    const who = Object.values(users).find((x) => x.customer === u.searchParams.get("customer"));
    const data = (who?.subs ?? []).map((s, i) => ({ id: `sub_${i}`, object: "subscription", status: s.status, items: { object: "list", data: [{ price: { id: s.price } }] } }));
    return Response.json({ object: "list", data, has_more: false, url: "/v1/subscriptions" });
  }
  if (u.pathname === "/v1/checkout/sessions" && req.method === "POST") return Response.json({ id: "cs_test_local", object: "checkout.session", url: "https://checkout.stripe.test/cs_test_local" });
  return Response.json({ error: { message: "not mocked" } }, { status: 404 });
});
const fn = new URL("../../supabase/functions/stripe-checkout/index.ts", import.meta.url).pathname;
const child = new Deno.Command(Deno.execPath(), {
  args: ["run", "-A", "--quiet", fn],
  clearEnv: true,
  env: {
    PATH: Deno.env.get("PATH") ?? "", HOME: Deno.env.get("HOME") ?? "", DENO_DIR: Deno.env.get("DENO_DIR") ?? `${Deno.env.get("HOME")}/.cache/deno`,
    STRIPE_SECRET_KEY: "sk_test_axon_local_dummy", STRIPE_API_BASE: `http://127.0.0.1:${STRIPE_PORT}`,
    SUPABASE_URL: `http://127.0.0.1:${MOCK_PORT}`, SUPABASE_SERVICE_ROLE_KEY: "local-dummy",
    APP_URL: "https://app.axon-memory.com",
  },
  stdout: "null", stderr: "piped",
}).spawn();
const call = async (tok: string, tier: string) => {
  stripeLog = [];
  const r = await fetch(`http://127.0.0.1:${FN_PORT}/`, { method: "POST", headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" }, body: JSON.stringify({ tier }) });
  return { status: r.status, body: await r.json().catch(() => null), stripe: [...stripeLog] };
};
for (let i = 0; i < 120; i++) {
  try { const r = await fetch(`http://127.0.0.1:${FN_PORT}/`, { method: "OPTIONS" }); await r.body?.cancel(); break; } catch { await new Promise((r) => setTimeout(r, 500)); }
}
const results: [string, boolean, string][] = [];
const noSession = (r: { stripe: string[] }) => !r.stripe.includes("POST /v1/checkout/sessions");
const d = (r: any) => `${r.status} ${JSON.stringify(r.body)} stripe=${JSON.stringify(r.stripe)}`;

for (const tier of ["starter", "pro", "ultra", "lifetime_founder"]) {
  const r = await call("tok-life", tier);
  results.push([`Lifetime member asking for ${tier}: 409 already_lifetime, no Stripe call`, r.status === 409 && r.body?.error === "already_lifetime" && r.stripe.length === 0, d(r)]);
}
for (const [tok, label] of [["tok-pro", "active Pro"], ["tok-starter-paid", "active paid Starter"], ["tok-pastdue", "past_due Power"], ["tok-lag", "trialing sub not yet on the profile (webhook lag)"]]) {
  for (const tier of ["starter", "pro", "ultra"]) {
    const r = await call(tok, tier);
    results.push([`${label} asking for ${tier}: 409 already_subscribed, no checkout session`, r.status === 409 && r.body?.error === "already_subscribed" && typeof r.body?.message === "string" && noSession(r), d(r)]);
  }
}
{
  const r = await call("tok-pro", "ultra");
  results.push(["refusal message names the current plan and points to billing", /Pro/.test(r.body?.message ?? "") && /billing/.test(r.body?.message ?? "") && r.body?.current_tier === "pro", d(r)]);
}
{
  const r = await call("tok-pro", "lifetime_founder");
  results.push(["active subscriber may still buy Lifetime (one-time, not a subscription)", r.status === 200 && typeof r.body?.url === "string", d(r)]);
}
{
  const r = await call("tok-cancelled", "pro");
  results.push(["only canceled / incomplete_expired subscriptions: checkout allowed", r.status === 200 && r.stripe.includes("GET /v1/subscriptions") && !noSession(r), d(r)]);
}
{
  const r = await call("tok-new", "pro");
  results.push(["brand-new customer: customer created, checkout allowed, no subscription lookup needed", r.status === 200 && r.stripe[0] === "POST /v1/customers" && !r.stripe.includes("GET /v1/subscriptions"), d(r)]);
}
const anon = await call("tok-nobody", "pro");
results.push(["no valid session: 401, no Stripe call", anon.status === 401 && anon.stripe.length === 0, `${anon.status}`]);
child.kill("SIGTERM"); await child.output(); await mock.shutdown(); await stripeMock.shutdown();
let failed = 0;
for (const [name, pass, detail] of results) { if (!pass) failed++; console.log(`${pass ? "✓" : "✗"} ${name}${pass ? "" : ` — ${detail}`}`); }
console.log(`\n${results.length - failed}/${results.length} checkout guard checks pass`);
if (failed) Deno.exit(1);
