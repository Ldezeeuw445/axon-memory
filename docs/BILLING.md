# Billing and entitlements (A11-2, A11-3)

Approved by Luka on 2026-10-17 and connected in A11-3:
- the webhook runs on the tested reducer;
- the plan is checked on every key and OAuth call;
- a Lifetime member cannot open a subscription checkout.

No Stripe price, product, webhook endpoint or live billing setting was changed.

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
| Replayed event (same id) | fixed: answered 200 `duplicate`, no write (ledger `stripe_events`) |
| Older `subscription.updated` delivered after a newer one | fixed: skipped (`profiles.billing_event_at`) |
| Lifetime member, an old subscription is deleted or updated | fixed: Lifetime kept, `billing_attention` alert raised where relevant |
| Customer moved to a new subscription, the previous one is deleted | fixed: only the profile's current subscription acts |
| Profile write fails | fixed: the claim is released and Stripe gets 500, so it redelivers |
| `status: unpaid/canceled` on update | Keeps the paid tier until `subscription.deleted`, by design |

## How the webhook works now

`_shared/billing.ts` is a pure reducer, `decide(profile, event, seen, ctx)`, tested in `_shared/billing.test.ts`. Its rules:
1. Skip event ids already processed.
2. Skip events older than the last one applied to this customer.
3. Never take Lifetime away through a subscription event.
4. Act only on the profile's current subscription.
5. Move `plan_started_at` only when the tier changes.

What `stripe-webhook` does:
1. It verifies the signature.
2. It claims the event id in `stripe_events`. A row that already exists means a duplicate, so it answers 200.
3. It loads the profile, calls `decide`, and writes the patch by profile id.
4. It records the outcome in the ledger.
5. On any error it releases the claim and answers 500, so Stripe retries.

Two cases raise a `billing_attention` alert in `system_alerts`, because a person may need to refund or cancel:
- a Lifetime member completes a subscription checkout;
- a subscriber buys Lifetime while a subscription is still running.

Schema (additive migration `stripe_events_ledger`):
- `stripe_events` has RLS on and no grants to anon or authenticated;
- `profiles.billing_event_at` is not user-writable.

## Checks on every call (A11-3)

`_shared/entitlement.ts` and `resolveBearerToken` in `_shared/mcp-auth.ts` read `user_plan_status` on every call made with a key or token.

| Credential | Needs | Without it |
|---|---|---|
| OAuth token (connected AI) | `has_axon_ai` (Pro, Power, Lifetime) | 402 `plan_required` with an upgrade sentence |
| Personal API key | `has_api_access` (Power, Lifetime) | 402 `plan_required` with an upgrade sentence |

- This applies to `mcp-server` (JSON-RPC error -32002), `api-v1`, `remember` and `context-pack`.
- A failed plan read lets the call through and logs it, so an outage of the plan read cannot lock everyone out.
- Live-tested with a Starter fixture user (`rls-isolation-http.mjs`, area `billing`).

Who was affected when this went live:
- **nobody.** Every active key and token belongs to a Lifetime member: 1 personal key and 13 OAuth tokens.

## Checkout guard (A11-3)

`stripe-checkout` answers 409 `already_lifetime` to a Lifetime member, before any Stripe call. The check is `checkoutRefusal` in `_shared/billing.ts`. The Subscription page shows "Included in your Lifetime plan" instead of a buy button.

`npm run test:billing` also runs `tests/billing/checkout-guard.ts`:
- it runs the real function against a mock;
- Lifetime gets 409 for every tier;
- Starter passes the guard.

## Other findings (need a decision)

- **`stripe-portal` return URL fallback.** It falls back to `http://localhost:5173` if `APP_URL` is unset. The secret's value cannot be read from here; confirm `APP_URL=https://app.axon-memory.com` is set.
