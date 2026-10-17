import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import { ApiError, apiCaptureOutcome, apiMemory, canWrite, requireId, routeOf } from "./api-v1.ts";
import { validateCapture } from "./capture.ts";

Deno.test("routeOf strips the function and version prefix", () => {
  assertEquals(routeOf("/functions/v1/api-v1/v1/memories/abc/retire"), ["memories", "abc", "retire"]);
  assertEquals(routeOf("/api-v1/v1/recall"), ["recall"]);
  assertEquals(routeOf("/v1/health"), ["health"]);
  assertEquals(routeOf("/functions/v1/api-v1/threads"), ["threads"]);
});

Deno.test("scope + id guards", () => {
  assertEquals(canWrite(null), true);
  assertEquals(canWrite("memory.read"), false);
  assertEquals(canWrite("memory.read memory.write"), true);
  assertThrows(() => requireId("nope"), ApiError);
  assertEquals(requireId("0A1B2C3D-0000-4000-8000-000000000000"), "0a1b2c3d-0000-4000-8000-000000000000");
});

const row = {
  id: "11111111-1111-4111-8111-111111111111", title: "t", content: "c", content_type: "note", project_id: "p1", facets: ["trading"],
  source_type: "manual", origin_key: "axe-core", source_connection_id: null, api_key_id: "k1", capture_channel: "agent",
  occurred_at: "2026-10-17T10:00:00Z", created_at: "2026-10-17T10:00:00Z", updated_at: null, retired_at: null, retired_reason: null,
  superseded_by: null, confidence: null, metadata: { source_ref: { id: "ext-1", url: "https://example.com/x" }, url: "https://example.com/x" },
};

Deno.test("apiMemory: one normalized shape with provenance and lifecycle", () => {
  const m = apiMemory(row, { threads: new Map([["p1", "trading-os"]]), clients: new Map([["k1", "AXE Core"]]) });
  assertEquals(m.kind, "memory");
  assertEquals(m.state, "active");
  assertEquals(m.thread, { id: "p1", key: "trading-os" });
  assertEquals(m.source.channel, "agent");
  assertEquals(m.source.client, "AXE Core");
  assertEquals(m.source.app, "axe-core");
  assertEquals(m.source.ref, { id: "ext-1", url: "https://example.com/x" });
  assertEquals(m.stated, true);
  assertEquals(m.updated_at, row.created_at);
  assertEquals("relevance" in m, false);
  const sup = apiMemory({ ...row, retired_at: "2026-10-17T11:00:00Z", retired_reason: "superseded", superseded_by: "x" });
  assertEquals(sup.state, "superseded");
  assertEquals(sup.superseded_by, "x");
});

Deno.test("apiCaptureOutcome maps failures to the error contract", () => {
  const ok = apiCaptureOutcome({ ok: true, status: "duplicate", id: "m", created_at: null, capture_id: "c", index: "indexed", attempts: 1 });
  assertEquals(ok.body.duplicate, true);
  try {
    apiCaptureOutcome({ ok: false, status: "failed", capture_id: "c", stage: "store", code: "store_failed", error: "db down", retryable: true, http: 503 });
  } catch (e) {
    const b = (e as ApiError).body() as { error: Record<string, unknown> };
    assertEquals([(e as ApiError).status, b.error.code, b.error.retryable, b.error.capture_id], [503, "capture_failed", true, "c"]);
  }
  try {
    apiCaptureOutcome({ ok: false, status: "failed", capture_id: null, stage: "normalize", code: "invalid", error: "content (string) is required", retryable: false, http: 400 });
  } catch (e) {
    assertEquals((e as ApiError).body().error.code, "invalid");
  }
});

Deno.test("capture accepts a source ref and rejects a bad one", () => {
  const now = Date.parse("2026-10-17T10:00:00Z");
  const ok = validateCapture({ content: "x", source_ref: { id: "abc", url: "https://github.com/a/b/pull/1" } }, now);
  assertEquals(ok.ok && ok.value.source_ref, { id: "abc", url: "https://github.com/a/b/pull/1" });
  const bad = validateCapture({ content: "x", source_ref: { url: "javascript:alert(1)" } }, now);
  assertEquals(bad.ok, false);
  const none = validateCapture({ content: "x" }, now);
  assertEquals(none.ok && "source_ref" in none.value, false);
});
