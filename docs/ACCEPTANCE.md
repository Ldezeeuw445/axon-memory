# AXON Memory — Acceptance (spec §37), release gate run of 2026-10-17 15:20–15:50 CEST

"Until this works end-to-end, AXON is not done." This file records which step is proven, by what, and what is still open.

Gate run on main `d81540f` + branch `a12-release-gate`, against production. Live suites used throwaway `@rls-test.invalid` users only; 0 were left afterwards. Raw logs are on the box under `/workspace/gate/`.

## Gate results

| Suite | Result |
|---|---|
| Local gate `bash scripts/release-gate.sh` | **10/10**: Deno type-check + unit 86; every edge function type-checks (except stripe-*, see notes); vitest 11; lexicon; plan names; lint (warnings only); worker; SDK unit; billing replay 17/17; build |
| SDK integration (live) | **12/12** |
| HTTP isolation + product flow (live) | **204/204**: rest 32, api 20, lifecycle 23, oauth 22, connector 21, capture 18, control 18, mcp 14, rpc 11, billing 5, anon 5, recall 4, delete 4, storage 4, auth/export/semantic 1 each |
| `tests/rls/isolation.sql` (rolled back) | **249/249**: leak 195, hygiene 34, control 14, integrity 6 |
| `tests/schema/capture_pipeline.sql` | **26/26** |
| `tests/schema/lifecycle.sql` | **44/44** |
| `tests/schema/memory_model.sql` | **45/45** |
| `tests/eval/recall_eval.sql` | **24/24** (20 recall, including hit@1, plus 4 leak) |
| MCP `GET mcp.axon-memory.com/health` | ok, database ok |
| Domains (app., apex, www) | all 200: `/`, `/recall`, `/capture`, `/docs`, `/login`, `/?facet=recall`, product images, manifest; one build (`index-nUaD4goP.js`) everywhere |

**No tenant leak in any suite.**

## The §37 flow

| # | Step | Status | Evidence |
|---|---|---|---|
| 1 | User creates account | **partial** | Fixture users go through `handle_new_user` (profile + plan) and sign in with a password grant. Sign-up is open with **email confirmation required** (`mailer_autoconfirm=false`). The real sign-up → confirmation mail → first sign-in has **not** been run end to end: that needs a real inbox (the bot has none claimed yet) |
| 2 | User captures a new Memory | automated | HTTP capture section (REST `remember`, MCP `capture`, `/v1` with key and with the app's own session, idempotency, offline queue). The app's capture is checked in the browser (`axon-shots/a9/capture-kept-mobile.png`) |
| 3 | Memory stores with provenance | automated | `memory_items_provenance_required`, capture_pipeline 26/26, HTTP checks on `source.channel` (direct/agent/connector) and `capture_events.channel` |
| 4 | Another AI connects through AXON MCP | **partial** | Automated: 22 OAuth checks (metadata, PKCE S256 only, code exchange, expiry, refresh rotation, grandfathering) and 14 MCP checks through the public gateway. The consent click in a real browser was run **by hand** (16/16, 2026-10-17); it is not scripted |
| 5 | AI recalls relevant Memory | automated | recall_eval 24/24, plus HTTP recall-trace checks |
| 6 | Recall shows the right user's information | automated | isolation 249 SQL + 204 HTTP |
| 7 | Source is traceable | automated | Every recalled item carries `source`, `confidence` and `relevance.matched_by`; inferences cite memory ids. The app's recall log shows which AI read what (`axon-shots/a9/you-recall-log-mobile.png`) |
| 8 | Newer fact supersedes older safely | automated | lifecycle 44/44, MCP `supersede` cross-tenant + happy path |
| 9 | Retire works | automated | lifecycle suite, MCP `retire`/`restore`, app "Retired" list |
| 10 | Delete removes from future Recall | automated | lifecycle propagation, MCP `delete`, `delete-account` (HTTP: a deleted user's key dies) |
| 11 | A different user cannot retrieve it | automated | isolation suites (release blocker): clean |
| 12 | Mobile Recall works | **partial** | Recall is the phone-first home (A9-1), live at app.axon-memory.com/recall. Checked at 390×844 in headless Chrome: live screenshot `axon-shots/live/app-recall-mobile.png`, recall query + result `axon-shots/a9/recall-result-mobile.png`. Not run on a physical phone or in the TWA |
| 13 | Terrain reflects actual relationship data | **partial** | Terrain reads only real rows (`memory_source_breakdown`, `memory_items`, `source_connections`, `api_keys`); there is no mock or sample data in the code path. It shows **where memories come from and which AIs read them**. It does **not** yet draw relationships between memories (`entities` / `entity_links`) |
| 14 | Billing entitlement is correct | **partial** | Entitlement truth holds: `user_plan_status` is the single source and users cannot change their plan, Stripe ids, the feature matrix or subscriptions (5 live checks + 402 on a Starter key). The live webhook has **5 recorded defects** in replay/ordering/Lifetime handling (`npm run test:billing`, docs/BILLING.md). The fix is written (`_shared/billing.ts`, 6/6) but **waits for approval** |
| 15 | MCP remains healthy | automated (probe) | `/health` ok with a database ping. Not yet watched by an external uptime monitor |

**Verdict: not done.** 10 of 15 steps are proven automatically. Five are partial:
- 1 needs a real inbox.
- 4 has an unscripted consent click.
- 12 has no physical-device run.
- 13 has no relationship view yet.
- 14 needs the billing fix, which needs approval.

No step failed, and nothing in the gate blocks the current production release.

## Notes

- stripe-checkout, stripe-portal and stripe-webhook are not type-checked by the gate. Deno's TypeScript host crashes on the esm.sh Stripe type directives, which is a tooling fault, not our code. The webhook is executed by `test:billing` instead.
- `npm run test:sql` needs a database URL; on the box each SQL file is run through Supabase `execute_sql`.
