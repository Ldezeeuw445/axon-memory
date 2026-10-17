# AXON Memory — Runbook (as live, 2026-10-17)

CI (GitHub Actions) is billing-locked (A0-2), so **every gate below is run by hand** before merge and deploy. Rules: no destructive migrations, never touch real user rows, deploy only after tests pass, and rerun isolation after every backend deploy.

## Identifiers
| Thing | Value |
|---|---|
| Supabase project | `ktaditgtbubonrahyiig` (eu, prod) |
| Cloudflare account | `78d47158ae5cedb2a11512396cd46c1e` |
| Worker | `axon-mcp-gateway` on route `mcp.axon-memory.com/*` |
| Pages | `axon-app` (app.axon-memory.com), `axon-memory` (axon-memory.com, www). Both serve the root `dist/` |
| Repo | `Ldezeeuw445/axon-memory`, squash-merge PRs to `main` |

## Health checks
```
curl -s https://mcp.axon-memory.com/health            # status ok, database ok, tools[]
curl -s -o /dev/null -w '%{http_code}' https://app.axon-memory.com/   # 200
curl -s -o /dev/null -w '%{http_code}' https://axon-memory.com/       # 200
```
Capture health per user or overall: `select public.capture_health(24);` (service role). Failed captures: `select * from capture_events where status='failed' order by created_at desc limit 20;`.

## Operations view (§35, A12-3)
The owner's **Operations** page (`/admin/alerts`, OWNER_EMAIL only) shows a live snapshot from `ops-health` → `public.ops_health_snapshot()` (service role only, counts and timings, never content):
- **Capture**: success rate, p50/p95, last 5 failures (`capture_events`).
- **Recall**: p50/p95, embed p50, error rate (5xx only), empty results, per surface (`recall_events`, written by api-v1 / mcp-server / context-pack with a 400 ms fire-and-forget insert; purged after 30 days by `check-alerts`).
- **Queues**: captures stuck >10 min, memories without an embedding >15 min old, undelivered alerts, `net.http_request_queue`.
- **Connectors**: connected, failing (`consecutive_failures>0`), stale >24 h.
- **Deletion**: lifecycle ops in 7 days; orphaned rows whose owner is gone (must be 0, a non-zero value means an account delete did not finish).
- **Billing**: webhook outcomes in 30 days, open `billing_attention`.
SQL equivalent: `select public.ops_health_snapshot();`. Auth errors, DB errors and RLS denials are in the Supabase logs (`query_logs`); RLS is proven per release by the isolation suites.

## Uptime watch
`check-alerts` (every 5 min) probes `mcp.axon-memory.com/health`, `app.axon-memory.com/login` and `axon-memory.com/` (`_shared/uptime.ts`). An outage writes one `uptime_down` row to `system_alerts`; recovery writes one `uptime_recovered`. These rows are written `notified=true` (in-app only) unless the secret `UPTIME_ALERTS_DELIVER=1` is set, which would send them to the existing alert channel; that needs Luka's approval. Read: `select alert_type, message, created_at from system_alerts where alert_type like 'uptime_%' order by created_at desc limit 20;`

## Test gates
| Gate | Command | Notes |
|---|---|---|
| Unit (Deno) | `npm test` | `_shared/*.test.ts` |
| Worker | `npm run test:worker` | |
| Plan naming | `npm run test:naming` | no user-visible "Ultra". Stripe price ids unchanged |
| Schema + eval SQL | `npm run test:sql` / `npm run test:eval` | Needs a DB URL. Without one, run each file through Supabase `execute_sql`. Each file is `begin; … rollback;` |
| Isolation SQL | `tests/rls/isolation.sql` via `execute_sql` | rolled back, fixture users `@rls-test.invalid`. Every row must be `ok = true` |
| Isolation HTTP | `node scripts/rls-fixtures-sql.mjs fixtures.json > provision.sql` → run `provision.sql` via `execute_sql` → `SUPABASE_URL=… SUPABASE_ANON_KEY=… RLS_FIXTURES=fixtures.json npm run test:rls-http` | Creates and deletes its own throwaway users. Afterwards check residue: `select count(*) from auth.users where email like '%@rls-test.invalid'` must be 0 |
| SDK | `npm run test:sdk` (unit). `AXON_FIXTURES=fixtures.json npm run test:sdk-integration` (live, run **before** the HTTP suite, which deletes the fixture users) | |
| Build | `npm run build` | needs `.env` with `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` |

## Release gate (A12-1)
1. Local: `bash scripts/release-gate.sh` (10 steps, no production access, exits non-zero on any failure).
2. Live, in this order:
   1. Provision fixtures.
   2. SDK integration.
   3. HTTP isolation (it deletes its own users).
   4. `tests/rls/isolation.sql`.
   5. The three `tests/schema/*.sql` files and `tests/eval/recall_eval.sql` through `execute_sql`.
   6. `tests/rls/cleanup-http-fixtures.sql`.
   7. Residue check: must be 0.
