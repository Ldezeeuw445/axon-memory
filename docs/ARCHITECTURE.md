# AXON Memory — Architecture (as live, 2026-10-17)

This describes what is deployed, not what is planned. If the code and this file disagree, the code is right and this file is a bug: fix it in the same PR.

## Shape

```
 browser / TWA (Android)            AI clients (Claude, ChatGPT, Cursor, …)       scripts / REST
         │                                   │  MCP Streamable HTTP + OAuth            │ Bearer axon_live_…
         ▼                                   ▼                                         ▼
 Cloudflare Pages                    Cloudflare Worker axon-mcp-gateway        Supabase Edge Functions
  axon-app    → app.axon-memory.com   mcp.axon-memory.com/*  (router only)  ──▶  /functions/v1/*
  axon-memory → axon-memory.com, www                                                  │
         │  supabase-js (anon key + user JWT, RLS)                                    │ service role, scoped by user_id
         └──────────────────────────────▶  Supabase Postgres (ktaditgtbubonrahyiig)  ◀┘
                                            RLS on every public table · pgvector · pg_trgm · pg_cron · pg_net
```

There is one source of truth: Postgres. There is no separate graph or vector store, and no cache. Context packs are built on every request.

## Components

| Component | Where | Notes |
|---|---|---|
| Web app | `src/` (React 19, Vite 8, react-router 7, three.js terrain) | Built to `dist/`. Both Pages projects serve **the same build**. `/` renders the landing page, except on the app host (`isAppHost()`), where it redirects into the app. `landing/` is a separate sub-project that is **not deployed** today |
| Android | TWA shell around app.axon-memory.com (`ANDROID.md`) | A web deploy updates the phone. The APK is rebuilt only for icon, name or URL changes |
| MCP gateway | `cloudflare/mcp-gateway/worker.js` | Path rewrites only: `/v1/*` → `api-v1` (public REST API, A7-1), `/.well-known/oauth-*` → `oauth-metadata`, `/register`, `/authorize`, `/token` → `mcp-oauth-*`, `/health` → `mcp-server?health=1`, `/` → `mcp-server`. It has no auth logic. It forwards redirects with `redirect: "manual"` |
| Edge functions | `supabase/functions/*` (24) | See the table below. Shared code is in `_shared/` |
| Database | `supabase/migrations/*` | Repo migrations equal applied migrations. Prod assigns the version timestamp, and the repo file is renamed to match |
| Scheduled jobs | pg_cron | `axon-sync-sources` */30 (cron-sync-sources), `axon-check-alerts` */5 (check-alerts), `sweep-rate-limit-buckets` 04:17, `capture-events-prune` 03:17 |
| Billing | Stripe (`stripe-checkout`, `stripe-portal`, `stripe-webhook`) | Entitlement truth: `subscriptions` + `plan_features`, read through `user_plan_status`. Internal tier keys are `starter/pro/ultra/lifetime_founder`. `ultra` is shown as **Power** (`_shared/plans.ts` `PLAN_DISPLAY_NAMES`) |

### Edge functions

| Function | verify_jwt | Caller | Purpose |
|---|---|---|---|
| mcp-server | no (own Bearer auth) | AI clients via gateway | MCP JSON-RPC: tools/list, tools/call, unauthenticated `?health` |
| api-v1 | no (own Bearer auth) | REST clients, SDK | Versioned public API `/v1` (`API.md`) |
| context-pack | no (own Bearer auth) | REST, GPT actions | Ranked context pack (`buildContextPack`) |
| remember | no (own Bearer auth) | REST, app, offline queue | Capture endpoint: idempotency, status, retry |
| openapi-actions | no | ChatGPT actions | OpenAPI document |
| mcp-oauth-register / -authorize / -token, oauth-metadata | no | MCP clients | OAuth 2.1 dynamic registration, PKCE, token = an `api_keys` row |
| mcp-oauth-consent | yes | app | The user approves a client and scope |
| api-keys-create | yes | app | Personal developer key (Power plan or higher) |
| oauth-start / oauth-callback, sync-source, cron-sync-sources, disconnect-source | mixed | app / cron | Source connectors (GitHub, Linear, …). Tokens are AES-GCM encrypted at rest |
| delete-account | yes | app | Full account deletion (everything cascades from `auth.users`) |
| stripe-checkout / stripe-portal / stripe-webhook | mixed | app / Stripe | Billing. The webhook verifies the Stripe signature |
| check-alerts, list-alerts | no / yes | cron / admin | Operational alerts (`system_alerts`) |
| notify-me, film-watch | no | landing | Interest list and landing film reach. No user memory |

## Request paths

- **App read:** supabase-js with the user's JWT → PostgREST → RLS (`auth.uid() = user_id`).
- **MCP / REST:** Bearer token → `resolveBearerToken` (`_shared/mcp-auth.ts`) hashes it (SHA-256) and looks it up in `api_keys` (not revoked) → `user_id`, `scope`, `oauth_client_id`. Every query after that runs with the service role **and an explicit `user_id` filter**, or calls a service-role-only RPC that takes `p_user_id`. MCP `tools/call` is rate limited to 60 calls per minute per key (`take_rate_limit_token`).
- **Capture:** `capture()` (`_shared/capture.ts`) validates input, deduplicates on `(user_id, idempotency_key)` / `origin_key`, writes `memory_items` with provenance, and records a `capture_events` row per stage. Embedding runs in the background (`EdgeRuntime.waitUntil`). See `CAPTURE.md`.
- **Recall:** `recall_hybrid()` (lexical + fuzzy + exact semantic + recency, with weight/provenance/thread/facet signals) feeds `buildContextPack`. Every item is traced to its memory, source and confidence, and inferences are kept apart from what the user stated. See `RECALL.md`.

## Deploy (manual. CI is billing-locked)

Everything is verified on a workstation or the agent box. The steps are in `RUNBOOK.md`. Pages projects are Direct Upload with no git integration, and the Worker is deployed by hand.

## Related docs
`MEMORY_MODEL.md` · `MEMORY_LIFECYCLE.md` · `CAPTURE.md` · `RECALL.md` · `SECURITY.md` · `MCP.md` · `RUNBOOK.md` · `ACCEPTANCE.md` · `CLAUDE.md` · canon in `Docs/axon/`.
