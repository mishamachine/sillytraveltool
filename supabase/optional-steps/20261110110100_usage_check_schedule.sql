-- OPTIONAL STEP, NOT run by `supabase db push` (this folder is not under migrations/).
-- Apply by hand, only after 20261110110000_usage_reader.sql and only if pg_cron is enabled
-- (Database > Extensions; on the live project it is enabled, as the hourly cost-alert job uses it).
-- Runs public.stt_usage_check() once a day at 18:05 UTC. Remove with: select cron.unschedule('stt-usage-check');
select cron.unschedule('stt-usage-check') where exists (select 1 from cron.job where jobname = 'stt-usage-check');
select cron.schedule('stt-usage-check', '5 18 * * *', 'select public.stt_usage_check()');
