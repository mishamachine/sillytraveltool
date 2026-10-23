-- Owner cockpit, step 1: the functions the /admin page and the in-app Owner view call.
-- Each one starts with admin_guard() (admin + MFA). Exclude-internal defaults to true everywhere.

-- ────────────────────────────────────────────────────────────
-- Fare tier from free-text cabin class ("Economy Basic", "Delta Main Basic (E)", "Business")
-- ────────────────────────────────────────────────────────────
create or replace function public.fare_tier(p_class text)
returns text language sql immutable set search_path = '' as $$
  select case
    when p_class is null or btrim(p_class) = '' then null
    when p_class ~* 'first|suite' then 'first'
    when p_class ~* 'business|polaris|club world|upper class|j class|mint' then 'business'
    when p_class ~* 'premium|comfort\+|economy plus|extra legroom|w class' then 'premium'
    when p_class ~* 'basic|light|saver|lite|\(e\)|blue basic' then 'basic'
    else 'economy'
  end
$$;

-- ────────────────────────────────────────────────────────────
-- One row per member with everything the list, pulse and rules need. Trip-cycle stage per docs/ADMIN_PLAN.md 4.
-- ────────────────────────────────────────────────────────────
create or replace function public.admin_member_rows()
returns table (
  user_id uuid, email text, display_name text, joined timestamptz, last_seen timestamptz, platform text,
  app_version text, trips integer, bookings integer, next_trip date, last_trip_end date, stage text, plan text,
  status text, internal boolean, tags text[], home_city text, countries integer, fare_top text, party_max integer,
  source text
)
language sql stable security definer set search_path = '' as $$
  with my_trips as (
    select t.owner_id as uid, t.* from public.trips t where t.status is distinct from 'cancelled'
    union
    select c.user_id as uid, t.* from public.trip_collaborators c join public.trips t on t.id = c.trip_id
    where c.status = 'accepted' and c.user_id is not null and t.status is distinct from 'cancelled'
  ),
  tstats as (
    select uid,
      count(*)::int as n_trips,
      bool_or(start_date <= current_date and end_date >= current_date) as on_road,
      min(start_date) filter (where start_date > current_date) as next_start,
      bool_or(start_date is null) as has_undated,
      max(end_date) filter (where end_date < current_date) as last_end,
      count(*) filter (where end_date < current_date)::int as n_past,
      case when count(*) filter (where end_date < current_date) >= 2
        then (max(start_date) filter (where end_date < current_date) - min(start_date) filter (where end_date < current_date))
             / (count(*) filter (where end_date < current_date) - 1)
      end as avg_gap,
      count(distinct destination_country_code)::int as countries
    from my_trips group by uid
  ),
  bstats as (
    select b.created_by as uid, count(*)::int as n,
      max(greatest(coalesce(b.party_size, 1), coalesce(b.ticket_quantity, 1)))::int as party_max,
      (array_agg(public.fare_tier(b.flight_class) order by
        case public.fare_tier(b.flight_class) when 'first' then 5 when 'business' then 4 when 'premium' then 3 when 'economy' then 2 when 'basic' then 1 else 0 end desc))[1] as fare_top
    from public.bookings b group by b.created_by
  ),
  seen as (
    select e.user_id as uid, max(e.ts) as last_ts,
      (array_agg(e.platform order by e.ts desc))[1] as platform,
      (array_agg(e.app_version order by e.ts desc))[1] as app_version
    from public.analytics_events e group by e.user_id
  ),
  base as (
    select u.id, u.email::text as email, p.display_name, u.created_at as joined,
      greatest(s.last_ts, u.last_sign_in_at) as last_seen, s.platform, s.app_version,
      coalesce(ts.n_trips, 0) as n_trips, coalesce(bs.n, 0) as n_bookings, ts.next_start, ts.last_end, ts.on_road,
      ts.has_undated, ts.n_past, ts.avg_gap, coalesce(ts.countries, 0) as countries, bs.fare_top, bs.party_max,
      p.home_city, (im.user_id is not null) as internal, a.utm_source, a.referrer_domain
    from auth.users u
    left join public.user_profiles p on p.id = u.id
    left join tstats ts on ts.uid = u.id
    left join bstats bs on bs.uid = u.id
    left join seen s on s.uid = u.id
    left join public.internal_members im on im.user_id = u.id
    left join public.member_attribution a on a.user_id = u.id
  )
  select b.id, b.email, b.display_name, b.joined, b.last_seen, b.platform, b.app_version, b.n_trips, b.n_bookings,
    b.next_start, b.last_end,
    case
      when b.n_trips = 0 then 'new'
      when b.on_road then 'on_the_road'
      when b.next_start is not null and b.next_start - current_date <= 7 then 'getting_ready'
      when b.next_start is not null and b.next_start - current_date <= 60 then 'planning'
      when b.next_start is not null or b.has_undated then 'dreaming'
      when b.last_end >= current_date - 14 then 'just_back'
      when current_date - greatest(coalesce(b.last_seen::date, b.joined::date), coalesce(b.last_end, b.joined::date)) >
        case
          when b.n_past >= 2 then greatest(60, 2 * coalesce(b.avg_gap, 180))
          when b.joined > now() - interval '180 days' then 180
          else 365
        end then 'lapsed'
      else 'between_trips'
    end,
    public.entitlement(b.id), public.member_status(b.id), b.internal,
    coalesce((select array_agg(t.tag order by t.tag) from public.member_tags t where t.user_id = b.id), '{}'),
    b.home_city, b.countries, b.fare_top, b.party_max,
    coalesce(b.utm_source, b.referrer_domain)
  from base b
$$;
revoke all on function public.admin_member_rows() from public, anon, authenticated;

-- Masks an email for the analyst role: j***@gmail.com
create or replace function public.mask_email(p_email text)
returns text language sql immutable set search_path = '' as $$
  select left(p_email, 1) || '***@' || split_part(p_email, '@', 2)
$$;

-- ────────────────────────────────────────────────────────────
-- Pulse: this period vs the previous one of the same length, plus a daily series
-- ────────────────────────────────────────────────────────────
create or replace function public.admin_pulse(p_from date, p_to date, p_exclude_internal boolean default true)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_len integer := p_to - p_from + 1;
  v_prev_from date := p_from - (p_to - p_from + 1);
  v_prev_to date := p_from - 1;
  v_result jsonb;
