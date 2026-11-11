-- Email-volume gauge for the nightly health check: today's and month-to-date counts of outbound email, so the
-- Resend Free limits (100/day, 3,000/month) can be watched without reading any member data.
--
-- public.stt_email_usage_counts() returns ONE row of integer aggregates. Never rows, ids or emails.
-- SECURITY DEFINER because it reads auth.users; callable only by the owner and the service role (not public, anon
-- or signed-in users). The nightly health task calls ONLY this function for email volume.
--
-- What is counted (UTC day and month):
--  * auth_*_today: users whose latest confirmation / recovery / email-change / invite email went out today
--    (auth.users keeps only the LATEST send time per kind, so a second send to the same user the same day counts once).
--  * auth_mtd: users with any of those four times this month (one per user, same caveat).
--  * app_email_sends_*: public.email_sends rows with status 'sent' (admin member emails; skipped and failed rows are not sends).
--  * app_invite_sends_*: public.invite_sends rows (trip invitation emails).
--  * beta_today: beta waitlist confirmation emails plus beta invite emails sent today. The beta emails are NOT logged in
--    email_sends (only the admin-email function writes there), so nothing is double counted.
create or replace function public.stt_email_usage_counts()
returns table (
  auth_confirm_today integer, auth_recovery_today integer, auth_email_change_today integer, auth_invite_today integer,
  app_email_sends_today integer, app_invite_sends_today integer, beta_today integer,
  auth_mtd integer, app_email_sends_mtd integer, app_invite_sends_mtd integer)
language sql stable security definer set search_path = ''
as $$
  with b as (
    select (date_trunc('day', now() at time zone 'utc')) at time zone 'utc' as d,
           (date_trunc('month', now() at time zone 'utc')) at time zone 'utc' as m
  )
  select
    (select count(*)::integer from auth.users u, b where u.confirmation_sent_at >= b.d),
    (select count(*)::integer from auth.users u, b where u.recovery_sent_at >= b.d),
    (select count(*)::integer from auth.users u, b where u.email_change_sent_at >= b.d),
    (select count(*)::integer from auth.users u, b where u.invited_at >= b.d),
    (select count(*)::integer from public.email_sends e, b where e.status = 'sent' and e.created_at >= b.d),
    (select count(*)::integer from public.invite_sends i, b where i.created_at >= b.d),
    (select (count(*) filter (where w.confirmation_sent_at >= b.d) + count(*) filter (where w.invited_at >= b.d))::integer
       from public.beta_waitlist w, b),
    (select count(*)::integer from auth.users u, b
       where u.confirmation_sent_at >= b.m or u.recovery_sent_at >= b.m or u.email_change_sent_at >= b.m or u.invited_at >= b.m),
    (select count(*)::integer from public.email_sends e, b where e.status = 'sent' and e.created_at >= b.m),
    (select count(*)::integer from public.invite_sends i, b where i.created_at >= b.m)
$$;
revoke all on function public.stt_email_usage_counts() from public, anon, authenticated;
grant execute on function public.stt_email_usage_counts() to service_role;
