-- Money → Free plan: the free-plan limits become one owner dashboard. app_settings.free_limits holds the master switch
-- (enabled, default off: app members can't pay yet), one switch per limit (trips_on, reservations_on, imports_on) and
-- the numbers. billing_settings (the old on/off row from the paywall work) is folded in and dropped.
-- admin_free_plan(): how many free members each limit touches today, as histograms so the cockpit can preview any number.

update public.app_settings
set value = jsonb_build_object('enabled', coalesce((select free_limits_on from public.billing_settings where id = 1), false),
                               'trips_on', true, 'reservations_on', true, 'imports_on', true) || value
where key = 'free_limits' and not value ? 'enabled';

-- Master switch (keeps its name: the limit triggers, email_import_locked and my_entitlement call it)
create or replace function public.free_limits_on()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((public.setting('free_limits') ->> 'enabled')::boolean, false)
$$;

-- One limit's number, or null when the master switch or that limit is off
create or replace function public.free_limit_cap(p_key text)
returns integer language sql stable security definer set search_path = '' as $$
  with s as (select public.setting('free_limits') v)
  select case when coalesce((v ->> 'enabled')::boolean, false)
               and coalesce((v ->> case p_key when 'upcoming_trips' then 'trips_on' when 'reservations_per_trip' then 'reservations_on'
                                               when 'email_imports' then 'imports_on' end)::boolean, true)
         then coalesce((v ->> p_key)::int, case p_key when 'upcoming_trips' then 2 else 5 end) end
  from s
$$;
revoke all on function public.free_limit_cap(text) from public, anon, authenticated;

create or replace function public.enforce_trip_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare cap int := public.free_limit_cap('upcoming_trips');
begin
  if auth.uid() is null or cap is null then return new; end if;
  if not public.trip_upcoming(new.start_date, new.end_date, new.status) then return new; end if;
  if tg_op = 'UPDATE' and public.trip_upcoming(old.start_date, old.end_date, old.status) then return new; end if;
  if public.entitlement(new.owner_id) = 'first_class' then return new; end if;
  if (select count(*) from public.trips t where t.owner_id = new.owner_id and t.id <> new.id
      and public.trip_upcoming(t.start_date, t.end_date, t.status)) >= cap then
    raise exception 'upgrade:trips' using hint = format('Free plan: %s upcoming trips. First Class lifts the limit.', cap);
  end if;
  return new;
end $$;

create or replace function public.enforce_reservation_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare cap int := public.free_limit_cap('reservations_per_trip');
begin
  if auth.uid() is null or cap is null then return new; end if;
  if new.trip_id is null or new.type not in ('restaurant', 'activity', 'other') then return new; end if;
  if tg_op = 'UPDATE' and old.trip_id is not distinct from new.trip_id and old.type in ('restaurant', 'activity', 'other') then return new; end if;
  if public.entitlement((select owner_id from public.trips where id = new.trip_id)) = 'first_class' then return new; end if;
  if (select count(*) from public.bookings b where b.trip_id = new.trip_id and b.id <> new.id
      and b.type in ('restaurant', 'activity', 'other')) >= cap then
    raise exception 'upgrade:reservations' using hint = format('Free plan: %s reservations per trip. First Class lifts the limit.', cap);
  end if;
  return new;
end $$;

create or replace function public.email_import_locked(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.free_limit_cap('email_imports') is not null and public.entitlement(p_user) = 'free'
    and (select count(distinct coalesce(b.raw_email_id, b.id::text)) from public.bookings b
         where b.created_by = p_user and b.source = 'email_import')
        >= public.free_limit_cap('email_imports')
$$;

-- my_entitlement: limits_on now comes from the setting (patched in place; the rest of the function is unchanged)
do $$
declare v_def text := pg_get_functiondef('public.my_entitlement()'::regprocedure);
begin
  if position('billing_settings' in v_def) > 0 then
    v_def := replace(v_def, 'coalesce((select free_limits_on from public.billing_settings where id = 1), false)', 'public.free_limits_on()');
    if position('billing_settings' in v_def) > 0 then raise exception 'my_entitlement still reads billing_settings'; end if;
    execute v_def;
  end if;
end $$;

drop table if exists public.billing_settings;

-- Settings: free_limits takes switches (true/false) as well as numbers
create or replace function public.admin_setting_set(p_key text, p_value jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_old jsonb; v_new jsonb; k text; v jsonb;
begin
  perform public.admin_guard('owner');
  if p_key not in ('founders_offer', 'free_limits', 'ai_limits', 'google_limits', 'kill', 'cost_alert', 'cost_rates') then
    raise exception 'unknown_setting' using errcode = '22023';
  end if;
  if jsonb_typeof(p_value) <> 'object' then raise exception 'bad_value' using errcode = '22023'; end if;
  p_value := p_value - 'last_sent_day' - '_updated_at';
  for k, v in select * from jsonb_each(p_value) loop
    if (p_key in ('founders_offer', 'kill') or (p_key = 'free_limits' and k in ('enabled', 'trips_on', 'reservations_on', 'imports_on')))
       and jsonb_typeof(v) <> 'boolean' then raise exception 'bad_value' using errcode = '22023'; end if;
    if p_key not in ('founders_offer', 'kill') and not (p_key = 'free_limits' and k in ('enabled', 'trips_on', 'reservations_on', 'imports_on')) and not (
      (jsonb_typeof(v) = 'number' and (v #>> '{}')::numeric >= 0)
      or (p_key = 'cost_rates' and k = 'google' and jsonb_typeof(v) = 'object'
          and not exists (select 1 from jsonb_each(v) g where jsonb_typeof(g.value) <> 'number' or (g.value #>> '{}')::numeric < 0))
      or (p_key = 'cost_rates' and k = 'ai_prices' and jsonb_typeof(v) = 'object'
          and not exists (select 1 from jsonb_each(v) m where jsonb_typeof(m.value) <> 'object'
            or exists (select 1 from jsonb_each(m.value) f where jsonb_typeof(f.value) <> 'number' or (f.value #>> '{}')::numeric < 0)))
    ) then raise exception 'bad_value' using errcode = '22023'; end if;
    -- A free-plan limit is a whole number of at least 1 (switch the limit off instead of setting 0)
    if p_key = 'free_limits' and k in ('upcoming_trips', 'reservations_per_trip', 'email_imports')
       and ((v #>> '{}')::numeric < 1 or (v #>> '{}')::numeric <> trunc((v #>> '{}')::numeric)) then
      raise exception 'bad_value' using errcode = '22023';
    end if;
  end loop;
  select value into v_old from public.app_settings where key = p_key;
  v_new := coalesce(v_old, '{}'::jsonb) || p_value;
  if p_key = 'cost_rates' then
    if p_value ? 'google' then v_new := jsonb_set(v_new, '{google}', coalesce(v_old -> 'google', '{}'::jsonb) || (p_value -> 'google')); end if;
    if p_value ? 'ai_prices' then
      v_new := jsonb_set(v_new, '{ai_prices}', coalesce((select jsonb_object_agg(m, coalesce(v_old -> 'ai_prices' -> m, '{}'::jsonb) || coalesce(p_value -> 'ai_prices' -> m, '{}'::jsonb))
        from (select jsonb_object_keys(coalesce(v_old -> 'ai_prices', '{}'::jsonb) || (p_value -> 'ai_prices')) m) x), '{}'::jsonb));
    end if;
  end if;
  insert into public.app_settings (key, value, updated_at, updated_by) values (p_key, v_new, now(), auth.uid())
  on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = auth.uid();
  perform public.admin_log('setting_' || p_key, null, jsonb_build_object('from', v_old, 'to', v_new));
  return v_new;
end;
$$;
revoke all on function public.admin_setting_set(text, jsonb) from public, anon;
grant execute on function public.admin_setting_set(text, jsonb) to authenticated;

-- Who each limit touches. Histograms (value → members) let the cockpit preview any number without a round trip.
create or replace function public.admin_free_plan(p_exclude_internal boolean default true)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.admin_guard('analyst');
  return (
    with members as (
      select u.id, public.entitlement(u.id) as plan from auth.users u
      where u.deleted_at is null and not (p_exclude_internal and u.id in (select user_id from public.internal_members))),
    free as (select id from members where plan = 'free'),
    trips as (
      select f.id, count(t.id) filter (where public.trip_upcoming(t.start_date, t.end_date, t.status))::int as n
      from free f left join public.trips t on t.owner_id = f.id group by f.id),
    res as (
      select f.id, coalesce(max(x.n), 0)::int as n from free f
      left join (select t.owner_id, t.id, count(b.id) as n from public.trips t
                 join public.bookings b on b.trip_id = t.id and b.type in ('restaurant', 'activity', 'other')
                 group by t.owner_id, t.id) x on x.owner_id = f.id
      group by f.id),
    imports as (
      select f.id, count(distinct coalesce(b.raw_email_id, b.id::text))::int as n from free f
      left join public.bookings b on b.created_by = f.id and b.source = 'email_import' group by f.id),
    hist as (
      select 'trips' as k, n, count(*)::int as members from trips group by n
      union all select 'reservations', n, count(*)::int from res group by n
      union all select 'imports', n, count(*)::int from imports group by n)
    select jsonb_build_object(
      'settings', public.setting('free_limits'),
      'members', (select count(*) from members),
      'free', (select count(*) from free),
      'first_class', (select count(*) from members where plan = 'first_class'),
      'histograms', coalesce((select jsonb_object_agg(k, h) from (select k, jsonb_agg(jsonb_build_object('n', n, 'members', members) order by n) h from hist group by k) x), '{}'::jsonb),
      'paywall_views_30d', (select count(*) from public.analytics_events where event = 'paywall_view' and ts > now() - interval '30 days'),
      'limit_hits_30d', coalesce((select jsonb_object_agg(f, c) from (
          select coalesce(props ->> 'feature', 'unknown') f, count(*) c from public.analytics_events
          where event = 'limit_hit' and ts > now() - interval '30 days' group by 1) x), '{}'::jsonb)
    ));
end;
$$;
revoke all on function public.admin_free_plan(boolean) from public, anon;
grant execute on function public.admin_free_plan(boolean) to authenticated;
