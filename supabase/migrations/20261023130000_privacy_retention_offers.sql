-- Privacy policy 2026-10-23: usage events kept 25 months (nightly pg_cron job); members can turn off tailored offers
-- (Settings → Tailored offers). Opted-out members are left out of the Audience view and get no offer suggestions.
alter table public.user_profiles add column if not exists tailored_offers boolean not null default true;

create extension if not exists pg_cron;

create or replace function public.purge_old_usage()
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  delete from public.analytics_events where ts < now() - interval '25 months';
  get diagnostics n = row_count;
  delete from public.code_attempts where ts < now() - interval '25 months';
  delete from public.function_errors where ts < now() - interval '25 months';
  return n;
end;
$$;
revoke all on function public.purge_old_usage() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'purge-old-usage';
select cron.schedule('purge-old-usage', '17 3 * * *', 'select public.purge_old_usage()');

-- Respect the opt-out in the cockpit functions from 20261023120200
do $$ declare d text; off text := '(select p.tailored_offers from public.user_profiles p where p.id = m.user_id) is false'; begin
  d := pg_get_functiondef('public.admin_insight_rows()'::regprocedure);
  d := replace(d, '''Send a trip recap and the First Class offer''', 'case when ' || off || ' then ''Send a trip recap (offers turned off)'' else ''Send a trip recap and the First Class offer'' end');
  d := replace(d, '''Heavy free user: First Class offer''', 'case when ' || off || ' then ''Heavy free user (offers turned off)'' else ''Heavy free user: First Class offer'' end');
  execute d;
  d := pg_get_functiondef('public.admin_audience(boolean)'::regprocedure);
  d := replace(d, 'where not p_exclude_internal or not b.internal', 'where (not p_exclude_internal or not b.internal)
        and coalesce((select p.tailored_offers from public.user_profiles p where p.id = b.user_id), true)');
  d := replace(d, '''members'', (select count(*) from m),', '''members'', (select count(*) from m),
      ''offers_off'', (select count(*) from public.user_profiles p where p.tailored_offers is false),');
  execute d;
  d := pg_get_functiondef('public.admin_members_plus(text,boolean)'::regprocedure);
  d := replace(d, 'jsonb_agg(m || coalesce(', 'jsonb_agg(m || jsonb_build_object(''offers'', coalesce((select p.tailored_offers from public.user_profiles p where p.id = (m ->> ''id'')::uuid), true)) || coalesce(');
  execute d;
end $$;
