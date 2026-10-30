-- Admin cockpit: member usage activity, for abuse watch. 'AI attempts' = the ai_usage counters, which are bumped before the limit check,
-- so refused attempts are included.
-- One read-only function, no new tables. Reads ai_usage (per-day quota counters, kinds ai / guide / inbox), api_usage (Google calls),
-- bookings (imports), function_errors (errors and the inbox_cap_hit / free_import_blocked kinds) and auth.users (joined, last sign-in).
-- Flags, per member, over the window:
--   over_ai_limit       any day where the 'ai' or 'guide' counter went past app_settings.ai_limits (ai_daily 100, guide_daily 40).
--                       The counter is bumped before the check, so a value above the limit means a call was refused.
--   inbox_cap           an inbox_cap_hit error row (a real per-inbox cap hit; inbox_quota_refused rows, for the kill switch, member status or
--                       the project-wide cap, are counted separately and do not set this flag), or any day where the 'inbox' counter went past ai_limits.inbox_daily (default 30)
--   free_import_blocked a free_import_blocked error row
--   far_above_median    AI calls in the window are at least 5 x the median of members who made any AI call, and at least 50
create or replace function public.admin_usage_activity(p_days integer default 7)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_days integer := least(greatest(coalesce(p_days, 7), 1), 90);
  v_from date;
  v_ai integer := coalesce((public.setting('ai_limits') ->> 'ai_daily')::integer, 100);
  v_guide integer := coalesce((public.setting('ai_limits') ->> 'guide_daily')::integer, 40);
  v_inbox integer := coalesce((public.setting('ai_limits') ->> 'inbox_daily')::integer, 30);
begin
  perform public.admin_guard('support');
  v_from := current_date - (v_days - 1);
  return (
    with ai as (
      select user_id,
        sum(calls)::int as calls,
        coalesce(sum(calls) filter (where day = current_date), 0)::int as today,
        bool_or(case kind when 'inbox' then false when 'guide' then calls > v_guide else calls > v_ai end) as over_ai,
        count(*) filter (where kind = 'inbox' and calls > v_inbox)::int as inbox_days_over
      from public.ai_usage where day >= v_from group by user_id),
    bk as (
      select created_by as user_id,
        count(distinct raw_email_id) filter (where source = 'email_import' and raw_email_id is not null)::int as forwarded,
        count(*) filter (where source = 'email_import' and raw_email_id is null)::int as in_app
      from public.bookings where created_at >= v_from group by created_by),
    gg as (
      select user_id, sum(calls)::int as calls from public.api_usage
      where service = 'google' and day >= v_from group by user_id),
    fe as (
      select user_id,
        count(*) filter (where kind is distinct from 'inbox_cap_hit' and kind is distinct from 'free_import_blocked'
          and kind is distinct from 'inbox_quota_refused')::int as errors,
        count(*) filter (where kind = 'inbox_cap_hit')::int as inbox_cap_hits,
        count(*) filter (where kind = 'free_import_blocked')::int as import_blocks,
        count(*) filter (where kind = 'inbox_quota_refused')::int as inbox_refusals
      from public.function_errors where ts >= v_from and user_id is not null group by user_id),
    seen as (select user_id, max(ts) as ts from public.analytics_events group by user_id),
    base as (
      select u.id, u.email::text as email, u.created_at as joined,
        greatest(s.ts, u.last_sign_in_at) as last_seen,
        public.entitlement(u.id) as plan,
        (im.user_id is not null) as internal,
        coalesce(ai.calls, 0) as ai_calls, coalesce(ai.today, 0) as ai_today,
        coalesce(bk.forwarded, 0) as forwarded, coalesce(bk.in_app, 0) as in_app,
        coalesce(gg.calls, 0) as google_calls,
        coalesce(fe.errors, 0) as errors, coalesce(fe.inbox_cap_hits, 0) as inbox_cap_hits,
        coalesce(ai.inbox_days_over, 0) as inbox_days_over, coalesce(fe.import_blocks, 0) as import_blocks, coalesce(fe.inbox_refusals, 0) as inbox_refusals,
        coalesce(ai.over_ai, false) as over_ai
      from auth.users u
      left join ai on ai.user_id = u.id left join bk on bk.user_id = u.id left join gg on gg.user_id = u.id
      left join fe on fe.user_id = u.id left join seen s on s.user_id = u.id
      left join public.internal_members im on im.user_id = u.id
      where u.deleted_at is null),
    med as (select percentile_cont(0.5) within group (order by ai_calls) as m from base where ai_calls > 0),
    flagged as (
      select b.*, array_remove(array[
        case when b.over_ai then 'over_ai_limit' end,
        case when b.inbox_cap_hits > 0 or b.inbox_days_over > 0 then 'inbox_cap' end,
        case when b.import_blocks > 0 then 'free_import_blocked' end,
        case when b.ai_calls >= greatest(50, 5 * coalesce((select m from med), 0)) then 'far_above_median' end
      ], null) as flags
      from base b)
    select jsonb_build_object(
      'days', v_days, 'from', v_from,
      'limits', jsonb_build_object('ai_daily', v_ai, 'guide_daily', v_guide, 'inbox_daily', v_inbox),
      'median_ai_calls', (select m from med),
      'far_above_rule', 'AI calls in the window at least 5 x the median of members with any AI call, and at least 50',
      'members', coalesce((select jsonb_agg(jsonb_build_object(
          'user_id', f.id, 'email', f.email, 'joined', f.joined, 'last_seen', f.last_seen, 'plan', f.plan, 'internal', f.internal,
          'ai_calls', f.ai_calls, 'ai_today', f.ai_today, 'forwarded_imports', f.forwarded, 'in_app_imports', f.in_app,
          'google_calls', f.google_calls, 'errors', f.errors, 'inbox_cap_hits', f.inbox_cap_hits, 'inbox_days_over', f.inbox_days_over,
          'import_blocks', f.import_blocks, 'inbox_refusals', f.inbox_refusals, 'flags', to_jsonb(f.flags)) order by f.ai_calls desc, f.email) from flagged f), '[]'::jsonb),
      'recent', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'kind', r.kind, 'fn', r.fn, 'ts', r.ts, 'user_id', r.user_id, 'email', r.email) order by r.ts desc)
        from (select e.id, e.kind, e.fn, e.ts, e.user_id, u.email::text as email
              from public.function_errors e left join auth.users u on u.id = e.user_id
              where e.kind in ('inbox_cap_hit', 'inbox_quota_refused', 'free_import_blocked') order by e.ts desc limit 25) r), '[]'::jsonb)
    )
  );
end;
$$;
revoke all on function public.admin_usage_activity(integer) from public, anon;
grant execute on function public.admin_usage_activity(integer) to authenticated;
