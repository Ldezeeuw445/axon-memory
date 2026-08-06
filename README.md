# AXON Memory

**One persistent memory layer. Every AI you use.**

AXON connects the apps you already work in — Gmail, GitHub, Notion, Slack —
into one encrypted, structured memory graph, then serves any AI tool
(ChatGPT, Claude, Gemini, Cursor, or anything that can call an authenticated
HTTP endpoint) a token-budgeted "context pack" on demand. $5/month, one plan.

This repo is the full application: React/Vite frontend + a Supabase-only
backend (Postgres, Auth, and Deno Edge Functions — no separate Node server).

---

## Architecture

```
┌────────────────────┐      OAuth       ┌──────────────────────────┐
│  Gmail / GitHub /   │ ───────────────▶ │  supabase/functions/     │
│  Notion / Slack     │ ◀─────────────── │  oauth-start,            │
└────────────────────┘   encrypted token │  oauth-callback          │
                                          └──────────┬────────────────┘
                                                      │ writes
                                                      ▼
┌────────────────────┐   token-budgeted   ┌──────────────────────────┐
│  ChatGPT / Claude / │ ◀───────────────── │  context-pack (Edge Fn)  │
│  Gemini / Cursor /  │   GET + API key    │  reads memory_items,     │
│  any HTTP client    │ ─────────────────▶ │  profiles, connections   │
└────────────────────┘                     └──────────┬────────────────┘
                                                        │
                                          ┌─────────────▼─────────────┐
                                          │   Postgres (Supabase)      │
                                          │   RLS on every table        │
                                          │   full-text + pgvector      │
                                          └────────────────────────────┘
```

**Why Supabase-only, no Railway/Vercel API layer:** every privileged
operation (OAuth token exchange, Stripe webhooks, account deletion, context
retrieval) is a Deno Edge Function running next to the database with
service-role access, gated by the Postgres row-level-security policies below
it. There's no second backend to keep in sync, no extra network hop, and no
separate deploy pipeline for "the API" vs. "the database."

### Data model (`supabase/migrations/0001_init.sql`)

| Table | Purpose |
|---|---|
| `profiles` | 1:1 with `auth.users`. Role/use-case from onboarding, plan, Stripe customer id. |
| `source_connections` | One row per user per provider (`gmail`/`github`/`notion`/`slack`). Encrypted tokens, sync status. |
| `memory_items` | The actual structured memory — content, content_type, extracted `entities[]`, full-text search index. |
| `memory_embeddings` | `vector(1536)` column, scaffolded for semantic search once an embeddings provider key is added. |
| `api_keys` | Hashed (SHA-256) personal API keys (`axon_live_...`) for external tools to call `context-pack`. |
| `subscriptions` | Stripe subscription mirror, kept in sync via `stripe-webhook`. |
| `context_pack_logs` | Every context-pack request, for the "tokens served" stat on the dashboard. |

Every table has RLS enabled with `auth.uid() = user_id` policies. Edge
Functions use the service-role key to bypass RLS only where that's the
explicit point (e.g. `oauth-callback` writing tokens on behalf of the user
who started the flow, verified via a signed `state` parameter).

### Edge Functions (`supabase/functions/`)

| Function | Auth | Purpose |
|---|---|---|
| `oauth-start` | user JWT | Builds the provider authorize URL with an HMAC-signed `state`. |
| `oauth-callback` | public (signed `state`) | Exchanges the code, encrypts tokens (AES-GCM), upserts `source_connections`. |
| `sync-source` | user JWT | Pulls recent data from a connected provider into `memory_items`. |
| `disconnect-source` | user JWT | Revokes a connection, keeps already-imported memories. |
| `context-pack` | user JWT **or** `axon_live_...` API key | The endpoint every AI tool calls. Token-budgeted, grouped by content type. |
| `api-keys-create` | user JWT | Issues a new personal API key (shown once, stored hashed). |
| `stripe-checkout` | user JWT | Creates a Stripe Checkout Session for the Standard plan. |
| `stripe-portal` | user JWT | Creates a Stripe Billing Portal session. |
| `stripe-webhook` | Stripe signature | Keeps `subscriptions`/`profiles.plan` in sync with Stripe. |
| `delete-account` | user JWT | Full account + data deletion. |

---

## Local setup

### 1. Frontend

```bash
npm install
cp .env.example .env   # fill in VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY
npm run dev
```

### 2. Supabase project secrets

These are **server-side** secrets for the Edge Functions — set them on the
Supabase project (Dashboard → Edge Functions → Secrets, or via the CLI):

