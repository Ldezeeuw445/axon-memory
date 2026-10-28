import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { canWrite, handleLifecycleTool, lifecycleTools, TOOL_ALIASES } from "./mcp-lifecycle.ts";

const OLD = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const NEW = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const me = { userId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", scope: null, clientLabel: "Claude" };

function fake(data: unknown = {}, error: { code?: string; message: string } | null = null) {
  const calls: [string, Record<string, unknown>][] = [];
  // deno-lint-ignore no-explicit-any
  return { calls, rpc: (fn: string, args: any) => { calls.push([fn, args]); return Promise.resolve({ data, error }); } };
}
const noCapture = () => Promise.reject(new Error("capture should not be called"));

Deno.test("canonical verbs are exposed and aliases point at existing tools", () => {
  const names = lifecycleTools({ inputSchema: {} }, { inputSchema: {} }).map((t) => t.name);
  assertEquals(names, ["capture", "recall", "retire", "restore", "supersede", "delete"]);
  assertEquals(TOOL_ALIASES, { capture: "remember", recall: "recall_context" });
  const del = lifecycleTools({ inputSchema: {} }, { inputSchema: {} }).find((t) => t.name === "delete")!;
  assertEquals((del.inputSchema as { required: string[] }).required, ["id", "confirm"]);
});

Deno.test("scope gate", () => {
  assertEquals(canWrite(null), true);
  assertEquals(canWrite(""), true);
  assertEquals(canWrite("memory.read memory.write"), true);
  assertEquals(canWrite("memory.read"), false);
});

Deno.test("read-only grant cannot change memories", async () => {
  const a = fake();
  const out = await handleLifecycleTool(a, { ...me, scope: "memory.read" }, "retire", { id: OLD }, noCapture);
  assertEquals(out.isError, true);
  assertEquals(a.calls.length, 0);
});

Deno.test("delete requires confirm: true and never reaches the database without it", async () => {
  const a = fake();
  for (const confirm of [undefined, false, "true", 1]) {
    const out = await handleLifecycleTool(a, me, "delete", { id: OLD, confirm }, noCapture);
    assertEquals(out.isError, true);
  }
  assertEquals(a.calls.length, 0);
  const ok = await handleLifecycleTool(fake({ id: OLD, embeddings: 1 }), me, "delete", { id: OLD, confirm: true }, noCapture);
  assertStringIncludes(ok.text, "Deleted");
});

Deno.test("retire passes the resolved owner, never one from args", async () => {
  const a = fake({ id: OLD, changed: true, facts_withdrawn: 2 });
  const out = await handleLifecycleTool(a, me, "retire", { id: OLD, user_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" }, noCapture);
  assertEquals(a.calls[0][1].p_user_id, me.userId);
  assertEquals(a.calls[0][1].p_actor, "Claude");
  assertStringIncludes(out.text, "2 conclusion");
});

Deno.test("delete, restore and supersede also take the owner from the token, never from args", async () => {
  const other = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const del = fake({ id: OLD });
  await handleLifecycleTool(del, me, "delete", { id: OLD, confirm: true, user_id: other, p_user_id: other }, noCapture);
  assertEquals(del.calls, [["memory_delete", { p_memory_id: OLD, p_actor: "Claude", p_user_id: me.userId }]]);
  const res = fake({ id: OLD, changed: true });
  await handleLifecycleTool(res, me, "restore", { id: OLD, user_id: other }, noCapture);
  assertEquals(res.calls[0][1].p_user_id, me.userId);
  const sup = fake({ old: OLD, new: NEW, changed: true });
  await handleLifecycleTool(sup, me, "supersede", { old_id: OLD, new_id: NEW, user_id: other }, noCapture);
  assertEquals(sup.calls[0][1].p_user_id, me.userId);
});

Deno.test("supersede with content captures the new memory first", async () => {
  const a = fake({ old: OLD, new: NEW, changed: true });
  let captured: [string, string | null] | null = null;
  const out = await handleLifecycleTool(a, me, "supersede", { old_id: OLD, content: "We use Postgres now", project: "axon" }, (c, p) => {
    captured = [c, p];
    return Promise.resolve({ id: NEW });
  });
  assertEquals(captured, ["We use Postgres now", "axon"]);
  assertEquals(a.calls[0], ["memory_supersede", { p_old_id: OLD, p_new_id: NEW, p_reason: null, p_actor: "Claude", p_user_id: me.userId }]);
  assertStringIncludes(out.text, "kept as history");
  const both = await handleLifecycleTool(fake(), me, "supersede", { old_id: OLD, new_id: NEW, content: "x" }, noCapture);
  assertEquals(both.isError, true);
});

Deno.test("not-found and invalid ids come back as tool errors, not crashes", async () => {
  const nf = await handleLifecycleTool(fake(null, { code: "P0002", message: "no such memory" }), me, "restore", { id: OLD }, noCapture);
  assertEquals(nf, { text: "No memory with that id on this account.", isError: true });
  const bad = await handleLifecycleTool(fake(), me, "retire", { id: "nope" }, noCapture);
  assertEquals(bad.isError, true);
});
