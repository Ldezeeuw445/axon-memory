import { assertEquals } from "jsr:@std/assert@1";
import { channelOf, confidenceOf, inferenceOf, relevanceOf, sourceOf, traceMemory, traceNote, type HybridRow } from "./recall.ts";

const row = (o: Partial<HybridRow> = {}): HybridRow => ({
  id: "m1", content_type: "note", title: "T", content: "C", occurred_at: "2026-10-01T00:00:00Z", source_type: "manual", ...o,
});

Deno.test("channel follows provenance precedence: connector > agent > direct", () => {
  assertEquals(channelOf(row()), "direct");
  assertEquals(channelOf(row({ api_key_id: "k" })), "agent");
  assertEquals(channelOf(row({ api_key_id: "k", source_connection_id: "c", source_type: "gmail" })), "connector");
  assertEquals(channelOf(row({ source_type: "github" })), "unknown");
  assertEquals(channelOf(row({ capture_channel: "agent" })), "agent");
});

Deno.test("confidence: stated value wins; age lowers; reliance raises; separate from relevance", () => {
  assertEquals(confidenceOf(row()).level, "high");
  assertEquals(confidenceOf(row({ source_connection_id: "c", depth: 3 })).level, "low");
  assertEquals(confidenceOf(row({ api_key_id: "k", weight: 4 })).score, 0.8);
  assertEquals(confidenceOf(row({ confidence: 0.3 })).level, "low");
  assertEquals(confidenceOf(row({ score: 0.01 })).level, "high");
});

Deno.test("source trace names provider/account for connectors and the client for agents", () => {
  const maps = {
    connections: new Map([["c", { provider: "gmail", account: "me@x.com" }]]),
    clients: new Map([["k", "Claude"]]),
  };
  assertEquals(sourceOf(row({ source_connection_id: "c", source_type: "gmail" }), maps),
    { channel: "connector", type: "gmail", provider: "gmail", account: "me@x.com", at: "2026-10-01T00:00:00Z" });
  assertEquals(sourceOf(row({ api_key_id: "k", metadata: { url: "https://x" } }), maps),
    { channel: "agent", type: "manual", client: "Claude", url: "https://x", at: "2026-10-01T00:00:00Z" });
});

Deno.test("a recalled memory says it is a memory and carries id, source, confidence, relevance", () => {
  const t = traceMemory(row({ score: 0.734, matched_by: ["semantic", "lexical"], project_id: "p", facets: ["trading"] }),
    { threads: new Map([["p", "trading-os"]]) });
  assertEquals(t.kind, "memory");
  assertEquals(t.id, "m1");
  assertEquals(t.relevance, { score: 0.73, matched_by: ["semantic", "lexical"] });
  assertEquals(t.thread, "trading-os");
  assertEquals(t.facets, ["trading"]);
  assertEquals(t.confidence, "high");
});

Deno.test("A3: a note in your_notes carries its memory_items id and its source", () => {
  const maps = { clients: new Map([["k", "Claude"]]) };
  const n = traceNote(row({ id: "n1", origin_key: "notes", api_key_id: "k", content: "x".repeat(500), metadata: { repo: "axon" } }), maps);
  assertEquals(n.id, "n1");
  assertEquals(n.kind, "memory");
  assertEquals(n.source, { channel: "agent", type: "manual", client: "Claude", app: "notes", at: "2026-10-01T00:00:00Z" });
  assertEquals(n.text.length, 400);
  assertEquals(n.about, "axon");
  assertEquals(traceNote(row({ id: "n2", metadata: null })).source.channel, "direct");
});

Deno.test("A3: every memory-shaped item in the pack has an id and a source", () => {
  const rows = [row({ id: "a" }), row({ id: "b", source_connection_id: "c", source_type: "gmail" }), row({ id: "c", api_key_id: "k" })];
  for (const item of [...rows.map((r) => traceMemory(r)), ...rows.map((r) => traceNote(r))]) {
    assertEquals(typeof item.id, "string");
    assertEquals(typeof item.source.channel, "string");
    assertEquals(item.source.at, "2026-10-01T00:00:00Z");
  }
});

Deno.test("inferences are labelled, point at their sources, and need 2+ sources for high", () => {
  const now = Date.parse("2026-10-17T00:00:00Z");
  const one = inferenceOf({ statement: "Prefers Postgres", category: "decision", source_item_ids: ["a"], last_confirmed_at: "2026-10-10T00:00:00Z" }, now);
  assertEquals(one.kind, "inference");
  assertEquals(one.from, ["a"]);
  assertEquals(one.confidence, "medium");
  const three = inferenceOf({ statement: "x", category: "c", source_item_ids: ["a", "b", "c"], last_confirmed_at: "2026-10-10T00:00:00Z" }, now);
  assertEquals(three.confidence, "high");
  const stale = inferenceOf({ statement: "x", category: "c", source_item_ids: ["a"], last_confirmed_at: "2025-10-10T00:00:00Z" }, now);
  assertEquals(stale.confidence, "low");
  const many = inferenceOf({ statement: "x", category: "c", source_item_ids: ["1", "2", "3", "4", "5", "6", "7"] }, now);
  assertEquals(many.from.length, 5);
  assertEquals(many.from_total, 7);
});

Deno.test("relevance: raw similarity is reported when the question was embedded, and only then", () => {
  assertEquals(relevanceOf({ id: "a", score: 0.734, matched_by: ["semantic"], semantic: 0.6789 } as HybridRow), { score: 0.73, matched_by: ["semantic"], similarity: 0.68 });
  assertEquals(relevanceOf({ id: "a", score: 0.5, matched_by: ["lexical"], semantic: null } as HybridRow), { score: 0.5, matched_by: ["lexical"] });
});