begin
  perform public.admin_guard('analyst');
  with excl as (select user_id from public.internal_members where p_exclude_internal),
  ev as (select * from public.analytics_events e where e.user_id not in (select user_id from excl)
         and e.ts >= v_prev_from and e.ts < p_to + 1),
  usr as (select * from auth.users u where u.id not in (select user_id from excl)),
  m as (
    select
      (select count(*) from usr where created_at >= p_from and created_at < p_to + 1) as signups,
      (select count(*) from usr where created_at >= v_prev_from and created_at < v_prev_to + 1) as signups_prev,
      (select count(distinct user_id) from ev where ts >= p_from) as active,
      (select count(distinct user_id) from ev where ts < p_from) as active_prev,
      (select count(distinct session_id) from ev where ts >= p_from) as sessions,
      (select count(distinct session_id) from ev where ts < p_from) as sessions_prev,
      (select count(*) from public.trips t where t.owner_id not in (select user_id from excl) and t.created_at >= p_from and t.created_at < p_to + 1) as trips,
      (select count(*) from public.trips t where t.owner_id not in (select user_id from excl) and t.created_at >= v_prev_from and t.created_at < v_prev_to + 1) as trips_prev,
      (select count(*) from public.bookings b where b.created_by not in (select user_id from excl) and b.created_at >= p_from and b.created_at < p_to + 1) as bookings,
      (select count(*) from public.bookings b where b.created_by not in (select user_id from excl) and b.created_at >= v_prev_from and b.created_at < v_prev_to + 1) as bookings_prev,
      (select count(*) from ev where ts >= p_from and event in ('app_error', 'ai_error')) as errors,
      (select count(*) from ev where ts < p_from and event in ('app_error', 'ai_error')) as errors_prev,
      (select coalesce(sum(calls), 0) from public.ai_usage a where a.user_id not in (select user_id from excl) and a.day between p_from and p_to) as ai_calls,
      (select coalesce(sum(calls), 0) from public.ai_usage a where a.user_id not in (select user_id from excl) and a.day between v_prev_from and v_prev_to) as ai_calls_prev,
      (select count(*) from public.code_redemptions r where r.redeemed_at >= p_from and r.redeemed_at < p_to + 1) as codes_used,
      (select count(distinct user_id) from public.analytics_events e where e.ts > now() - interval '5 minutes'
         and e.user_id not in (select user_id from excl)) as online_now,
      (select count(*) from usr where public.entitlement(usr.id) = 'first_class') as first_class,
      (select count(*) from usr) as members,
      (select count(*) from public.function_errors f where f.ts >= p_from and f.ts < p_to + 1) as function_errors
  ),
  days as (select d::date as day from generate_series(p_from, p_to, interval '1 day') d),
  series as (
    select jsonb_agg(jsonb_build_object(
      'day', days.day,
      'signups', (select count(*) from usr where created_at::date = days.day),
      'active', (select count(distinct user_id) from ev where ts::date = days.day),
      'bookings', (select count(*) from public.bookings b where b.created_by not in (select user_id from excl) and b.created_at::date = days.day),
      'errors', (select count(*) from ev where ts::date = days.day and event in ('app_error', 'ai_error'))
    ) order by days.day) as s from days
  )
  select to_jsonb(m) || jsonb_build_object('series', series.s, 'from', p_from, 'to', p_to, 'days', v_len, 'as_of', now())
  into v_result from m, series;
  return v_result;
end;
$$;

-- ────────────────────────────────────────────────────────────
-- Needs you: rule items (virtual, keyed) + owner items, minus done / snoozed
-- ────────────────────────────────────────────────────────────
create or replace function public.admin_needs_you()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_items jsonb := '[]'::jsonb;
  v_n integer;
  v_avg numeric;
  v_today text := to_char(current_date, 'YYYY-MM-DD');
  v_week text := to_char(current_date, 'IYYY-IW');
  r record;
