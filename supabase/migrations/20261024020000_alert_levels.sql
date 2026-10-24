-- Owner request: no routine emails. The dashboard alert (a banner on every cockpit page + Needs you) fires at the normal
-- levels (cost_alert.daily_usd, flag_ai / flag_guide / flag_google); an email goes out only for a big spike:
-- email_usd for the day's spend, email_ai / email_guide / email_google for one member (PAYWALL_PLAN's runaway levels).

update public.app_settings
set value = jsonb_build_object('email_usd', 50, 'email_ai', 1000, 'email_guide', 400, 'email_google', 5000) || value
where key = 'cost_alert' and not value ? 'email_usd';

create or replace function public.cost_alert_run(p_test boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_cfg jsonb := public.setting('cost_alert');
  v_today numeric; v_email_at numeric := coalesce((v_cfg ->> 'email_usd')::numeric, 50);
  v_over boolean; v_flags jsonb;
begin
  select coalesce(sum(ai_usd + guide_usd + google_usd), 0) into v_today from public.cost_rows(current_date, current_date);
  -- Dashboard flags at the normal levels (shown in the banner and Needs you), whether or not an email follows
  insert into public.usage_flags (day, user_id, kind, calls)
    select current_date, f.user_id, f.kind, f.calls from public.usage_over_flags(current_date) f
    where exists (select 1 from auth.users u where u.id = f.user_id)
  on conflict (day, user_id, kind) do update set calls = excluded.calls;
  -- Emails only for members past the runaway levels
  select coalesce(jsonb_agg(jsonb_build_object('user_id', f.user_id, 'kind', f.kind, 'calls', f.calls, 'email', u.email)), '[]'::jsonb) into v_flags
    from public.usage_flags f left join auth.users u on u.id = f.user_id
    where f.notified_at is null and f.day >= current_date - 1
      and f.calls > coalesce((v_cfg ->> ('email_' || f.kind))::int, case f.kind when 'guide' then 400 when 'google' then 5000 else 1000 end);
  v_over := v_email_at > 0 and v_today > v_email_at and (v_cfg ->> 'last_sent_day') is distinct from current_date::text;
  return jsonb_build_object(
    'send', p_test or v_over or jsonb_array_length(v_flags) > 0,
    'test', p_test, 'over', v_over, 'today', round(v_today, 2), 'threshold', v_email_at, 'day', current_date,
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

-- The dashboard alert: cost over the daily level, kill switch on, members over the flag levels
create or replace function public.cost_needs_items()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_items jsonb := '[]'::jsonb;
  v_cfg jsonb := public.setting('cost_alert');
  v_today numeric; v_threshold numeric := (v_cfg ->> 'daily_usd')::numeric;
  v_email_at numeric := coalesce((v_cfg ->> 'email_usd')::numeric, 50);
  v_kill jsonb := public.setting('kill');
  r record;
begin
  select coalesce(sum(ai_usd + guide_usd + google_usd), 0) into v_today from public.cost_rows(current_date, current_date);
  if v_threshold > 0 and v_today > v_threshold then
    v_items := v_items || jsonb_build_object('key', 'cost_day:' || current_date, 'priority', 1, 'tab', 'money', 'kind', 'cost',
      'title', 'AI + Google spend today is about $' || to_char(v_today, 'FM999990.00'),
      'detail', 'Over your $' || to_char(v_threshold, 'FM999990.00') || ' alert level' ||
        case when v_today > v_email_at then ' and the $' || to_char(v_email_at, 'FM999990.00') || ' email level.'
             else '. You get an email only past $' || to_char(v_email_at, 'FM999990.00') || '.' end ||
        ' Money → Costs shows who and what; the kill switches are in Controls.');
  end if;
  if coalesce((v_kill ->> 'ai_paused')::boolean, false) or coalesce((v_kill ->> 'google_paused')::boolean, false) then
    v_items := v_items || jsonb_build_object('key', 'kill_on:' || current_date, 'priority', 1, 'tab', 'money', 'kind', 'kill',
      'title', concat_ws(' and ', case when (v_kill ->> 'ai_paused')::boolean then 'AI' end, case when (v_kill ->> 'google_paused')::boolean then 'Google Maps' end) || ' paused for everyone',
      'detail', 'The cost kill switch is on. Turn it off in Money → Controls when you''re ready.');
  end if;
  for r in
    select f.user_id, f.kind, f.calls, u.email from public.usage_over_flags(current_date) f join auth.users u on u.id = f.user_id
  loop
    v_items := v_items || jsonb_build_object('key', 'abuse:' || r.user_id || ':' || r.kind || ':' || current_date, 'priority', 1,
      'tab', 'members', 'member', r.user_id, 'kind', 'abuse',
      'title', r.email || ': ' || r.calls || ' ' || case r.kind when 'guide' then 'guide sections' when 'google' then 'Google calls' else 'AI calls' end || ' today',
      'detail', 'Far above any real day. Check for a script or a shared account; restrict or suspend from their page if needed.');
  end loop;
  return v_items;
end;
$$;
revoke all on function public.cost_needs_items() from public, anon, authenticated;

-- For the banner on every cockpit page (snoozed or done items in Needs you still show here: it is the loud one)
create or replace function public.admin_alerts()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.admin_guard('analyst');
  return jsonb_build_object('items', public.cost_needs_items());
end;
$$;
revoke all on function public.admin_alerts() from public, anon;
grant execute on function public.admin_alerts() to authenticated;
