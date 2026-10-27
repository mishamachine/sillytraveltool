-- Stripe went live on 2026-10-25. Everything synced before that came from the Stripe sandbox, so purge it and make sure
-- cockpit reporting only ever reads rows in the site's current mode (stripe_sync.livemode), even if sandbox rows reappear.
-- Untouched: admin_audit, entitlement_grants, code_redemptions.

do $$
begin
  if (select livemode from public.stripe_sync where id = 1) is not true then
    raise exception 'stripe_sync.livemode is not true: run the live sync before purging sandbox rows';
  end if;
end $$;

-- 1. Sandbox rows (every stripe_* table has livemode; none are null)
delete from public.stripe_balance_txns    where livemode = false;
delete from public.stripe_charges         where livemode = false;
delete from public.stripe_checkouts       where livemode = false;
delete from public.stripe_customers       where livemode = false;
delete from public.stripe_invoices        where livemode = false;
delete from public.stripe_promotion_codes where livemode = false;
delete from public.stripe_subscriptions   where livemode = false;

-- 2. Sync state: the sync is a full pull each run; clearing last_sync lifts the throttle, and counts/balance were sandbox figures
update public.stripe_sync set last_sync = null, ok = null, error = null, counts = null, balance = null where id = 1;

-- 3. Cockpit codes pushed to the sandbox: those coupon and promotion-code ids don't exist live. Re-push on demand.
update public.promo_codes
  set stripe_coupon_id = null, stripe_promo_id = null, stripe_error = null,
      note = concat_ws(' · ', nullif(note, ''), 'Sandbox Stripe link cleared 2026-10-25; push to live from Codes'),
      updated_at = now()
  where stripe_coupon_id is not null or stripe_promo_id is not null or stripe_error is not null;

-- 4. Reporting functions that read stripe_* without a mode filter

create or replace function public.admin_code_stripe(p_code uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_promo text; v_code text; v_live boolean;
begin
  perform public.admin_guard('analyst');
  select livemode into v_live from public.stripe_sync where id = 1;
  select stripe_promo_id, code into v_promo, v_code from public.promo_codes where id = p_code;
  return jsonb_build_object(
    'promotion', (select to_jsonb(p) from public.stripe_promotion_codes p
                  where p.livemode = v_live and (p.id = v_promo or (v_promo is null and p.code = v_code)) limit 1),
    'checkouts', (select count(*) from public.stripe_checkouts c where c.livemode = v_live and c.promotion_code = v_promo and c.status = 'complete'),
    'revenue', (select coalesce(sum(amount_total), 0) from public.stripe_checkouts c where c.livemode = v_live and c.promotion_code = v_promo and c.status = 'complete')
             + (select coalesce(sum(amount_paid), 0) from public.stripe_invoices i where i.livemode = v_live and i.promotion_code = v_promo and i.billing_reason = 'subscription_cycle'),
    'discount_given', (select coalesce(sum(amount_discount), 0) from public.stripe_checkouts c where c.livemode = v_live and c.promotion_code = v_promo and c.status = 'complete')
                    + (select coalesce(sum(amount_discount), 0) from public.stripe_invoices i where i.livemode = v_live and i.promotion_code = v_promo and i.billing_reason = 'subscription_cycle'),
    'subscriptions_active', (select count(*) from public.stripe_subscriptions s where s.livemode = v_live and s.promotion_code = v_promo and s.status in ('active', 'trialing', 'past_due')),
    'subscriptions_canceled', (select count(*) from public.stripe_subscriptions s where s.livemode = v_live and s.promotion_code = v_promo and s.status = 'canceled')
  );
end;
$$;

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
      (select count(*) from public.stripe_checkouts where created > now() - interval '28 days'
         and livemode = (select livemode from public.stripe_sync where id = 1)) / 28.0 as checkouts
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
    'country', coalesce(tc.country, (select c.country from public.stripe_customers c where c.user_id = b.user_id and c.country is not null
                                       and c.livemode = (select livemode from public.stripe_sync where id = 1) limit 1)),
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
