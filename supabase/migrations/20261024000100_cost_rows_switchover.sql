-- cost_rows: on the day token logging started, calls made before it have no tokens, so that day counts whichever is
-- higher (token cost or calls × flat rate); later days use tokens only, earlier days the flat estimate.
create or replace function public.cost_rows(p_from date, p_to date)
returns table (day date, user_id uuid, ai_calls integer, guide_calls integer, google_calls integer,
               ai_usd numeric, guide_usd numeric, google_usd numeric)
language sql stable security definer set search_path = '' as $$
  with r as (select public.setting('cost_rates') as v),
  first_day as (select min(c.day) as d from public.ai_calls c),
  ai as (
    select a.day, a.user_id, sum(a.calls) filter (where a.kind <> 'guide')::int as ai, sum(a.calls) filter (where a.kind = 'guide')::int as guide
    from public.ai_usage a where a.day between p_from and p_to group by 1, 2),
  tok as (
    select c.day, coalesce(c.user_id, '00000000-0000-0000-0000-000000000000') as user_id,
      sum(c.usd) filter (where c.feature is distinct from 'generate-guide') as ai_usd,
      sum(c.usd) filter (where c.feature = 'generate-guide') as guide_usd
    from public.ai_calls c where c.day between p_from and p_to group by 1, 2),
  g as (
    select u.day, u.user_id, sum(u.calls)::int as calls,
      sum(u.calls * coalesce((r.v -> 'google' ->> u.endpoint)::numeric, (r.v -> 'google' ->> 'other')::numeric, 0.005)) as usd
    from public.api_usage u, r where u.service = 'google' and u.day between p_from and p_to group by 1, 2),
  keys as (select day, user_id from ai union select day, user_id from tok union select day, user_id from g)
  select k.day, k.user_id,
    coalesce(ai.ai, 0), coalesce(ai.guide, 0), coalesce(g.calls, 0),
    case when k.day > f.d then coalesce(tok.ai_usd, 0)
         when k.day = f.d then greatest(coalesce(tok.ai_usd, 0), coalesce(ai.ai, 0) * coalesce((r.v ->> 'ai_call')::numeric, 0))
         else coalesce(ai.ai, 0) * coalesce((r.v ->> 'ai_call')::numeric, 0) end,
    case when k.day > f.d then coalesce(tok.guide_usd, 0)
         when k.day = f.d then greatest(coalesce(tok.guide_usd, 0), coalesce(ai.guide, 0) * coalesce((r.v ->> 'guide_section')::numeric, 0))
         else coalesce(ai.guide, 0) * coalesce((r.v ->> 'guide_section')::numeric, 0) end,
    coalesce(g.usd, 0)
  from keys k cross join r cross join first_day f
  left join ai on ai.day = k.day and ai.user_id = k.user_id
  left join tok on tok.day = k.day and tok.user_id = k.user_id
  left join g on g.day = k.day and g.user_id = k.user_id
$$;
revoke all on function public.cost_rows(date, date) from public, anon, authenticated;
