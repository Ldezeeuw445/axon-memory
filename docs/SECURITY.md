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
| `scripts/rls-isolation-http.mjs` | live HTTP with throwaway `@rls-test.invalid` users: PostgREST, RPC, Storage, context-pack, MCP (function + gateway), OAuth (PKCE, refresh, expiry, grandfathering), lifecycle verbs, capture, exports, account deletion | 150/150 |

## Secrets and tokens
- MCP OAuth (A5-4/A5-5): PKCE is **S256 only**, and public clients must send it. Before `plain` was removed, every stored grant was checked: all 13 used S256. New grants get a 24 h access token (`expires_in`) plus a rotating refresh token (90 days, bound to the client, single use, compare-and-swap rotation). An expired token gets `401 WWW-Authenticate: Bearer error="invalid_token"`. Tokens issued earlier have `access_expires_at = NULL` and keep working (grandfathered). TTLs can be overridden with `OAUTH_ACCESS_TTL_SECONDS` / `OAUTH_REFRESH_TTL_SECONDS`.
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
| The 13 OAuth tokens issued before A5-5 have no expiry (kept on purpose so no connected client is cut off) | A leaked old token stays valid until revoked | Reconnecting the client replaces it with an expiring one. Force-expiring them needs Luka's approval |
| Leaked-password protection disabled in Supabase Auth (advisor WARN) | Weak or breached passwords are accepted | A5-3 (waiting for Luka's approval) |
| `vector` extension lives in `public` (advisor WARN) | Cosmetic. Moving it would rewrite dependent columns, so it is left alone | none (would be destructive) |
| CI billing-locked | No automatic gate on main. All verification is manual (see `RUNBOOK.md`) | A0-2 |

## Reporting
Security issues go to Luka directly, not to a public issue.
