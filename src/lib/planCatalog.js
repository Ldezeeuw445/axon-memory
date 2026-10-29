// Frontend copy for the 4-tier pricing model. Mirrors
// supabase/functions/_shared/plans.ts (tier keys + billing mode) and
// supabase/migrations/20260805214500_pricing_tiers.sql (feature matrix) —
// keep all three in sync when pricing changes. Every line below must be
// true of the plan_features matrix — no unverifiable perks or urgency.
export const PLAN_CATALOG = [
  {
    tier: 'starter',
    name: 'Starter',
    price: '€2.99',
    period: '/month',
    tagline: 'Your memory, kept in one place.',
    features: [
      'Capture and recall in the AXON app',
      'Connect Gmail, GitHub, Notion, and Slack',
      'Keyword recall and your Terrain',
      'No AI connectors (MCP) on this plan',
    ],
    cta: 'Start on Starter',
  },
  {
    tier: 'pro',
    name: 'Pro',
    price: '€5.99',
    period: '/month',
    tagline: 'Let the AIs you use read it.',
    recommended: true,
    features: [
      'Everything in Starter',
      'Connect Claude, ChatGPT, Gemini, Cursor and other MCP clients',
      'One memory shared across every connected AI',
      'Advanced recall filters',
      'Cancel any time; you keep your memory on Starter',
    ],
    cta: 'Go Pro',
  },
  {
    tier: 'ultra',
    name: 'Power',
    price: '€9.99',
    period: '/month',
    tagline: 'For power users and builders.',
    features: [
      'Everything in Pro',
      'Recall by meaning, not just words',
      'Personal API keys for your own tools',
      'Cancel any time; you keep your memory on Starter',
    ],
    cta: 'Go Power',
  },
  {
    tier: 'lifetime_founder',
    name: 'Lifetime Founder',
    price: '€199',
    period: 'one-time',
    tagline: 'Everything in Power, paid once.',
    features: [
      'Everything in Power',
      'No recurring billing',
      '14-day money-back on Lifetime',
    ],
    cta: 'Choose Lifetime',
  },
];

export function planByTier(tier) {
  return PLAN_CATALOG.find((p) => p.tier === tier);
}
