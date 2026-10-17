// A11-3 — plan check on every call made with a key or an OAuth token.
//
// Until now a feature was checked once, when access was granted: `axon_ai` at
// OAuth consent, `api_access` at personal-key creation. A token kept working
// after a downgrade. Now every call re-reads `user_plan_status` (the single
// source of truth, docs/BILLING.md):
//   - a token an AI obtained through OAuth needs `axon_ai`;
//   - a personal key needs `api_access`.
// The person's own app session is not a key and is not gated here.

export type PlanRow = { plan_tier: string | null; has_axon_ai: boolean | null; has_api_access: boolean | null } | null;
export type Entitlement = { entitled: boolean; plan: string | null; feature: "axon_ai" | "api_access" };

const PLAN_NAME: Record<string, string> = { starter: "Starter", pro: "Pro", ultra: "Power", lifetime_founder: "Lifetime" };

export function requiredFeature(viaOauthClient: boolean): Entitlement["feature"] {
  return viaOauthClient ? "axon_ai" : "api_access";
}

/**
 * `readFailed` = the plan could not be read (database hiccup). Access was
 * checked when it was granted, so a transient read failure keeps it rather
 * than cutting every connected AI off at once; a row that says no is a no.
 */
export function entitlementFor(row: PlanRow, viaOauthClient: boolean, readFailed = false): Entitlement {
  const feature = requiredFeature(viaOauthClient);
  if (readFailed) return { entitled: true, plan: null, feature };
  if (!row) return { entitled: false, plan: null, feature };
  const ok = feature === "axon_ai" ? row.has_axon_ai === true : row.has_api_access === true;
  return { entitled: ok, plan: row.plan_tier, feature };
}

export function planMessage(e: Entitlement): string {
  const plan = e.plan ? PLAN_NAME[e.plan] ?? e.plan : "your current plan";
  return e.feature === "axon_ai"
    ? `Connecting AIs to AXON is not part of ${plan}. Upgrade at https://app.axon-memory.com/?facet=you to keep using this connection.`
    : `Personal API keys are not part of ${plan}. Upgrade at https://app.axon-memory.com/?facet=you to keep using this key.`;
}
