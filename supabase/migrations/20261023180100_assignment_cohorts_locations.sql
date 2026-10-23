-- 1. Experiment assignment: each signed-in member gets a stable version per running test, recorded once; "exposed"
--    is set when the app actually shows it; the readout counts exposed people who did the metric event afterwards.
-- 2. Cohorts: saved member groups (rules or a fixed list), sized nightly so they can be tracked over time.
-- 3. Member location (country from the time zone of their first session, else their profile) and platforms (main first).
-- 4. The signed-in admin always appears in Members, marked as you.

-- ── 1. Assignment ──────────────────────────────────────────────────────────────────────────────────────────────────
alter table public.experiments add column if not exists metric_event text check (metric_event is null or metric_event ~ '^[a-z0-9_]{2,64}$');

create table if not exists public.experiment_assignments (
  experiment_id uuid not null references public.experiments (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  variant text not null,
  assigned_at timestamptz not null default now(),
  exposed_at timestamptz,
  primary key (experiment_id, user_id)
);
create index if not exists experiment_assignments_variant on public.experiment_assignments (experiment_id, variant);
alter table public.experiment_assignments enable row level security;
revoke all on public.experiment_assignments from anon, authenticated;

-- Stable 0..1 number from text (same input, same number, every time)
create or replace function public.unit_hash(p text)
returns numeric language sql immutable set search_path = '' as $$
  select ('x' || substr(md5(p), 1, 8))::bit(32)::bigint / 4294967296.0
$$;

-- The caller's versions for every running test: { key: variant }. Not in a test (outside its traffic share) = absent.
create or replace function public.my_experiments()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); e record; v_variant text; v_pick numeric; v_acc numeric; v_total numeric; x jsonb; v_out jsonb := '{}'::jsonb;
begin
  if v_uid is null then return '{}'::jsonb; end if;
  for e in select * from public.experiments where status = 'running' and key is not null loop
    select variant into v_variant from public.experiment_assignments where experiment_id = e.id and user_id = v_uid;
    if v_variant is null then
      if public.unit_hash(e.key || ':in:' || v_uid) >= e.traffic_share then continue; end if;
      select coalesce(sum((v ->> 'weight')::numeric), 0) into v_total from jsonb_array_elements(e.variants) v;
      if v_total <= 0 then continue; end if;
      v_pick := public.unit_hash(e.key || ':v:' || v_uid) * v_total;
      v_acc := 0;
      for x in select * from jsonb_array_elements(e.variants) loop
        v_acc := v_acc + (x ->> 'weight')::numeric;
        if v_pick < v_acc then v_variant := x ->> 'key'; exit; end if;
      end loop;
      insert into public.experiment_assignments (experiment_id, user_id, variant) values (e.id, v_uid, v_variant) on conflict do nothing;
    end if;
    v_out := v_out || jsonb_build_object(e.key, v_variant);
  end loop;
  return v_out;
end;
$$;
revoke all on function public.my_experiments() from public, anon;
grant execute on function public.my_experiments() to authenticated;

create or replace function public.experiment_exposed(p_key text)
returns void language sql security definer set search_path = '' as $$
  update public.experiment_assignments a set exposed_at = now()
  from public.experiments e
  where e.key = p_key and a.experiment_id = e.id and a.user_id = auth.uid() and a.exposed_at is null
$$;
revoke all on function public.experiment_exposed(text) from public, anon;
grant execute on function public.experiment_exposed(text) to authenticated;

