import { assertEquals, assertMatch } from "jsr:@std/assert@1";
import { entitlementFor, planMessage, requiredFeature } from "./entitlement.ts";

// Mirrors plan_features in production (2026-10-17).
const rows = {
  starter: { plan_tier: "starter", has_axon_ai: false, has_api_access: false },
  pro: { plan_tier: "pro", has_axon_ai: true, has_api_access: false },
  ultra: { plan_tier: "ultra", has_axon_ai: true, has_api_access: true },
  lifetime_founder: { plan_tier: "lifetime_founder", has_axon_ai: true, has_api_access: true },
};

Deno.test("OAuth tokens need axon_ai, personal keys need api_access", () => {
  assertEquals(requiredFeature(true), "axon_ai");
  assertEquals(requiredFeature(false), "api_access");
});

Deno.test("the plan matrix, per credential kind", () => {
  const oauth = Object.fromEntries(Object.entries(rows).map(([k, r]) => [k, entitlementFor(r, true).entitled]));
  const key = Object.fromEntries(Object.entries(rows).map(([k, r]) => [k, entitlementFor(r, false).entitled]));
  assertEquals(oauth, { starter: false, pro: true, ultra: true, lifetime_founder: true });
  assertEquals(key, { starter: false, pro: false, ultra: true, lifetime_founder: true });
});

Deno.test("no plan row is a no; an unreadable plan keeps access", () => {
  assertEquals(entitlementFor(null, true).entitled, false);
  assertEquals(entitlementFor(null, true, true).entitled, true);
});

Deno.test("the refusal names the plan and where to change it", () => {
  assertMatch(planMessage(entitlementFor(rows.starter, true)), /Connecting AIs to AXON is not part of Starter\. Upgrade at https:\/\/app\.axon-memory\.com/);
  assertMatch(planMessage(entitlementFor(rows.pro, false)), /Personal API keys are not part of Pro/);
});
