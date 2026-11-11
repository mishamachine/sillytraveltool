-- Rollback for 20261111183241_usage_reader.sql (run by hand). First, if the schedule was added:
--   select cron.unschedule('stt-usage-check');
drop function if exists public.stt_usage_check();
drop function if exists public.usage_alert_recipients();
drop table if exists public.usage_alerts;
drop function if exists public.stt_email_usage_counts();
drop policy if exists usage_reader_read on public.email_sends;
drop policy if exists usage_reader_read on public.invite_sends;
drop policy if exists usage_reader_read on public.beta_waitlist;
drop view if exists usage_private.auth_email_stamps;
drop schema if exists usage_private;
revoke all on public.email_sends, public.invite_sends, public.beta_waitlist from usage_reader;
revoke usage on schema public from usage_reader;
revoke usage_reader from postgres;
drop role if exists usage_reader;
