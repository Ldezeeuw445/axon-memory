// The pricing copy must stay true to the plan_features matrix (A10-1).
import { describe, expect, it } from 'vitest';
import { PLAN_CATALOG } from '../planCatalog';

describe('plan catalog', () => {
  it('lists the four backend tiers, Power being tier "ultra"', () => {
    expect(PLAN_CATALOG.map((p) => p.tier)).toEqual(['starter', 'pro', 'ultra', 'lifetime_founder']);
    expect(PLAN_CATALOG.find((p) => p.tier === 'ultra').name).toBe('Power');
    expect(PLAN_CATALOG.map((p) => p.price)).toEqual(['€2.99', '€5.99', '€9.99', '€199']);
  });
  it('does not promise API keys below Power (api_access is off for starter and pro)', () => {
    for (const p of PLAN_CATALOG.filter((x) => ['starter', 'pro'].includes(x.tier))) {
      expect(p.features.join(' ')).not.toMatch(/api key/i);
    }
  });
  it('does not promise meaning-based recall below Power (semantic_search)', () => {
    for (const p of PLAN_CATALOG.filter((x) => ['starter', 'pro'].includes(x.tier))) {
      expect(p.features.join(' ')).not.toMatch(/meaning|semantic/i);
    }
  });
  it('carries no unverifiable perks or urgency', () => {
    const all = PLAN_CATALOG.map((p) => [p.tagline, ...p.features, p.cta].join(' ')).join(' ');
    expect(all).not.toMatch(/limited|badge|direct line|priority|early access|military|unlimited/i);
  });
});
