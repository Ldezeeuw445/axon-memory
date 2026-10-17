# AXON Memory — Security (as live, 2026-10-17)

## Tenant isolation (release blocker)
A user must never retrieve another user's Memory. Any failing isolation check blocks a release.

- **RLS is on for every public table (38).** Owner tables use `auth.uid() = user_id` (or ownership helpers: `owns_workspace`, `owns_project`, `owns_api_key`). Parent references are checked across tenants on insert and update (A5).
- **Deny-all tables** (RLS on, no policy, service role only, intentional): `internal_config`, `oauth_clients`, `oauth_authorization_codes`, `system_alerts`, `embedding_usage_daily`, `embedding_usage_daily_user`, `embedding_usage_monthly`, `landing_interest`, `landing_film_watch`, `rate_limit_buckets`.
- **Owner-read, service-write:** `capture_events`. `memory_lifecycle_events` is owner select and owner insert (`user_id = auth.uid()`), with no update or delete.
- **Views** are `security_invoker`, so RLS applies to them.
- **Functions:** recall and lifecycle RPCs (`recall_hybrid`, `memory_retire/restore/supersede/delete`, `capture_health`, `core_summary`) are SECURITY INVOKER. Wherever a `p_user_id` override exists, it is honoured for the service role only. SECURITY DEFINER functions are trigger or internal helpers, with EXECUTE revoked from `anon` and `authenticated` (A5).
- **Edge functions** run as the service role, so they bypass RLS. Every query must filter on the resolved `user_id`. This is the main review point for any backend change.

### Isolation suites (rerun after every backend deploy)
| Suite | What | Last result |
|---|---|---|
| `tests/rls/isolation.sql` | rolled back. Rows, joins, views, RPCs, semantic + keyword recall, threads, relations, storage, exports, hygiene (no anon-executable SECDEF) | 240/240 |
| `scripts/rls-isolation-http.mjs` | live HTTP with throwaway `@rls-test.invalid` users: PostgREST, RPC, Storage, context-pack, MCP (function + gateway), lifecycle verbs, capture, exports, account deletion | 130/130 |

## Secrets and tokens
- API keys and OAuth access tokens: only `sha256(token)` and a prefix are stored (`api_keys`). Revoked via `revoked_at`.
- Connector OAuth tokens: AES-GCM at rest with the `ENCRYPTION_KEY` project secret (`_shared/crypto.ts`).
- Stripe webhook: signature verified (`constructEventAsync`) before anything is processed.
- The browser holds only the anon key and the user's session JWT. The service-role key exists only in edge function secrets. **Never put it in the frontend, a repo file, or a log.**

## CORS
`_shared/cors.ts` defines two explicit doors. App-internal functions use the origin allowlist. Functions external tools are meant to call (mcp-server, context-pack, remember, openapi-actions, OAuth endpoints, notify-me, film-watch) use the `public*` helpers. No function uses cookies or `Access-Control-Allow-Credentials`, and all auth is an explicit Bearer header.

## Abuse limits
MCP `tools/call`: 60 per minute per key. Capture payload limits and validation are in `_shared/capture.ts`. `rate_limit_buckets` is swept daily.

## Deletion
`memory_delete` propagates to embeddings, recalls, relations, entity links, orphaned entities and sole-source facts (see `MEMORY_LIFECYCLE.md`). `delete-account` removes everything that cascades from `auth.users`. Both are covered by the HTTP suite.

## Known gaps (tracked, not yet fixed)
| Gap | Risk | Task |
|---|---|---|
| OAuth metadata advertises PKCE `plain` alongside `S256` | A weaker challenge method is accepted if a client asks for it (`_shared/oauth.ts`) | not yet tracked (proposed follow-up) |
| OAuth access tokens do not expire (revocation only) | A leaked token stays valid until revoked | not yet tracked (proposed follow-up) |
| Leaked-password protection disabled in Supabase Auth (advisor WARN) | Weak or breached passwords are accepted | A5-3 (waiting for Luka's approval) |
| `vector` extension lives in `public` (advisor WARN) | Cosmetic. Moving it would rewrite dependent columns, so it is left alone | none (would be destructive) |
| CI billing-locked | No automatic gate on main. All verification is manual (see `RUNBOOK.md`) | A0-2 |

## Reporting
Security issues go to Luka directly, not to a public issue.
