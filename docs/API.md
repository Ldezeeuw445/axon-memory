# AXON public API v1 (A7-1, live 2026-10-17)

Base URL: **`https://mcp.axon-memory.com/v1`** (gateway). Direct: `https://ktaditgtbubonrahyiig.supabase.co/functions/v1/api-v1/v1`.
Machine-readable contract: `GET /v1/openapi.json` (no auth). Function: `supabase/functions/api-v1`. Logic: `_shared/api-v1.ts`. SDK: `packages/sdk-ts`.

## Contract rules
- **Versioned paths.** Within v1, changes are additive only. A breaking change means `/v2`.
- **Auth:** `Authorization: Bearer <token>`. A personal key (`axon_live_…`, created in the app) or an OAuth access token from the MCP OAuth flow. An expired OAuth token gets 401: refresh it.
- **Scopes:** tokens without `memory.write` can read and recall, but writes return `403 forbidden_scope`. Personal keys have full access to their own account.
- **Tenant boundary:** every call acts only on the token's own account. Another account's id answers `404 not_found` (it is never "forbidden", so nothing leaks about existence).
- **Errors** are always `{ "error": { "code", "message", "retryable", …context } }`. Codes: `unauthorized` 401, `forbidden_scope` 403, `not_found` 404, `invalid` 400, `method_not_allowed` 405, `conflict` 409, `gone` 410, `rate_limited` 429 (with `Retry-After`), `capture_failed` 5xx, `server_error` 5xx.
- **Rate limit:** 60 calls a minute per token, shared with MCP `tools/call`.
- **One memory shape everywhere** (GET, capture result, recall item): `id, kind:"memory", title, content, content_type, state (active|superseded|retired), superseded_by?, thread {id,key}|null, facets[], source {channel, type, provider?, account?, client?, app?, url?, at, connection_id, api_key_id, ref {id,url}|null}, stated (true = said, false = inferred), confidence (high|medium|low), relevance? {score, matched_by[]} (recall only), created_at, updated_at`.

## Endpoints
| Method | Path | What |
|---|---|---|
| GET | `/health` | Liveness, no auth |
| GET | `/openapi.json` | Contract, no auth |
| GET | `/me` | Token identity: user_id, plan, token kind / client / scope / can_write |
| POST | `/memories` | Capture. Body: `content` (required), `title`, `thread` (key), `facets[]`, `occurred_at`, `idempotency_key` (or the `Idempotency-Key` header), `source {label, ref {id, url}}`. Returns 201 `{memory_id, capture_id, status, duplicate, index, memory}`, or 200 for an idempotent duplicate. Goes through the A2-1 pipeline (`capture_events`, channel `api`) |
| GET | `/memories/{id}` | One memory |
| POST | `/memories/{id}/retire` | Out of recall, reversible (`reason?`) |
| POST | `/memories/{id}/restore` | Back into recall |
| POST | `/memories/{id}/supersede` | `new_id` **or** `content` (+`thread`, `reason`). The old memory is kept as history |
| DELETE | `/memories/{id}` | Permanent, with full propagation (vectors, links, sole-source conclusions). An idempotent replay of its capture returns `410 gone` and never re-creates it |
| POST | `/recall` | `query?`, `thread?`, `facets[]?`, `limit` (1–50), `include_inferences` (default true). Returns `{memories[], inferences[], signals[]}`. Inferences are conclusions with `from` memory ids, never mixed into memories |
| GET | `/threads` | Thread keys to pass as `thread` |
| GET | `/captures` | 24 h capture health plus captures needing attention |
| GET | `/captures/{id}` | One capture's status |
| POST | `/captures/{id}/retry` | Retry a failed capture from its saved payload |

## Tests
- `supabase/functions/_shared/api-v1.test.ts`: routing, shape, error mapping, source-ref validation.
- `packages/sdk-ts/test/unit.test.mjs`: SDK transport, retries, error typing (no network).
- `packages/sdk-ts/test/integration.test.mjs`: live, against **both** base URLs, with throwaway fixture users. Covers capture + provenance + thread, idempotency, recall trace, thread scoping, cross-tenant refusal on every verb, supersede/retire/restore/delete, no resurrection after delete, read-only scope, validation, auth.
- `scripts/rls-isolation-http.mjs`: 7 `/v1` isolation checks in the release suite.
