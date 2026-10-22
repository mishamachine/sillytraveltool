-- Separate daily allowances per kind of AI work.
-- 'ai'    = the user's own requests (packing, import, HONK, phrases): AI_DAILY_LIMIT, default 100
-- 'guide' = city guide sections written into the shared cache for everyone: GUIDE_DAILY_LIMIT, default 40
-- Old callers pass two arguments and keep counting as 'ai'.

alter table public.ai_usage add column if not exists kind text not null default 'ai';
alter table public.ai_usage drop constraint if exists ai_usage_pkey;
alter table public.ai_usage add primary key (user_id, day, kind);

drop function if exists public.consume_ai_quota(uuid, integer);

create or replace function public.consume_ai_quota(p_user_id uuid, p_limit integer default 100, p_kind text default 'ai')
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_calls integer;
begin
  insert into public.ai_usage (user_id, day, kind, calls) values (p_user_id, current_date, p_kind, 1)
  on conflict (user_id, day, kind) do update set calls = public.ai_usage.calls + 1
  returning calls into v_calls;
  return v_calls <= p_limit;
end;
$$;
revoke all on function public.consume_ai_quota(uuid, integer, text) from public, anon, authenticated;
grant execute on function public.consume_ai_quota(uuid, integer, text) to service_role;
