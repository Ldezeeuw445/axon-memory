# Capture pipeline (A2-1)

Every new memory, from any entry point, goes through `_shared/capture.ts`. The entry points are MCP `remember`/`capture`, REST `POST /remember`, the replacement memory in `supersede`, and an offline/mobile queue flushing through either of those.

```
receive → normalize → classify → dedupe → store → link → index
```

| Stage | What happens | Fails as |
| --- | --- | --- |
| receive | The owner must be a real user id, and the channel (`mcp`, `rest`, `app`, `offline`, `api` or `connector`) is required. | `no_owner` (401), `no_provenance` (400) |
| normalize | Content is trimmed but otherwise kept verbatim, max 20,000 chars. The title is limited to 300 chars. Tags are deduplicated (max 30). Facets are slugged (max 8). The project key is lowercased. `idempotency_key` must be 8–200 chars of `[A-Za-z0-9._:-]`. `occurred_at` must be ISO and not in the future. | `invalid` (400, not retryable) |
| classify | The Thread (project key) is resolved. Facets are applied. `metadata.kind` is set to decision, preference, task or fact by a light heuristic that never blocks a capture. | — |
| dedupe | If the same owner sent the same normalized text within 10 minutes, the existing memory is returned. | — |
| store | The `memory_items` insert. Provenance is set here: `origin_key` from the client label, `api_key_id`, and `metadata.channel` / `capture_id` / `remembered_via`. | `store_failed`: 503 and retryable, or 400 for a constraint violation |
| link | Entity links are written by the `memory_items_sync_entities` trigger in the same insert. | — |
| index | The Gemini embedding runs in the background (`EdgeRuntime.waitUntil`, 25 s cap), so a save answers as soon as it's stored. The capture records `indexed`, or `stored` + `index_pending` (retryable). | — |

## Where it's recorded: `capture_events`

There is one row per capture attempt (migration `20261017104221_capture_pipeline.sql`). Each row holds:

- `status`: received, stored, indexed, failed or duplicate
- the furthest `stage` reached
- `error` / `error_code`, and `retryable`
- `attempts`
- per-stage `timings` (ms) and `total_ms`
- `memory_id`, set to null if the memory is later deleted
- the channel, client and API key

RLS lets owners read their own rows. Only the service role can write; users can't forge or rewrite capture history.

A failed attempt keeps its normalized `payload` so it can be retried. A check constraint stops a successful attempt from keeping a copy. Failed payloads are cleared after 30 days by `capture_events_prune()`, which runs daily via pg_cron (`capture-events-prune`, 03:17 UTC). Deleting the account cascades.

## Provenance is mandatory

The trigger `memory_items_provenance_defaults` fills an empty `origin_key` from `source_type`. The check `memory_items_provenance_required` (validated on every row) requires it. `owner` (`user_id`) and `source_type` were already NOT NULL.

## Idempotency (offline / mobile queue)

Send `idempotency_key` in the body, the `Idempotency-Key` header, or the MCP argument. A resend never stores twice:

- **Already stored:** the same id comes back with `status: duplicate`.
- **Failed before:** the capture is retried from the new payload.
- **Still in flight** (less than 2 min ago): 409 `in_progress`.
- **Its memory was deleted:** 410 `deleted`; it's never re-created.

Send `occurred_at` for when the thing happened, and `channel: "offline"` to label a queue flush.

## Seeing and retrying failures

- MCP: `capture_status` returns 24 h health plus the captures that need attention. `retry_capture({ capture_id })` retries one.
- REST: `GET /remember?status` and `POST /remember { retry_capture_id }`.
- Every failure message says which stage failed, and gives the capture_id when it can be retried.
- `capture_health(p_hours, p_user_id)` returns attempts, stored, indexed, duplicates, failed, stuck, success_rate, failures_by_stage, index_backlog and p50/p95 latency. A service-role call with a null user covers the whole system (for AXE Core). An authenticated call returns only the caller's own data.

## Tests

- `capture.test.ts`: normalize, classify, provenance, idempotency decisions, outcome text.
- `tests/schema/capture_pipeline.sql`: 26 checks.
- The live `capture` section of `scripts/rls-isolation-http.mjs`: idempotent offline capture, dedupe, visible failure, cross-tenant retry refused (REST and MCP), retry from payload, background index lands, save in under 3 s.
