# CLAUDE.md — working on AXON Memory

Instructions for any AI agent (Claude, Grok Bot, Cursor, …) that changes this repo. Read this before you touch code.

## Read first
- Canon: `Docs/axon/` (Operating Manual, Lexicon, Native Product Language). User-visible words follow the Lexicon: Memory, Thread, Core, Facet, Capture, Recall, Retire. Banned in UI copy: Workspace, Dashboard, Sync, Import, Alert, Notification, Category, Tag, History, Archive, Chat, Assistant. Internal identifiers may keep old names.
- Plan names: the internal key `ultra` is shown as **Power**. Never change Stripe price or product ids or the tier key without Luka's approval. `npm run test:naming` guards this.
- System docs: `docs/ARCHITECTURE.md`, `MEMORY_MODEL.md`, `MEMORY_LIFECYCLE.md`, `CAPTURE.md`, `RECALL.md`, `SECURITY.md`, `MCP.md`, `RUNBOOK.md`, `ACCEPTANCE.md`. Task state: `docs/tasks.json` (update it in the same PR).

## Hard rules
1. **Tenant isolation is a release blocker.** Edge functions use the service role, so every query filters on the resolved `user_id`. Rerun `tests/rls/isolation.sql` and `scripts/rls-isolation-http.mjs` after any backend deploy. Report a leak loudly and stop.
2. **No destructive migrations.** Additive only. Dropping or rewriting columns or data needs Luka's approval.
3. **Never touch real user rows.** Tests use rolled-back transactions or throwaway `@rls-test.invalid` users that the test deletes.
4. **No billing changes** without approval. Do not redeploy `stripe-webhook` for comment-only edits.
5. **Deploy only after tests pass.** CI is billing-locked, so run the gates in `RUNBOOK.md` yourself and put the results in the PR body.
6. **Never commit or log secrets** (service-role key, `ENCRYPTION_KEY`, Stripe keys). The frontend gets only the anon key.
7. Docs must not drift: if you change behaviour described in `docs/`, update the doc in the same PR.

## Layout
- `src/`: React 19 + Vite app (served at app.axon-memory.com and axon-memory.com). `landing/` is not deployed.
- `supabase/functions/`: edge functions. Shared logic lives in `_shared/` (`memory-core.ts`, `capture.ts`, `recall.ts`, `lifecycle.ts`, `mcp-lifecycle.ts`, `mcp-auth.ts`, `plans.ts`, `cors.ts`).
- `supabase/migrations/`: matches prod exactly (file version = applied version).
- `cloudflare/mcp-gateway/`: router Worker for mcp.axon-memory.com.
- `tests/`: `rls/`, `schema/`, `eval/` SQL suites (each `begin; … rollback;`). `scripts/`: HTTP isolation suite, fixtures, naming check, smoke test.

## Commands
```
npm test               # Deno unit tests (_shared/*.test.ts)
npm run test:worker    # gateway worker
npm run test:naming    # Power naming + Stripe id guard
npm run test:sql       # schema + eval suites (needs DB URL; or run files via execute_sql)
npm run test:rls-http  # live isolation suite (see RUNBOOK for fixtures)
npm run build          # frontend → dist/
```

## Conventions
- Capture goes through `capture()` (`_shared/capture.ts`): provenance is mandatory, and failures are visible and retryable. Do not insert into `memory_items` directly from a new code path.
- Recall goes through `buildContextPack` → `recall_hybrid`. Keep memory, inference, source and confidence separate in anything shown to a model or a person.
- Lifecycle goes through `memory_retire/restore/supersede/delete`. Never flip `retired_at` by hand.
- Small PRs, squash-merged, one task id per PR (`A3-1: …`).
