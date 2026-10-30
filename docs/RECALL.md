# Recall engine (A3-1)

One ranked list from every signal, plus a trace that says what each result is and why it came back.

## Ranking: `public.recall_hybrid` (migration `20261017103036_recall_hybrid.sql`)

Candidate pools, merged:

| Signal | How | Pool |
| --- | --- | --- |
| lexical | OR-of-prefix tsquery over title + content + entities (`recall_or_tsquery`), scored as 0.7 × term coverage + 0.3 × normalised `ts_rank_cd` | top 300 |
| fuzzy | `pg_trgm` word similarity of the query against titles (≥ 0.5) for typos | top 50 |
| semantic | exact cosine distance over this owner's embeddings (only when the plan includes semantic search and the query was embedded), scaled `(sim − 0.62) / 0.16` for gemini-embedding-001 (A3-2) | top 150 |
| recency | newest rows (only when there is no query) | 300 |

Each candidate then gets:

- relevance: `0.6·max(sem, text) + 0.4·mean(sem, text)` with an embedding, or `text = max(lexical, 0.85·fuzzy)` without. With an embedding, a partial word match (not every query term) that the meaning does not back up (scaled semantic < 0.15) counts for 40% (A3-2)
- recency: `exp(-age_days/45)`
- Weight: from `memory_weight`
- Depth: from `memory_depth`
- provenance: direct 1.0 / agent 0.8 / connector 0.4 / unknown 0.5
- Thread match: the item's `project_id` equals the requested project
- Facet match: the item's facets overlap the requested ones

The final score depends on whether there is a query.

With a query, results with relevance below 0.10, or below 35% of the best match, are dropped (A3-2), so a question about something never captured returns nothing. The rest are scored:

`0.70·rel + 0.10·recency + 0.07·weight + 0.06·provenance + 0.04·thread + 0.03·facet`

Without a query (overview):

`0.45·recency + 0.20·weight + 0.15·provenance + 0.12·thread + 0.08·facet`

The scope rules are unchanged:

- own rows only, live rows only (retired and superseded rows are excluded)
- a project-scoped recall returns that project plus unscoped items that did not come from a connected account

The function is service-role only (no anon or authenticated EXECUTE), SECURITY INVOKER, and the owner is passed explicitly. Every row carries `semantic` (the raw cosine similarity since A3-2, also returned as `relevance.similarity`), `lexical`, `fuzzy`, `recency`, `weight`, `depth`, `thread_match`, `facet_match`, `score` and `matched_by`.

`memory-core.buildContextPack` calls it first. If it errors, recall falls back to the old semantic → keyword → recency path, so recall degrades instead of failing.

## Trace: `_shared/recall.ts`

Every memory in a pack is `{ id, kind: "memory", title, content, source, confidence, relevance: { score, matched_by }, thread?, facets? }`.

- `source`: `{ channel: direct|agent|connector|unknown, type, provider?, account?, client?, app?, url?, at }`
- `confidence`: trust in the statement itself, not how well it matched. It's `high`, `medium` or `low`, based on the stated confidence, otherwise the channel, minus age (Depth), plus reliance (Weight).
- Notes the person wrote come out separately under `your_notes`, and each one is a memory too: `{ id, kind: "memory", title, text, about, written_at, source }` (`traceNote`). So every item in the pack carries its `memory_items` id and its source.
- Conclusions (`memory_facts`) are under `inferred`. Each one is `{ statement, kind: "inference", from: [memory ids], derived_by?, confidence }`, and it's never `high` with fewer than two sources. The old bare-string `known` key is gone.
- `how_to_use.reading` spells out what memory, inference, source and confidence mean.
- Inputs: `facets` on `recall_context`/`recall` (MCP), and `?facets=a,b` or `body.facets` on `/context-pack`. Facets only change the ranking; they never filter results out.

## Evaluation: `tests/eval/recall_eval.sql`

This is a repeatable, rolled-back suite with hand-built fixtures (including synthetic topic embeddings). It has 13 cases:

- lexical: exact terms, and a natural-language question
- semantic, with no shared words
- fuzzy: a typo
- Thread
- recency tie-break
- Weight
- provenance
- Facet
- supersession
- relevance over recency
- entity-only match
- overview (no query)

It also checks tenant isolation, the trace columns, the null-owner contract and privileges, and measures latency over 5,000 rows.

Thresholds: hit@1 = 100% and MRR ≥ 0.95. On the same cases the legacy keyword path scores 6/10. Results on prod (2026-10-17): 13/13, MRR 1.0, 258 ms with a query and 136 ms without, over 5,000 rows.

Run with `npm run test:eval` (psql, `DATABASE_URL`) or paste the file into the SQL editor / MCP `execute_sql`.

## Live evaluation (A3-2): `tests/eval/recall-live.mjs`

The SQL suite uses synthetic vectors, so it cannot see how the real embedding model behaves. The live suite does:
- a throwaway Power user gets 20 hand-written memories through `POST /v1/memories`, so they have real gemini-embedding-001 vectors;
- the memories include paraphrase targets, Dutch memories, a contradiction (the launch date moved, no supersede) and an explicit supersession (the price changed);
- 18 questions are then asked through `POST /v1/recall`.

| | Before (2026-10-17) | After A3-2 |
|---|---|---|
| hit@1 (15 questions with an answer) | 13/15 | 15/15 |
| MRR | 0.933 | 1.000 |
| abstain (3 questions about nothing captured) | 0/3 | 2/3 |
| results per specific question | 19.0 (everything) | 1.3 |

Why it was broken: gemini-embedding-001 puts unrelated text at cosine 0.55–0.66. The doc-to-doc median on a real account was 0.66. The old scale `(sim − 0.2) / 0.5` therefore rated every memory as a near-perfect semantic match. Nothing was ever cut, and ranking leaned on recency and partial word matches.

Still open:
- "what is my blood type" returns the TypeScript preference, because "type" is a prefix of TypeScript; the match is weak but above the cut.
- The floor (0.62) is tuned on one corpus. `relevance.similarity` is now in every trace, so it can be re-checked on real use.

Run: `FIX=<throwaway fixture with apiKey> SEED=1 node tests/eval/recall-live.mjs` (`npm run test:eval:live`).