begin
  perform public.admin_guard('analyst');

  -- Errors today vs the 7-day daily average
  select count(*) into v_n from public.analytics_events
  where event in ('app_error', 'ai_error') and ts > now() - interval '24 hours'
    and user_id not in (select user_id from public.internal_members);
  select count(*) / 7.0 into v_avg from public.analytics_events
  where event in ('app_error', 'ai_error') and ts between now() - interval '8 days' and now() - interval '24 hours'
    and user_id not in (select user_id from public.internal_members);
  if v_n >= 3 and v_n > 2 * v_avg then
    v_items := v_items || jsonb_build_object('key', 'errors:' || v_today, 'priority', 1, 'tab', 'product',
      'title', v_n || ' errors in the last 24 hours',
      'detail', 'About ' || round(v_avg, 1) || ' a day is normal. Open Product to see which screens and versions.');
  end if;

  select count(*) into v_n from public.function_errors where ts > now() - interval '24 hours';
  if v_n > 0 then
    v_items := v_items || jsonb_build_object('key', 'fn_errors:' || v_today, 'priority', 1, 'tab', 'system',
      'title', v_n || ' server function errors today', 'detail', 'See System for which function and status.');
  end if;

  -- New members this week
  select count(*) into v_n from auth.users u
  where u.created_at > now() - interval '7 days' and u.id not in (select user_id from public.internal_members);
  if v_n > 0 then
    v_items := v_items || jsonb_build_object('key', 'welcome:' || v_week, 'priority', 2, 'tab', 'members', 'filter', 'new',
      'title', v_n || ' new member' || case when v_n = 1 then '' else 's' end || ' this week',
      'detail', 'Say hello while it''s fresh. A personal note from the founder converts better than any campaign.');
  end if;

  -- Trip-cycle moments
  for r in
    select stage, count(*) as n from public.admin_member_rows() where not internal and stage in ('just_back', 'getting_ready')
    group by stage
  loop
    v_items := v_items || case r.stage
      when 'just_back' then jsonb_build_object('key', 'just_back:' || v_today, 'priority', 2, 'tab', 'members', 'filter', 'just_back',
        'title', r.n || ' member' || case when r.n = 1 then ' is' else 's are' end || ' just back from a trip',
        'detail', 'Best moment for a recap, a share ask or the First Class offer.')
      else jsonb_build_object('key', 'getting_ready:' || v_today, 'priority', 3, 'tab', 'members', 'filter', 'getting_ready',
        'title', r.n || ' member' || case when r.n = 1 then ' leaves' else 's leave' end || ' within 7 days',
        'detail', 'Check their imports worked and nothing in their plan is broken.')
    end;
  end loop;

  -- Codes near their limit or ending soon
  for r in
    select c.id, c.code, c.max_uses, c.ends_at, (select count(*) from public.code_redemptions x where x.code_id = c.id) as used
    from public.promo_codes c where c.status = 'active' and c.batch is null
  loop
    if r.max_uses is not null and r.used >= 0.8 * r.max_uses then
      v_items := v_items || jsonb_build_object('key', 'code_cap:' || r.id, 'priority', 2, 'tab', 'money', 'code', r.id,
        'title', 'Code ' || r.code || ' has ' || r.used || ' of ' || r.max_uses || ' uses',
        'detail', 'Raise the limit or let it run out.');
    end if;
    if r.ends_at is not null and r.ends_at between now() and now() + interval '7 days' then
      v_items := v_items || jsonb_build_object('key', 'code_end:' || r.id, 'priority', 3, 'tab', 'money', 'code', r.id,
        'title', 'Code ' || r.code || ' ends ' || to_char(r.ends_at, 'Mon DD'),
        'detail', 'Extend it or plan what replaces it.');
    end if;
  end loop;

  -- Suspensions ending soon
  for r in
    select m.user_id, m.ends_at, u.email from public.member_moderation m join auth.users u on u.id = m.user_id
    where m.level = 'suspended' and m.lifted_at is null and m.ends_at between now() and now() + interval '3 days'
  loop
    v_items := v_items || jsonb_build_object('key', 'susp_end:' || r.user_id || ':' || to_char(r.ends_at, 'YYYYMMDD'),
      'priority', 2, 'tab', 'members', 'member', r.user_id,
      'title', 'Suspension ends ' || to_char(r.ends_at, 'Mon DD'), 'detail', 'Review before it lifts automatically.');
  end loop;

  -- Duplicated sign-in events (known old bug) in the last 7 days
  select count(*) into v_n from (
    select user_id from public.analytics_events where event = 'sign_in' and ts > now() - interval '7 days'
    group by user_id, date_trunc('hour', ts) having count(*) > 20) x;
  if v_n > 0 then
    v_items := v_items || jsonb_build_object('key', 'dup_signin:' || v_week, 'priority', 3, 'tab', 'system',
      'title', 'Sign-in events look duplicated', 'detail', 'A member logged over 20 sign-ins in one hour. Counts in the cockpit ignore repeats.');
  end if;

  -- No experiment running (the experiments engine is build step 4)
  v_items := v_items || jsonb_build_object('key', 'no_test:' || v_week, 'priority', 2, 'tab', 'experiments',
    'title', 'No conversion test running', 'detail', 'The experiments engine is build step 4. Until then, note test ideas in Up next.');

  -- Grants that unlock nothing yet
  select count(*) into v_n from public.entitlement_grants where ended_at is null and (ends_at is null or ends_at > now());
  if v_n > 0 then
    v_items := v_items || jsonb_build_object('key', 'grants_dormant:' || v_week, 'priority', 3, 'tab', 'money',
      'title', v_n || ' First Class grant' || case when v_n = 1 then '' else 's' end || ' waiting on the paywall',
      'detail', 'They''re recorded and will switch on when the paywall ships.');
  end if;

  -- Drop done / snoozed rule items; add open owner items
  return jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(i order by (i ->> 'priority')::int, i ->> 'title')
      from jsonb_array_elements(v_items) i
      where not exists (select 1 from public.admin_tasks t where t.key = i ->> 'key'
                        and (t.status = 'done' or (t.status = 'snoozed' and t.snooze_until > now())))
    ), '[]'::jsonb) || coalesce((
      select jsonb_agg(jsonb_build_object('key', t.key, 'priority', 2, 'title', t.title, 'detail', t.detail, 'own', true) order by t.created_at)
      from public.admin_tasks t where t.key like 'own:%' and (t.status = 'open' or (t.status = 'snoozed' and t.snooze_until <= now()))
    ), '[]'::jsonb),
    'done_recent', coalesce((
      select jsonb_agg(jsonb_build_object('key', t.key, 'title', t.title, 'status', t.status, 'at', t.updated_at) order by t.updated_at desc)
      from (select * from public.admin_tasks where status = 'done' order by updated_at desc limit 10) t
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.admin_task_set(p_key text, p_status text, p_snooze_until timestamptz default null, p_title text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.admin_guard('support');
  if p_status not in ('open', 'done', 'snoozed') then raise exception 'bad_status'; end if;
  insert into public.admin_tasks (key, title, status, snooze_until, created_by)
  values (p_key, p_title, p_status, p_snooze_until, auth.uid())
  on conflict (key) do update set status = excluded.status, snooze_until = excluded.snooze_until,
    title = coalesce(excluded.title, public.admin_tasks.title), updated_at = now();
  perform public.admin_log('task.' || p_status, null, jsonb_build_object('key', p_key));
end;
$$;

create or replace function public.admin_task_add(p_title text, p_detail text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare v_key text := 'own:' || gen_random_uuid();
begin
  perform public.admin_guard('support');
  insert into public.admin_tasks (key, title, detail, created_by) values (v_key, left(p_title, 200), left(p_detail, 1000), auth.uid());
  return v_key;
end;
$$;

-- ────────────────────────────────────────────────────────────
-- Members list and profile
-- ────────────────────────────────────────────────────────────
create or replace function public.admin_members(p_search text default null, p_stage text default null, p_plan text default null,
  p_status text default null, p_exclude_internal boolean default true)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_role text; v_q text := nullif(btrim(lower(p_search)), '');
begin
  v_role := public.admin_guard('analyst');
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', m.user_id,
      'email', case when v_role = 'analyst' then public.mask_email(m.email) else m.email end,
      'name', m.display_name, 'joined', m.joined, 'last_seen', m.last_seen, 'platform', m.platform,
      'app_version', m.app_version, 'trips', m.trips, 'bookings', m.bookings, 'next_trip', m.next_trip,
      'last_trip_end', m.last_trip_end, 'stage', m.stage, 'plan', m.plan, 'status', m.status, 'internal', m.internal,
      'tags', m.tags, 'home_city', m.home_city, 'countries', m.countries, 'fare_top', m.fare_top,
      'party_max', m.party_max, 'source', m.source
    ) order by m.last_seen desc nulls last)
    from public.admin_member_rows() m
    where (not p_exclude_internal or not m.internal)
      and (p_stage is null or m.stage = p_stage)
      and (p_plan is null or m.plan = p_plan)
      and (p_status is null or m.status = p_status)
      and (v_q is null or lower(m.email) like '%' || v_q || '%' or lower(coalesce(m.display_name, '')) like '%' || v_q || '%'
           or m.user_id::text = v_q or v_q = any (m.tags))
  ), '[]'::jsonb);
end;
$$;