-- Per version: assigned, exposed, converted (did metric_event after exposure, before the test ended)
create or replace function public.admin_experiment_readout(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare e public.experiments;
begin
  perform public.admin_guard('analyst');
  select * into e from public.experiments where id = p_id;
  return jsonb_build_object('metric_event', e.metric_event, 'variants', coalesce((
    select jsonb_agg(jsonb_build_object('variant', v.key, 'assigned', coalesce(s.assigned, 0), 'exposed', coalesce(s.exposed, 0),
      'converted', coalesce(s.converted, 0)) order by v.ord)
    from (select x ->> 'key' as key, ord from jsonb_array_elements(e.variants) with ordinality as t(x, ord)) v
    left join (
      select a.variant, count(*) as assigned, count(a.exposed_at) as exposed,
        count(*) filter (where a.exposed_at is not null and e.metric_event is not null and exists (
          select 1 from public.analytics_events ev where ev.user_id = a.user_id and ev.event = e.metric_event
            and ev.ts >= a.exposed_at and (e.ended_at is null or ev.ts <= e.ended_at))) as converted
      from public.experiment_assignments a
      where a.experiment_id = e.id and a.user_id not in (select user_id from public.internal_members)
      group by a.variant
    ) s on s.variant = v.key
  ), '[]'::jsonb));
end;
$$;
revoke all on function public.admin_experiment_readout(uuid) from public, anon;
grant execute on function public.admin_experiment_readout(uuid) to authenticated;

-- Save also takes metric_event; a test needs a key before it can run (made from its name)
do $$ declare d text; begin
  d := pg_get_functiondef('public.admin_experiment_save(jsonb)'::regprocedure);
  d := replace(d, '    design_chat = coalesce(p -> ''design_chat'', design_chat),',
    '    design_chat = coalesce(p -> ''design_chat'', design_chat),
    metric_event = case when p ? ''metric_event'' then nullif(p ->> ''metric_event'', '''') else metric_event end,');
  execute d;
  d := pg_get_functiondef('public.admin_experiment_status(uuid,text)'::regprocedure);
  d := replace(d, '  select status into v_old from public.experiments where id = p_id;',
    '  select status into v_old from public.experiments where id = p_id;
  if p_status = ''running'' then
    update public.experiments set key = left(regexp_replace(lower(name), ''[^a-z0-9]+'', ''_'', ''g''), 32) || ''_'' || substr(md5(id::text), 1, 4)
    where id = p_id and key is null;
  end if;');
  execute d;
end $$;

-- ── 3. Location and platforms (used by everything below) ──────────────────────────────────────────────────────
create or replace function public.member_rows_plus()
returns setof jsonb language sql stable security definer set search_path = '' as $$
  with first_tz as (
    select distinct on (user_id) user_id, props ->> 'tz' as tz
    from public.analytics_events where event = 'session_start' and props ? 'tz' order by user_id, ts
  ),
  plat as (
    select user_id, array_agg(p order by n desc, p) as platforms from (
      select user_id, case when platform = 'web' and display = 'installed' then 'web (installed)' else coalesce(platform, 'web') end as p,
        count(distinct session_id) as n
      from (select e.user_id, e.platform, e.session_id,
              max(case when e.event = 'session_start' then e.props ->> 'display' end) over (partition by e.session_id) as display
            from public.analytics_events e) s
      group by 1, 2
    ) x group by user_id
  )
  select (to_jsonb(b) || coalesce(to_jsonb(i) - 'user_id' - 'affluence_why', '{}'::jsonb) || jsonb_build_object(
    'id', b.user_id, 'name', b.display_name,
    'tz', coalesce(ft.tz, p.timezone),
    'country', coalesce(tc.country, (select c.country from public.stripe_customers c where c.user_id = b.user_id and c.country is not null limit 1)),
    'location_from', case when ft.tz is not null then 'first session' when p.timezone is not null then 'profile' end,
    'area', replace(split_part(coalesce(ft.tz, p.timezone), '/', -1), '_', ' '),
    'platforms', coalesce(to_jsonb(pl.platforms), '[]'::jsonb),
    'main_platform', pl.platforms[1],
    'platform_mix', array_to_string(array(select distinct split_part(x, ' ', 1) from unnest(pl.platforms) x order by 1), ' + '),
    'offers', coalesce(p.tailored_offers, true), 'emails_ok', coalesce(p.marketing_emails, false)
  )) - 'user_id' - 'display_name'
  from public.admin_member_rows() b
  left join public.admin_insight_rows() i on i.user_id = b.user_id
  left join public.user_profiles p on p.id = b.user_id
  left join first_tz ft on ft.user_id = b.user_id
  left join public.tz_country tc on tc.tz = coalesce(ft.tz, p.timezone)
  left join plat pl on pl.user_id = b.user_id
$$;
revoke all on function public.member_rows_plus() from public, anon, authenticated;

-- ── 4. Members list: includes you; analyst sees masked emails ──────────────────────────────────────────────────
create or replace function public.admin_members_plus(p_search text default null, p_exclude_internal boolean default true)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_role text; v_q text := nullif(btrim(lower(p_search)), '');
begin
  v_role := public.admin_guard('analyst');
  return coalesce((
    select jsonb_agg(m || jsonb_build_object('is_me', (m ->> 'id')::uuid = auth.uid(),
        'email', case when v_role = 'analyst' then public.mask_email(m ->> 'email') else m ->> 'email' end)
      order by ((m ->> 'id')::uuid = auth.uid()) desc, m ->> 'last_seen' desc nulls last)
    from public.member_rows_plus() m
    where (not p_exclude_internal or not (m ->> 'internal')::boolean or (m ->> 'id')::uuid = auth.uid())
      and (v_q is null or lower(m ->> 'email') like '%' || v_q || '%' or lower(coalesce(m ->> 'name', '')) like '%' || v_q || '%'
           or m ->> 'id' = v_q or (m -> 'tags') ? v_q)
  ), '[]'::jsonb);
end;
$$;

do $$ declare d text; begin
  d := pg_get_functiondef('public.admin_members(text,text,text,text,boolean)'::regprocedure);
  d := replace(d, 'where (not p_exclude_internal or not m.internal)', 'where (not p_exclude_internal or not m.internal or m.user_id = auth.uid())');
  execute d;
end $$;

-- ── 2. Cohorts ───────────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.cohorts (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  description text check (char_length(description) <= 500),
  kind text not null default 'rules' check (kind in ('rules', 'fixed')),
  rules jsonb not null default '{}'::jsonb,
  member_ids uuid[] not null default '{}',
  archived boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.cohorts enable row level security;
revoke all on public.cohorts from anon, authenticated;

create table if not exists public.cohort_snapshots (
  cohort_id uuid not null references public.cohorts (id) on delete cascade,
  day date not null default current_date,
  size integer not null, active_7d integer not null, paying integer not null, emails_ok integer not null,
  primary key (cohort_id, day)
);
alter table public.cohort_snapshots enable row level security;
revoke all on public.cohort_snapshots from anon, authenticated;

-- Does a member (member_rows_plus row) match a cohort's rules?
-- Keys: any member field (stage, plan, status, affluence, traveller_type, trip_style, planning_style, persona, channel,
-- source, country, main_platform, platform_mix …) = value ("Not known yet" = empty); region / tag / platform = contains;
-- joined_after, joined_before (dates), seen_within_days, min_trips, search; include_internal (default false).
create or replace function public.member_matches(m jsonb, r jsonb)
returns boolean language plpgsql stable set search_path = '' as $$
declare k text; v jsonb;
begin
  if not coalesce((r ->> 'include_internal')::boolean, false) and coalesce((m ->> 'internal')::boolean, false) then return false; end if;
  for k, v in select * from jsonb_each(r) loop
    if v is null or v = 'null'::jsonb or v = '""'::jsonb or k = 'include_internal' then continue; end if;
    if k = 'region' then if not coalesce((m -> 'regions') ? (v #>> '{}'), false) then return false; end if;
    elsif k = 'tag' then if not coalesce((m -> 'tags') ? (v #>> '{}'), false) then return false; end if;
    elsif k = 'platform' then if not exists (select 1 from jsonb_array_elements_text(coalesce(m -> 'platforms', '[]')) x where x like (v #>> '{}') || '%') then return false; end if;
    elsif k = 'joined_after' then if (m ->> 'joined')::timestamptz < (v #>> '{}')::date then return false; end if;
    elsif k = 'joined_before' then if (m ->> 'joined')::timestamptz >= (v #>> '{}')::date + 1 then return false; end if;
    elsif k = 'seen_within_days' then if coalesce((m ->> 'last_seen')::timestamptz, '-infinity') < now() - make_interval(days => (v #>> '{}')::int) then return false; end if;
    elsif k = 'min_trips' then if coalesce((m ->> 'trips')::int, 0) < (v #>> '{}')::int then return false; end if;
    elsif k = 'search' then if not (lower(coalesce(m ->> 'email', '')) like '%' || lower(v #>> '{}') || '%' or lower(coalesce(m ->> 'name', '')) like '%' || lower(v #>> '{}') || '%') then return false; end if;
    elsif (v #>> '{}') = 'Not known yet' then if coalesce(m ->> k, '') <> '' then return false; end if;
    elsif coalesce(m ->> k, '') <> (v #>> '{}') then return false;
    end if;
  end loop;
  return true;
end;
$$;

create or replace function public.cohort_rows(p_cohort uuid)
returns setof jsonb language sql stable security definer set search_path = '' as $$
  select m from public.member_rows_plus() m, public.cohorts c
  where c.id = p_cohort and case when c.kind = 'fixed' then (m ->> 'id')::uuid = any (c.member_ids) else public.member_matches(m, c.rules) end
$$;
revoke all on function public.cohort_rows(uuid) from public, anon, authenticated;

create or replace function public.snapshot_cohorts()
returns void language sql security definer set search_path = '' as $$
  insert into public.cohort_snapshots (cohort_id, day, size, active_7d, paying, emails_ok)
  select c.id, current_date, count(m),
    count(m) filter (where (m ->> 'last_seen')::timestamptz > now() - interval '7 days'),
    count(m) filter (where m ->> 'plan' = 'first_class'),
    count(m) filter (where (m ->> 'emails_ok')::boolean)
  from public.cohorts c left join lateral public.cohort_rows(c.id) m on true
  where not c.archived group by c.id
  on conflict (cohort_id, day) do update set size = excluded.size, active_7d = excluded.active_7d, paying = excluded.paying, emails_ok = excluded.emails_ok
$$;
revoke all on function public.snapshot_cohorts() from public, anon, authenticated;
select cron.unschedule(jobid) from cron.job where jobname = 'snapshot-cohorts';
select cron.schedule('snapshot-cohorts', '7 4 * * *', 'select public.snapshot_cohorts()');

create or replace function public.admin_cohorts()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.admin_guard('analyst');
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', c.id, 'name', c.name, 'description', c.description, 'kind', c.kind, 'rules', c.rules, 'fixed_count', cardinality(c.member_ids),
      'created_at', c.created_at, 'updated_at', c.updated_at,
      'now', (select jsonb_build_object('size', count(m), 'active_7d', count(m) filter (where (m ->> 'last_seen')::timestamptz > now() - interval '7 days'),
          'paying', count(m) filter (where m ->> 'plan' = 'first_class'), 'emails_ok', count(m) filter (where (m ->> 'emails_ok')::boolean),
          'avg_health', round(avg((m ->> 'health')::numeric))) from public.cohort_rows(c.id) m),
      'history', coalesce((select jsonb_agg(jsonb_build_object('day', s.day, 'size', s.size, 'active_7d', s.active_7d, 'paying', s.paying) order by s.day)
          from public.cohort_snapshots s where s.cohort_id = c.id and s.day > current_date - 90), '[]'::jsonb)
    ) order by c.created_at desc) from public.cohorts c where not c.archived), '[]'::jsonb);
end;
$$;

create or replace function public.admin_cohort_members(p_cohort uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_role text;
begin
  v_role := public.admin_guard('analyst');
  return coalesce((select jsonb_agg(m || jsonb_build_object('email', case when v_role = 'analyst' then public.mask_email(m ->> 'email') else m ->> 'email' end))
    from public.cohort_rows(p_cohort) m), '[]'::jsonb);
end;
$$;

-- Live preview of a rules cohort before saving
create or replace function public.admin_cohort_preview(p_rules jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.admin_guard('analyst');
  return (select jsonb_build_object('size', count(*), 'emails_ok', count(*) filter (where (m ->> 'emails_ok')::boolean))
    from public.member_rows_plus() m where public.member_matches(m, coalesce(p_rules, '{}'::jsonb)));
end;
$$;

create or replace function public.admin_cohort_save(p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid := nullif(p ->> 'id', '')::uuid;
begin
  perform public.admin_guard('support');
  if v_id is null then
    insert into public.cohorts (name, description, kind, rules, member_ids, created_by)
    values (p ->> 'name', p ->> 'description', coalesce(p ->> 'kind', 'rules'), coalesce(p -> 'rules', '{}'::jsonb),
      coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(p -> 'member_ids') x), '{}'), auth.uid())
    returning id into v_id;
  else
    update public.cohorts set name = coalesce(p ->> 'name', name), description = case when p ? 'description' then p ->> 'description' else description end,
      rules = coalesce(p -> 'rules', rules),
      member_ids = case when p ? 'member_ids' then coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(p -> 'member_ids') x), '{}') else member_ids end,
      archived = coalesce((p ->> 'archived')::boolean, archived), updated_at = now()
    where id = v_id;
  end if;
  perform public.admin_log('cohort.save', null, jsonb_build_object('cohort', v_id, 'name', p ->> 'name'));
  return v_id;
end;
$$;

-- Add or remove one member from a fixed cohort
create or replace function public.admin_cohort_member(p_cohort uuid, p_user uuid, p_add boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.admin_guard('support');
  update public.cohorts set member_ids = case when p_add then array(select distinct unnest(member_ids || p_user)) else array_remove(member_ids, p_user) end,
    updated_at = now() where id = p_cohort and kind = 'fixed';
  perform public.admin_log(case when p_add then 'cohort.add' else 'cohort.remove' end, p_user, jsonb_build_object('cohort', p_cohort));
end;
$$;

-- Audience on the same rows, plus where members are and what they use
create or replace function public.admin_audience(p_exclude_internal boolean default true)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.admin_guard('analyst');
  return (
    with m as (
      select x from public.member_rows_plus() x
      where (not p_exclude_internal or not (x ->> 'internal')::boolean) and coalesce((x ->> 'offers')::boolean, true)
    ),
    dist as (
      select k, x ->> k as v from m, unnest(array['traveller_type', 'affluence', 'planning_style', 'trip_style', 'channel', 'persona',
        'main_platform', 'platform_mix', 'plan', 'stage', 'source', 'country']) k
      union all
      select 'region', r from m, lateral unnest(case when jsonb_array_length(coalesce(x -> 'regions', '[]')) = 0 then array[null::text]
        else array(select jsonb_array_elements_text(x -> 'regions')) end) r
      union all
      select 'platform', p from m, lateral unnest(case when jsonb_array_length(coalesce(x -> 'platforms', '[]')) = 0 then array[null::text]
        else array(select jsonb_array_elements_text(x -> 'platforms')) end) p
    )
    select jsonb_build_object(
      'members', (select count(*) from m),
      'offers_off', (select count(*) from public.user_profiles p where p.tailored_offers is false),
      'with_trips', (select count(*) from m where (x ->> 'trips')::int > 0),
      'avg_trips_per_year', (select round(avg((x ->> 'trips_per_year')::numeric), 1) from m),
      'avg_trip_days', (select round(avg((x ->> 'avg_trip_days')::numeric), 1) from m),
      'avg_lead_days', (select round(avg((x ->> 'lead_days')::numeric)) from m),
      'avg_health', (select round(avg((x ->> 'health')::numeric)) from m),
      'premium_or_better_pct', (select round(100.0 * count(*) filter (where x ->> 'affluence' in ('Premium', 'Luxury')) / nullif(count(*) filter (where x ->> 'affluence' is not null), 0)) from m),
      'affluence_known', (select count(*) from m where x ->> 'affluence' is not null),
      'paying', (select count(*) from m where x ->> 'plan' = 'first_class'),
      'multi_platform', (select count(*) from m where jsonb_array_length(coalesce(x -> 'platforms', '[]')) > 1),
      'located', (select count(*) from m where x ->> 'country' is not null),
      'lifetime_value', (select coalesce(sum((x ->> 'lifetime_value')::numeric), 0) from m),
      'dist', (select jsonb_object_agg(k, vals) from (
        select k, jsonb_agg(jsonb_build_object('value', coalesce(v, 'Not known yet'), 'n', n) order by n desc) as vals
        from (select k, v, count(*) as n from dist group by k, v) z group by k) y)
    )
  );
end;
$$;

do $$
declare f text;
begin
  foreach f in array array['public.admin_cohorts()', 'public.admin_cohort_members(uuid)', 'public.admin_cohort_preview(jsonb)',
                           'public.admin_cohort_save(jsonb)', 'public.admin_cohort_member(uuid, uuid, boolean)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
