/**
 * Stripe → entitlement reducer (A11-2, wired into stripe-webhook in A11-3
 * after Luka's approval on 2026-10-17; docs/BILLING.md).
 *
 * Pure: given the profile as stored, the event, and what has already been
 * processed, it returns the profile patch to write, or null for "nothing to
 * do". Every defect recorded by tests/billing/webhook-replay.ts has a case in
 * billing.test.ts that this reducer gets right.
 *
 * Rules
 *  1. An event id already processed is a no-op (needs a processed-events
 *     ledger; proposed additive table `stripe_events`).
 *  2. An event older than the last one applied to this customer is a no-op
 *     (Stripe does not guarantee order; needs `profiles.billing_event_at`).
 *  3. Lifetime is never taken away by a subscription event. A Lifetime member
 *     with a subscription still running is surfaced, not silently changed.
 *  4. A subscription event only acts on the profile's CURRENT subscription.
 *     Deleting a previous one changes nothing.
 *  5. plan_started_at moves only when the tier actually changes.
 */
import { FALLBACK_TIER, PLANS, tierFromPriceId, type PlanTier } from "./plans.ts";

export type BillingProfile = {
  plan_tier: PlanTier;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  billing_event_at?: string | null;
};
export type BillingEvent = { id: string; type: string; created: number; data: { object: any } };
export type Decision =
  | { action: "write"; patch: Record<string, unknown>; note?: string }
  | { action: "skip"; reason: string };

const iso = (unix: number) => new Date(unix * 1000).toISOString();

export function decide(
  profile: BillingProfile | null,
  event: BillingEvent,
  seen: (eventId: string) => boolean,
  ctx: { subscriptionPriceId?: string | null } = {},
): Decision {
  if (seen(event.id)) return { action: "skip", reason: "duplicate event" };
  if (!profile) return { action: "skip", reason: "no matching profile" };
  if (profile.billing_event_at && iso(event.created) < profile.billing_event_at) {
    return { action: "skip", reason: "older than the last applied event" };
  }
  const o = event.data.object ?? {};
  const stamp = { billing_event_at: iso(event.created) };
  const tierChange = (tier: PlanTier) => (tier !== profile.plan_tier ? { plan_tier: tier, plan_started_at: iso(event.created) } : {});
  const isLifetime = profile.plan_tier === "lifetime_founder";

  switch (event.type) {
    case "checkout.session.completed": {
      const customer = typeof o.customer === "string" ? o.customer : o.customer?.id ?? null;
      if (o.mode === "payment") {
        if (o.metadata?.plan_tier !== "lifetime_founder") return { action: "skip", reason: "one-time checkout without a recognised plan" };
        return { action: "write", patch: { ...tierChange("lifetime_founder"), plan_expires_at: null, stripe_customer_id: customer, stripe_subscription_id: null, stripe_price_id: PLANS.lifetime_founder.priceId, ...stamp } };
      }
      if (o.mode === "subscription") {
        const subId = typeof o.subscription === "string" ? o.subscription : o.subscription?.id ?? null;
        if (!subId) return { action: "skip", reason: "subscription checkout without a subscription id" };
        if (isLifetime) {
          return { action: "skip", reason: "lifetime member started a subscription; tier kept", };
        }
        const tier = tierFromPriceId(ctx.subscriptionPriceId) ?? FALLBACK_TIER;
        return { action: "write", patch: { ...tierChange(tier), plan_expires_at: null, stripe_customer_id: customer, stripe_subscription_id: subId, stripe_price_id: ctx.subscriptionPriceId ?? null, ...stamp } };
      }
      return { action: "skip", reason: "checkout mode not handled" };
    }
    case "customer.subscription.updated": {
      if (isLifetime) return { action: "skip", reason: "lifetime is not changed by subscription events" };
      if (profile.stripe_subscription_id && o.id !== profile.stripe_subscription_id) return { action: "skip", reason: "not the current subscription" };
      const priceId = o.items?.data?.[0]?.price?.id ?? null;
      const tier = tierFromPriceId(priceId);
      if (!tier) return { action: "skip", reason: "unrecognised price" };
      return { action: "write", patch: { ...tierChange(tier), stripe_subscription_id: o.id, stripe_price_id: priceId, ...stamp } };
    }
    case "customer.subscription.deleted": {
      if (isLifetime) return { action: "skip", reason: "lifetime is not changed by subscription events" };
      if (o.id !== profile.stripe_subscription_id) return { action: "skip", reason: "not the current subscription" };
      return { action: "write", patch: { ...tierChange(FALLBACK_TIER), stripe_subscription_id: null, stripe_price_id: null, ...stamp } };
    }
    default:
      return { action: "skip", reason: "event type not handled" };
  }
}

/**
 * A11-3 — refuse a checkout that can only take money for nothing. A Lifetime
 * member already has every feature for good: a subscription on top would bill
 * them monthly for what they own, and a second Lifetime would charge twice.
 */
export function checkoutRefusal(current: string | null | undefined, requested: PlanTier): string | null {
  if (current !== "lifetime_founder") return null;
  return requested === "lifetime_founder"
    ? "You already have Lifetime. There is nothing more to buy."
    : "You have Lifetime, which already includes everything in every plan. No subscription is needed.";
}
