# AXON Memory — Acceptance (spec §37), status as of 2026-10-17

"Until this works end-to-end, AXON is not done." This file records which step is proven, by what, and what is still open. "Automated" means the live HTTP suite (`scripts/rls-isolation-http.mjs`, 130 checks) or a rolled-back SQL suite, run against production with throwaway users.

| # | Step | Status | Evidence |
|---|---|---|---|
| 1 | User creates account | partial | Fixture users are created directly in `auth.users` (the `handle_new_user` trigger and profile run). The real sign-up UI and email flow have **not** been exercised automatically |
| 2 | User captures a new Memory | automated | HTTP suite capture section (REST `remember` + MCP `capture`, idempotency, offline channel) |
| 3 | Memory stores with provenance | automated | `memory_items_provenance_required` constraint, plus `tests/schema/capture_pipeline.sql` (26) and HTTP checks on channel and origin |
| 4 | Another AI connects through AXON MCP | partial | MCP via the public gateway with a Bearer key is automated. The OAuth discovery endpoints are live. A full OAuth dance (DCR register → /authorize S256 → consent on app.axon-memory.com in a real browser → approve → token → MCP tools/list → refresh rotation) passed by hand on 2026-10-17 with a throwaway user, 16/16, including a spoofed "Claude" client shown by its host with a warning. Not yet in CI |
| 5 | AI recalls relevant Memory | automated | `tests/eval/recall_eval.sql` (13 cases, hit@1 13/13), HTTP recall-trace checks |
| 6 | Recall shows the right user's information | automated | Isolation suites: A never sees B (240 SQL + 130 HTTP) |
| 7 | Source is traceable | automated | Every recalled item is `{id, kind: memory, source, confidence, relevance (incl. matched_by)}`. Inferences come back under `inferred` and cite memory ids (`_shared/recall.ts`) |
| 8 | Newer fact supersedes older safely | automated | `tests/schema/lifecycle.sql` (44), MCP `supersede` cross-tenant + happy path |
| 9 | Retire works | automated | lifecycle suite + MCP `retire`/`restore` |
| 10 | Delete removes from future Recall | automated | lifecycle suite (propagation table) + MCP `delete` + `delete-account` |
| 11 | A different user cannot retrieve it | automated | Isolation suites (release blocker) |
| 12 | Mobile Recall works | **open** | The TWA wraps the web app, but there is no mobile-first Recall surface yet (A9-1) and no device test |
| 13 | Terrain reflects actual relationship data | **open** | Terrain reads `entities` / `entity_links`. Not yet verified free of mock data (A9-1, A10-1) |
| 14 | Billing entitlement is correct | **open** | Stripe checkout and webhook live. Server-side normalisation and webhook replay tests are pending (A11-2). Display name Power is live (A11-1) |
| 15 | MCP remains healthy | automated (probe) | `GET mcp.axon-memory.com/health` (database ping + tool list). Not yet registered with an external uptime monitor |

**Verdict:** not done. Steps 12–14 are open, and 1 and 4 are only partly automated. The release gate (A12-1) should run this table end to end.
