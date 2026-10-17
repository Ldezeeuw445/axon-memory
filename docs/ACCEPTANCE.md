# AXON Memory — Acceptance (spec §37), release gate run of 2026-10-17 15:20–15:50 CEST

"Until this works end-to-end, AXON is not done." This file records which step is proven, by what, and what is still open.

Gate run on main `d81540f` + branch `a12-release-gate`, against production. Live suites used throwaway `@rls-test.invalid` users only; 0 were left afterwards. Raw logs are on the box under `/workspace/gate/`.

## Gate results

| Suite | Result |
|---|---|
| Local gate `bash scripts/release-gate.sh` | **12/12**: Deno type-check + unit 86; every edge function type-checks (except stripe-*, see notes); vitest 11; lexicon; plan names; lint (warnings only); worker; SDK unit; billing replay 23/23 + checkout guard 6/6; build |
| SDK integration (live) | **12/12** |
| HTTP isolation + product flow (live) | **211/211**: rest 32, api 20, lifecycle 23, oauth 22, connector 21, capture 18, control 18, mcp 14, rpc 11, billing 5, anon 5, recall 4, delete 4, storage 4, auth/export/semantic 1 each |
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
| 1 | User creates account | **pass** | Run end to end on 2026-10-17 18:37 CEST with the bot's inbox axon-test@mail.grokbot.com in a mobile Chrome profile (`scripts/signup-e2e-a.mjs`, `-b.mjs`, shots in `axon-shots/step1`): sign-up at /login?mode=signup → 200, "Check your email"; the confirmation mail arrived within a minute; the link lands signed in on Recall; first password sign-in in a fresh browser → Recall in 5.4 s; You shows Starter; delete-account → 200, back to /login; the old password → "Invalid login credentials"; auth.users, identities and profiles for the address → 0. Finding: the mail comes from Supabase's default sender (`noreply@mail.app.supabase.io`, "powered by Supabase"), so it has no AXON branding and is subject to Supabase's low default send limit. A custom SMTP and template are a dashboard setting for Luka |
| 2 | User captures a new Memory | automated | HTTP capture section (REST `remember`, MCP `capture`, `/v1` with key and with the app's own session, idempotency, offline queue). The app's capture is checked in the browser (`axon-shots/a9/capture-kept-mobile.png`) |
| 3 | Memory stores with provenance | automated | `memory_items_provenance_required`, capture_pipeline 26/26, HTTP checks on `source.channel` (direct/agent/connector) and `capture_events.channel` |
| 4 | Another AI connects through AXON MCP | automated | `npm run test:oauth-e2e` (scripts/oauth-consent-e2e.mjs, real headless Chrome against production, throwaway `@rls-test.invalid` Pro user): DCR register → `/authorize` S256 → sign-in → consent screen names the client → **Approve click** → code + state → token → MCP `tools/list` (22) + `recall_context` → refresh rotation → the AI is listed in Connect → Withdraw → old token 401 → second consent **Cancel** → `access_denied` → all of the client's keys revoked. **14/14** on 2026-10-17. Plus 22 OAuth and 14 MCP protocol checks |
| 5 | AI recalls relevant Memory | automated | recall_eval 24/24, plus HTTP recall-trace checks |
| 6 | Recall shows the right user's information | automated | isolation 249 SQL + 204 HTTP |
| 7 | Source is traceable | automated | Every recalled item carries `source`, `confidence` and `relevance.matched_by`; inferences cite memory ids. The app's recall log shows which AI read what (`axon-shots/a9/you-recall-log-mobile.png`) |
| 8 | Newer fact supersedes older safely | automated | lifecycle 44/44, MCP `supersede` cross-tenant + happy path |
| 9 | Retire works | automated | lifecycle suite, MCP `retire`/`restore`, app "Retired" list |
| 10 | Delete removes from future Recall | automated | lifecycle propagation, MCP `delete`, `delete-account` (HTTP: a deleted user's key dies) |
| 11 | A different user cannot retrieve it | automated | isolation suites (release blocker): clean |
| 12 | Mobile Recall works | **partial** | Recall is the phone-first home (A9-1), live at app.axon-memory.com/recall. Checked at 390×844 in headless Chrome: live screenshot `axon-shots/live/app-recall-mobile.png`, recall query + result `axon-shots/a9/recall-result-mobile.png`. Not run on a physical phone or in the TWA |
| 13 | Terrain reflects actual relationship data | automated | Terrain has two readings. *Where it comes from* (source summits, `memory_source_breakdown`). *How it connects* (`?facet=terrain&view=links`) draws the stored links between memories: thread (`memory_items.project_id`), same person or thing (`entity_links`, only entities joined to 2+ memories), replaced by newer (`superseded_by`), and `memory_relations` (relates, weaves, contradicts). Rows are read with the person's own session (RLS), and memories with no link are left out. No sample data in the code path; the empty state says so. `src/lib/linkGraph.js`, 8 unit tests. Screenshots at 390×844 and 1440×900: `axon-shots/a13/links-*.png` (throwaway user seeded with 3 threads, 4 named things, 2 replacements, 1 relation → 15 memories, 29 links) |
| 14 | Billing entitlement is correct | **pass** | `user_plan_status` is the single source and users cannot change their plan, Stripe ids, the feature matrix or subscriptions. Since A11-3 (2026-10-17) the webhook runs on the tested reducer with an event ledger (replay 23/23, 7 former defects fixed), the plan is checked on every key/OAuth call (7 live checks: Starter → 402, Power key → 200) and a Lifetime member cannot open a checkout (guard 6/6). Live: stripe-webhook v25 answers unsigned/bad-signature deliveries with 400; a signed live delivery needs the webhook secret, which is not readable from here |
| 15 | MCP remains healthy | automated (probe + watch) | `/health` ok with a database ping. Watched every 5 minutes by `check-alerts` (pg_cron): `mcp.axon-memory.com/health`, `app.axon-memory.com/login`, `axon-memory.com/`; down = two failures 3 s apart; one `uptime_down` alert per outage and one `uptime_recovered` after, in `system_alerts` (admin view). Delivery to the alert channel is off unless `UPTIME_ALERTS_DELIVER=1`. The watch runs inside Supabase, so a full Supabase outage is not caught by it |

**Verdict: not done.** 12 of 15 steps are proven automatically. Three are partial:
- 1 needs a real inbox (the bot's own inbox must be claimed first).
- 12 has no physical-device run.

No step failed, and nothing in the gate blocks the current production release.

## Notes

- stripe-checkout, stripe-portal and stripe-webhook are not type-checked by the gate. Deno's TypeScript host crashes on the esm.sh Stripe type directives, which is a tooling fault, not our code. The webhook is executed by `test:billing` instead.
- `npm run test:sql` needs a database URL; on the box each SQL file is run through Supabase `execute_sql`.
