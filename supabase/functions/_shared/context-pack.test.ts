// A3: every memory a context pack hands out carries its memory_items id and
// its source — ranked memories and the person's own notes alike — so an
// assistant can retire / supersede / delete it and can say where it came from.
// Runs the real buildContextPack against a fake Supabase client.
import { assert, assertEquals } from "jsr:@std/assert@1";
import { buildContextPack } from "./memory-core.ts";

const USER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const RANKED = [
  { id: "m-conn", content_type: "email", title: "Invoice", content: "Paid", occurred_at: "2026-10-01T00:00:00Z",
    source_type: "gmail", source_connection_id: "c1", score: 0.9, matched_by: ["recency"] },
  { id: "m-agent", content_type: "note", title: "Decision", content: "Use Postgres", occurred_at: "2026-10-02T00:00:00Z",
    source_type: "manual", api_key_id: "k1", score: 0.8, matched_by: ["recency"] },
  { id: "m-user", content_type: "note", title: null, content: "Ship Friday", occurred_at: "2026-10-03T00:00:00Z",
    source_type: "manual", score: 0.7, matched_by: ["recency"] },
];

const NOTES = [
  { id: "n-user", content_type: "note", title: "Half a thought", content: "Started on", occurred_at: "2026-10-04T00:00:00Z",
    metadata: { repo: "axon" }, source_type: "manual", origin_key: "notes" },
  { id: "n-agent", content_type: "note", title: null, content: "Saved by Claude", occurred_at: "2026-10-05T00:00:00Z",
    metadata: {}, source_type: "manual", origin_key: "notes", api_key_id: "k1" },
];

const TABLES: Record<string, unknown> = {
  profiles: { full_name: "T", role: null, use_case: null, plan_tier: "ultra" },
  user_plan_status: { has_semantic_search: false },
  source_connections: [{ id: "c1", provider: "gmail", status: "active", external_account_label: "me@x.com", last_synced_at: null }],
  api_keys: [{ id: "k1", name: "claude", display_name: "Claude" }],
};

/** Chainable, awaitable stand-in for supabase-js: every builder call returns
 *  the builder; awaiting it yields the canned rows for that table. */
function fakeAdmin() {
  const owners = new Set<unknown>();
  const builder = (table: string) => {
    const filters: Record<string, unknown> = {};
    // deno-lint-ignore no-explicit-any
    const b: any = new Proxy({}, {
      get(_t, prop) {
        if (prop === "then") {
          const data = table === "memory_items" ? (filters.origin_key === "notes" ? NOTES : []) : (TABLES[table] ?? []);
          return (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
            Promise.resolve({ data, error: null, count: 0 }).then(res, rej);
        }
        return (...args: unknown[]) => {
          if (prop === "eq") {
            filters[args[0] as string] = args[1];
            if (args[0] === "user_id" || (args[0] === "id" && table === "profiles")) owners.add(args[1]);
          }
          return b;
        };
      },
    });
    return b;
  };
  return {
    owners,
    from: builder,
    rpc: (fn: string, args: Record<string, unknown>) => {
      owners.add(args.p_user_id);
      return Promise.resolve({ data: fn === "recall_hybrid" ? structuredClone(RANKED) : [], error: null });
    },
  };
}

Deno.test({
  name: "every memory and note in a context pack carries its memory_items id and its source",
  // recordRecallEvent races its insert against a 400 ms timer it never clears.
  sanitizeOps: false,
  fn: async () => {
    const admin = fakeAdmin();
    // deno-lint-ignore no-explicit-any
    const pack: any = await buildContextPack(admin as any, USER, { surface: "mcp" });

    const memories = Object.values(pack.memory).flat() as { id: string; kind: string; source: Record<string, unknown> }[];
    assertEquals(memories.map((m) => m.id).sort(), ["m-agent", "m-conn", "m-user"]);
    for (const m of memories) {
      assertEquals(m.kind, "memory");
      assert(m.source && typeof m.source.channel === "string", `memory ${m.id} has no source`);
    }
    const byId = Object.fromEntries(memories.map((m) => [m.id, m.source]));
    assertEquals(byId["m-conn"], { channel: "connector", type: "gmail", provider: "gmail", account: "me@x.com", at: "2026-10-01T00:00:00Z" });
    assertEquals(byId["m-agent"], { channel: "agent", type: "manual", client: "Claude", at: "2026-10-02T00:00:00Z" });
    assertEquals(byId["m-user"], { channel: "direct", type: "manual", at: "2026-10-03T00:00:00Z" });

    // Notes come out separately and must be traced the same way.
    assertEquals(pack.your_notes, [
      { id: "n-user", kind: "memory", title: "Half a thought", text: "Started on", about: "axon", written_at: "2026-10-04T00:00:00Z",
        source: { channel: "direct", type: "manual", app: "notes", at: "2026-10-04T00:00:00Z" } },
      { id: "n-agent", kind: "memory", title: null, text: "Saved by Claude", about: null, written_at: "2026-10-05T00:00:00Z",
        source: { channel: "agent", type: "manual", client: "Claude", app: "notes", at: "2026-10-05T00:00:00Z" } },
    ]);

    // Owner-scoped: every filtered read and the ranking RPC used the caller's id only.
    assertEquals([...admin.owners], [USER]);
  },
});
