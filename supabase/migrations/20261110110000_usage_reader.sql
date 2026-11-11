-- Email-volume gauge with a least-privilege, no-login role (usage_reader), so the nightly health check and the
-- usage alert can see "how many emails went out" without being able to read any member data.
--
--  * usage_reader: NOLOGIN. SELECT on four named columns of three public tables, plus a view of four auth timestamps.
--  * public.stt_email_usage_counts(): ONE row of integers, owned by usage_reader, so it runs with only those rights.
--    Only the service role can call it. The nightly health task calls ONLY this function.
--  * public.stt_usage_check(): once a day (pg_cron, optional step) compares the counts with the Resend Free limits
--    (100/day, 3,000/month) and, at the interim levels below, emails the owner through the cost-alert function, once
--    per day and once per month (public.usage_alerts is the dedupe key).
--
-- auth.users cannot be granted by column to a role the way the other tables are: its RLS is on, its owner is
-- supabase_auth_admin (not postgres), and so postgres cannot add a policy to it. A view owned by postgres that
-- exposes only the four timestamp columns (no id, no email) is the closest equivalent.

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'usage_reader') then
    create role usage_reader nologin;
  end if;
end $$;
alter role usage_reader nologin noinherit;

create schema if not exists usage_private;
revoke all on schema usage_private from public, anon, authenticated;
grant usage on schema usage_private to usage_reader;

create or replace view usage_private.auth_email_stamps as
  select confirmation_sent_at, recovery_sent_at, email_change_sent_at, invited_at from auth.users;
revoke all on usage_private.auth_email_stamps from public, anon, authenticated;
grant select on usage_private.auth_email_stamps to usage_reader;

grant usage on schema public to usage_reader;
grant select (created_at) on public.email_sends to usage_reader;
grant select (created_at) on public.invite_sends to usage_reader;
grant select (confirmation_sent_at, invited_at) on public.beta_waitlist to usage_reader;
-- RLS is on for these tables with no policies; give usage_reader (only) a read policy. Column grants limit what it sees.
drop policy if exists usage_reader_read on public.email_sends;
create policy usage_reader_read on public.email_sends for select to usage_reader using (true);
drop policy if exists usage_reader_read on public.invite_sends;
create policy usage_reader_read on public.invite_sends for select to usage_reader using (true);
drop policy if exists usage_reader_read on public.beta_waitlist;
create policy usage_reader_read on public.beta_waitlist for select to usage_reader using (true);

-- Counts (UTC day and month). Notes:
--  * auth.users keeps only the LATEST send time per kind, so repeat sends to one user count once.
--  * email_sends has no status grant here, so skipped and failed rows are counted too: an upper bound, fine for an alert.
--  * Beta emails are not logged in email_sends (only the admin-email function writes there): no double counting.
create or replace function public.stt_email_usage_counts()
returns table (
  auth_confirm_today integer, auth_recovery_today integer, auth_email_change_today integer, auth_invite_today integer,
  app_email_sends_today integer, app_invite_sends_today integer, beta_today integer,
  auth_mtd integer, app_email_sends_mtd integer, app_invite_sends_mtd integer, beta_mtd integer)
language sql stable security definer set search_path = ''
as $$
  with b as (
    select (date_trunc('day', now() at time zone 'utc')) at time zone 'utc' as d,
           (date_trunc('month', now() at time zone 'utc')) at time zone 'utc' as m
  )
  select
    (select count(*)::integer from usage_private.auth_email_stamps u, b where u.confirmation_sent_at >= b.d),
    (select count(*)::integer from usage_private.auth_email_stamps u, b where u.recovery_sent_at >= b.d),
    (select count(*)::integer from usage_private.auth_email_stamps u, b where u.email_change_sent_at >= b.d),
    (select count(*)::integer from usage_private.auth_email_stamps u, b where u.invited_at >= b.d),
    (select count(*)::integer from public.email_sends e, b where e.created_at >= b.d),
    (select count(*)::integer from public.invite_sends i, b where i.created_at >= b.d),
    (select (count(*) filter (where w.confirmation_sent_at >= b.d) + count(*) filter (where w.invited_at >= b.d))::integer
       from public.beta_waitlist w, b),
    (select count(*)::integer from usage_private.auth_email_stamps u, b
       where u.confirmation_sent_at >= b.m or u.recovery_sent_at >= b.m or u.email_change_sent_at >= b.m or u.invited_at >= b.m),
    (select count(*)::integer from public.email_sends e, b where e.created_at >= b.m),
    (select count(*)::integer from public.invite_sends i, b where i.created_at >= b.m),
    (select (count(*) filter (where w.confirmation_sent_at >= b.m) + count(*) filter (where w.invited_at >= b.m))::integer
       from public.beta_waitlist w, b)
