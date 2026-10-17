import { assertEquals } from "jsr:@std/assert@1";
import { checkoutRefusal, decide, type BillingEvent, type BillingProfile } from "./billing.ts";
import { PLANS } from "./plans.ts";

const P = { pro: PLANS.pro.priceId, ultra: PLANS.ultra.priceId };
const never = () => false;
let n = 0;
const ev = (type: string, object: any, created = 1_800_000_000): BillingEvent => ({ id: `evt_${++n}`, type, created, data: { object } });
const sub = (id: string, price: string, extra: any = {}) => ({ id, customer: "cus", status: "active", items: { data: [{ price: { id: price } }] }, ...extra });
const prof = (p: Partial<BillingProfile>): BillingProfile => ({ plan_tier: "starter", stripe_customer_id: "cus", stripe_subscription_id: null, billing_event_at: null, ...p });
const apply = (p: BillingProfile, d: ReturnType<typeof decide>) => (d.action === "write" ? { ...p, ...d.patch } as BillingProfile : p);

Deno.test("billing: a processed event id is a no-op", () => {
  const e = ev("customer.subscription.updated", sub("sub", P.ultra));
  const seen = new Set<string>([e.id]);
  assertEquals(decide(prof({ plan_tier: "pro", stripe_subscription_id: "sub" }), e, (id) => seen.has(id)).action, "skip");
});

Deno.test("billing: replayed lifetime checkout does not move plan_started_at", () => {
  const e = ev("checkout.session.completed", { mode: "payment", customer: "cus", metadata: { plan_tier: "lifetime_founder" } });
  const once = apply(prof({}), decide(prof({}), e, never));
  assertEquals(once.plan_tier, "lifetime_founder");
  const started = (once as any).plan_started_at;
  const twice = apply(once, decide(once, { ...e, id: "evt_replay_same_payload" }, never));
  assertEquals((twice as any).plan_started_at, started);
});

Deno.test("billing: an older update arriving late is ignored", () => {
  let p = prof({ plan_tier: "pro", stripe_subscription_id: "sub" });
  p = apply(p, decide(p, ev("customer.subscription.updated", sub("sub", P.ultra), 2_000), never));
  p = apply(p, decide(p, ev("customer.subscription.updated", sub("sub", P.pro), 1_000), never));
  assertEquals(p.plan_tier, "ultra");
});

Deno.test("billing: lifetime is never taken away by subscription events", () => {
  const p = prof({ plan_tier: "lifetime_founder" });
  assertEquals(decide(p, ev("customer.subscription.deleted", sub("sub_old", P.pro)), never).action, "skip");
  assertEquals(decide(p, ev("customer.subscription.updated", sub("sub_old", P.pro)), never).action, "skip");
  assertEquals(decide(p, ev("checkout.session.completed", { mode: "subscription", subscription: "sub_new" }), never, { subscriptionPriceId: P.pro }).action, "skip");
});

Deno.test("billing: deleting a previous subscription leaves the current plan", () => {
  const p = prof({ plan_tier: "ultra", stripe_subscription_id: "sub_new" });
  assertEquals(decide(p, ev("customer.subscription.deleted", sub("sub_old", P.pro)), never).action, "skip");
  const d = decide(p, ev("customer.subscription.deleted", sub("sub_new", P.ultra)), never);
  assertEquals(apply(p, d).plan_tier, "starter");
});

Deno.test("billing: ordinary paths still work", () => {
  let p = prof({});
  p = apply(p, decide(p, ev("checkout.session.completed", { mode: "subscription", subscription: "sub", customer: "cus" }, 10), never, { subscriptionPriceId: P.pro }));
  assertEquals([p.plan_tier, p.stripe_subscription_id], ["pro", "sub"]);
  p = apply(p, decide(p, ev("customer.subscription.updated", sub("sub", P.ultra), 20), never));
  assertEquals(p.plan_tier, "ultra");
  assertEquals(decide(p, ev("customer.subscription.updated", sub("sub", "price_other"), 30), never).action, "skip");
  assertEquals(decide(null, ev("customer.subscription.updated", sub("sub", P.pro), 30), never).action, "skip");
  assertEquals(decide(p, ev("charge.refunded", {}, 30), never).action, "skip");
});

Deno.test("checkout: a Lifetime member cannot buy a subscription or Lifetime again; everyone else can buy anything", () => {
  for (const t of ["starter", "pro", "ultra", "lifetime_founder"] as const) {
    assertEquals(typeof checkoutRefusal("lifetime_founder", t), "string");
    for (const cur of ["starter", "pro", "ultra", null]) assertEquals(checkoutRefusal(cur, t), null);
  }
});
