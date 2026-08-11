-- Users could grant themselves any plan.
--
-- `profiles_update_own` was `for update using (auth.uid() = id)` with no
-- column restriction and no WITH CHECK. Postgres RLS gates rows, not columns,
-- so that policy let any authenticated user PATCH their own profile row and
-- set `plan_tier` to 'pro', 'ultra' or 'lifetime_founder' with a single REST
-- call against the anon endpoint — no Stripe session, no payment.
--
-- Column privileges are the mechanism that actually restricts which fields a
-- role may write, so the grant below is the real fix; the WITH CHECK is a
-- second belt so a row can never be re-pointed at another user.
--
-- Billing is unaffected: stripe-webhook and stripe-checkout write through the
-- service role, which bypasses both RLS and these grants.

-- Profile fields a user legitimately owns.
revoke update on public.profiles from authenticated;
grant update (full_name, avatar_url, role, use_case, onboarding_completed_at)
  on public.profiles to authenticated;

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- `plan`, `plan_tier`, `plan_started_at`, `plan_expires_at`,
-- `stripe_customer_id` and `stripe_subscription_id` are deliberately absent
-- from the grant above. Add a column here only if a user is genuinely meant
-- to be able to set it themselves.
