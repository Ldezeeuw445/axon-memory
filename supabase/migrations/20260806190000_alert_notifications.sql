-- Makes system_alerts (currently written by trip_embedding_alert, or by
-- future callers) actually reach a human instead of sitting silently in the
-- table. Adds a `notified` flag so the delivery job below can dedupe, and
-- schedules a pg_cron tick that forwards new alerts to the check-alerts edge
-- function every 5 minutes. That function no-ops safely if no delivery
-- channel (SLACK_ALERT_WEBHOOK_URL) is configured yet — this migration is
-- what makes delivery *possible*, not what forces it on before the operator
-- has set that secret.

alter table system_alerts add column if not exists notified boolean not null default false;

-- HISTORICAL NOTE: this originally hardcoded the real CRON_SECRET as a
-- literal here too. Rotated and superseded by
-- 20260806200000_internal_config_secret_hygiene.sql — see that file.
select cron.schedule(
  'axon-check-alerts',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://ktaditgtbubonrahyiig.supabase.co/functions/v1/check-alerts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', '[REDACTED — rotated, see 20260806200000_internal_config_secret_hygiene.sql]'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 15000
  );
  $$
);
