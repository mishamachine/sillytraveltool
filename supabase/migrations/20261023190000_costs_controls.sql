-- Money → Costs and Controls (docs/ADMIN_PLAN.md section 8, docs/PAYWALL_PLAN.md section 10).
-- app_settings: server-side switches the owner changes in the cockpit without a deploy.
-- api_usage + consume_api_call: every Google Maps call is counted per user/day/endpoint and can be paused or capped.
-- consume_ai_quota now honours kill.ai_paused and ai_limits. admin_costs: estimated spend from usage × cost_rates.
-- Cost alerts: Needs-you items + the cost-alert Edge Function, run hourly by pg_cron (token in Vault).

create extension if not exists pg_net;

-- ── Settings ────────────────────────────────────────────────────────────────────
create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
alter table public.app_settings enable row level security;
revoke all on public.app_settings from anon, authenticated;

insert into public.app_settings (key, value) values
  ('founders_offer', '{"active": true}'),
  ('free_limits', '{"upcoming_trips": 2, "reservations_per_trip": 5, "email_imports": 5}'),
  ('ai_limits', '{"ai_daily": 100, "guide_daily": 40}'),
  ('google_limits', '{"per_user_daily": 5000}'),
  ('kill', '{"ai_paused": false, "google_paused": false}'),
  ('cost_alert', '{"daily_usd": 10, "flag_ai": 300, "flag_guide": 150, "flag_google": 1500, "last_sent_day": null}'),
  ('cost_rates', '{"ai_call": 0.0015, "guide_section": 0.004,
    "google": {"autocomplete": 0.00283, "place_details": 0.017, "text_search": 0.032, "nearby": 0.032, "photo": 0.007,
               "routes": 0.005, "geocode": 0.005, "timezone": 0.005, "static_map": 0.002, "other": 0.005},
    "supabase_monthly": 25, "hosting_monthly": 4}')
on conflict (key) do nothing;

create or replace function public.setting(p_key text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce((select value from public.app_settings where key = p_key), '{}'::jsonb)
$$;
revoke all on function public.setting(text) from public, anon, authenticated;

-- Safe flags for the app and paywall (anyone, signed in or not)
create or replace function public.public_settings()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'founders_offer', jsonb_build_object('active', coalesce((public.setting('founders_offer') ->> 'active')::boolean, true)),
    'free_limits', public.setting('free_limits'))
$$;
revoke all on function public.public_settings() from public;
grant execute on function public.public_settings() to anon, authenticated;

create or replace function public.admin_settings()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.admin_guard('analyst');
  return coalesce((select jsonb_object_agg(key, value || jsonb_build_object('_updated_at', updated_at)) from public.app_settings), '{}'::jsonb);
end;
$$;