$$;
revoke all on function public.stt_email_usage_counts() from public, anon, authenticated;
-- Hand the function to usage_reader so it runs with only the rights above. The new owner needs CREATE on the schema
-- for the moment of the change only.
-- postgres must be able to SET ROLE to the new owner for the owner change (PG16+ grants the creator this by default; made explicit).
grant usage_reader to postgres with inherit true, set true;
grant create on schema public to usage_reader;
alter function public.stt_email_usage_counts() owner to usage_reader;
revoke create on schema public from usage_reader;
grant execute on function public.stt_email_usage_counts() to service_role, postgres; -- postgres: stt_usage_check and pg_cron run as it

-- Dedupe log for the usage alert: one row per period key ('day:2026-11-10', 'month:2026-11'). Counts only, no PII.
create table if not exists public.usage_alerts (
  period_key text primary key,
  total integer not null,
  alert_limit integer not null,
  created_at timestamptz not null default now()
);
alter table public.usage_alerts enable row level security; -- no policies: nobody but the owner and service role
revoke all on public.usage_alerts from public, anon, authenticated;

-- Daily check. Limits are constants here (interim 40/day and 1,500/month; raise to 60 and 2,000 by editing the two
-- values and re-running this statement). The total counts every email kind in stt_email_usage_counts.
-- Calls the cost-alert Edge Function through pg_net the same way the hourly cost-alert cron does: the Vault secret
-- cost_alert_token in the x-cron-token header. Delivery is best-effort (pg_net is async): a failed send is not retried.
create or replace function public.stt_usage_check()
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_day_limit constant integer := 40;
  v_month_limit constant integer := 1500;
  c record; v_today integer; v_mtd integer; v_fired jsonb := '[]'::jsonb; v_key text; v_token text;
begin
  select * into c from public.stt_email_usage_counts();
  v_today := c.auth_confirm_today + c.auth_recovery_today + c.auth_email_change_today + c.auth_invite_today
           + c.app_email_sends_today + c.app_invite_sends_today + c.beta_today;
  v_mtd := c.auth_mtd + c.app_email_sends_mtd + c.app_invite_sends_mtd + c.beta_mtd;
  select decrypted_secret into v_token from vault.decrypted_secrets where name = 'cost_alert_token';
  if v_token is null then return jsonb_build_object('error', 'cost_alert_token missing in Vault', 'today', v_today, 'mtd', v_mtd); end if;

  v_key := 'day:' || to_char(now() at time zone 'utc', 'YYYY-MM-DD');
  if v_today >= v_day_limit then
    insert into public.usage_alerts (period_key, total, alert_limit) values (v_key, v_today, v_day_limit) on conflict do nothing;
    if found then
      perform net.http_post(url := 'https://swywrvbuswylvqlktsym.supabase.co/functions/v1/cost-alert',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-token', v_token),
        body := jsonb_build_object('kind', 'usage', 'scope', 'day', 'period', v_key, 'total', v_today, 'limit', v_day_limit, 'counts', to_jsonb(c)),
        timeout_milliseconds := 20000);
      v_fired := v_fired || to_jsonb(v_key);
    end if;
  end if;
  v_key := 'month:' || to_char(now() at time zone 'utc', 'YYYY-MM');
  if v_mtd >= v_month_limit then
    insert into public.usage_alerts (period_key, total, alert_limit) values (v_key, v_mtd, v_month_limit) on conflict do nothing;
    if found then
      perform net.http_post(url := 'https://swywrvbuswylvqlktsym.supabase.co/functions/v1/cost-alert',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-token', v_token),
        body := jsonb_build_object('kind', 'usage', 'scope', 'month', 'period', v_key, 'total', v_mtd, 'limit', v_month_limit, 'counts', to_jsonb(c)),
        timeout_milliseconds := 20000);
      v_fired := v_fired || to_jsonb(v_key);
    end if;
  end if;
  return jsonb_build_object('today', v_today, 'mtd', v_mtd, 'fired', v_fired);
end;
$$;
revoke all on function public.stt_usage_check() from public, anon, authenticated;
grant execute on function public.stt_usage_check() to service_role;

-- Owner address(es) for the alert email, so the Edge Function does not have to call cost_alert_run. Service role only.
create or replace function public.usage_alert_recipients()
returns text[] language sql stable security definer set search_path = ''
as $$
  select coalesce(array_agg(u.email) filter (where u.email is not null), '{}')
  from public.admins a join auth.users u on u.id = a.user_id where a.role = 'owner'
$$;
revoke all on function public.usage_alert_recipients() from public, anon, authenticated;
grant execute on function public.usage_alert_recipients() to service_role;
