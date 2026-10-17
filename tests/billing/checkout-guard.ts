/**
 * A11-3 — stripe-checkout refuses a Lifetime member before any Stripe call.
 * Runs the REAL function locally: SUPABASE_URL points at a mock that answers
 * /auth/v1/user and /rest/v1/profiles; STRIPE_SECRET_KEY is a dummy, so any
 * Stripe call fails (500). A 409 therefore proves no Stripe call was made, and
 * a 500 for a Starter member proves the guard lets everyone else through.
 *
 *   deno run -A tests/billing/checkout-guard.ts
 */
const MOCK_PORT = 54398;
const FN_PORT = 8000; // Deno.serve default; the function takes no port
const users: Record<string, { id: string; plan_tier: string }> = {
  "tok-life": { id: "u-life", plan_tier: "lifetime_founder" },
  "tok-starter": { id: "u-starter", plan_tier: "starter" },
};
const mock = Deno.serve({ port: MOCK_PORT, onListen: () => {} }, (req) => {
  const u = new URL(req.url);
  const tok = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (u.pathname === "/auth/v1/user") {
    const who = users[tok];
    return who ? Response.json({ id: who.id, aud: "authenticated", email: `${who.id}@rls-test.invalid` }) : Response.json({ msg: "bad jwt" }, { status: 401 });
  }
  if (u.pathname === "/rest/v1/profiles") {
    const id = (u.searchParams.get("id") ?? "").replace(/^eq\./, "");
    const p = Object.values(users).find((x) => x.id === id);
    return p ? Response.json({ id: p.id, stripe_customer_id: "cus_local", email: null, plan_tier: p.plan_tier }) : Response.json({ message: "none" }, { status: 406 });
  }
  return new Response("not mocked", { status: 404 });
});
const fn = new URL("../../supabase/functions/stripe-checkout/index.ts", import.meta.url).pathname;
const child = new Deno.Command(Deno.execPath(), {
  args: ["run", "-A", "--quiet", fn],
  clearEnv: true,
  env: {
    PATH: Deno.env.get("PATH") ?? "", HOME: Deno.env.get("HOME") ?? "", DENO_DIR: Deno.env.get("DENO_DIR") ?? `${Deno.env.get("HOME")}/.cache/deno`,
    // Stripe's API host is unreachable on purpose: a dummy key and no network to it.
    STRIPE_SECRET_KEY: "sk_test_axon_local_dummy", SUPABASE_URL: `http://127.0.0.1:${MOCK_PORT}`, SUPABASE_SERVICE_ROLE_KEY: "local-dummy",
    APP_URL: "https://app.axon-memory.com",
  },
  stdout: "null", stderr: "piped",
}).spawn();
const call = async (tok: string, tier: string) => {
  const r = await fetch(`http://127.0.0.1:${FN_PORT}/`, { method: "POST", headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" }, body: JSON.stringify({ tier }) });
  return { status: r.status, body: await r.json().catch(() => null) };
};
for (let i = 0; i < 120; i++) {
  try { const r = await fetch(`http://127.0.0.1:${FN_PORT}/`, { method: "OPTIONS" }); await r.body?.cancel(); break; } catch { await new Promise((r) => setTimeout(r, 500)); }
}
const results: [string, boolean, string][] = [];
for (const tier of ["starter", "pro", "ultra", "lifetime_founder"]) {
  const r = await call("tok-life", tier);
  results.push([`Lifetime member asking for ${tier}: 409 already_lifetime, no Stripe call`, r.status === 409 && r.body?.error === "already_lifetime", `${r.status} ${JSON.stringify(r.body)}`]);
}
const s = await call("tok-starter", "pro");
results.push(["Starter member asking for pro passes the guard (not refused; Stripe itself is unreachable here)", s.status !== 409 && s.status !== 401, `${s.status} ${JSON.stringify(s.body)}`]);
const anon = await call("tok-nobody", "pro");
results.push(["no valid session: 401", anon.status === 401, `${anon.status}`]);
child.kill("SIGTERM"); await child.output(); await mock.shutdown();
let failed = 0;
for (const [name, pass, detail] of results) { if (!pass) failed++; console.log(`${pass ? "✓" : "✗"} ${name}${pass ? "" : ` — ${detail}`}`); }
console.log(`\n${results.length - failed}/${results.length} checkout guard checks pass`);
if (failed) Deno.exit(1);
