-- Experiments (docs/ADMIN_PLAN.md section 7): design with the AI, queue, prioritise, check overlap with what's live.
-- Assignment and exposure (who sees which version) come next; this is the planning and record side, so tests run
-- in priority order and every result lands in the archive.

create table if not exists public.experiments (
  id uuid primary key default gen_random_uuid(),
  key text unique check (key is null or key ~ '^[a-z0-9_]{2,40}$'),
  name text not null check (char_length(name) <= 120),
  hypothesis text check (char_length(hypothesis) <= 2000),
  surface text not null default 'paywall' check (surface in ('paywall', 'website', 'onboarding', 'email', 'trip_planning', 'explore', 'pricing', 'other')),
  audience text not null default 'everyone' check (char_length(audience) <= 200),
  primary_metric text check (char_length(primary_metric) <= 200),
  guardrail text check (char_length(guardrail) <= 200),
  variants jsonb not null default '[{"key":"control","name":"Control","weight":50},{"key":"b","name":"Variant B","weight":50}]'::jsonb,
  baseline_rate numeric check (baseline_rate is null or (baseline_rate > 0 and baseline_rate < 1)),
  min_effect numeric check (min_effect is null or (min_effect > 0 and min_effect < 10)), -- relative lift, 0.2 = +20%
  traffic_share numeric not null default 1 check (traffic_share > 0 and traffic_share <= 1),
  ice_impact integer check (ice_impact between 1 and 10),
  ice_confidence integer check (ice_confidence between 1 and 10),
  ice_ease integer check (ice_ease between 1 and 10),
  queue_position integer,
  status text not null default 'draft' check (status in ('draft', 'queued', 'running', 'paused', 'done', 'archived')),
  started_at timestamptz,
  ended_at timestamptz,
  result text check (char_length(result) <= 4000),
  decision text check (decision is null or decision in ('ship', 'drop', 'inconclusive', 'iterate')),
  learnings text check (char_length(learnings) <= 4000),
  design_chat jsonb not null default '[]'::jsonb,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists experiments_status on public.experiments (status, queue_position);
alter table public.experiments enable row level security;
revoke all on public.experiments from anon, authenticated;

-- Daily people reaching each surface (last 28 days), for "how long will this take"
create or replace function public.experiment_traffic()
returns jsonb language sql stable security definer set search_path = '' as $$
  with ev as (
    select * from public.analytics_events
    where ts > now() - interval '28 days' and user_id not in (select user_id from public.internal_members)
  ),
  d as (
    select
      (select count(distinct (user_id::text || ts::date::text)) from ev) / 28.0 as active,
      (select count(*) from auth.users where created_at > now() - interval '28 days'
         and id not in (select user_id from public.internal_members)) / 28.0 as signups,
      (select count(distinct (user_id::text || ts::date::text)) from ev where event = 'paywall_view') / 28.0 as paywall,
      (select count(distinct (user_id::text || ts::date::text)) from ev where screen like 'trip%') / 28.0 as trip,
      (select count(distinct (user_id::text || ts::date::text)) from ev where screen in ('explore', 'guide', 'goosey') or event in ('guide_viewed', 'honk_used')) / 28.0 as explore,
      (select count(*) from public.user_profiles where marketing_emails) as opted_in,
      (select count(*) from public.stripe_checkouts where created > now() - interval '28 days') / 28.0 as checkouts
  )
  select jsonb_build_object(
    'paywall', case when paywall > 0 then paywall else active * 0.3 end, 'paywall_estimated', paywall = 0,
    'pricing', case when checkouts > 0 then checkouts else active * 0.05 end, 'pricing_estimated', checkouts = 0,
    'website', null, 'website_note', 'needs GA4 visits (build step 3)',
    'onboarding', signups, 'trip_planning', trip, 'explore', explore, 'other', active,
    'email', opted_in, 'email_note', 'people opted in; one send reaches them once',
    'active', active, 'signups', signups
  ) from d
$$;
revoke all on function public.experiment_traffic() from public, anon, authenticated;

create or replace function public.admin_experiments()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.admin_guard('analyst');
  return jsonb_build_object(
    'experiments', coalesce((select jsonb_agg(to_jsonb(e) - 'created_by' order by
        case e.status when 'running' then 0 when 'paused' then 1 when 'queued' then 2 when 'draft' then 3 when 'done' then 4 else 5 end,
        e.queue_position nulls last, e.created_at desc) from public.experiments e), '[]'::jsonb),
    'traffic', public.experiment_traffic()
  );
end;
$$;

create or replace function public.admin_experiment_save(p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid := nullif(p ->> 'id', '')::uuid; v_status text;
begin
  perform public.admin_guard('owner');
  if v_id is null then
    insert into public.experiments (name, created_by) values (coalesce(nullif(p ->> 'name', ''), 'Untitled experiment'), auth.uid()) returning id into v_id;
  end if;
  select status into v_status from public.experiments where id = v_id;
  update public.experiments set
    key = case when p ? 'key' then nullif(lower(p ->> 'key'), '') else key end,
    name = coalesce(nullif(p ->> 'name', ''), name),
    hypothesis = case when p ? 'hypothesis' then p ->> 'hypothesis' else hypothesis end,
    surface = coalesce(nullif(p ->> 'surface', ''), surface),
    audience = coalesce(nullif(p ->> 'audience', ''), audience),
    primary_metric = case when p ? 'primary_metric' then p ->> 'primary_metric' else primary_metric end,
    guardrail = case when p ? 'guardrail' then p ->> 'guardrail' else guardrail end,
    variants = coalesce(p -> 'variants', variants),
    baseline_rate = case when p ? 'baseline_rate' then (p ->> 'baseline_rate')::numeric else baseline_rate end,
    min_effect = case when p ? 'min_effect' then (p ->> 'min_effect')::numeric else min_effect end,
    traffic_share = coalesce((p ->> 'traffic_share')::numeric, traffic_share),
    ice_impact = case when p ? 'ice_impact' then (p ->> 'ice_impact')::int else ice_impact end,
    ice_confidence = case when p ? 'ice_confidence' then (p ->> 'ice_confidence')::int else ice_confidence end,
    ice_ease = case when p ? 'ice_ease' then (p ->> 'ice_ease')::int else ice_ease end,
    design_chat = coalesce(p -> 'design_chat', design_chat),
    result = case when p ? 'result' then p ->> 'result' else result end,
    decision = case when p ? 'decision' then nullif(p ->> 'decision', '') else decision end,
    learnings = case when p ? 'learnings' then p ->> 'learnings' else learnings end,
    updated_at = now()
  where id = v_id;
  perform public.admin_log(case when v_status is null then 'experiment.create' else 'experiment.save' end, null, jsonb_build_object('experiment', v_id));
  return v_id;
end;
$$;

-- Status moves: queue (to the end of the line), start, pause, end, archive, back to draft
create or replace function public.admin_experiment_status(p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_old text;
begin
  perform public.admin_guard('owner');
  if p_status not in ('draft', 'queued', 'running', 'paused', 'done', 'archived') then raise exception 'bad_status'; end if;
  select status into v_old from public.experiments where id = p_id;
  update public.experiments set status = p_status, updated_at = now(),
    queue_position = case when p_status = 'queued' and v_old <> 'queued'
                          then coalesce((select max(queue_position) from public.experiments where status = 'queued'), 0) + 1
                          when p_status = 'queued' then queue_position else null end,
    started_at = case when p_status = 'running' and started_at is null then now() else started_at end,
    ended_at = case when p_status = 'done' then now() else ended_at end
  where id = p_id;
  -- Close the gap in the queue
  if v_old = 'queued' and p_status <> 'queued' then
    with q as (select id, row_number() over (order by queue_position, created_at) as n from public.experiments where status = 'queued')
    update public.experiments e set queue_position = q.n from q where e.id = q.id;
  end if;
  perform public.admin_log('experiment.' || p_status, null, jsonb_build_object('experiment', p_id, 'from', v_old));
end;
$$;

-- New queue order (array of ids, first = next to run)
create or replace function public.admin_experiment_reorder(p_ids uuid[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.admin_guard('owner');
  update public.experiments e set queue_position = x.n, updated_at = now()
  from unnest(p_ids) with ordinality as x(id, n) where e.id = x.id and e.status = 'queued';
  perform public.admin_log('experiment.reorder', null, jsonb_build_object('order', p_ids));
end;
$$;

create or replace function public.admin_experiment_delete(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.admin_guard('owner');
  delete from public.experiments where id = p_id and status = 'draft';
  perform public.admin_log('experiment.delete_draft', null, jsonb_build_object('experiment', p_id));
end;
$$;

do $$
declare f text;
begin
  foreach f in array array['public.admin_experiments()', 'public.admin_experiment_save(jsonb)', 'public.admin_experiment_status(uuid, text)',
                           'public.admin_experiment_reorder(uuid[])', 'public.admin_experiment_delete(uuid)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- Needs you: "No conversion test running" now points at the queue
do $$ declare d text; begin
  d := pg_get_functiondef('public.admin_needs_you()'::regprocedure);
  d := replace(d, $q$  v_items := v_items || jsonb_build_object('key', 'no_test:' || v_week, 'priority', 2, 'tab', 'experiments',
    'title', 'No conversion test running', 'detail', 'The experiments engine is build step 4. Until then, note test ideas in Up next.');$q$,
  $q$  if not exists (select 1 from public.experiments where status = 'running') then
    v_items := v_items || jsonb_build_object('key', 'no_test:' || v_week, 'priority', 2, 'tab', 'experiments',
      'title', 'No conversion test running',
      'detail', case when (select count(*) from public.experiments where status = 'queued') > 0
        then 'Next in the queue: ' || (select name from public.experiments where status = 'queued' order by queue_position limit 1) || '. Start it from Experiments.'
        else 'Design one with Goose in Experiments and queue it.' end);
  end if;$q$);
  execute d;
end $$;
