-- Cockpit: usage on and off trip, how plans get added, and how often members come back.
--
-- 1. bookings.added_via: how a booking was added in the app ('manual', 'paste_import', 'idea'). Forwarded emails are already
--    known from raw_email_id, so the inbox function doesn't need to set it. Older rows are null and fall back to source.
-- 2. member_activity_daily: one row per member per active day (their own local day, from the latest session_start time zone),
--    with the trip phase that day: on_trip, pre_trip (a trip starts within 60 days), post_trip (one ended within 14 days),
--    between (has trips, none close) or no_trip. trip_day = day - trip start (negative before). Kept for analysis;
--    refreshed hourly for the last 3 days by pg_cron and backfilled once here.
-- 3. member_frequency(): daily / weekly / monthly / occasional / dormant, from days with app use (not sign_in events, which
--    repeat on every token refresh).
-- 4. admin_member_activity(user) and admin_engagement(window) for the cockpit. Counts only: never booking contents.

alter table public.bookings add column if not exists added_via text
  check (added_via is null or char_length(added_via) <= 30);

-- How a booking or plan was added, as one code for the cockpit
create or replace function public.booking_channel(p_source text, p_raw_email_id text, p_added_via text)
returns text language sql immutable set search_path = '' as $$
  select case
    when p_raw_email_id is not null then 'email'
    when p_added_via is not null then p_added_via
    when p_source = 'email_import' then 'paste_import'
    else 'manual' end
$$;

create or replace function public.activity_channel(p_source text, p_is_idea boolean)
returns text language sql immutable set search_path = '' as $$
  select case p_source
    when 'guide' then 'explore'
    when 'goosey' then 'honk'
    else case when p_is_idea then 'explore' else 'manual' end end
$$;

create table if not exists public.member_activity_daily (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  events integer not null default 0,
  sessions integer not null default 0,
  active_seconds integer not null default 0,
  screens integer not null default 0,
  features jsonb not null default '{}'::jsonb,
  platform text,
  trip_id uuid references public.trips (id) on delete set null,
  phase text not null check (phase in ('on_trip', 'pre_trip', 'post_trip', 'between', 'no_trip')),
  trip_day integer,
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);
create index if not exists member_activity_daily_day on public.member_activity_daily (day);
alter table public.member_activity_daily enable row level security;
revoke all on public.member_activity_daily from anon, authenticated;

create or replace function public.refresh_member_activity_daily(p_from date default current_date - 2)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_n integer;
begin
  delete from public.member_activity_daily where day >= p_from;
  insert into public.member_activity_daily (user_id, day, events, sessions, active_seconds, screens, features, platform, trip_id, phase, trip_day)
  with tz as (
    select u.id as user_id, coalesce(
      (select z.name from public.analytics_events e join pg_catalog.pg_timezone_names z on z.name = e.props ->> 'tz'
        where e.user_id = u.id and e.event = 'session_start' order by e.ts desc limit 1),
      (select z.name from public.user_profiles p join pg_catalog.pg_timezone_names z on z.name = p.timezone where p.id = u.id),
      'UTC') as tz
    from auth.users u where u.deleted_at is null),
  ev as (
    select e.user_id, (e.ts at time zone tz.tz)::date as day, e.event, e.session_id, e.platform, e.props
    from public.analytics_events e join tz on tz.user_id = e.user_id
    where e.ts >= (p_from - 2)::timestamptz),
  feat as (
    select user_id, day, jsonb_object_agg(event, n) as features from (
      select user_id, day, event, count(*) as n from ev
      where event not in ('active_time', 'screen_view', 'session_start', 'sign_in', 'sign_out') group by 1, 2, 3) x
    group by 1, 2),
  days as (
    select user_id, day,
      count(*)::int as events,
      count(distinct session_id)::int as sessions,
      coalesce(sum(case when event = 'active_time' and (props ->> 'seconds') ~ '^\d{1,5}$' then (props ->> 'seconds')::int end), 0)::int as active_seconds,
      count(*) filter (where event = 'screen_view')::int as screens,
      mode() within group (order by platform) as platform
    from ev where day >= p_from group by 1, 2),
  my_trips as (
    select t.owner_id as user_id, t.id, t.start_date as s, coalesce(t.end_date, t.start_date) as e
    from public.trips t where t.start_date is not null
    union
    select c.user_id, t.id, t.start_date, coalesce(t.end_date, t.start_date)
    from public.trip_collaborators c join public.trips t on t.id = c.trip_id
    where c.status = 'accepted' and t.start_date is not null)
  select d.user_id, d.day, d.events, d.sessions, d.active_seconds, d.screens, coalesce(f.features, '{}'::jsonb), d.platform,
    pick.id,
    coalesce(pick.phase, case when exists (select 1 from my_trips m where m.user_id = d.user_id) then 'between' else 'no_trip' end),
    d.day - pick.s
  from days d
  left join feat f on f.user_id = d.user_id and f.day = d.day
  left join lateral (
    select m.id, m.s, case when d.day between m.s and m.e then 'on_trip' when m.s > d.day then 'pre_trip' else 'post_trip' end as phase
    from my_trips m
    where m.user_id = d.user_id and (d.day between m.s and m.e or (m.s > d.day and m.s - d.day <= 60) or (m.e < d.day and d.day - m.e <= 14))
    order by case when d.day between m.s and m.e then 0 when m.s > d.day then 1 else 2 end, abs(d.day - m.s)
    limit 1) pick on true
  where exists (select 1 from auth.users u where u.id = d.user_id);
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke execute on function public.refresh_member_activity_daily(date) from public, anon, authenticated;

