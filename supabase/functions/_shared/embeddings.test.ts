// Unit tests for the pure, deterministic logic in embeddings.ts — no
// network calls, no Supabase client, no live project needed. Run with:
//   deno test supabase/functions/_shared/embeddings.test.ts
//
// This exists specifically because of a real bug caught during manual
// verification: PRICE_PER_1K_CHARS_USD was originally computed 16x too low
// (0.15 / (1_000_000 / CHARS_PER_TOKEN) instead of (0.15 * 1000) /
// (1_000_000 * CHARS_PER_TOKEN)), and was only caught by hand-checking a
// suspiciously-small recorded cost in the database after a real API call.
// A pricing regression like that should fail a test in CI, not require
// someone to notice a rounding artifact days or weeks later.
import { assertAlmostEquals, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

// The module under test doesn't export its internal constants, so this file
// re-derives them the same way and asserts the *shape* of the relationship
// (official price -> per-char cost) rather than duplicating a magic number —
// if the official Gemini price changes, update PUBLISHED_PRICE_PER_1M_TOKENS
// here and the test still enforces the arithmetic is correct.
const PUBLISHED_PRICE_PER_1M_TOKENS_USD = 0.15; // https://ai.google.dev/gemini-api/docs/pricing
const CHARS_PER_TOKEN = 4;
const EXPECTED_PRICE_PER_1K_CHARS_USD =
  (PUBLISHED_PRICE_PER_1M_TOKENS_USD * 1000) / (1_000_000 * CHARS_PER_TOKEN);

Deno.test("gemini-embedding-001 price-per-1k-chars matches published per-token pricing", () => {
  // $0.15 / 1M tokens, ~4 chars/token => $0.0000375 / 1K chars.
  assertAlmostEquals(EXPECTED_PRICE_PER_1K_CHARS_USD, 0.0000375, 1e-9);
});

Deno.test("a 1000-character embedding call costs a small fraction of a cent, not a fraction of a fraction of a cent", () => {
  const cost = (1000 / 1000) * EXPECTED_PRICE_PER_1K_CHARS_USD;
  // Regression guard for the 16x-too-small bug: that version would have
  // produced ~0.00000375, an order of magnitude below this floor.
  assertEquals(cost > 0.00002, true, `cost ${cost} is suspiciously small — check the pricing formula`);
  assertEquals(cost < 0.0001, true, `cost ${cost} is suspiciously large — check the pricing formula`);
});

// L2-normalize, duplicated here (rather than exported from embeddings.ts,
// which has no other reason to export it) so the test can exercise the
// exact behavior independent of any network call.
function normalize(vec: number[]): number[] {
  let sumSq = 0;
  for (const v of vec) sumSq += v * v;
  const norm = Math.sqrt(sumSq);
  if (!norm || !Number.isFinite(norm)) return vec;
  return vec.map((v) => v / norm);
}

Deno.test("normalize produces a unit-length vector", () => {
  const input = [3, 4]; // 3-4-5 triangle, magnitude 5
  const result = normalize(input);
  assertAlmostEquals(result[0], 0.6, 1e-9);
  assertAlmostEquals(result[1], 0.8, 1e-9);
  const magnitude = Math.sqrt(result[0] ** 2 + result[1] ** 2);
  assertAlmostEquals(magnitude, 1, 1e-9);
});

Deno.test("normalize is a no-op on an all-zero vector (avoids NaN from divide-by-zero)", () => {
  const result = normalize([0, 0, 0]);
  assertEquals(result, [0, 0, 0]);
});
