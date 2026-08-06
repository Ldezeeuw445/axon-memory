-- Security fix: `user_plan_status` is a plain view over `profiles`. On
-- Postgres 15, views default to security_invoker = false, meaning the view
-- runs with the *view owner's* privileges and does NOT re-check the calling
-- user's row-level-security policies on the underlying `profiles` table.
-- Combined with `grant select ... to authenticated, anon` from the previous
-- migration, this meant ANY authenticated (or anonymous) request could read
-- every user's plan_tier, stripe_customer_id, and stripe_subscription_id —
-- not just their own row. Flipping security_invoker on makes Postgres
-- evaluate the view as the calling role, so `profiles_select_own` (auth.uid()
-- = id) applies exactly as it does for direct queries against `profiles`.
alter view public.user_plan_status set (security_invoker = true);

-- anon has no legitimate use for this (there is no session to scope it to,
-- and profiles RLS would return zero rows for anon anyway) — tighten grants
-- to least privilege.
revoke select on public.user_plan_status from anon;
revoke select on public.plan_features from anon;
grant select on public.plan_features to authenticated;
