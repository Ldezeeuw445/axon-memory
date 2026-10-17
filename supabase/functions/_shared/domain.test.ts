import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import {
  computeDepth, computeWeight, ContractError, isFacet, lifecycleStateOf, MEMORY_VIEW_COLUMNS,
  memoryFromRow, normalizeContent, normalizeFacets,
} from "./domain.ts";

// The same cases are asserted against public.memory_weight / memory_depth in
// tests/schema/memory_model.sql — keep the two lists identical.
export const WEIGHT_CASES: [number | null, number, number, string, number][] = [
  [null, 0, 0, "github", 1], [null, 0, 0, "manual", 2], [null, 1, 0, "github", 2], [null, 5, 0, "github", 3],
  [null, 2, 3, "manual", 5], [null, 9, 9, "manual", 5], [4, 0, 0, "github", 4], [1, 9, 9, "manual", 1],
];
export const DEPTH_CASES: [number, boolean, number][] = [[0, false, 0], [6, false, 0], [8, false, 1], [40, false, 2], [400, false, 3], [1, true, 3]];

Deno.test("weight rules", () => {
  for (const [anchor, clients, links, src, want] of WEIGHT_CASES) {
    assertEquals(computeWeight({ anchoredWeight: anchor, recallClients: clients, linkCount: links, sourceType: src }), want, `${anchor},${clients},${links},${src}`);
  }
});

Deno.test("depth rules", () => {
  const now = new Date("2026-10-17T12:00:00Z");
  for (const [days, retired, want] of DEPTH_CASES) {
    const occurred = new Date(now.getTime() - days * 86_400_000);
    assertEquals(computeDepth(occurred, retired ? now : null, now), want, `${days}d retired=${retired}`);
  }
  assertEquals(computeDepth(null, null, now), 0);
});

Deno.test("lifecycle state derivation", () => {
  assertEquals(lifecycleStateOf(null, null), "active");
  assertEquals(lifecycleStateOf("2026-01-01", "user"), "retired");
  assertEquals(lifecycleStateOf("2026-01-01", "superseded"), "superseded");
  assertEquals(lifecycleStateOf("2026-01-01", null), "retired");
});

Deno.test("facets", () => {
  assertEquals(isFacet("trading"), true);
  assertEquals(isFacet("Trading"), false);
  assertEquals(isFacet("-x"), false);
  assertEquals(normalizeFacets(["Trading OS", "trading-os", "  Dev ", 3, "!!"]), ["trading-os", "dev"]);
});

Deno.test("normalized content", () => {
  assertEquals(normalizeContent(" Title ", "  Some\n\ncontent  "), "title some content");
  assertEquals(normalizeContent(null, "A  b"), "a b");
});

const row = () => ({
  id: "11111111-1111-1111-1111-111111111111", owner_id: "22222222-2222-2222-2222-222222222222",
  title: "Decision", content: "Use Postgres", normalized_content: "decision use postgres", content_type: "note",
  source_type: "manual", source_id: null, source_application: "claude", source_connection_id: null,
  api_key_id: "33333333-3333-3333-3333-333333333333", capture_channel: "agent", source_at: "2026-10-01T00:00:00Z",
  created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z", thread_id: null, facets: ["development"],
  entities: ["Postgres"], confidence: null, lifecycle_state: "active", retired_at: null, retired_reason: null,
  superseded_by: null, anchored_weight: null, recall_clients: 1, recall_count: 4, link_count: 1, weight: 3, depth: 1,
  has_embedding: true,
});

Deno.test("memoryFromRow maps a valid row", () => {
  const m = memoryFromRow(row());
  assertEquals(m.provenance.channel, "agent");
  assertEquals(m.provenance.sourceApplication, "claude");
  assertEquals(m.lifecycle.state, "active");
  assertEquals(m.strength, { weight: 3, anchored: false, depth: 1, recallClients: 1, recallCount: 4, linkCount: 1 });
  assertEquals(Object.keys(row()).sort(), [...MEMORY_VIEW_COLUMNS].sort());
});

Deno.test("memoryFromRow rejects contract violations", () => {
  assertThrows(() => memoryFromRow({ ...row(), lifecycle_state: "deleted" }), ContractError);
  assertThrows(() => memoryFromRow({ ...row(), lifecycle_state: "retired" }), ContractError); // retired_at null
  assertThrows(() => memoryFromRow({ ...row(), facets: ["Bad Facet"] }), ContractError);
  assertThrows(() => memoryFromRow({ ...row(), confidence: 2 }), ContractError);
  assertThrows(() => memoryFromRow({ ...row(), weight: 9 }), ContractError);
  assertThrows(() => memoryFromRow({ ...row(), source_type: "fax" }), ContractError);
  assertThrows(() => memoryFromRow({ ...row(), content: "" }), ContractError);
  const s = memoryFromRow({ ...row(), lifecycle_state: "superseded", retired_at: "2026-10-02T00:00:00Z", retired_reason: "superseded", superseded_by: "44444444-4444-4444-4444-444444444444" });
  assertEquals(s.lifecycle.supersededBy, "44444444-4444-4444-4444-444444444444");
});
