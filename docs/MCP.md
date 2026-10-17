# AXON MCP (as live, 2026-10-17)

Endpoint: **`https://mcp.axon-memory.com/`**. Transport is MCP Streamable HTTP (JSON-RPC over POST) and the protocol is `2025-06-18`. The Cloudflare Worker `axon-mcp-gateway` only routes. The server is the Supabase function `mcp-server` (`supabase/functions/mcp-server/index.ts`).

## Authentication
- Discovery: `/.well-known/oauth-protected-resource` and `/.well-known/oauth-authorization-server` (both served by `oauth-metadata`). An unauthenticated `tools/*` call gets 401 with `WWW-Authenticate: Bearer resource_metadata=…`.
- OAuth 2.1: dynamic client registration `/register`, then `/authorize` (the user signs in and approves on app.axon-memory.com/connect/authorize through `mcp-oauth-consent`), then `/token`. Grants: `authorization_code` with PKCE **S256 only** (`plain` is refused, and public clients must use PKCE), and `refresh_token` (rotating, bound to the client). Access tokens last 24 h (`expires_in`). Scopes: `memory.read`, `memory.write`.
- Consent screen: before showing anything, `/connect/authorize` calls `mcp-oauth-consent` with `decision: "describe"`. The server returns `{ client: { name, registeredName, host, local, verified, slug } }`, decided from the registered client and the already-checked `redirect_uri` host (claude.ai, chatgpt.com, gemini.google.com, cursor, perplexity, or a client AXON seeded). The `client_name` in the link is ignored. Unverified clients are titled by their host with a warning. Approve stays disabled until the answer is in. `describe` runs the same client, redirect and PKCE checks as `approve` and mints nothing. The `api_keys` table is server-minted only (`20261017120631_a_key_is_made_by_the_server`): the browser may read, rename and revoke its own keys, nothing else.
- The access token is an `api_keys` row (only the SHA-256 is stored) carrying `oauth_client_id`, `scope`, `access_expires_at` and the refresh hash. A refresh rotates both tokens on the same row, so the connection keeps its identity and provenance. Tokens issued before 2026-10-17 have no expiry (grandfathered). Revoking a token in the app disconnects that client. An expired or revoked token gets 401 with `error="invalid_token"`.
- Personal developer keys (`axon_live_…`, created in the app, Power plan or higher) work as Bearer tokens too. They have no scope, which means full access.
- `initialize` and `notifications/*` need no auth (they carry no user data). `tools/list` and `tools/call` do.
- Rate limit: 60 `tools/call` per minute per key (`take_rate_limit_token`). An over-limit call returns a tool error that says when to retry.

## REST alternative
The same capture, recall and lifecycle operations are available as a versioned REST API at `https://mcp.axon-memory.com/v1` (see `API.md`), with the same tokens and the same rate-limit budget.

## Health
`GET https://mcp.axon-memory.com/health` is unauthenticated. It returns `{status, service, version, protocol, database, db_ms, tools[], time}` and contains no user data.

## Tools
Canonical lifecycle (spec §18), all scoped to the token's user:

| Tool | Scope | What it does |
|---|---|---|
| `capture` (alias of `remember`) | write | Store a memory with provenance (channel `agent`, origin from the client label). Args: `content`, optional `title`, `project`, `facets`, `occurred_at`, `idempotency_key`. Returns the memory id, capture id and index state, or a visible failure with a capture id to retry |
| `recall` (alias of `recall_context`) | read | Ranked context pack: profile, sources, entities and memories, each traced as memory / source / confidence / why it matched. Inferences come back separately and cite their memories. Args: `query`, `project`, `facets`, `limit_tokens` |
| `supersede` | write | Replace an older memory with a newer one (`new_id`, or `content` to capture the replacement). The old one is kept as history and leaves recall |
| `retire` | write | Take a memory out of active recall (reversible) |
| `restore` | write | Bring a retired or superseded memory back |
| `delete` | write | Permanent deletion with full propagation (`confirm: true` required) |
| `capture_status` | read | 24-hour capture health plus failed and pending captures |
| `retry_capture` | write | Retry a failed capture from its stored payload |

Threads and context: `set_thread` (write), `list_projects`, `list_sources`.
Work tracking (legacy "workspace" surface): `list_tasks`, `add_task`, `add_phase`, `mark_built`, `mark_tested`, `add_catch`, `list_work`, `claim_work`, `complete_work`.

A read-only connection (scope without `memory.write`) gets a tool error on every write tool.

## Tests
- `scripts/rls-isolation-http.mjs`: MCP through the function URL **and** the public gateway, cross-tenant attempts on every lifecycle verb, capture idempotency and retry.
- `supabase/functions/_shared/mcp-lifecycle.test.ts` and `cloudflare/mcp-gateway/worker.test.mjs`.

## Changing it
Do not guess transports or endpoints (spec §18). Bump `version` in the health payload when the tool surface changes, and update this file in the same PR.
