-- Discovered while testing the new server-side plan-tier enforcement: at
-- least one pre-existing auth.users row (the very first signup on the
-- project) had no matching public.profiles row. Root cause: that account
-- signed up before the on_auth_user_created trigger / profiles table
-- existed in this project's history, so it was never backfilled.
--
-- Effect while missing: user_plan_status (LEFT JOIN'd from profiles) has no
-- row for that user, so every has_* flag reads as false/undefined -- which
-- fails closed (correctly denies gated features) but also means even a
-- Starter-tier action like "connections" silently wasn't available.
--
-- This backfill is idempotent (on conflict do nothing) so it's safe to run
-- once now and safe if it ever runs again.
insert into public.profiles (id, email, full_name, avatar_url)
select u.id, u.email, u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'avatar_url'
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
on conflict (id) do nothing;
