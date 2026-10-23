-- Device and setting codes from session_start events (src/lib/analytics.js), for Product → Devices and context
create or replace function public.admin_context(p_from date, p_to date, p_exclude_internal boolean default true)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.admin_guard('analyst');
  return (
    with s as (
      select e.props from public.analytics_events e
      where e.event = 'session_start' and e.ts >= p_from and e.ts < p_to + 1
        and (not p_exclude_internal or e.user_id not in (select user_id from public.internal_members))
    ),
    d as (
      select k, coalesce(props ->> k, 'unknown') as v from s, unnest(array['os', 'display', 'screen', 'lang', 'theme', 'net', 'tz']) k
      union all
      select 'return_gap', case when props ->> 'days_since' is null then 'First session on device'
        when (props ->> 'days_since')::int = 0 then 'Same day' when (props ->> 'days_since')::int <= 7 then 'Within a week'
        when (props ->> 'days_since')::int <= 30 then 'Within a month' else 'Over a month' end from s
    )
    select jsonb_build_object('sessions', (select count(*) from s),
      'dist', coalesce((select jsonb_object_agg(k, vals) from (
        select k, jsonb_agg(jsonb_build_object('value', v, 'n', n) order by n desc) as vals
        from (select k, v, count(*) as n from d group by 1, 2) x group by k) y), '{}'::jsonb))
  );
end;
$$;
revoke all on function public.admin_context(date, date, boolean) from public, anon;
grant execute on function public.admin_context(date, date, boolean) to authenticated;
