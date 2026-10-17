# AXON Memory lifecycle: supersede, retire, restore, delete (A4-1)

SQL: `supabase/migrations/20261017101436_memory_lifecycle.sql`. TS: `supabase/functions/_shared/lifecycle.ts`. Tests: `tests/schema/lifecycle.sql` (44 checks, rolled back) and `lifecycle.test.ts`.

| Operation | Function | What happens | Recall after |
|---|---|---|---|
| Retire | `memory_retire(id, reason='user', actor, p_user_id)` | `retired_at = now()` and `retired_reason` are set. Facts with no live source left are withdrawn (`resync_facts_on_retire`). Idempotent. | Excluded from semantic, keyword, recency, related, entities, hub counts and repo views |
| Restore | `memory_restore(id, actor, p_user_id)` | Clears retired/superseded state. Withdrawn facts regain footing. Supersession history is kept | Included again |
| Supersede | `memory_supersede(old, new, reason, actor, p_user_id)` | old: `retired_reason='superseded'`, `superseded_by=new`. Adds a `memory_relations(new → old, 'supersedes')` row. The old row is kept verbatim as the previous state. `new` must be active and owned by the same user | old excluded, new included |
| Delete | `memory_delete(id, actor, p_user_id)` | The row is removed, and everything derived from it goes too (table below). Returns the counts | Gone everywhere |

Every operation writes a `memory_lifecycle_events` row with the actor, ids and counts, never content. A retire reason is capped at 200 characters, and `superseded` is reserved for supersede.

## Delete propagation (spec §33)
| Surface | Mechanism |
|---|---|
| `memory_items` row | the DELETE |
| `memory_embeddings` + HNSW index | FK cascade; the index is maintained transactionally |
| full-text GIN indexes | maintained transactionally |
| `memory_recalls`, `memory_relations` | FK cascade |
| other memories' `superseded_by` | FK set null (they stay superseded, i.e. out of recall) |
| `entity_links` | `purge_memory_derivatives` (BEFORE DELETE trigger) |
| entities only this memory mentioned | deleted by the trigger. Shared entities are kept |
| `memory_facts` derived only from it | deleted by the trigger |
| facts with other sources | the id is removed. If no live source remains, the fact is withdrawn (`source-retired`) |
| caches | none exist. Context packs are built per request, and `context_pack_logs` store the query only |
| account deletion | the trigger steps aside; every table cascades from `auth.users` |

## Tenant boundary
All four functions are SECURITY INVOKER (RLS applies) and go through `lifecycle_owner(p_user_id)`:
- A signed-in caller always acts as `auth.uid()`. Naming another user raises 42501.
- The service role (edge functions) must pass `p_user_id`. Every statement also filters `user_id = p_user_id`, so another user's memory id gives "no such memory".
- anon has no EXECUTE.

## MCP tools (A6-1)

The MCP server (`mcp.axon-memory.com`, same OAuth/API-key auth and JSON-RPC transport as before) exposes the lifecycle as tools, next to the existing ones:

| Tool | Args | Notes |
| --- | --- | --- |
| `capture` | same as `remember` | alias; `remember` still works |
| `recall` | same as `recall_context` | alias; every memory in the pack now carries its `id` |
| `retire` | `id`, `reason?` | out of recall, kept; reversible |
| `restore` | `id` | undo retire |
| `supersede` | `old_id`, `new_id` **or** `content`, `project?`, `reason?` | `content` captures the replacement first |
| `delete` | `id`, `confirm: true` | permanent; refused without `confirm: true` |

Writes need the `memory.write` scope (personal API keys have full scope). The owner is always the authenticated key/token; a user id in the arguments is ignored. Another account's id answers "No memory with that id on this account." — identical to a missing id, so ids can't be probed.

`GET https://mcp.axon-memory.com/health` (→ `mcp-server?health=1`) is an unauthenticated liveness probe: status, protocol, tool names and a database round-trip; no user data.

Tests: `npm test` (Deno, incl. `mcp-lifecycle.test.ts`), `npm run test:worker` (gateway routing), and the live `lifecycle` section of `npm run test:rls-http` (capture → recall → supersede → cross-tenant refusals on both transports → retire/restore → delete).