create or replace function public.admin_member(p_user uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_role text; v_row record; v_out jsonb;
begin
  v_role := public.admin_guard('analyst');
  select * into v_row from public.admin_member_rows() m where m.user_id = p_user;
  if v_row.user_id is null then raise exception 'not_found'; end if;
  perform public.admin_log('member.view', p_user);

  select jsonb_build_object(
    'id', v_row.user_id,
    'email', case when v_role = 'analyst' then public.mask_email(v_row.email) else v_row.email end,
    'name', v_row.display_name, 'joined', v_row.joined, 'last_seen', v_row.last_seen, 'platform', v_row.platform,
    'app_version', v_row.app_version, 'stage', v_row.stage, 'plan', v_row.plan, 'status', v_row.status,
    'internal', v_row.internal, 'tags', v_row.tags, 'home_city', v_row.home_city, 'countries', v_row.countries,
    'fare_top', v_row.fare_top, 'party_max', v_row.party_max, 'source', v_row.source,
    'is_admin', exists (select 1 from public.admins a where a.user_id = p_user),
    'account', (select jsonb_build_object(
        'confirmed', u.email_confirmed_at is not null, 'last_sign_in', u.last_sign_in_at,
        'providers', coalesce(u.raw_app_meta_data -> 'providers', jsonb_build_array(u.raw_app_meta_data ->> 'provider')),
        'banned_until', u.banned_until, 'mfa', exists (select 1 from auth.mfa_factors f where f.user_id = u.id and f.status = 'verified'))
      from auth.users u where u.id = p_user),
    'profile', (select jsonb_build_object('home_currency', p.home_currency, 'timezone', p.timezone, 'temp_unit', p.temp_unit)
      from public.user_profiles p where p.id = p_user),
    'attribution', (select to_jsonb(a) - 'user_id' from public.member_attribution a where a.user_id = p_user),
    -- Trips: dates, places, counts. Never booking contents.
    'trips', coalesce((select jsonb_agg(jsonb_build_object(
        'id', t.id, 'city', t.destination_city, 'country', t.destination_country_code, 'start', t.start_date, 'end', t.end_date,
        'status', t.status, 'owner', t.owner_id = p_user, 'created', t.created_at,
        'bookings', (select count(*) from public.bookings b where b.trip_id = t.id),
        'by_type', (select jsonb_object_agg(x.type, x.n) from (select b.type::text as type, count(*) as n from public.bookings b where b.trip_id = t.id group by 1) x),
        'stops', (select count(*) from public.trip_stops s where s.trip_id = t.id),
        'travellers', 1 + (select count(*) from public.trip_collaborators c where c.trip_id = t.id and c.status = 'accepted'))
        order by t.start_date desc nulls first)
      from public.trips t
      where t.owner_id = p_user or exists (select 1 from public.trip_collaborators c where c.trip_id = t.id and c.user_id = p_user and c.status = 'accepted')), '[]'::jsonb),
    'fares', coalesce((select jsonb_object_agg(f.tier, f.n) from (
        select coalesce(public.fare_tier(b.flight_class), 'unknown') as tier, count(*) as n
        from public.bookings b where b.created_by = p_user and b.type::text = 'flight' group by 1) f), '{}'::jsonb),
    'stats', (select to_jsonb(s) - 'user_id' from public.user_stats s where s.user_id = p_user),
    'usage', coalesce((select jsonb_object_agg(x.event, x.n) from (
        select e.event, count(*) as n from public.analytics_events e
        where e.user_id = p_user and e.event not in ('screen_view', 'sign_in', 'active_time') group by 1) x), '{}'::jsonb),
    'timeline', coalesce((select jsonb_agg(jsonb_build_object('event', e.event, 'screen', e.screen, 'props', e.props,
        'platform', e.platform, 'version', e.app_version, 'ts', e.ts) order by e.ts desc)
      from (select * from public.analytics_events where user_id = p_user order by ts desc limit 150) e), '[]'::jsonb),
    'grants', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'source', g.source, 'reason', g.reason, 'note', g.note,
        'starts_at', g.starts_at, 'ends_at', g.ends_at, 'ended_at', g.ended_at, 'end_reason', g.end_reason,
        'code', (select c.code from public.promo_codes c where c.id = g.code_id), 'created_at', g.created_at,
        'live', g.ended_at is null and g.starts_at <= now() and (g.ends_at is null or g.ends_at > now())) order by g.created_at desc)
      from public.entitlement_grants g where g.user_id = p_user), '[]'::jsonb),
    'codes', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'code', c.code, 'redeemed_at', r.redeemed_at, 'ended_at', r.ended_at)
        order by r.redeemed_at desc)
      from public.code_redemptions r join public.promo_codes c on c.id = r.code_id where r.user_id = p_user), '[]'::jsonb),
    'code_attempts', coalesce((select jsonb_agg(jsonb_build_object('code', a.code_entered, 'result', a.result, 'ts', a.ts) order by a.ts desc)
      from (select * from public.code_attempts where user_id = p_user order by ts desc limit 20) a), '[]'::jsonb),
    'moderation', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'level', m.level, 'reason', m.reason, 'note', m.note,
        'member_message', m.member_message, 'starts_at', m.starts_at, 'ends_at', m.ends_at, 'lifted_at', m.lifted_at,
        'lift_reason', m.lift_reason, 'created_at', m.created_at,
        'live', m.lifted_at is null and m.starts_at <= now() and (m.ends_at is null or m.ends_at > now())) order by m.created_at desc)
      from public.member_moderation m where m.user_id = p_user), '[]'::jsonb),
    'notes', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'body', n.body, 'pinned', n.pinned, 'created_at', n.created_at)
        order by n.pinned desc, n.created_at desc)
      from public.member_notes n where n.user_id = p_user and n.deleted_at is null), '[]'::jsonb),
    'audit', coalesce((select jsonb_agg(jsonb_build_object('action', a.action, 'detail', a.detail, 'ts', a.ts) order by a.ts desc)
      from (select * from public.admin_audit where target_user = p_user and action <> 'member.view' order by ts desc limit 50) a), '[]'::jsonb)
  ) into v_out;
  return v_out;
end;
$$;

