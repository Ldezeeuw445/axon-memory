// Live integration tests for the v1 API through the SDK (A7-1).
//
// Runs against the deployed API with DISPOSABLE users only (the
// @rls-test.invalid fixtures from scripts/rls-fixtures-sql.mjs). Every memory
// it creates is deleted again; the users are deleted by the isolation suite.
//   AXON_FIXTURES=/path/rls-fixtures.json [AXON_BASE_URL=…] npm run test:integration
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { Axon, AxonError } from "../dist/index.js";

const fx = JSON.parse(readFileSync(process.env.AXON_FIXTURES ?? "/tmp/rls-fixtures.json", "utf8"));
const BASES = (process.env.AXON_BASE_URL ?? "https://mcp.axon-memory.com/v1,https://ktaditgtbubonrahyiig.supabase.co/functions/v1/api-v1/v1").split(",");
const created = new Set();

for (const base of BASES) {
  const A = new Axon({ token: fx.a.apiKey, baseUrl: base });
  const B = new Axon({ token: fx.b.apiKey, baseUrl: base });
  const label = base.includes("supabase") ? "direct" : "gateway";
  const tok = `sdktok${randomBytes(5).toString("hex")}`;
  let memId, newId;

  test(`[${label}] health + openapi + me`, async () => {
    assert.equal((await A.health()).status, "ok");
    const spec = await (await fetch(base + "/openapi.json")).json();
    for (const p of ["/memories", "/memories/{id}", "/memories/{id}/retire", "/memories/{id}/restore", "/memories/{id}/supersede", "/recall", "/threads", "/captures", "/captures/{id}/retry", "/me"]) {
      assert.ok(spec.paths[p], `openapi has ${p}`);
    }
    const me = await A.me();
    assert.equal(me.user_id, fx.a.id);
    assert.equal(me.token.can_write, true);
    assert.equal(me.api_version, "v1");
  });

  test(`[${label}] capture with provenance + thread, idempotent`, async () => {
    const key = `sdk-${tok}`;
    const r1 = await A.capture({ content: `SDK decision ${tok}: ship weekly`, title: `SDK ${tok}`, thread: fx.a.threadKey, facets: ["Trading"],
      idempotency_key: key, source: { label: "sdk-test", ref: { id: `ext-${tok}`, url: `https://example.com/${tok}` } } });
    assert.equal(r1.duplicate, false);
    memId = r1.memory_id; created.add(memId);
    const r2 = await A.capture({ content: `SDK decision ${tok}: ship weekly`, idempotency_key: key });
    assert.equal(r2.duplicate, true);
    assert.equal(r2.memory_id, memId);
    const m = await A.get(memId);
    assert.equal(m.kind, "memory");
    assert.equal(m.state, "active");
    assert.equal(m.thread?.key, fx.a.threadKey);
    assert.deepEqual(m.facets, ["trading"]);
    assert.equal(m.source.app, "sdk-test");
    assert.deepEqual(m.source.ref, { id: `ext-${tok}`, url: `https://example.com/${tok}` });
    assert.equal(m.stated, true);
    assert.equal(m.source.api_key_id !== null, true);
  });

  test(`[${label}] recall finds it with a trace; thread scoping works`, async () => {
    const r = await A.recall({ query: tok, limit: 5 });
    assert.equal(r.memories[0]?.id, memId);
    assert.ok(r.memories[0].relevance && r.memories[0].relevance.matched_by.length > 0);
    assert.ok(Array.isArray(r.inferences));
    const scoped = await A.recall({ query: tok, thread: fx.a.threadKey });
    assert.equal(scoped.thread?.key, fx.a.threadKey);
    assert.equal(scoped.memories[0]?.id, memId);
    await assert.rejects(A.recall({ query: tok, thread: "no-such-thread-x" }), (e) => e instanceof AxonError && e.code === "not_found");
    const t = await A.threads();
    assert.ok(t.threads.some((x) => x.key === fx.a.threadKey));
  });

  test(`[${label}] another user cannot see or touch it`, async () => {
    const r = await B.recall({ query: tok });
    assert.equal(r.memories.some((m) => m.id === memId || m.content.includes(tok)), false);
    for (const call of [() => B.get(memId), () => B.retire(memId), () => B.restore(memId), () => B.delete(memId), () => B.supersede(memId, { content: `B ${tok}` })]) {
      await assert.rejects(call(), (e) => e instanceof AxonError && e.status === 404);
    }
    await assert.rejects(B.getCapture(fx.a.failedCaptureId), (e) => e.status === 404);
    await assert.rejects(B.retryCapture(fx.a.failedCaptureId), (e) => e.status === 404);
    assert.equal((await A.get(memId)).state, "active", "still intact after B's attempts");
  });

  test(`[${label}] supersede, retire, restore, delete`, async () => {
    const s = await A.supersede(memId, { content: `SDK decision ${tok}: ship daily`, thread: fx.a.threadKey, reason: "changed" });
    newId = s.new.id; created.add(newId);
    assert.equal(s.old.state, "superseded");
    assert.equal(s.old.superseded_by, newId);
    let r = await A.recall({ query: tok });
    assert.equal(r.memories.some((m) => m.id === memId), false, "superseded memory left recall");
    assert.equal(r.memories[0]?.id, newId);

    assert.equal((await A.retire(newId, "test")).memory.state, "retired");
    r = await A.recall({ query: tok });
    assert.equal(r.memories.some((m) => m.id === newId), false, "retired memory left recall");
    assert.equal((await A.restore(newId)).memory.state, "active");

    for (const id of [newId, memId]) {
      const d = await A.delete(id);
      assert.equal(d.deleted, true);
      created.delete(id);
      await assert.rejects(A.get(id), (e) => e.code === "not_found");
    }
    r = await A.recall({ query: tok });
    assert.equal(r.memories.some((m) => m.content.includes(tok)), false, "deleted memories never come back");
    const again = await A.capture({ content: `SDK decision ${tok}: ship weekly`, idempotency_key: `sdk-${tok}` }).catch((e) => e);
    assert.ok(again instanceof AxonError && again.code === "gone", "an idempotent replay does not resurrect a deleted memory");
  });

  test(`[${label}] scopes, validation and auth`, async () => {
    const RO = new Axon({ token: fx.a.readOnlyKey, baseUrl: base });
    assert.equal((await RO.me()).token.can_write, false);
    await assert.rejects(RO.capture({ content: `ro ${tok}` }), (e) => e.status === 403 && e.code === "forbidden_scope");
    assert.ok(Array.isArray((await RO.recall({ query: tok })).memories));
    await assert.rejects(A.capture({ content: "" }), (e) => e.status === 400 && e.code === "invalid");
    await assert.rejects(A.get("not-a-uuid"), (e) => e.status === 400);
    await assert.rejects(new Axon({ token: "axon_live_" + "0".repeat(40), baseUrl: base }).me(), (e) => e.status === 401 && e.code === "unauthorized");
    const st = await A.captureStatus();
    assert.ok("health" in st && Array.isArray(st.needs_attention));
  });
}

test.after(async () => {
  // Safety net: remove anything a failed assertion left behind (A's own memories only).
  const A = new Axon({ token: fx.a.apiKey, baseUrl: BASES[0] });
  for (const id of created) await A.delete(id).catch(() => {});
});
