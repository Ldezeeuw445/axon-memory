import { assert, assertEquals } from "jsr:@std/assert@1";
import { classifyKind, decideOnExisting, describeOutcome, LIMITS, originKeyFor, validateCapture } from "./capture.ts";

const NOW = Date.parse("2026-10-17T12:00:00Z");

Deno.test("normalize: trims, dedupes tags, slugs facets, lowercases project, keeps content verbatim", () => {
  const r = validateCapture({ content: "  We use Postgres.\n\nReally.  ", title: " DB ", tags: ["a", "a", " b ", 3], facets: ["Trading OS", "!!"], project: " Trading-OS " }, NOW);
  assert(r.ok);
  assertEquals(r.value.content, "We use Postgres.\n\nReally.");
  assertEquals(r.value.title, "DB");
  assertEquals(r.value.tags, ["a", "b"]);
  assertEquals(r.value.facets, ["trading-os"]);
  assertEquals(r.value.project, "trading-os");
  assertEquals(r.value.occurred_at, new Date(NOW).toISOString());
  assertEquals(r.value.idempotency_key, null);
});

Deno.test("normalize: rejects what cannot be stored, with a reason", () => {
  for (const bad of [
    {}, { content: "   " }, { content: 5 }, { content: "x".repeat(LIMITS.content + 1) },
    { content: "x", tags: "a" }, { content: "x", project: 3 }, { content: "x", idempotency_key: "short" },
    { content: "x", idempotency_key: "has spaces in it" }, { content: "x", occurred_at: "yesterday" },
    { content: "x", occurred_at: "2026-10-30T00:00:00Z" },
  ]) {
    const r = validateCapture(bad as never, NOW);
    assert(!r.ok, JSON.stringify(bad));
  }
  const ok = validateCapture({ content: "x", idempotency_key: "phone-queue:0001", occurred_at: "2026-10-16T08:00:00Z" }, NOW);
  assert(ok.ok);
  assertEquals(ok.value.idempotency_key, "phone-queue:0001");
  assertEquals(ok.value.occurred_at, "2026-10-16T08:00:00.000Z");
});

Deno.test("classify: decision / preference / task / fact", () => {
  assertEquals(classifyKind("We decided to keep Postgres"), "decision");
  assertEquals(classifyKind("I prefer short answers"), "preference");
  assertEquals(classifyKind("Need to renew the domain"), "task");
  assertEquals(classifyKind("The office is in Utrecht"), "fact");
});

Deno.test("provenance: an unknown client keeps its own name; nothing claimed is manual", () => {
  assertEquals(originKeyFor(null), "manual");
  assertEquals(originKeyFor("Claude"), "anthropic");
  assertEquals(originKeyFor("My Private Tool"), "my-private-tool");
});

Deno.test("idempotency: stored/duplicate return, failed/stale retry, fresh in-progress waits, deleted never resurrects", () => {
  const ev = (status: string, memory_id: string | null, ageMs = 0) =>
    ({ id: "e", status, memory_id, attempts: 1, updated_at: new Date(NOW - ageMs).toISOString() });
  assertEquals(decideOnExisting(ev("indexed", "m"), NOW), "return");
  assertEquals(decideOnExisting(ev("duplicate", "m"), NOW), "return");
  assertEquals(decideOnExisting(ev("stored", "m"), NOW), "reindex");
  // indexing handed to the background seconds ago: answer, don't embed twice; after a minute, re-run it
  assertEquals(decideOnExisting({ ...ev("stored", "m", 5_000), error_code: "index_queued" }, NOW), "return");
  assertEquals(decideOnExisting({ ...ev("stored", "m", 120_000), error_code: "index_queued" }, NOW), "reindex");
  assertEquals(decideOnExisting(ev("failed", null), NOW), "retry");
  assertEquals(decideOnExisting(ev("received", null, 10_000), NOW), "in_progress");
  assertEquals(decideOnExisting(ev("received", null, 5 * 60_000), NOW), "retry");
  assertEquals(decideOnExisting(ev("indexed", null), NOW), "deleted");
  assertEquals(decideOnExisting(ev("stored", null), NOW), "deleted");
});

Deno.test("outcome text tells an assistant what happened and how to retry", () => {
  assertEquals(describeOutcome({ ok: true, status: "duplicate", id: "m", created_at: null, capture_id: "c", index: "indexed", attempts: 2 }),
    "Already saved (id: m); not stored twice.");
  const pending = describeOutcome({ ok: true, status: "stored", id: "m", created_at: null, capture_id: "c", index: "pending", attempts: 1 });
  assert(pending.includes("indexing is pending"));
  const queued = describeOutcome({ ok: true, status: "stored", id: "m", created_at: null, capture_id: "c", index: "queued", attempts: 1 });
  assert(!queued.includes("pending"));
  const failed = describeOutcome({ ok: false, status: "failed", capture_id: "c1", stage: "store", code: "store_failed", error: "timeout", retryable: true, http: 503 });
  assert(failed.includes('retry_capture({ capture_id: "c1" })'));
  const invalid = describeOutcome({ ok: false, status: "failed", capture_id: "c2", stage: "normalize", code: "invalid", error: "content (string) is required", retryable: false, http: 400 });
  assert(!invalid.includes("retry"));
});
