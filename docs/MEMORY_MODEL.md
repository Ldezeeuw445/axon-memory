# AXON Memory — domain model (A1-1)

Canon nouns (Lexicon §1): **Memory, Thread, Core, Facet, Weight, Depth**. Canon verbs: **Capture, Recall, Retire, Restore, Delete**, plus supersession (spec §15).
Contract code: `supabase/functions/_shared/domain.ts` (types, rules, row mapper). Database surface: migration `20261017101016_memory_domain_model.sql`. They're kept in step by `tests/schema/memory_model.sql` (view columns, Weight/Depth parity) and `domain.test.ts`.

The model sits on top of the existing tables. Nothing was dropped, renamed or backfilled: the migration only adds nullable or defaulted columns, two tables, two views and three functions.

## Memory → `memory_items`, read through `public.memories`

| Contract field | Column / derivation |
|---|---|
| id, owner | `id`, `user_id` (RLS: `auth.uid() = user_id`) |
| content, normalized content | `title`, `content`; `normalized_content` = lower-cased, whitespace-collapsed title + content (derived, not stored) |
| provenance | `source_type`, `external_id` → source_id, `origin_key` → source_application, `source_connection_id`, `api_key_id`, `occurred_at` → source_at, `capture_channel` (direct / agent / connector / unknown), `confidence` (NULL = stated directly; 0..1 = inference, which must never pass as a direct statement) |
| timestamps | `created_at`, `updated_at` (new, NULL falls back to created_at) |
| Thread membership | `project_id` → thread_id (NULL = applies across all Threads) |
| Facets | `facets text[]` (new, default `{}`, lowercase slugs). One memory, many facets; never duplicated per app |
| Weight | computed 1..5 (`memory_weight`): an Anchor (`anchored_weight`, new) wins; otherwise 1 + distinct recalling clients (max 2) + 1 for a dense graph position (≥3 entity links) + 1 for deliberate capture (`manual`). Distinct clients, so one automation hammering a memory can't inflate it |
| Depth | computed 0..3 (`memory_depth`): surface < 7d, near < 30d, deep < 365d, bedrock otherwise or once retired (it settles) |
| lifecycle | `lifecycle_state` ∈ active / superseded / retired, derived from `retired_at` + `retired_reason` (new). `superseded_by` (new) points at the newer truth |
| relationships | `entities` → `entities`/`entity_links` (graph), `memory_relations` (new: supersedes / contradicts / relates / weaves) |
| embedding | `memory_embeddings` (1536-d pgvector, HNSW); `has_embedding` in the view |

Weight and Depth are never shown as numbers in the product (Lexicon). They exist for recall ranking (A3) and for the terrain.

### Lifecycle
`retired_at` already meant "out of active recall", and every recall path filters on it: semantic, keyword, recency, related, top entities, hub counts and repo views. So:
- **Retire**: `retired_at = now()`, `retired_reason` = `user` (or a short reason).
- **Supersede**: the old memory gets `retired_at`, `retired_reason = 'superseded'`, `superseded_by = new`, and a `memory_relations(new → old, 'supersedes')` row. The old row is kept as the previous state, so history is never falsified. It leaves recall through the same filters, and the facts derived only from it are withdrawn by the existing `resync_facts_on_retire` trigger.
- **Restore**: clears all three fields.
- **Delete**: removes the row. Propagation is covered by A4-1 (see `docs/MEMORY_LIFECYCLE.md`).
- Every lifecycle op writes a row to `memory_lifecycle_events` with counts and ids only, never content.

## Thread → `projects` + `project_threads`, read through `public.threads`
A continuous strand about one thing. Today a Thread is a project (key, name) plus its single overwritten state line (`set_thread`). Columns: id, owner_id, key, name, colour, created_at, state, state_updated_by, state_updated_at, active_memories.

## Core → `core_summary()`
The one entity holding every Thread: counts of memories by lifecycle state, thread count and the facets in use. It always answers for the caller (`auth.uid()`). Only the service role may pass `p_user_id`.

## Not yet modelled (tracked)
- Many-to-many Thread membership (a memory in several Threads): A2/A3.
- Weave/Merge mechanics beyond the `weaves` relation kind: later.
