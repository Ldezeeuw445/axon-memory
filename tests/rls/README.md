# Tenant isolation suite (spec §17 — hard release gate)

A user must never retrieve another user's memory. Two complementary suites prove it:

| Suite | Layer | Fixtures | Run |
|---|---|---|---|
| `tests/rls/isolation.sql` | Postgres: every table + view in `public`, joins, RPC, SECURITY DEFINER grants, semantic recall (`match_memory_items` with B's exact vector), Threads, entities/entity_links, Storage, anon role, write/impersonation attacks, cross-tenant parent references | Two throwaway users created **inside one transaction that ends in `ROLLBACK`** — nothing persists | `SUPABASE_DB_URL=… npm run test:sql` or paste into the SQL editor / MCP `execute_sql` |
| `scripts/rls-isolation-http.mjs` | Deployed stack: PostgREST rows + RPC, Storage API, `context-pack` (JWT + API key), `remember` (incl. spoofed `user_id`), MCP `mcp-server` and `mcp.axon-memory.com` gateway, `delete-account` boundary | Two disposable `@rls-test.invalid` users, deleted through `delete-account` at the end | CI: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. Without a service key: `node scripts/rls-fixtures-sql.mjs fx.json > p.sql`, run `p.sql` as postgres, then `RLS_FIXTURES=fx.json npm run test:sql-http` |

Severity in the SQL suite: `leak` = release blocker; `integrity` = A can write rows hanging off B's objects; `hygiene` = privilege grants; `control` = positive controls proving the zero-counts are not vacuous. CI fails on any non-pass.

Exports: no export endpoint exists yet. The HTTP suite records it as skipped; the task that ships export must add a case.

Fallback cleanup for the HTTP fixtures: `tests/rls/cleanup-http-fixtures.sql` (matches only `@rls-test.invalid`).

## Results — 2026-10-17 (production, ktaditgtbubonrahyiig)

- SQL suite before A5-2/A5-4: 175/175 leak checks pass, 0 leaks; 6 integrity failures (cross-tenant parent references accepted), 6 hygiene failures (anon/authenticated EXECUTE on 3 SECDEF trigger fns).
- SQL suite with migrations `20261017095946` + `20261017095947`: 220/220 pass (incl. legit-write control firing all three triggers).
- HTTP suite: 84/84 pass, zero residue afterwards.
- After applying both migrations to production: SQL suite 220/220, HTTP suite 84/84, zero residue.

## Security advisor — remaining findings (documented exceptions)

`get_advisors(security)` after A5-2: no SECURITY DEFINER findings left. Remaining:

- **rls_enabled_no_policy** on `embedding_usage_daily`, `embedding_usage_daily_user`, `embedding_usage_monthly`, `internal_config`, `landing_film_watch`, `landing_interest`, `oauth_authorization_codes`, `oauth_clients`, `rate_limit_buckets`, `system_alerts`. Intentional deny-all: only the service role (edge functions) reads/writes them. No policy = no access for anon/authenticated, which the SQL suite verifies.
- **extension_in_public** (`vector`). Not moved: function bodies (`match_memory_items`, embedding writes) resolve `vector` through `search_path = public`; moving the extension would break semantic recall. Revisit only with a coordinated migration that re-creates those functions with `extensions.vector`.
- **auth_leaked_password_protection** — dashboard-only Auth setting, tracked as A5-3 (owner).
