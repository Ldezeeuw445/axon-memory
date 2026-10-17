-- A11-3 (approved by Luka 2026-10-17): the Stripe webhook becomes idempotent
-- and order-aware. Additive only: a new ledger table and one new column.
--
-- stripe_events: every event id the webhook has applied (or deliberately
-- skipped). A redelivery of an id already here is acknowledged and ignored.
-- Written only by the webhook (service role); nobody else can read it.
create table if not exists public.stripe_events (
  id text primary key,
  type text not null,
  created timestamptz not null,
  outcome text,
  processed_at timestamptz not null default now()
);
alter table public.stripe_events enable row level security;
revoke all on public.stripe_events from public, anon, authenticated;

-- profiles.billing_event_at: the Stripe `created` time of the last event that
-- changed this profile's billing. An event older than this is stale (Stripe
-- does not guarantee delivery order) and is ignored.
alter table public.profiles add column if not exists billing_event_at timestamptz;

comment on table public.stripe_events is 'Stripe webhook ledger (A11-3): processed event ids, for idempotency. Service role only.';
comment on column public.profiles.billing_event_at is 'Stripe created-time of the last applied billing event (A11-3 ordering guard). Written only by stripe-webhook.';