```bash
supabase link --project-ref ktaditgtbubonrahyiig

supabase secrets set \
  ENCRYPTION_KEY=$(openssl rand -base64 32) \
  APP_URL=https://www.axon-memory.com \
  GOOGLE_OAUTH_CLIENT_ID=... GOOGLE_OAUTH_CLIENT_SECRET=... \
  GITHUB_OAUTH_CLIENT_ID=... GITHUB_OAUTH_CLIENT_SECRET=... \
  NOTION_OAUTH_CLIENT_ID=... NOTION_OAUTH_CLIENT_SECRET=... \
  SLACK_OAUTH_CLIENT_ID=... SLACK_OAUTH_CLIENT_SECRET=... \
  STRIPE_SECRET_KEY=sk_live_... \
  STRIPE_WEBHOOK_SECRET=whsec_... \
  STRIPE_ENTERPRISE_PRICE_ID=price_...
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are already injected
automatically into every Edge Function by Supabase — you do not set those
yourself.

Each provider's OAuth redirect URI must be registered as:
`https://ktaditgtbubonrahyiig.supabase.co/functions/v1/oauth-callback?provider=<gmail|github|notion|slack>`

### 3. Apply the schema and deploy the functions

```bash
supabase db push                      # runs supabase/migrations/0001_init.sql
supabase functions deploy oauth-start
supabase functions deploy oauth-callback --no-verify-jwt
supabase functions deploy sync-source
supabase functions deploy disconnect-source
supabase functions deploy context-pack
supabase functions deploy api-keys-create
supabase functions deploy stripe-checkout
supabase functions deploy stripe-portal
supabase functions deploy stripe-webhook --no-verify-jwt
supabase functions deploy delete-account
```

(`supabase/config.toml` already marks `oauth-callback` and `stripe-webhook`
as `verify_jwt = false` for local dev; the explicit flags above are for
`supabase functions deploy`, which reads flags rather than the config file
for that setting on some CLI versions.)

### 4. Stripe

Create one recurring $5/mo price in the Stripe Dashboard, then set:

```bash
# .env (frontend)
VITE_STRIPE_STANDARD_PRICE_ID=price_...
```

Point a Stripe webhook at
`https://ktaditgtbubonrahyiig.supabase.co/functions/v1/stripe-webhook`
listening for `checkout.session.completed`, `customer.subscription.updated`,
and `customer.subscription.deleted`.

---

## Testing & CI

- **Unit tests** (`supabase/functions/_shared/*.test.ts`, run with `npm run
  test` / Deno) cover deterministic logic that has no business talking to a
  network — right now that's the Gemini embedding pricing math and vector
  normalization in `embeddings.ts`. This exists because of a real bug: the
  pricing constant was once 16x too low, and the only reason it was caught
  was a suspiciously-small number in the database after a live call. A test
  like this should catch that kind of regression in CI, not in production.
- **Smoke test** (`scripts/smoke-test.mjs`, run with `npm run smoke-test`)
  exercises the real, deployed Supabase project end-to-end: creates a
  disposable auth user, logs in for real, calls `context-pack`, writes a
  memory item and confirms it round-trips back through the read path, calls
  `delete-account`, and asserts zero residue afterward. This is the exact
  by-hand verification ritual used to validate every change during
  development, turned into something repeatable. Needs `SUPABASE_URL`,
  `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` as env vars — never
  commit these, pass them at run time.
- **GitHub Actions** (`.github/workflows/ci.yml`) runs lint + build + unit
  tests on every push/PR automatically once this repo lives on GitHub — no
  further setup needed for those. The smoke-test job additionally needs the
  three env vars above added as repo secrets (Settings → Secrets and
  variables → Actions); until they're added, that one job skips itself
  rather than failing.

## Status

- ✅ **Live in production.** Frontend at `app.axon-memory.com`, marketing
  site at `axon-memory.com`, MCP gateway at `mcp.axon-memory.com`, all 20+
  Edge Functions deployed to the live Supabase project with RLS on every
  table, real OAuth (Google/GitHub/Notion/Slack), real Stripe billing across
  4 tiers, real Gemini-backed semantic search with a cost-ceiling circuit
  breaker, automatic background sync via pg_cron, and owner-facing system
  alerts.
- ✅ App icons for Tauri desktop, Android, and web/PWA — including the
  brain-mark brand icon across all surfaces.
- ⏳ Remaining: real per-provider OAuth sync testing against live third-party
  accounts (as opposed to the smoke test's synthetic data), and a Tauri
  desktop build actually run/packaged on a real machine (the project and its
  Quick Start are delivered as `axon-desktop.zip`; running `npm run tauri
  build` needs to happen on a real macOS/Windows/Linux desktop, not this
  sandbox).
