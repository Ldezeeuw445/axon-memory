// node --test test/unit.test.mjs (after build). No network.
import test from "node:test";
import assert from "node:assert/strict";
import { Axon, AxonError } from "../dist/index.js";

function fake(responses) {
  const calls = [];
  const f = async (url, init) => {
    calls.push({ url, init });
    const r = responses.shift();
    if (r instanceof Error) throw r;
    return new Response(r.body === undefined ? "" : JSON.stringify(r.body), { status: r.status ?? 200, headers: r.headers ?? {} });
  };
  return { f, calls };
}

test("sends bearer + JSON to the versioned path", async () => {
  const { f, calls } = fake([{ status: 201, body: { memory_id: "m1", duplicate: false } }]);
  const axon = new Axon({ token: "axon_live_x", baseUrl: "https://h/v1/", fetch: f });
  const r = await axon.capture({ content: "hi", thread: "t", occurred_at: new Date("2026-10-17T10:00:00Z") });
  assert.equal(r.memory_id, "m1");
  assert.equal(calls[0].url, "https://h/v1/memories");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers.Authorization, "Bearer axon_live_x");
  assert.deepEqual(JSON.parse(calls[0].init.body), { content: "hi", thread: "t", occurred_at: "2026-10-17T10:00:00.000Z" });
});

test("errors follow the contract and are typed", async () => {
  const { f } = fake([{ status: 404, body: { error: { code: "not_found", message: "No memory", retryable: false } } }]);
  const axon = new Axon({ token: "t", baseUrl: "https://h/v1", fetch: f });
  await assert.rejects(axon.get("x"), (e) => e instanceof AxonError && e.status === 404 && e.code === "not_found" && !e.retryable);
});

test("retries idempotent calls on retryable failures, not plain POSTs", async () => {
  const fail = { status: 503, body: { error: { code: "server_error", message: "x", retryable: true } } };
  const a = fake([fail, { status: 200, body: { id: "m" } }]);
  const axon = new Axon({ token: "t", baseUrl: "https://h/v1", fetch: a.f, maxRetries: 2 });
  assert.equal((await axon.get("m")).id, "m");
  assert.equal(a.calls.length, 2);

  const b = fake([fail]);
  await assert.rejects(new Axon({ token: "t", baseUrl: "https://h/v1", fetch: b.f }).capture({ content: "x" }), (e) => e.code === "server_error");
  assert.equal(b.calls.length, 1, "a POST without idempotency key is never replayed");

  const c = fake([fail, { status: 201, body: { memory_id: "m", duplicate: false } }]);
  await new Axon({ token: "t", baseUrl: "https://h/v1", fetch: c.f }).capture({ content: "x", idempotency_key: "key-12345678" });
  assert.equal(c.calls.length, 2, "with an idempotency key a capture is retried");
});

test("429 surfaces Retry-After", async () => {
  const { f } = fake([{ status: 429, headers: { "retry-after": "7" }, body: { error: { code: "rate_limited", message: "slow", retryable: true } } }]);
  await assert.rejects(new Axon({ token: "t", baseUrl: "https://h/v1", fetch: f, maxRetries: 0 }).recall({ query: "q" }), (e) => e.code === "rate_limited" && e.retryAfter === 7);
});

test("token is required", () => {
  assert.throws(() => new Axon({ token: "" }));
});