-- Merges p_value into the setting (so the cockpit can send one field). Owner only, audited.
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
  -- Numbers must be numbers ≥ 0; switches must be true/false
  for k, v in select * from jsonb_each(p_value) loop
    if p_key in ('founders_offer', 'kill') and jsonb_typeof(v) <> 'boolean' then raise exception 'bad_value' using errcode = '22023'; end if;
    if p_key not in ('founders_offer', 'kill') and not (
      (jsonb_typeof(v) = 'number' and (v #>> '{}')::numeric >= 0)
      or (p_key = 'cost_rates' and k = 'google' and jsonb_typeof(v) = 'object'
          and not exists (select 1 from jsonb_each(v) g where jsonb_typeof(g.value) <> 'number' or (g.value #>> '{}')::numeric < 0))
    ) then raise exception 'bad_value' using errcode = '22023'; end if;
  end loop;
  select value into v_old from public.app_settings where key = p_key;
  v_new := coalesce(v_old, '{}'::jsonb) || case when p_key = 'cost_rates' and p_value ? 'google'
    then jsonb_set(p_value, '{google}', coalesce(v_old -> 'google', '{}'::jsonb) || (p_value -> 'google')) else p_value end;
  insert into public.app_settings (key, value, updated_at, updated_by) values (p_key, v_new, now(), auth.uid())
  on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = auth.uid();
  perform public.admin_log('setting_' || p_key, null, jsonb_build_object('from', v_old, 'to', v_new));
  return v_new;
end;
$$;
revoke all on function public.admin_settings() from public, anon;
revoke all on function public.admin_setting_set(text, jsonb) from public, anon;
grant execute on function public.admin_settings() to authenticated;
grant execute on function public.admin_setting_set(text, jsonb) to authenticated;

-- ── AI: kill switch + limits from settings (p_limit from the function env is the fallback) ──
create or replace function public.consume_ai_quota(p_user_id uuid, p_limit integer default 100, p_kind text default 'ai')
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_calls integer; v_limit integer;
begin
  if coalesce((public.setting('kill') ->> 'ai_paused')::boolean, false) then return false; end if;
  if public.member_status(p_user_id) in ('restricted', 'suspended', 'banned') then return false; end if;
  v_limit := coalesce((public.setting('ai_limits') ->> case p_kind when 'guide' then 'guide_daily' else 'ai_daily' end)::integer, p_limit);
  insert into public.ai_usage (user_id, day, kind, calls) values (p_user_id, current_date, p_kind, 1)
  on conflict (user_id, day, kind) do update set calls = public.ai_usage.calls + 1
  returning calls into v_calls;
  return v_calls <= v_limit;
end;
$$;
revoke all on function public.consume_ai_quota(uuid, integer, text) from public, anon, authenticated;
grant execute on function public.consume_ai_quota(uuid, integer, text) to service_role;

-- ── Google (and other paid APIs): count every call ─────────────────────────────
-- user_id is the zero UUID when a call has no member (e.g. a cron job)
create table if not exists public.api_usage (
  day date not null default current_date,
  user_id uuid not null,
  service text not null default 'google',
  endpoint text not null,
  calls integer not null default 0,
  primary key (day, user_id, service, endpoint)
);
create index if not exists api_usage_user_day on public.api_usage (user_id, day);
alter table public.api_usage enable row level security;
revoke all on public.api_usage from anon, authenticated;

-- true = go ahead (and counted); false = paused or this member's daily cap is used up
create or replace function public.consume_api_call(p_user_id uuid, p_endpoint text, p_service text default 'google')
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_user uuid := coalesce(p_user_id, '00000000-0000-0000-0000-000000000000'); v_cap integer; v_used integer;
begin
  if p_service = 'google' and coalesce((public.setting('kill') ->> 'google_paused')::boolean, false) then return false; end if;
  v_cap := (public.setting('google_limits') ->> 'per_user_daily')::integer;
  if p_user_id is not null and v_cap is not null and p_service = 'google' then
    select coalesce(sum(calls), 0) into v_used from public.api_usage where day = current_date and user_id = v_user and service = p_service;
    if v_used >= v_cap then return false; end if;
  end if;
  insert into public.api_usage (day, user_id, service, endpoint, calls) values (current_date, v_user, p_service, left(coalesce(p_endpoint, 'other'), 40), 1)
  on conflict (day, user_id, service, endpoint) do update set calls = public.api_usage.calls + 1;
  return true;
end;
$$;
revoke all on function public.consume_api_call(uuid, text, text) from public, anon, authenticated;
grant execute on function public.consume_api_call(uuid, text, text) to service_role;

-- ── Abuse flags (PAYWALL_PLAN section 10): one row per member, day and kind ──────
create table if not exists public.usage_flags (
  day date not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('ai', 'guide', 'google')),
  calls integer not null,
  created_at timestamptz not null default now(),
  notified_at timestamptz,
  primary key (day, user_id, kind)
);
alter table public.usage_flags enable row level security;
revoke all on public.usage_flags from anon, authenticated;

-- ── Estimated cost per member per day (usage × cost_rates) ──────────────────────
create or replace function public.cost_rows(p_from date, p_to date)
returns table (day date, user_id uuid, ai_calls integer, guide_calls integer, google_calls integer,
               ai_usd numeric, guide_usd numeric, google_usd numeric)
language sql stable security definer set search_path = '' as $$
  with r as (select public.setting('cost_rates') as v),
  ai as (
    select a.day, a.user_id, sum(a.calls) filter (where a.kind <> 'guide')::int as ai, sum(a.calls) filter (where a.kind = 'guide')::int as guide
    from public.ai_usage a where a.day between p_from and p_to group by 1, 2),
  g as (
    select u.day, u.user_id, sum(u.calls)::int as calls,
      sum(u.calls * coalesce((r.v -> 'google' ->> u.endpoint)::numeric, (r.v -> 'google' ->> 'other')::numeric, 0.005)) as usd
    from public.api_usage u, r where u.service = 'google' and u.day between p_from and p_to group by 1, 2)
  select coalesce(ai.day, g.day), coalesce(ai.user_id, g.user_id),
    coalesce(ai.ai, 0), coalesce(ai.guide, 0), coalesce(g.calls, 0),
    coalesce(ai.ai, 0) * coalesce((r.v ->> 'ai_call')::numeric, 0),
    coalesce(ai.guide, 0) * coalesce((r.v ->> 'guide_section')::numeric, 0),
    coalesce(g.usd, 0)
  from ai full join g on g.day = ai.day and g.user_id = ai.user_id, r
$$;
revoke all on function public.cost_rows(date, date) from public, anon, authenticated;

-- Volatile (not stable): it fills a temp table so the usage is read once
create or replace function public.admin_costs(p_from date, p_to date, p_exclude_internal boolean default true)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_role text; v_live boolean; v_rates jsonb := public.setting('cost_rates');
  v_days integer := greatest(1, p_to - p_from + 1);
  v_fixed numeric; v_variable numeric; v_variable_all numeric; v_active integer; v_paying integer; v_gross numeric; v_refunded numeric;
  v_today numeric;
begin
  v_role := public.admin_guard('analyst');
  select livemode into v_live from public.stripe_sync where id = 1;
  create temp table if not exists _cost on commit drop as select * from public.cost_rows(p_from, p_to) limit 0;
  truncate _cost;
  insert into _cost select * from public.cost_rows(p_from, p_to);
  v_fixed := round((coalesce((v_rates ->> 'supabase_monthly')::numeric, 0) + coalesce((v_rates ->> 'hosting_monthly')::numeric, 0)) * v_days / 30.0, 2);
  select coalesce(sum(ai_usd + guide_usd + google_usd), 0) into v_variable_all from _cost;
  select coalesce(sum(ai_usd + guide_usd + google_usd), 0) into v_variable from _cost c
    where not (p_exclude_internal and c.user_id in (select user_id from public.internal_members));
  select count(distinct e.user_id) into v_active from public.analytics_events e
    where e.ts >= p_from and e.ts < p_to + 1 and e.user_id is not null
      and not (p_exclude_internal and e.user_id in (select user_id from public.internal_members));
  select count(*) into v_paying from auth.users u
    where public.entitlement(u.id) = 'first_class' and not (p_exclude_internal and u.id in (select user_id from public.internal_members));
  select coalesce(sum(amount) filter (where paid), 0) / 100.0, coalesce(sum(amount_refunded), 0) / 100.0 into v_gross, v_refunded
    from public.stripe_charges where livemode is not distinct from v_live and created >= p_from and created < p_to + 1;
  select coalesce(sum(ai_usd + guide_usd + google_usd), 0) into v_today from public.cost_rows(current_date, current_date);

  return jsonb_build_object(
    'rates', v_rates,
    'days', v_days,
    'variable', round(v_variable, 2),
    'variable_all', round(v_variable_all, 2),
    'fixed', v_fixed,
    'total', round(v_variable + v_fixed, 2),
    'ai_usd', round((select coalesce(sum(ai_usd), 0) from _cost c where not (p_exclude_internal and c.user_id in (select user_id from public.internal_members))), 2),
    'guide_usd', round((select coalesce(sum(guide_usd), 0) from _cost c where not (p_exclude_internal and c.user_id in (select user_id from public.internal_members))), 2),
    'google_usd', round((select coalesce(sum(google_usd), 0) from _cost c where not (p_exclude_internal and c.user_id in (select user_id from public.internal_members))), 2),
    'ai_calls', (select coalesce(sum(ai_calls), 0) from _cost c where not (p_exclude_internal and c.user_id in (select user_id from public.internal_members))),
    'guide_calls', (select coalesce(sum(guide_calls), 0) from _cost c where not (p_exclude_internal and c.user_id in (select user_id from public.internal_members))),
    'google_calls', (select coalesce(sum(google_calls), 0) from _cost c where not (p_exclude_internal and c.user_id in (select user_id from public.internal_members))),
    'active_members', v_active,
    'paying_members', v_paying,
    'per_active', case when v_active > 0 then round(v_variable / v_active, 4) end,
    'per_paying', case when v_paying > 0 then round((v_variable + v_fixed) / v_paying, 2) end,
    'gross', v_gross,
    'refunded', v_refunded,
    'margin', round(v_gross - v_refunded - v_variable_all - v_fixed, 2),
    'today', round(v_today, 2),
    'today_threshold', (public.setting('cost_alert') ->> 'daily_usd')::numeric,
    'daily', coalesce((select jsonb_agg(jsonb_build_object('day', d.day, 'ai', round(d.ai, 4), 'guide', round(d.guide, 4), 'google', round(d.google, 4),
        'total', round(d.ai + d.guide + d.google, 4), 'ai_calls', d.ai_calls, 'guide_calls', d.guide_calls, 'google_calls', d.google_calls) order by d.day)
      from (select c.day, sum(ai_usd) ai, sum(guide_usd) guide, sum(google_usd) google,
              sum(c.ai_calls) ai_calls, sum(c.guide_calls) guide_calls, sum(c.google_calls) google_calls
            from _cost c where not (p_exclude_internal and c.user_id in (select user_id from public.internal_members)) group by 1) d), '[]'::jsonb),
    'google_endpoints', coalesce((select jsonb_agg(jsonb_build_object('endpoint', x.endpoint, 'calls', x.calls,
        'usd', round(x.calls * coalesce((v_rates -> 'google' ->> x.endpoint)::numeric, (v_rates -> 'google' ->> 'other')::numeric, 0.005), 2)) order by x.calls desc)
      from (select u.endpoint, sum(u.calls)::int calls from public.api_usage u
            where u.service = 'google' and u.day between p_from and p_to
              and not (p_exclude_internal and u.user_id in (select user_id from public.internal_members)) group by 1) x), '[]'::jsonb),
    'top_members', coalesce((select jsonb_agg(t order by t.usd desc) from (
        select c.user_id, case when v_role = 'analyst' then public.mask_email(u.email) else u.email end as email,
          c.user_id = '00000000-0000-0000-0000-000000000000' as system,
          c.user_id in (select user_id from public.internal_members) as internal,
          public.entitlement(c.user_id) as plan,
          sum(c.ai_calls)::int ai_calls, sum(c.guide_calls)::int guide_calls, sum(c.google_calls)::int google_calls,
          round(sum(c.ai_usd + c.guide_usd + c.google_usd), 2) usd,
          max(c.ai_calls) max_ai_day, max(c.google_calls) max_google_day
        from _cost c left join auth.users u on u.id = c.user_id
        where not (p_exclude_internal and c.user_id in (select user_id from public.internal_members))
        group by c.user_id, u.email order by 9 desc limit 25) t), '[]'::jsonb),
    'flags', coalesce((select jsonb_agg(jsonb_build_object('day', f.day, 'user_id', f.user_id, 'kind', f.kind, 'calls', f.calls,
        'email', case when v_role = 'analyst' then public.mask_email(u.email) else u.email end) order by f.day desc, f.calls desc)
      from public.usage_flags f left join auth.users u on u.id = f.user_id where f.day between p_from and p_to), '[]'::jsonb),
    'last_24h', jsonb_build_object(
      'ai_members', (select count(distinct a.user_id) from public.ai_usage a where a.day >= current_date - 1),
      'ai_calls', (select coalesce(sum(a.calls), 0) from public.ai_usage a where a.day >= current_date - 1),
      'google_members', (select count(distinct a.user_id) from public.api_usage a where a.day >= current_date - 1 and a.service = 'google'),
      'google_calls', (select coalesce(sum(a.calls), 0) from public.api_usage a where a.day >= current_date - 1 and a.service = 'google'))
  );
end;
$$;
revoke all on function public.admin_costs(date, date, boolean) from public, anon;
grant execute on function public.admin_costs(date, date, boolean) to authenticated;

-- Members over the abuse levels today (also used by Needs you)
create or replace function public.usage_over_flags(p_day date default current_date)
returns table (user_id uuid, kind text, calls integer)
language sql stable security definer set search_path = '' as $$
  with s as (select public.setting('cost_alert') v),
  t as (
    select a.user_id, case a.kind when 'guide' then 'guide' else 'ai' end as kind, sum(a.calls)::int as calls
    from public.ai_usage a where a.day = p_day group by 1, 2
    union all
    select u.user_id, 'google', sum(u.calls)::int from public.api_usage u
    where u.day = p_day and u.service = 'google' and u.user_id <> '00000000-0000-0000-0000-000000000000' group by 1)
  select t.user_id, t.kind, t.calls from t, s
  where t.calls > coalesce((s.v ->> ('flag_' || t.kind))::int, case t.kind when 'guide' then 150 when 'google' then 1500 else 300 end)
$$;
revoke all on function public.usage_over_flags(date) from public, anon, authenticated;

-- ── Cost alert email (cost-alert Edge Function; hourly pg_cron, or the owner's "Send test") ──
-- The cron token is generated here and kept in Vault; it never appears in code.
do $$ begin
  if not exists (select 1 from vault.secrets where name = 'cost_alert_token') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'cost_alert_token', 'pg_cron → cost-alert Edge Function');
  end if;
end $$;

create or replace function public.cost_alert_token_ok(p_token text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(length(p_token) >= 32 and p_token = (select decrypted_secret from vault.decrypted_secrets where name = 'cost_alert_token'), false)
$$;
revoke all on function public.cost_alert_token_ok(text) from public, anon, authenticated;
grant execute on function public.cost_alert_token_ok(text) to service_role;

-- What to email now: today's estimate over the threshold (once a day) and new abuse flags (once per member/day/kind).
create or replace function public.cost_alert_run(p_test boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_cfg jsonb := public.setting('cost_alert');
  v_today numeric; v_threshold numeric := (v_cfg ->> 'daily_usd')::numeric;
  v_over boolean; v_flags jsonb;
begin
  select coalesce(sum(ai_usd + guide_usd + google_usd), 0) into v_today from public.cost_rows(current_date, current_date);
  insert into public.usage_flags (day, user_id, kind, calls)
    select current_date, f.user_id, f.kind, f.calls from public.usage_over_flags(current_date) f
    where exists (select 1 from auth.users u where u.id = f.user_id)
  on conflict (day, user_id, kind) do update set calls = excluded.calls;
  select coalesce(jsonb_agg(jsonb_build_object('user_id', f.user_id, 'kind', f.kind, 'calls', f.calls, 'email', u.email)), '[]'::jsonb) into v_flags
    from public.usage_flags f left join auth.users u on u.id = f.user_id where f.notified_at is null and f.day >= current_date - 1;
  v_over := v_threshold is not null and v_threshold > 0 and v_today > v_threshold
            and (v_cfg ->> 'last_sent_day') is distinct from current_date::text;
  return jsonb_build_object(
    'send', p_test or v_over or jsonb_array_length(v_flags) > 0,
    'test', p_test, 'over', v_over, 'today', round(v_today, 2), 'threshold', v_threshold, 'day', current_date,
    'flags', v_flags,
    'to', coalesce((select jsonb_agg(u.email) from public.admins a join auth.users u on u.id = a.user_id where a.role = 'owner'), '[]'::jsonb),
    'breakdown', (select jsonb_build_object('ai', round(coalesce(sum(ai_usd), 0), 2), 'guide', round(coalesce(sum(guide_usd), 0), 2),
                    'google', round(coalesce(sum(google_usd), 0), 2), 'ai_calls', coalesce(sum(ai_calls), 0),
                    'guide_calls', coalesce(sum(guide_calls), 0), 'google_calls', coalesce(sum(google_calls), 0))
                  from public.cost_rows(current_date, current_date)));
end;
$$;
revoke all on function public.cost_alert_run(boolean) from public, anon, authenticated;
grant execute on function public.cost_alert_run(boolean) to service_role;

-- Called after the email went out
create or replace function public.cost_alert_sent(p_over boolean, p_flags jsonb, p_test boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_over then
    update public.app_settings set value = value || jsonb_build_object('last_sent_day', current_date::text) where key = 'cost_alert';
  end if;
  update public.usage_flags f set notified_at = now()
    from jsonb_array_elements(coalesce(p_flags, '[]'::jsonb)) x
    where f.user_id = (x ->> 'user_id')::uuid and f.kind = x ->> 'kind' and f.notified_at is null;
  insert into public.admin_audit (admin_id, action, detail)
    values (null, case when p_test then 'cost_alert_test' else 'cost_alert_sent' end,
            jsonb_build_object('over', p_over, 'flags', jsonb_array_length(coalesce(p_flags, '[]'::jsonb))));
end;
$$;
revoke all on function public.cost_alert_sent(boolean, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.cost_alert_sent(boolean, jsonb, boolean) to service_role;

select cron.unschedule('cost-alert') where exists (select 1 from cron.job where jobname = 'cost-alert');
select cron.schedule('cost-alert', '5 * * * *', $cron$
  select net.http_post(
    url := 'https://swywrvbuswylvqlktsym.supabase.co/functions/v1/cost-alert',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-token', (select decrypted_secret from vault.decrypted_secrets where name = 'cost_alert_token')),
    body := '{}'::jsonb, timeout_milliseconds := 20000)
$cron$);

-- Keep api_usage and usage_flags inside the 25-month retention like other usage data
create or replace function public.purge_old_costs()
returns void language sql security definer set search_path = '' as $$
  delete from public.api_usage where day < current_date - interval '25 months';
  delete from public.usage_flags where day < current_date - interval '25 months';
$$;
revoke all on function public.purge_old_costs() from public, anon, authenticated;
select cron.unschedule('purge-old-costs') where exists (select 1 from cron.job where jobname = 'purge-old-costs');
select cron.schedule('purge-old-costs', '27 3 * * *', 'select public.purge_old_costs()');

-- ── Needs you: cost over the daily alert level, members over the abuse levels ──────
create or replace function public.cost_needs_items()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_items jsonb := '[]'::jsonb;
  v_today numeric; v_threshold numeric := (public.setting('cost_alert') ->> 'daily_usd')::numeric;
  v_kill jsonb := public.setting('kill');
  r record;
begin
  select coalesce(sum(ai_usd + guide_usd + google_usd), 0) into v_today from public.cost_rows(current_date, current_date);
  if v_threshold > 0 and v_today > v_threshold then
    v_items := v_items || jsonb_build_object('key', 'cost_day:' || current_date, 'priority', 1, 'tab', 'money',
      'title', 'AI + Google spend today is about $' || to_char(v_today, 'FM999990.00'),
      'detail', 'Over your $' || to_char(v_threshold, 'FM999990.00') || ' alert level. Money → Costs shows who and what; the kill switches are in Controls.');
  end if;
  if coalesce((v_kill ->> 'ai_paused')::boolean, false) or coalesce((v_kill ->> 'google_paused')::boolean, false) then
    v_items := v_items || jsonb_build_object('key', 'kill_on:' || current_date, 'priority', 1, 'tab', 'money',
      'title', concat_ws(' and ', case when (v_kill ->> 'ai_paused')::boolean then 'AI' end, case when (v_kill ->> 'google_paused')::boolean then 'Google Maps' end) || ' paused for everyone',
      'detail', 'The cost kill switch is on. Turn it off in Money → Controls when you''re ready.');
  end if;
  for r in
    select f.user_id, f.kind, f.calls, u.email from public.usage_over_flags(current_date) f join auth.users u on u.id = f.user_id
  loop
    v_items := v_items || jsonb_build_object('key', 'abuse:' || r.user_id || ':' || r.kind || ':' || current_date, 'priority', 1,
      'tab', 'members', 'member', r.user_id,
      'title', r.email || ': ' || r.calls || ' ' || case r.kind when 'guide' then 'guide sections' when 'google' then 'Google calls' else 'AI calls' end || ' today',
      'detail', 'Far above any real day. Check for a script or a shared account; restrict or suspend from their page if needed.');
  end loop;
  return v_items;
end;
$$;
revoke all on function public.cost_needs_items() from public, anon, authenticated;

-- admin_needs_you: add the cost items just before it returns (patched in place so the rules above it stay as they are)
do $$
declare v_def text := pg_get_functiondef('public.admin_needs_you()'::regprocedure);
begin
  if position('cost_needs_items' in v_def) = 0 then
    v_def := replace(v_def, E'  return jsonb_build_object(\n    ''items''',
      E'  v_items := v_items || public.cost_needs_items();\n\n  return jsonb_build_object(\n    ''items''');
    if position('cost_needs_items' in v_def) = 0 then raise exception 'admin_needs_you anchor not found'; end if;
    execute v_def;
  end if;
end $$;
