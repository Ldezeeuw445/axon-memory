import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { deleteMemory, LifecycleError, retireMemory, supersedeMemory } from "./lifecycle.ts";

const ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ID2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const USER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function fake(result: { data?: unknown; error?: { code?: string; message: string } | null }) {
  const calls: [string, Record<string, unknown>][] = [];
  return {
    calls,
    // deno-lint-ignore no-explicit-any
    rpc: (fn: string, args: Record<string, unknown>) => { calls.push([fn, args]); return Promise.resolve({ data: result.data ?? null, error: result.error ?? null }) as any; },
  };
}

Deno.test("retire passes owner explicitly and defaults reason", async () => {
  const a = fake({ data: { changed: true } });
  await retireMemory(a, USER, ID.toUpperCase(), { actor: "Claude" });
  assertEquals(a.calls, [["memory_retire", { p_memory_id: ID, p_reason: "user", p_actor: "Claude", p_user_id: USER }]]);
});

Deno.test("supersede maps both ids", async () => {
  const a = fake({ data: {} });
  await supersedeMemory(a, USER, ID, ID2, { reason: " changed mind " });
  assertEquals(a.calls[0], ["memory_supersede", { p_old_id: ID, p_new_id: ID2, p_reason: "changed mind", p_actor: null, p_user_id: USER }]);
});

Deno.test("invalid id never reaches the database", async () => {
  const a = fake({});
  await assertRejects(() => deleteMemory(a, USER, "not-an-id"), LifecycleError);
  await assertRejects(() => deleteMemory(a, USER, undefined), LifecycleError);
  assertEquals(a.calls.length, 0);
});

Deno.test("database errors map to stable codes", async () => {
  const nf = await assertRejects(() => deleteMemory(fake({ error: { code: "P0002", message: "no such memory" } }), USER, ID), LifecycleError);
  assertEquals((nf as LifecycleError).code, "not_found");
  const fb = await assertRejects(() => deleteMemory(fake({ error: { code: "42501", message: "x" } }), USER, ID), LifecycleError);
  assertEquals((fb as LifecycleError).code, "forbidden");
  const inv = await assertRejects(() => retireMemory(fake({ error: { code: "22023", message: "bad" } }), USER, ID), LifecycleError);
  assertEquals((inv as LifecycleError).code, "invalid");
});
