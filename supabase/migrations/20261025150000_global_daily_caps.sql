-- Global daily caps (audit C1, docs/audit-pack/09_FABLE_AUDIT_REPORT.md): a project-wide ceiling on AI calls and
-- Google Maps calls per day, on top of the per-member limits, so a flood of sign-ups cannot run the bill up.
--   app_settings.global_limits {ai_daily, google_daily}   edited by the owner like the other limits (admin_setting_set)
--   public.global_usage (day, kind, calls)                 one row per day and kind ('ai', 'google')
--   consume_ai_quota / consume_api_call                    also count the project-wide row and refuse past the cap
-- The project-wide count lives in its own table, not as a zero-UUID row in ai_usage / api_usage: ai_usage and cost_rows
-- are summed by the cockpit's Money, Costs and Financials pages, and a second row per call would count every call twice.
-- Also lowers the default google_limits.per_user_daily from 5000 to 500.
-- NOT applied automatically: the owner applies it (supabase db push, or paste into the SQL editor).

insert into public.app_settings (key, value) values
  ('global_limits', '{"ai_daily": 3000, "google_daily": 20000}')
on conflict (key) do nothing;

-- The heaviest real day so far is a few hundred calls per member; 5000 per member was a switch that never tripped
update public.app_settings
set value = value || '{"per_user_daily": 500}'::jsonb, updated_at = now()
where key = 'google_limits' and coalesce((value ->> 'per_user_daily')::numeric, 5000) > 500;

-- The cockpit can edit global_limits (same number rules as the other limits): add it to admin_setting_set's key list,
-- patched in place so the rest of that function stays as it is
do $$
declare v_def text := pg_get_functiondef('public.admin_setting_set(text, jsonb)'::regprocedure);
begin
  if position('global_limits' in v_def) = 0 then
    v_def := replace(v_def, '''google_limits'', ''kill''', '''google_limits'', ''global_limits'', ''kill''');
    if position('global_limits' in v_def) = 0 then raise exception 'admin_setting_set anchor not found'; end if;
    execute v_def;
  end if;
end $$;

-- ── Project-wide counters ───────────────────────────────────────────────────────
create table if not exists public.global_usage (
  day date not null default current_date,
  kind text not null check (kind in ('ai', 'google')),
  calls integer not null default 0,
  primary key (day, kind)
);
alter table public.global_usage enable row level security; -- no policies: service role only
revoke all on public.global_usage from anon, authenticated;

-- ── AI: per-member limit, then the project-wide cap (guide sections count too: they cost the same) ──
create or replace function public.consume_ai_quota(p_user_id uuid, p_limit integer default 100, p_kind text default 'ai')
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_calls integer; v_limit integer; v_global integer; v_cap integer;
begin
  if coalesce((public.setting('kill') ->> 'ai_paused')::boolean, false) then return false; end if;
  if public.member_status(p_user_id) in ('restricted', 'suspended', 'banned') then return false; end if;
  v_limit := coalesce((public.setting('ai_limits') ->> case p_kind when 'guide' then 'guide_daily' else 'ai_daily' end)::integer, p_limit);
  insert into public.ai_usage (user_id, day, kind, calls) values (p_user_id, current_date, p_kind, 1)
  on conflict (user_id, day, kind) do update set calls = public.ai_usage.calls + 1
  returning calls into v_calls;
  if v_calls > v_limit then return false; end if;

  v_cap := coalesce((public.setting('global_limits') ->> 'ai_daily')::integer, 3000);
  insert into public.global_usage (day, kind, calls) values (current_date, 'ai', 1)
  on conflict (day, kind) do update set calls = public.global_usage.calls + 1
  returning calls into v_global;
  return v_global <= v_cap;
end;
$$;
revoke all on function public.consume_ai_quota(uuid, integer, text) from public, anon, authenticated;
grant execute on function public.consume_ai_quota(uuid, integer, text) to service_role;

-- ── Google (and other paid APIs): per-member cap, then the project-wide cap (Google only) ──
-- true = go ahead (and counted); false = paused, this member's daily cap is used up, or the project's is
create or replace function public.consume_api_call(p_user_id uuid, p_endpoint text, p_service text default 'google')
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_user uuid := coalesce(p_user_id, '00000000-0000-0000-0000-000000000000'); v_cap integer; v_used integer; v_global integer;
begin
  if p_service = 'google' and coalesce((public.setting('kill') ->> 'google_paused')::boolean, false) then return false; end if;
  v_cap := (public.setting('google_limits') ->> 'per_user_daily')::integer;
  if p_user_id is not null and v_cap is not null and p_service = 'google' then
    select coalesce(sum(calls), 0) into v_used from public.api_usage where day = current_date and user_id = v_user and service = p_service;
    if v_used >= v_cap then return false; end if;
  end if;
  if p_service = 'google' then
    insert into public.global_usage (day, kind, calls) values (current_date, 'google', 1)
    on conflict (day, kind) do update set calls = public.global_usage.calls + 1
    returning calls into v_global;
    if v_global > coalesce((public.setting('global_limits') ->> 'google_daily')::integer, 20000) then return false; end if;
  end if;
  insert into public.api_usage (day, user_id, service, endpoint, calls) values (current_date, v_user, p_service, left(coalesce(p_endpoint, 'other'), 40), 1)
  on conflict (day, user_id, service, endpoint) do update set calls = public.api_usage.calls + 1;
  return true;
end;
$$;
revoke all on function public.consume_api_call(uuid, text, text) from public, anon, authenticated;
grant execute on function public.consume_api_call(uuid, text, text) to service_role;