-- How often each member uses the app, over the last 28 days (and 90 for "occasional")
create or replace function public.member_frequency()
returns table (user_id uuid, frequency text, days_28 integer, weeks_4 integer, sessions_28 integer, active_min_28 integer, last_day date)
language sql
stable
security definer
set search_path = ''
as $$
  select a.user_id,
    case
      when count(*) filter (where a.day > current_date - 28) >= 12 then 'daily'
      when count(distinct (current_date - a.day) / 7) filter (where a.day > current_date - 28) >= 3 then 'weekly'
      when count(*) filter (where a.day > current_date - 28) >= 1 then 'monthly'
      else 'occasional' end,
    (count(*) filter (where a.day > current_date - 28))::int,
    (count(distinct (current_date - a.day) / 7) filter (where a.day > current_date - 28))::int,
    coalesce(sum(a.sessions) filter (where a.day > current_date - 28), 0)::int,
    (coalesce(sum(a.active_seconds) filter (where a.day > current_date - 28), 0) / 60)::int,
    max(a.day)
  from public.member_activity_daily a
  where a.day > current_date - 90
  group by a.user_id
$$;
revoke execute on function public.member_frequency() from public, anon, authenticated;

-- One member: daily activity (last 180 days) with trip phase, frequency, and per-trip plans by how they were added
create or replace function public.admin_member_activity(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.admin_guard('analyst');
  return jsonb_build_object(
    'frequency', coalesce((select to_jsonb(f) - 'user_id' from public.member_frequency() f where f.user_id = p_user),
      jsonb_build_object('frequency', 'dormant')),
    'days', coalesce((select jsonb_agg(jsonb_build_object('day', a.day, 'events', a.events, 'sessions', a.sessions,
        'active_seconds', a.active_seconds, 'phase', a.phase, 'trip_id', a.trip_id, 'trip_day', a.trip_day, 'features', a.features,
        'platform', a.platform) order by a.day)
      from public.member_activity_daily a where a.user_id = p_user and a.day > current_date - 180), '[]'::jsonb),
    'phases', coalesce((select jsonb_object_agg(phase, jsonb_build_object('days', n, 'sessions', s, 'active_min', m)) from (
        select a.phase, count(*) as n, sum(a.sessions) as s, sum(a.active_seconds) / 60 as m
        from public.member_activity_daily a where a.user_id = p_user group by 1) x), '{}'::jsonb),
    'trips', coalesce((select jsonb_agg(jsonb_build_object(
        'id', t.id, 'title', t.title, 'city', t.destination_city, 'country', t.destination_country_code,
        'start', t.start_date, 'end', t.end_date, 'status', t.status, 'owner', t.owner_id = p_user, 'created', t.created_at,
        'plans', (select count(*) from public.trip_activities x where x.trip_id = t.id and not coalesce(x.is_idea, false)),
        'ideas', (select count(*) from public.trip_activities x where x.trip_id = t.id and coalesce(x.is_idea, false)),
        'done', (select count(*) from public.trip_activities x where x.trip_id = t.id and x.is_completed),
        'bookings', (select count(*) from public.bookings b where b.trip_id = t.id),
        'by_channel', coalesce((select jsonb_object_agg(ch, n) from (
            select ch, sum(n) as n from (
              select public.booking_channel(b.source, b.raw_email_id, b.added_via) as ch, count(*) as n
              from public.bookings b where b.trip_id = t.id group by 1
              union all
              select public.activity_channel(x.source, x.is_idea), count(*)
              from public.trip_activities x where x.trip_id = t.id group by 1) u group by 1) c), '{}'::jsonb),
        'mine', (select count(*) from public.bookings b where b.trip_id = t.id and b.created_by = p_user)
               + (select count(*) from public.trip_activities x where x.trip_id = t.id and x.created_by = p_user),
        'active_days', (select count(*) from public.member_activity_daily a where a.user_id = p_user and a.trip_id = t.id),
        'active_days_on', (select count(*) from public.member_activity_daily a where a.user_id = p_user and a.trip_id = t.id and a.phase = 'on_trip'))
        order by t.start_date desc nulls first)
      from public.trips t
      where t.owner_id = p_user or exists (select 1 from public.trip_collaborators c where c.trip_id = t.id and c.user_id = p_user and c.status = 'accepted')), '[]'::jsonb)
  );
end;
$$;
revoke execute on function public.admin_member_activity(uuid) from public, anon;
grant execute on function public.admin_member_activity(uuid) to authenticated;

-- Everyone: frequency mix, use by trip phase, the trip curve (-30 to +21 days around a trip's start) and how plans are added
create or replace function public.admin_engagement(p_from timestamptz, p_to timestamptz, p_exclude_internal boolean default true)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.admin_guard('analyst');
  return (
    with members as (
      select u.id from auth.users u
      where u.deleted_at is null
        and not (coalesce(p_exclude_internal, true) and exists (select 1 from public.internal_members im where im.user_id = u.id))),
    a as (select d.* from public.member_activity_daily d join members m on m.id = d.user_id),
    win as (select * from a where a.day >= p_from::date and a.day <= p_to::date),
    freq as (
      select coalesce(f.frequency, 'dormant') as frequency, count(*) as n
      from members m left join public.member_frequency() f on f.user_id = m.id group by 1),
    curve as (
      select a.trip_day, count(distinct a.user_id) as members, sum(a.sessions) as sessions, sum(a.active_seconds) as seconds, sum(a.events) as events
      from a where a.trip_day between -30 and 21 group by 1),
    trip_len as (
      select percentile_cont(0.5) within group (order by coalesce(t.end_date, t.start_date) - t.start_date + 1) as median_days
      from public.trips t join members m on m.id = t.owner_id where t.start_date is not null),
    added as (
      select ch, kind, count(*) as n, count(distinct uid) as members from (
        select public.booking_channel(b.source, b.raw_email_id, b.added_via) as ch, 'booking' as kind, b.created_by as uid
        from public.bookings b join members m on m.id = b.created_by where b.created_at between p_from and p_to
        union all
        select public.activity_channel(x.source, x.is_idea), case when x.is_idea then 'idea' else 'plan' end, x.created_by
        from public.trip_activities x join members m on m.id = x.created_by where x.created_at between p_from and p_to) z
      group by 1, 2)
    select jsonb_build_object(
      'refreshed', (select max(updated_at) from public.member_activity_daily),
      'since', (select min(day) from public.member_activity_daily),
      'frequency', coalesce((select jsonb_object_agg(frequency, n) from freq), '{}'::jsonb),
      'phases', coalesce((select jsonb_agg(jsonb_build_object('phase', phase, 'members', m, 'days', n, 'sessions', s, 'active_min', sec / 60)) from (
          select phase, count(distinct user_id) as m, count(*) as n, sum(sessions) as s, sum(active_seconds) as sec from win group by 1) x), '[]'::jsonb),
      'phase_features', coalesce((select jsonb_agg(jsonb_build_object('phase', phase, 'feature', k, 'uses', uses, 'members', mem)) from (
          select w.phase, f.key as k, sum(f.value::int) as uses, count(distinct w.user_id) as mem
          from win w cross join lateral jsonb_each_text(w.features) f group by 1, 2) x), '[]'::jsonb),
      'curve', coalesce((select jsonb_agg(jsonb_build_object('trip_day', trip_day, 'members', members, 'sessions', sessions,
          'active_min', round(seconds / 60.0, 1), 'events', events) order by trip_day) from curve), '[]'::jsonb),
      'median_trip_days', (select median_days from trip_len),
      'daily', coalesce((select jsonb_agg(jsonb_build_object('day', day, 'members', m, 'on_trip', o) order by day) from (
          select day, count(*) as m, count(*) filter (where phase = 'on_trip') as o from win group by 1) x), '[]'::jsonb),
      'added', coalesce((select jsonb_agg(jsonb_build_object('channel', ch, 'kind', kind, 'n', n, 'members', members)) from added), '[]'::jsonb)
    ));
end;
$$;
revoke execute on function public.admin_engagement(timestamptz, timestamptz, boolean) from public, anon;
grant execute on function public.admin_engagement(timestamptz, timestamptz, boolean) to authenticated;

select public.refresh_member_activity_daily('2026-01-01');

select cron.unschedule(jobid) from cron.job where jobname = 'refresh-member-activity';
select cron.schedule('refresh-member-activity', '17 * * * *', $$select public.refresh_member_activity_daily(current_date - 2)$$);
