// Frontend copy for the 4-tier pricing model. Mirrors
// supabase/functions/_shared/plans.ts (tier keys + billing mode) and
// supabase/migrations/20260805214500_pricing_tiers.sql (feature matrix) —
// keep all three in sync when pricing changes.
export const PLAN_CATALOG = [
  {
    tier: 'starter',
    name: 'Starter',
    price: '€2.99',
    period: '/month',
    tagline: 'Get your memory layer running.',
    features: [
      'Unlimited structured memories',
      'Connect Gmail, GitHub, Notion, and Slack',
      'Full-text recall & memory graph',
      'One personal API key',
    ],
    cta: 'Start on Starter',
  },
  {
    tier: 'pro',
    name: 'Pro',
    price: '€5.99',
    period: '/month',
    tagline: 'Connect your AI assistants.',
    recommended: true,
    features: [
      'Everything in Starter',
      'Connect Claude, ChatGPT, Gemini, Cursor & more',
      'One memory shared across every connected AI',
      'Advanced search & entity extraction',
    ],
    cta: 'Go Pro',
  },
  {
    tier: 'ultra',
    name: 'Ultra',
    price: '€9.99',
    period: '/month',
    tagline: 'For power users and builders.',
    features: [
      'Everything in Pro',
      'Semantic (meaning-based) search',
      'Full API + MCP access for custom tools',
      'Priority sync frequency',
    ],
    cta: 'Go Ultra',
  },
  {
    tier: 'lifetime_founder',
    name: 'Lifetime Founder',
    price: '€199',
    period: 'one-time',
    tagline: 'Everything, forever. Limited founder pricing.',
    features: [
      'Everything in Ultra',
      'Lifetime access — no recurring billing',
      'Founder badge + early access to new features',
      'Direct line to the team',
    ],
    cta: 'Claim Lifetime Access',
  },
];

export function planByTier(tier) {
  return PLAN_CATALOG.find((p) => p.tier === tier);
}
