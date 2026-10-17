# Billing and entitlements (A11-2)

Read and tested only. No Stripe price, product, webhook endpoint or live billing setting was changed. `stripe-webhook` v24, `stripe-checkout` v24 and `stripe-portal` v22 run unchanged. The deployed code matches the repo, apart from comments and the additive display-name exports in `_shared/plans.ts`.

## Where the plan lives (single source of truth)

- **Stored:** `profiles.plan_tier` (enum `starter|pro|ultra|lifetime_founder`; "ultra" is shown as Power). Only the service role writes it, via `stripe-webhook`.
  - `profiles.plan` (text, default `free`) is a legacy column. Nothing reads it.
  - `subscriptions` is empty and unused.
- **Derived:** the `user_plan_status` view (`security_invoker=true`) joins `profiles` with `plan_features`. Everything reads entitlements from it:
  - the app (`usePlan`);
  - `api-keys-create` (`has_api_access`, answers 402 otherwise);
  - `mcp-oauth-consent` (`has_axon_ai`);
  - recall (`has_semantic_search`).
- **Protection** (live-tested in `scripts/rls-isolation-http.mjs`, area `billing`):
  - a signed-in user cannot raise `plan_tier`, forge Stripe ids, edit `plan_features`, or insert a `subscriptions` row;
  - `authenticated` has column UPDATE only on full_name, avatar_url, role, use_case and onboarding_completed_at;
  - `plan_features` and `subscriptions` have SELECT-only policies;
  - the server refuses a personal key on Starter.

## Webhook replay, idempotency and ordering

`npm run test:billing` (`tests/billing/webhook-replay.ts`) runs the real `stripe-webhook` code locally, with no Stripe and no production:
- it uses a throwaway signing secret and a mock of the `profiles` table;
- it sends events signed exactly as Stripe signs them.

| Behaviour | Status |
|---|---|
| Unsigned, wrongly signed, or stale (>5 min) delivery → 400 | ok: a captured delivery cannot be replayed later |
| Unknown event type, unknown customer, unrecognised price, checkout without a user → 200, no write | ok |
| Replayed `customer.subscription.updated` | ok: same end state |
| Replayed lifetime checkout | same tier, but **`plan_started_at` is rewritten**: no event-id dedupe |
| Older `subscription.updated` delivered after a newer one | **DEFECT**: the older plan wins (no ordering check) |
| Lifetime member, an old subscription is deleted | **DEFECT**: downgraded to Starter |
| Lifetime member, an old subscription is updated | **DEFECT**: overwritten to Pro |
| Customer moved to a new subscription, the previous one is deleted | **DEFECT**: downgraded to Starter (matches on customer, not subscription) |
| `status: unpaid/canceled` on update | Keeps the paid tier until `subscription.deleted`, by design |

Not covered locally: subscription-mode checkout, because it calls `stripe.subscriptions.retrieve`.

Exposure today:
- 3 Lifetime and 3 Starter profiles; 1 has a Stripe customer, 0 have a subscription id.
- No one is affected yet. The Lifetime defects bite the first time a former subscriber buys Lifetime, or a Lifetime member starts a subscription.

## Proposed fix: needs approval, NOT deployed

`_shared/billing.ts` is a pure reducer, `decide(profile, event, seen, ctx)`, with tests in `_shared/billing.test.ts` that get every case above right. Its rules:
1. Skip event ids already processed.
2. Skip events older than the last one applied to this customer.
3. Never take Lifetime away through a subscription event.
4. Act only on the profile's current subscription.
5. Move `plan_started_at` only when the tier changes.

Wiring it in needs:
- an additive migration: a `stripe_events(id text primary key, type text, created timestamptz, processed_at timestamptz default now())` table and `profiles.billing_event_at timestamptz`;
- a rewrite of `stripe-webhook` to load the profile, call `decide`, write the patch and record the event id.

That changes live billing behaviour, so it waits for Luka.

## Other findings (need a decision)

- **Plan features are only checked when access is granted, not on every call.**
  - `axon_ai` is checked at OAuth consent and `api_access` at key creation.
  - An MCP token or personal key keeps working after a downgrade.
  - No Starter user holds an active key today; all 13 OAuth tokens and 1 personal key belong to Lifetime members. Checking per call is an entitlement-policy change.
- **A Lifetime member can still open a subscription checkout.** With today's webhook that would overwrite Lifetime with the subscription's tier. Blocking it in `stripe-checkout` (or in the reducer, as proposed) is a billing change.
- **`stripe-portal` return URL fallback.** It falls back to `http://localhost:5173` if `APP_URL` is unset. The secret's value cannot be read from here; confirm `APP_URL=https://app.axon-memory.com` is set.
