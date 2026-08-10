-- Removes CRON_SECRET from being a literal string inside git-committed
-- migration SQL. Two earlier migrations (20260806120000_cron_sync_sources
-- and 20260806190000_alert_notifications) originally hardcoded the real
-- cron secret directly in the pg_cron `net.http_post` header — harmless as
-- long as those files stay private, but this repo is public on GitHub, so
-- that value would otherwise be readable by anyone. It has since been
-- rotated (the old value no longer works) and this migration moves the
-- secret out of source control entirely: it now lives in one row of a
-- service-role-only table, and the cron job commands (rewritten below)
-- read it dynamically instead of embedding it as a string literal.
--
-- The real value is set via a one-off UPDATE run directly against
-- production — never through a file that gets committed to git.

create table if not exists internal_config (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table internal_config enable row level security;
revoke all on internal_config from public, anon, authenticated;
grant select on internal_config to service_role;

-- Placeholder only. The real secret is set with:
--   update internal_config set value = '<real secret>' where key = 'cron_secret';
-- run directly against the project, not from this file.
insert into internal_config (key, value)
values ('cron_secret', 'REPLACE_ME_VIA_DIRECT_SQL_NOT_IN_GIT')
on conflict (key) do nothing;

-- Re-point both existing cron jobs at the dynamic lookup instead of a
-- literal secret. Same job names as before, so this replaces them in place
-- rather than creating duplicates.
select cron.schedule(
  'axon-sync-sources',
  '*/30 * * * *',
  $$
  select net.http_post(
    url := 'https://ktaditgtbubonrahyiig.supabase.co/functions/v1/cron-sync-sources',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select value from internal_config where key = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
  $$
);

select cron.schedule(
  'axon-check-alerts',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://ktaditgtbubonrahyiig.supabase.co/functions/v1/check-alerts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select value from internal_config where key = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 15000
  );
  $$
);