create or replace function public.admin_note_add(p_user uuid, p_body text, p_pinned boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.admin_guard('support');
  insert into public.member_notes (user_id, author, body, pinned) values (p_user, auth.uid(), p_body, coalesce(p_pinned, false));
  perform public.admin_log('note.add', p_user, jsonb_build_object('pinned', p_pinned));
end;
$$;

create or replace function public.admin_note_update(p_note bigint, p_pinned boolean default null, p_delete boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare v_user uuid;
begin
  perform public.admin_guard('support');
  update public.member_notes set pinned = coalesce(p_pinned, pinned), deleted_at = case when p_delete then now() else deleted_at end
  where id = p_note returning user_id into v_user;
  perform public.admin_log(case when p_delete then 'note.delete' else 'note.pin' end, v_user, jsonb_build_object('note', p_note));
end;
$$;

create or replace function public.admin_set_tags(p_user uuid, p_tags text[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.admin_guard('support');
  delete from public.member_tags where user_id = p_user;
  insert into public.member_tags (user_id, tag)
  select p_user, t from (select distinct lower(btrim(x)) as t from unnest(p_tags) x) y where t <> '';
  perform public.admin_log('tags.set', p_user, jsonb_build_object('tags', p_tags));
end;
$$;

create or replace function public.admin_set_internal(p_user uuid, p_internal boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.admin_guard('owner');
  if p_internal then
    insert into public.internal_members (user_id, reason) values (p_user, 'marked in cockpit') on conflict do nothing;
  else
    delete from public.internal_members where user_id = p_user;
  end if;
  perform public.admin_log('member.internal', p_user, jsonb_build_object('internal', p_internal));
end;
$$;

-- ────────────────────────────────────────────────────────────
-- Moderation
-- ────────────────────────────────────────────────────────────
-- What a status change would touch, shown before confirming
create or replace function public.admin_status_impact(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.admin_guard('support');
  return jsonb_build_object(
    'plan', public.entitlement(p_user),
    'live_grants', (select count(*) from public.entitlement_grants g where g.user_id = p_user and g.ended_at is null and (g.ends_at is null or g.ends_at > now())),
    'store_subscription', null, -- filled in by the paywall (store subscriptions keep billing until the member cancels)
    'shared_trips', (select count(*) from public.trips t where t.owner_id = p_user
                     and exists (select 1 from public.trip_collaborators c where c.trip_id = t.id and c.status = 'accepted')),
    'travellers_on_them', (select count(*) from public.trip_collaborators c join public.trips t on t.id = c.trip_id
                           where t.owner_id = p_user and c.status = 'accepted'),
    'pending_invites', (select count(*) from public.trip_collaborators c where c.invited_by = p_user and c.status = 'pending'),
    'is_admin', exists (select 1 from public.admins a where a.user_id = p_user),
    'status', public.member_status(p_user)
  );
end;
$$;

create or replace function public.admin_set_status(p_user uuid, p_level text, p_reason text, p_note text default null,
  p_ends_at timestamptz default null, p_member_message text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_role text; v_id uuid; v_email text; v_cancelled integer := 0;
begin
  v_role := public.admin_guard('support');
  if p_user = auth.uid() then raise exception 'You can''t change your own account status.'; end if;
  if exists (select 1 from public.admins a where a.user_id = p_user and a.role = 'owner') then
    raise exception 'Owners can''t be moderated from the cockpit.';
  end if;
  if p_level not in ('warning', 'restricted', 'suspended', 'banned') then raise exception 'bad_level'; end if;
  if p_level = 'suspended' and (p_ends_at is null or p_ends_at <= now()) then raise exception 'A suspension needs an end date in the future.'; end if;
  if v_role = 'support' and (p_level = 'banned' or (p_level = 'suspended' and p_ends_at > now() + interval '7 days')) then
    raise exception 'Support can suspend for up to 7 days. Bans need the owner.';
  end if;

  insert into public.member_moderation (user_id, level, reason, note, member_message, ends_at, created_by)
  values (p_user, p_level, p_reason, p_note, p_member_message, case when p_level = 'banned' then null else p_ends_at end, auth.uid())
  returning id into v_id;

  if p_level in ('suspended', 'banned') then
    -- Sign-in blocked by Supabase Auth; every session signed out now
    update auth.users set banned_until = case when p_level = 'banned' then now() + interval '100 years' else p_ends_at end
    where id = p_user returning email into v_email;
    delete from auth.refresh_tokens where user_id = p_user::text;
    delete from auth.sessions where user_id = p_user;
    -- Their pending invites stop working; travellers already on their trips keep access
    with x as (delete from public.trip_collaborators where invited_by = p_user and status = 'pending' returning 1)
    select count(*) into v_cancelled from x;
  end if;
  if p_level = 'banned' and v_email is not null then
    insert into public.blocked_identities (email_norm, user_id, moderation_id) values (public.normalize_email(v_email), p_user, v_id)
    on conflict (email_norm) do update set moderation_id = excluded.moderation_id;
  end if;

  perform public.admin_log('status.' || p_level, p_user, jsonb_build_object('reason', p_reason, 'ends_at', p_ends_at,
    'moderation', v_id, 'invites_cancelled', v_cancelled, 'message', p_member_message is not null));
  return jsonb_build_object('id', v_id, 'invites_cancelled', v_cancelled, 'status', public.member_status(p_user));
end;
$$;

create or replace function public.admin_lift_status(p_moderation uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_role text; v_m record;
begin
  v_role := public.admin_guard('support');
  if coalesce(btrim(p_reason), '') = '' then raise exception 'A reason is needed to lift a status.'; end if;
  select * into v_m from public.member_moderation where id = p_moderation;
  if v_m.id is null or v_m.lifted_at is not null then raise exception 'Nothing to lift.'; end if;
  if v_m.level = 'banned' and v_role <> 'owner' then raise exception 'Only the owner can lift a ban.'; end if;
  update public.member_moderation set lifted_at = now(), lifted_by = auth.uid(), lift_reason = p_reason where id = p_moderation;
  -- Clear the sign-in block when nothing else still needs it
  if public.member_status(v_m.user_id) not in ('suspended', 'banned') then
    update auth.users set banned_until = null where id = v_m.user_id;
  end if;
  if v_m.level = 'banned' then delete from public.blocked_identities where moderation_id = p_moderation; end if;
  perform public.admin_log('status.lift', v_m.user_id, jsonb_build_object('level', v_m.level, 'reason', p_reason, 'moderation', p_moderation));
  return jsonb_build_object('status', public.member_status(v_m.user_id));
end;
$$;

-- ────────────────────────────────────────────────────────────
-- First Class grants (admin)
-- ────────────────────────────────────────────────────────────
create or replace function public.admin_grant(p_user uuid, p_reason text, p_days integer default null, p_until timestamptz default null,
  p_lifetime boolean default false, p_note text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_role text; v_start timestamptz; v_end timestamptz; v_id uuid;
begin
  v_role := public.admin_guard('support');
  if not p_lifetime and p_days is null and p_until is null then raise exception 'Choose days, an end date or lifetime.'; end if;
  v_start := public.grant_start(p_user);
  v_end := case when p_lifetime then null when p_until is not null then p_until else v_start + make_interval(days => p_days) end;
  if v_end is not null and v_end <= v_start then raise exception 'The end date must be after the start.'; end if;
  if v_role = 'support' and (v_end is null or v_end > now() + interval '31 days') then
    raise exception 'Support can give up to 30 days. Longer grants need the owner.';
  end if;
  insert into public.entitlement_grants (user_id, source, reason, note, starts_at, ends_at, created_by)
  values (p_user, 'admin', p_reason, p_note, v_start, v_end, auth.uid()) returning id into v_id;
  perform public.admin_log('grant.add', p_user, jsonb_build_object('grant', v_id, 'reason', p_reason, 'ends_at', v_end, 'lifetime', p_lifetime));
  return v_id;
end;
$$;

create or replace function public.admin_end_grant(p_grant uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_user uuid;
begin
  perform public.admin_guard('support');
  if coalesce(btrim(p_reason), '') = '' then raise exception 'A reason is needed.'; end if;
  update public.entitlement_grants set ended_at = now(), ended_by = auth.uid(), end_reason = p_reason
  where id = p_grant and ended_at is null returning user_id into v_user;
  if v_user is null then raise exception 'That grant has already ended.'; end if;
  update public.code_redemptions set ended_at = now(), end_reason = p_reason where grant_id = p_grant and ended_at is null;
  perform public.admin_log('grant.end', v_user, jsonb_build_object('grant', p_grant, 'reason', p_reason));
end;
$$;

-- ────────────────────────────────────────────────────────────
-- Codes
-- ────────────────────────────────────────────────────────────
-- Unambiguous alphabet: no 0/O, 1/I/L
create or replace function public.random_code(p_len integer)
returns text language sql volatile set search_path = '' as $$
  select string_agg(substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ', 1 + floor(random() * 31)::int, 1), '')
  from generate_series(1, p_len)
$$;

create or replace function public.admin_code_create(p jsonb, p_count integer default 1)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_ids uuid[] := '{}'; v_id uuid; v_codes text[] := '{}'; v_code text; v_batch text; i integer; v_prefix text;
begin
  perform public.admin_guard('owner');
  if p_count < 1 or p_count > 1000 then raise exception 'Between 1 and 1,000 codes at a time.'; end if;
  v_prefix := upper(nullif(btrim(p ->> 'prefix'), ''));
  v_batch := case when p_count > 1 then coalesce(nullif(btrim(p ->> 'batch'), ''), coalesce(v_prefix, 'BATCH') || '-' || to_char(now(), 'YYYYMMDD-HH24MI')) end;
  for i in 1..p_count loop
    v_code := case when p_count = 1 and nullif(btrim(p ->> 'code'), '') is not null then upper(btrim(p ->> 'code'))
                   else coalesce(v_prefix || '-', '') || public.random_code(8) end;
    insert into public.promo_codes (code, kind, days, lifetime, discount_percent, discount_amount, discount_currency, discount_duration,
      plans, audience, audience_member, max_uses, per_member, starts_at, ends_at, batch, campaign, note, created_by)
    values (v_code, p ->> 'kind', (p ->> 'days')::int, coalesce((p ->> 'lifetime')::boolean, false),
      (p ->> 'discount_percent')::int, (p ->> 'discount_amount')::numeric, upper(p ->> 'discount_currency'), p ->> 'discount_duration',
      coalesce((select array_agg(x) from jsonb_array_elements_text(p -> 'plans') x), array['yearly', 'lifetime']),
      coalesce(p ->> 'audience', 'anyone'), (p ->> 'audience_member')::uuid,
      case when p_count > 1 then 1 else (p ->> 'max_uses')::int end, coalesce((p ->> 'per_member')::int, 1),
      coalesce((p ->> 'starts_at')::timestamptz, now()), (p ->> 'ends_at')::timestamptz, v_batch,
      nullif(lower(btrim(p ->> 'campaign')), ''), p ->> 'note', auth.uid()) returning id into v_id;
    v_ids := v_ids || v_id;
    v_codes := v_codes || v_code;
  end loop;
  perform public.admin_log('code.create', null, jsonb_build_object('count', p_count, 'batch', v_batch, 'first', v_codes[1], 'kind', p ->> 'kind'));
  return jsonb_build_object('codes', to_jsonb(v_codes), 'ids', to_jsonb(v_ids), 'batch', v_batch);
exception when unique_violation then
  raise exception 'That code already exists. Pick another.';
end;
$$;

create or replace function public.admin_code_update(p_code uuid, p jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.admin_guard('owner');
  update public.promo_codes set
    status = coalesce(p ->> 'status', status),
    max_uses = case when p ? 'max_uses' then (p ->> 'max_uses')::int else max_uses end,
    ends_at = case when p ? 'ends_at' then (p ->> 'ends_at')::timestamptz else ends_at end,
    note = case when p ? 'note' then p ->> 'note' else note end,
    campaign = case when p ? 'campaign' then nullif(lower(btrim(p ->> 'campaign')), '') else campaign end,
    updated_at = now()
  where id = p_code or (p ? 'whole_batch' and batch = (select batch from public.promo_codes where id = p_code) and batch is not null);
  perform public.admin_log('code.update', null, jsonb_build_object('code', p_code) || p);
end;
$$;

create or replace function public.admin_codes(p_include_archived boolean default false)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.admin_guard('analyst');
  return coalesce((
    with c as (
      select coalesce(p.batch, p.id::text) as grp, bool_or(p.batch is not null) as is_batch, min(p.batch) as batch,
        (array_agg(p.id order by p.created_at))[1] as id,
        case when count(*) = 1 then min(p.code) else min(p.batch) end as label,
        count(*) as codes, min(p.kind) as kind, min(p.days) as days, bool_or(p.lifetime) as lifetime,
        min(p.discount_percent) as discount_percent, min(p.discount_amount) as discount_amount, min(p.discount_currency) as discount_currency,
        min(p.discount_duration) as discount_duration, min(p.audience) as audience, sum(p.max_uses) as max_uses,
        min(p.starts_at) as starts_at, max(p.ends_at) as ends_at, min(p.campaign) as campaign, min(p.note) as note,
        min(p.created_at) as created_at,
        case when bool_or(p.status = 'active') then 'active' when bool_or(p.status = 'paused') then 'paused'
             when bool_or(p.status = 'ended') then 'ended' else 'archived' end as status,
        array_agg(p.id) as ids, min(p.stripe_promo_id) as stripe_promo_id, min(p.stripe_error) as stripe_error
      from public.promo_codes p
      where p_include_archived or p.status <> 'archived'
      group by 1
    )
    select jsonb_agg(jsonb_build_object(
      'id', c.id, 'label', c.label, 'is_batch', c.is_batch, 'batch', c.batch, 'codes', c.codes, 'kind', c.kind, 'days', c.days,
      'lifetime', c.lifetime, 'discount_percent', c.discount_percent, 'discount_amount', c.discount_amount,
      'discount_currency', c.discount_currency, 'discount_duration', c.discount_duration, 'audience', c.audience,
      'max_uses', c.max_uses, 'starts_at', c.starts_at, 'ends_at', c.ends_at, 'campaign', c.campaign, 'note', c.note,
      'status', case when c.status = 'active' and c.ends_at is not null and c.ends_at < now() then 'expired' else c.status end,
      'created_at', c.created_at, 'stripe_promo_id', c.stripe_promo_id, 'stripe_error', c.stripe_error,
      'uses', (select count(*) from public.code_redemptions r where r.code_id = any (c.ids)),
      'members', (select count(distinct r.user_id) from public.code_redemptions r where r.code_id = any (c.ids)),
      'attempts', (select count(*) from public.code_attempts a where a.code_id = any (c.ids)),
      'still_first_class', (select count(distinct r.user_id) from public.code_redemptions r where r.code_id = any (c.ids)
                            and public.entitlement(r.user_id) = 'first_class'),
      'last_used', (select max(r.redeemed_at) from public.code_redemptions r where r.code_id = any (c.ids))
    ) order by c.created_at desc) from c
  ), '[]'::jsonb);
end;
$$;

create or replace function public.admin_code_report(p_code uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_role text; v_ids uuid[]; v_batch text;
begin
  v_role := public.admin_guard('analyst');
  select batch into v_batch from public.promo_codes where id = p_code;
  select array_agg(id) into v_ids from public.promo_codes where id = p_code or (v_batch is not null and batch = v_batch);
  return jsonb_build_object(
    'codes', (select jsonb_agg(jsonb_build_object('id', c.id, 'code', c.code, 'status', c.status,
                'uses', (select count(*) from public.code_redemptions r where r.code_id = c.id)) order by c.code)
              from public.promo_codes c where c.id = any (v_ids)),
    'daily', coalesce((select jsonb_agg(jsonb_build_object('day', d, 'uses', n) order by d) from (
                select r.redeemed_at::date as d, count(*) as n from public.code_redemptions r where r.code_id = any (v_ids) group by 1) x), '[]'::jsonb),
    'attempts', coalesce((select jsonb_object_agg(result, n) from (
                select a.result, count(*) as n from public.code_attempts a where a.code_id = any (v_ids) group by 1) x), '{}'::jsonb),
    'redemptions', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'user_id', r.user_id,
                'email', case when v_role = 'analyst' then public.mask_email(u.email) else u.email end,
                'code', c.code, 'redeemed_at', r.redeemed_at, 'ended_at', r.ended_at,
                'plan_now', public.entitlement(r.user_id)) order by r.redeemed_at desc)
              from public.code_redemptions r join public.promo_codes c on c.id = r.code_id join auth.users u on u.id = r.user_id
              where r.code_id = any (v_ids)), '[]'::jsonb)
  );
end;
$$;

-- End one member's use of a code (their grant ends now)
create or replace function public.admin_end_redemption(p_redemption uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_grant uuid;
begin
  perform public.admin_guard('support');
  select grant_id into v_grant from public.code_redemptions where id = p_redemption and ended_at is null;
  if v_grant is null then raise exception 'That use has already ended.'; end if;
  perform public.admin_end_grant(v_grant, p_reason);
end;
$$;

-- ────────────────────────────────────────────────────────────
-- Member-facing: redeem a code (website). Rate limited; every attempt recorded.
-- ────────────────────────────────────────────────────────────
create or replace function public.redeem_code(p_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_entered text := upper(regexp_replace(coalesce(p_code, ''), '\s', '', 'g'));
  v_c public.promo_codes;
  v_used integer; v_mine integer; v_start timestamptz; v_end timestamptz; v_grant uuid; v_result text;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  if public.member_status(v_uid) in ('restricted', 'suspended', 'banned') then
    return jsonb_build_object('ok', false, 'result', 'not_eligible', 'message', 'This code can''t be used on this account.');
  end if;
  if (select count(*) from public.code_attempts where user_id = v_uid and result <> 'ok' and ts > now() - interval '1 hour') >= 5 then
    insert into public.code_attempts (user_id, code_entered, result) values (v_uid, left(v_entered, 40), 'rate_limited');
    return jsonb_build_object('ok', false, 'result', 'rate_limited', 'message', 'Too many tries. Try again in an hour.');
  end if;

  select * into v_c from public.promo_codes where code = v_entered;
  v_result := case
    when v_c.id is null then 'invalid'
    when v_c.status = 'paused' then 'paused'
    when v_c.status in ('ended', 'archived') or (v_c.ends_at is not null and v_c.ends_at < now()) then 'expired'
    when v_c.starts_at > now() then 'not_started'
    when v_c.audience = 'member' and v_c.audience_member is distinct from v_uid then 'not_eligible'
    when v_c.audience = 'new_members' and (select created_at from auth.users where id = v_uid) < now() - interval '30 days' then 'not_eligible'
    when v_c.kind = 'discount' then 'discount_at_checkout'
    else null end;

  if v_result is null then
    select count(*) into v_used from public.code_redemptions where code_id = v_c.id;
    select count(*) into v_mine from public.code_redemptions where code_id = v_c.id and user_id = v_uid;
    v_result := case
      when v_c.max_uses is not null and v_used >= v_c.max_uses then 'used_up'
      when v_mine >= v_c.per_member then 'already_used'
      when exists (select 1 from public.entitlement_grants g where g.user_id = v_uid and g.ended_at is null and g.ends_at is null) then 'already_member'
      else 'ok' end;
  end if;

  insert into public.code_attempts (user_id, code_entered, code_id, result) values (v_uid, left(v_entered, 40), v_c.id, v_result);
  if v_result <> 'ok' then
    return jsonb_build_object('ok', false, 'result', v_result, 'message', case v_result
      when 'invalid' then 'That code doesn''t exist. Check the spelling.'
      when 'paused' then 'That code is paused right now.'
      when 'expired' then 'That code has ended.'
      when 'not_started' then 'That code isn''t active yet.'
      when 'not_eligible' then 'That code isn''t available for this account.'
      when 'used_up' then 'That code has been fully used.'
      when 'already_used' then 'You''ve already used this code.'
      when 'already_member' then 'You already have First Class for life.'
      when 'discount_at_checkout' then 'This is a discount code. Enter it when you choose a plan.'
    end);
  end if;

  v_start := public.grant_start(v_uid);
  v_end := case when v_c.lifetime then null else v_start + make_interval(days => v_c.days) end;
  insert into public.entitlement_grants (user_id, source, code_id, reason, starts_at, ends_at)
  values (v_uid, 'code', v_c.id, 'code', v_start, v_end) returning id into v_grant;
  insert into public.code_redemptions (code_id, user_id, grant_id) values (v_c.id, v_uid, v_grant);
  return jsonb_build_object('ok', true, 'result', 'ok', 'until', v_end, 'lifetime', v_c.lifetime,
    'message', case when v_c.lifetime then 'First Class is yours for life.' else 'First Class until ' || to_char(v_end, 'FMMonth FMDD, YYYY') || '.' end);
end;
$$;
revoke all on function public.redeem_code(text) from public, anon;
grant execute on function public.redeem_code(text) to authenticated;

-- ────────────────────────────────────────────────────────────
-- Product usage
-- ────────────────────────────────────────────────────────────
create or replace function public.admin_usage(p_from date, p_to date, p_exclude_internal boolean default true)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_out jsonb;
begin
  perform public.admin_guard('analyst');
  with ev as (
    select e.*, public.entitlement(e.user_id) as plan from public.analytics_events e
    where e.ts >= p_from and e.ts < p_to + 1
      and (not p_exclude_internal or e.user_id not in (select user_id from public.internal_members))
  ),
  -- The old double-fire bug: count at most one sign_in per member per hour
  ev_clean as (
    select * from ev where event <> 'sign_in'
    union all
    select distinct on (user_id, date_trunc('hour', ts)) * from ev where event = 'sign_in'
  ),
  act as (select count(distinct user_id) as n,
            count(distinct user_id) filter (where plan = 'first_class') as fc,
            count(distinct user_id) filter (where plan = 'free') as free from ev)
  select jsonb_build_object(
    'active', (select n from act), 'active_free', (select free from act), 'active_first_class', (select fc from act),
    'sessions', (select count(distinct session_id) from ev),
    'features', coalesce((select jsonb_agg(x order by (x ->> 'users')::int desc, (x ->> 'uses')::int desc) from (
        select jsonb_build_object('event', event, 'uses', count(*), 'users', count(distinct user_id),
          'pct', round(100.0 * count(distinct user_id) / nullif((select n from act), 0)),
          'free_users', count(distinct user_id) filter (where plan = 'free'),
          'fc_users', count(distinct user_id) filter (where plan = 'first_class')) as x
        from ev_clean where event not in ('screen_view', 'active_time', 'app_error', 'ai_error', 'analytics_opt_in', 'sign_out')
        group by event) f), '[]'::jsonb),
    'screens', coalesce((select jsonb_agg(jsonb_build_object('path', s.path, 'views', s.views, 'users', s.users,
          'seconds', coalesce(t.seconds, 0)) order by s.views desc)
        from (select coalesce(props ->> 'path', screen) as path, count(*) as views, count(distinct user_id) as users
              from ev where event = 'screen_view' group by 1) s
        left join (select props ->> 'path' as path, sum((props ->> 'seconds')::numeric) as seconds
                   from ev where event = 'active_time' group by 1) t on t.path = s.path), '[]'::jsonb),
    'active_time', (select jsonb_build_object(
        'seconds', coalesce(sum((props ->> 'seconds')::numeric), 0),
        'sessions', count(distinct session_id),
        'per_session_min', round(coalesce(sum((props ->> 'seconds')::numeric), 0) / 60.0 / nullif(count(distinct session_id), 0), 1),
        'since', min(ts))
      from ev where event = 'active_time'),
    'errors', coalesce((select jsonb_agg(x order by (x ->> 'n')::int desc) from (
        select jsonb_build_object('event', event, 'kind', coalesce(props ->> 'error_type', props ->> 'feature', props ->> 'kind', 'other'),
          'screen', screen, 'version', app_version, 'platform', platform, 'n', count(*), 'users', count(distinct user_id),
          'last', max(ts)) as x
        from ev where event in ('app_error', 'ai_error') group by event, coalesce(props ->> 'error_type', props ->> 'feature', props ->> 'kind', 'other'), screen, app_version, platform) er), '[]'::jsonb),
    'platforms', coalesce((select jsonb_object_agg(coalesce(platform, 'unknown'), n) from (
        select platform, count(distinct user_id) as n from ev group by 1) p), '{}'::jsonb),
    'versions', coalesce((select jsonb_object_agg(coalesce(app_version, 'unknown'), n) from (
        select app_version, count(distinct user_id) as n from ev group by 1) p), '{}'::jsonb),
    'daily', coalesce((select jsonb_agg(jsonb_build_object('day', d, 'events', n, 'users', u) order by d) from (
        select ts::date as d, count(*) as n, count(distinct user_id) as u from ev_clean group by 1) x), '[]'::jsonb)
  ) into v_out;
  return v_out;
end;
$$;

-- System: function errors, AI usage by kind, audit trail
create or replace function public.admin_system(p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.admin_guard('analyst');
  return jsonb_build_object(
    'function_errors', coalesce((select jsonb_agg(jsonb_build_object('fn', fn, 'kind', kind, 'status', status, 'n', n, 'last', last) order by n desc)
      from (select fn, kind, status, count(*) as n, max(ts) as last from public.function_errors
            where ts >= p_from and ts < p_to + 1 group by 1, 2, 3) x), '[]'::jsonb),
    'ai_usage', coalesce((select jsonb_agg(jsonb_build_object('day', day, 'kind', kind, 'calls', calls, 'users', users) order by day)
      from (select day, kind, sum(calls) as calls, count(distinct user_id) as users from public.ai_usage
            where day between p_from and p_to group by 1, 2) x), '[]'::jsonb),
    'quota_hits', (select count(*) from public.analytics_events where event = 'ai_quota_hit' and ts >= p_from and ts < p_to + 1),
    'flags', coalesce((select jsonb_agg(jsonb_build_object('user_id', m.user_id, 'level', m.level, 'reason', m.reason, 'ends_at', m.ends_at))
      from public.member_moderation m where m.lifted_at is null and (m.ends_at is null or m.ends_at > now())), '[]'::jsonb),
    'audit', coalesce((select jsonb_agg(jsonb_build_object('action', a.action, 'target', a.target_user,
        'email', (select u.email from auth.users u where u.id = a.target_user), 'detail', a.detail, 'ts', a.ts) order by a.ts desc)
      from (select * from public.admin_audit order by ts desc limit 200) a), '[]'::jsonb),
    'admins', coalesce((select jsonb_agg(jsonb_build_object('email', u.email, 'role', a.role, 'added_at', a.added_at))
      from public.admins a join auth.users u on u.id = a.user_id), '[]'::jsonb)
  );
end;
$$;

-- Data export for one member (support / data requests)
create or replace function public.admin_member_export(p_user uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform public.admin_guard('support');
  perform public.admin_log('member.export', p_user);
  return jsonb_build_object(
    'exported_at', now(),
    'account', (select jsonb_build_object('id', u.id, 'email', u.email, 'created_at', u.created_at, 'last_sign_in_at', u.last_sign_in_at)
                from auth.users u where u.id = p_user),
    'profile', (select to_jsonb(p) - 'booking_email_token' from public.user_profiles p where p.id = p_user),
    'trips', coalesce((select jsonb_agg(to_jsonb(t)) from public.trips t where t.owner_id = p_user), '[]'::jsonb),
    'bookings', coalesce((select jsonb_agg(to_jsonb(b) - 'raw_email_id') from public.bookings b where b.created_by = p_user), '[]'::jsonb),
    'activities', coalesce((select jsonb_agg(to_jsonb(a)) from public.trip_activities a where a.created_by = p_user), '[]'::jsonb),
    'loyalty', coalesce((select jsonb_agg(to_jsonb(l)) from public.loyalty_cards l where l.user_id = p_user), '[]'::jsonb),
    'stats', (select to_jsonb(s) from public.user_stats s where s.user_id = p_user),
    'badges', coalesce((select jsonb_agg(to_jsonb(b)) from public.user_badges b where b.user_id = p_user), '[]'::jsonb),
    'grants', coalesce((select jsonb_agg(to_jsonb(g)) from public.entitlement_grants g where g.user_id = p_user), '[]'::jsonb)
  );
end;
$$;

-- Lock every admin_* function to signed-in callers (the guard does the rest)
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'admin\_%'
  loop
    execute format('revoke all on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;
-- Internal helpers stay server-only
revoke all on function public.admin_member_rows() from authenticated;
revoke all on function public.admin_log(text, uuid, jsonb) from authenticated;
revoke all on function public.grant_start(uuid) from public, anon, authenticated;
revoke all on function public.random_code(integer) from public, anon, authenticated;
-- Trigger functions aren't API endpoints; my_entitlement needs a signed-in caller
revoke all on function public.block_banned_signup() from public, anon, authenticated;
revoke all on function public.block_restricted_invites() from public, anon, authenticated;
revoke all on function public.my_entitlement() from public, anon;
grant execute on function public.my_entitlement() to authenticated;
