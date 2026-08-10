-- Schedules automatic re-sync of connected sources (Gmail/GitHub/Notion/Slack)
-- every 30 minutes via pg_cron + pg_net, instead of relying on the user to
-- click "Sync now". Calls the cron-sync-sources edge function, which is
-- protected by a shared secret header (not a user JWT — there's no logged
-- in user in a cron context).
--
-- HISTORICAL NOTE: this migration originally hardcoded the real
-- CRON_SECRET value directly below as a string literal. That was fine
-- while this file was private, but once this became a public repo it meant
-- the live secret was readable by anyone. It has since been rotated (the
-- old value no longer works) and the cron job it defines has been
-- superseded by 20260806200000_internal_config_secret_hygiene.sql, which
-- re-points the same job (by name) at a dynamic lookup instead of a
-- literal. The command below is left as an inert historical record of
-- what this migration originally did — re-running it would be harmless
-- (cron.schedule with the same name just gets overwritten again by the
-- later migration) but it no longer reflects what's actually live.
select cron.schedule(
  'axon-sync-sources',
  '*/30 * * * *',
  $$
  select net.http_post(
    url := 'https://ktaditgtbubonrahyiig.supabase.co/functions/v1/cron-sync-sources',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', '[REDACTED — rotated, see 20260806200000_internal_config_secret_hygiene.sql]'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
  $$
);
