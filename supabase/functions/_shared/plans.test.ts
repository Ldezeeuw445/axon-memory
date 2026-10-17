import { assertEquals } from "jsr:@std/assert@1";
import { PLANS, planDisplayName } from "./plans.ts";

Deno.test("Power is the display name of the internal 'ultra' tier; billing ids untouched", () => {
  assertEquals(planDisplayName("ultra"), "Power");
  assertEquals(planDisplayName("pro"), "Pro");
  assertEquals(planDisplayName(null), "Starter");
  assertEquals(planDisplayName("nonsense"), "Starter");
  assertEquals(PLANS.ultra.tier, "ultra");
  assertEquals(PLANS.ultra.priceId, "price_1U1AhtFGBQHVlLfhfmRRvtjv");
});
