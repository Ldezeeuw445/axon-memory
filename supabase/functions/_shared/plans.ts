// Shared plan/price configuration for Axon Memory's 4-tier pricing model.
// Single source of truth — both stripe-checkout and stripe-webhook import this.

export type PlanTier = "starter" | "pro" | "ultra" | "lifetime_founder";

export interface PlanConfig {
  tier: PlanTier;
  priceId: string;
  mode: "subscription" | "payment"; // Stripe Checkout Session mode
}

export const PLANS: Record<PlanTier, PlanConfig> = {
  starter: {
    tier: "starter",
    priceId: "price_1U1AfvFGBQHVlLfhO8uNIEWX", // €2,99 / month
    mode: "subscription",
  },
  pro: {
    tier: "pro",
    priceId: "price_1U1620FGBQHVlLfhBfLCbaZM", // €5,99 / month
    mode: "subscription",
  },
  ultra: {
    tier: "ultra",
    priceId: "price_1U1AhtFGBQHVlLfhfmRRvtjv", // €9,99 / month
    mode: "subscription",
  },
  lifetime_founder: {
    tier: "lifetime_founder",
    priceId: "price_1U1AjIFGBQHVlLfhwDyO8RZl", // €199 one-time
    mode: "payment",
  },
};

// Reverse lookup used by the webhook to resolve a Stripe price ID back to a plan tier.
const PRICE_ID_TO_TIER: Record<string, PlanTier> = Object.fromEntries(
  Object.values(PLANS).map((p) => [p.priceId, p.tier]),
) as Record<string, PlanTier>;

export function tierFromPriceId(priceId: string | null | undefined): PlanTier | null {
  if (!priceId) return null;
  return PRICE_ID_TO_TIER[priceId] ?? null;
}

export function isValidTier(tier: string): tier is PlanTier {
  return tier === "starter" || tier === "pro" || tier === "ultra" || tier === "lifetime_founder";
}

// The tier a cancelled/expired subscription falls back to.
export const FALLBACK_TIER: PlanTier = "starter";