3. Consent click e2e (step 4): seed a throwaway Pro user (`demo-seed` + `plan_tier='pro'`), then `E2E_FIXTURE=… SUPABASE_ANON_KEY=… npm run test:oauth-e2e` (needs playwright-core + Chrome; `PW_DIR`). The cleanup SQL removes its DCR clients.
4. Probe `mcp.axon-memory.com/health` and smoke all three domains (`/`, `/recall`, `/capture`, `/docs`, `/login`, `/?facet=recall`; all 200, one index hash).
5. Record the run in `docs/ACCEPTANCE.md`. Any `leak` row is a release blocker.

## Migrations
1. Write an **additive** migration. If it would drop or rewrite existing columns or data, stop and get Luka's approval.
2. Dry run: `begin;` + migration + the relevant suite (its own `begin;` stripped) + `rollback;` via `execute_sql`.
3. Apply with `apply_migration`. Prod assigns the version: rename the repo file to `<version>_<name>.sql` to match `list_migrations`.
4. Rerun the schema suite, `isolation.sql` and the advisors (`get_advisors security`).

## Edge functions
The Supabase MCP deploy accepts only a few files, so each function is shipped as one bundle:
```
deno bundle --platform deno --external 'npm:*' -o bundles/<fn>.js supabase/functions/<fn>/index.ts
deno run -A bundles/<fn>.js      # local smoke: listens on :8000, OPTIONS → 200
```
Deploy with entrypoint `index.js` and the function's **existing** `verify_jwt` setting (see the table in `ARCHITECTURE.md`). Before redeploying a function you didn't touch recently, diff the deployed source against the repo (`get_edge_function`). **Do not redeploy `stripe-webhook` for comment-only changes.** Then run both isolation suites.

## Frontend (Pages Direct Upload)
1. `npm run build`.
2. Get an upload token **per project** and run step 3 once per project with that project's token. Assets are stored per project: a deployment whose hashes were uploaded only under the other project's token succeeds but serves **500** (happened to axon-memory.com on 2026-10-17 for ~2.5 min, 13:37–13:40 CEST). Get the token: Cloudflare API `GET /accounts/{acct}/pages/projects/{name}/upload-token`.
3. `UPLOAD_JWT=<that project's token> npm run deploy:upload` (`scripts/deploy/pages-upload.mjs`: MD5-keyed check-missing → upload → upsert-hashes; writes `.pages-manifest.json`). Never print the token.
4. `npm run deploy:pages -- <project> <sha> "<message>"` (`scripts/deploy/pages-deploy.mjs`). With `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` it creates the production deployment itself; without them it writes `.pages-deploy-<project>.js` to run through the Cloudflare MCP `execute` tool.
5. `npm run deploy:smoke -- <index-*.js from dist/index.html>` (`scripts/deploy/smoke.sh`): 3 domains × 8 paths, exits 1 on any non-200 or a page still serving another build (the other site, until it is deployed too). Any 5xx: roll back at once.
6. Then repeat 2–5 for the other project. Lazy chunks: a tab left open across a deploy reloads once to pick up the new build (`src/lib/lazyPage.js`).
Note: `_headers` / `_redirects` currently travel only inside the manifest, so `_redirects` rules (missing `/assets/*` → 404) are **not** active. Sending them as their own multipart fields would activate them. That is a behaviour change, so test it on a preview first.

## Worker
`cloudflare/mcp-gateway/worker.js`. Test with `npm run test:worker`, deploy through the Cloudflare API (script upload, module syntax), then check `/health` and `/.well-known/oauth-authorization-server`.

## Rollback
- Frontend: redeploy the previous Pages deployment (`POST …/deployments/{id}/rollback`), or rebuild the previous commit.
- Edge function: rebundle from the previous commit and deploy.
- Migration: write a forward fix. Never `down`-migrate prod data.
- Worker: redeploy the previous `worker.js`.

## Incidents
| Symptom | First look |
|---|---|
| MCP clients fail to connect | `/health`, then `/.well-known/oauth-protected-resource`, then the `mcp-server` logs (`query_logs`, service `edge-function`) |
| Saves fail | `capture_health(24)`, and `capture_events` with status failed (stage + error_code). Retry with `retry_capture` |
| Recall empty or odd | `npm run test:eval`. Check `memory_embeddings` backlog (`capture_health` index backlog) |
| Possible cross-tenant leak | **Release blocker.** Run both isolation suites, freeze deploys, tell Luka |
