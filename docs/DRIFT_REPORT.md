# AXON Memory — Phase A0 Drift Report

Generated 2026-10-16 by Grok Bot (executor). Baseline: `origin/main` @ `09e3f5b`. Live sources inspected read-only: Supabase `ktaditgtbubonrahyiig`, Cloudflare account `78d47158…`, app/landing/MCP endpoints.

Canon: `Docs/axon/*` (Operating Manual, Lexicon, Native Product Language, Canon Corrections/Review, Experience Design, Creative Direction, Motion Design, Reality Report) plus Master Build Spec 3/5 (owner-supplied).

## Reality snapshot
| Area | State |
|---|---|
| Migrations | 61 in repo = 61 applied live (no schema drift between repo and prod) |
| Edge functions | 23 in repo = 23 deployed |
| Tables | 35 public tables, RLS enabled on all. 12 have **RLS on, zero policies** (service-role only: internal_config, oauth_*, system_alerts, embedding_usage_*, landing_*, rate_limit_buckets) — intentional deny-all, but undocumented |
| Data | ~6.4k memory_items, ~5k embeddings, ~774 memory_facts, 19 source connections, 14 API keys |
| App / landing | app.axon-memory.com 200, axon-memory.com 200 (Pages Direct Upload, build 09e3f5b) |
| MCP | mcp.axon-memory.com Worker = pure router to Supabase `mcp-server` + OAuth functions; protected-resource metadata OK |
| CI | `.github/workflows/ci.yml` exists; **every run since 2026-09-29 fails with no failed step** → jobs never start (Actions disabled/billing/minutes) |
| Tests | Only `supabase/functions/_shared/embeddings.test.ts` + `scripts/smoke-test.mjs`. No RLS, MCP, recall-eval, or frontend tests. No typecheck (JS app) |

## Drift findings (ranked)
1. **Ultra vs Power.** Spec/canon pricing names the €9.99 tier *Power*. Code everywhere says *Ultra*: `plan_features.tier='ultra'`, `_shared/plans.ts`, `stripe-checkout`, `stripe-webhook`, `api-keys-create`, `mcp-oauth-consent`, `memory-core.ts`, `src/lib/planCatalog.js` ("Go Ultra"), `landing/src/content.js`. Prices (€2.99/5.99/9.99/199) match. Fix: display name → Power, keep DB key `ultra` as internal id (no billing change) until owner approves a key rename.
2. **MCP lacks canonical lifecycle.** MCP tools: remember, recall_context, list_projects, list_sources, set_thread + workspace/task tools (add_task, add_phase, claim_work, complete_work, mark_built, mark_tested, add_catch, list_tasks, list_work). **No retire, no delete, no supersede** over MCP (spec §18 requires capture/recall/retire/delete). Verb names (`remember`, `recall_context`) differ from canon (Capture/Recall).
3. **Forbidden language in product.** Lexicon bans Workspace, Dashboard, Sync, Import, Alert, Notification, Category, Tag, History, Archive, Chat, Assistant. Implementation has `workspaces*` tables + MCP tools, `Dashboard.jsx`, `AdminAlerts.jsx`, `sync-source`/`cron-sync-sources`, `memory_facts.category`, `system_alerts`. Internal names can stay; **user-visible strings** must be audited (A9/A10).
4. **Memory model is thinner than spec §5.** `memory_items` has no explicit Weight, Depth, Facet, lifecycle_state, confidence, normalized_content, or Core relation columns. Provenance is partial (source_type, source_connection_id, api_key_id, origin_key, external_id, occurred_at). Thread membership only via `project_threads`/projects. Supersession exists only on `memory_facts` (superseded_at/by/reason) — good basis.
5. **Delete propagation unverified.** `retire_memory` + "withdrawn memory withdraws conclusions" exist; no tested guarantee that delete removes embeddings/facts/entity_links/context-pack caches (spec §33, A4).
6. **No tenant-isolation test suite.** RLS on everywhere, but zero adversarial tests across rows/RPC/semantic recall/MCP/API/export (spec §17 hard gate). Advisors flag: SECURITY DEFINER functions executable by `anon` (`starter_tasks_on_workspace`, `starter_tasks_on_fact`, `resync_facts_for_item`) and by authenticated; extension in public schema; leaked-password protection disabled.
7. **CI is dead.** All recent runs fail before any step → no lint/build/test gate on main. `gh` CLI not authenticated on box; git over HTTPS has no credentials (pushes go via GitHub MCP).
8. **Plan enforcement & entitlements split.** `profiles.plan` marked vestigial; truth in `subscriptions` + `plan_features` (subscriptions table currently empty). No native (App/Play) entitlement path; no webhook replay/idempotency tests (A11).
9. **Recall engine not evaluated.** Semantic search (pgvector) + title search + recall_rules exist; no hybrid ranking with Weight/Depth/Facet/recency and **no eval fixtures**; recall output does not distinguish memory/inference/source/confidence explicitly.
10. **Docs required by spec §36 missing.** Present: Operating Manual, Product Language, Lexicon. Missing: ARCHITECTURE.md, MEMORY_MODEL.md, SECURITY.md, MCP.md, RUNBOOK.md, ACCEPTANCE.md, CLAUDE.md. Also `Docs/` vs `docs/` casing split; `.agents/memory/` and `replit.md` hold stale architecture notes.
11. **Duplicate/dead frontend code.** `src/context/AuthContext.jsx` and `src/contexts/AuthContext.jsx`; `src/lib/supabase.js` and `supabaseClient.js`; terrain engine duplicated between `src/components/terrain` and `landing/src/terrain`. Landing `banner/mockGraph.js` = mock data → check against "no fake data" rule (§24, §27).
12. **Connectors contract incomplete.** `source_connections` + OAuth + cron sync exist (GitHub, Linear, etc.), but no uniform status/scope/last_success/error/count/revoke contract surfaced in UI; risk of showing "connected" when sync failed (§20).
13. **Offline capture.** `public/sw.js` exists; no idempotent queued capture with queued/syncing/stored/failed states (§32).
14. **Canon tension to resolve with owner (not code):** Canon says retirement not deletion & "never exported as a file"; spec §33 + Reality Report demand export and real deletion. Spec (owner's newer instruction) wins for data controls; canon wording should be amended.
15. **Deploy is manual.** Pages projects are Direct Upload (no git integration); Worker deployed by hand. No scripted, reproducible deploy or health heartbeat registered for AXE Core.

## Not drifted (verified)
- Prices match canon on app + landing + Stripe price ids.
- Repo migrations == live migrations; repo functions == deployed functions.
- MCP OAuth discovery endpoints live and routed correctly.
