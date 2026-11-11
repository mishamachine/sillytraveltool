-- OPTIONAL STEP, NOT run by `supabase db push` (this folder is not under migrations/).
-- Apply by hand, only after 20261111183241_usage_reader.sql and only if pg_cron is enabled
-- (Database > Extensions; on the live project it is enabled, as the hourly cost-alert job uses it).
-- Deploy the cost-alert Edge Function BEFORE running this. Runs public.stt_usage_check() hourly (at minute 5); an alert is sent once per day / once per month whatever the frequency. Remove with: select cron.unschedule('stt-usage-check');
select cron.unschedule('stt-usage-check') where exists (select 1 from cron.job where jobname = 'stt-usage-check');
select cron.schedule('stt-usage-check', '5 * * * *', 'select public.stt_usage_check()');
