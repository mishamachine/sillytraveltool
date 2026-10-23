-- Web billing straight through Stripe (no RevenueCat on the web). stripe-webhook writes stripe_subscriptions /
-- stripe_charges (tables from 20261023120100_stripe_feed); these functions read them.
-- Only rows in the site's current Stripe mode count (stripe_sync.livemode, set by the webhook and the cockpit sync),
-- so sandbox purchases stop granting First Class once live keys are in.

-- Paying for First Class on the web right now: a live subscription or a paid, unrefunded lifetime purchase
create or replace function public.stripe_first_class(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  with mode as (select livemode from public.stripe_sync where id = 1)
  select exists (
    select 1 from public.stripe_subscriptions s
    where s.user_id = p_user and s.status in ('active', 'trialing', 'past_due')
      and (s.current_period_end is null or s.current_period_end > now())
      and s.livemode is not distinct from coalesce((select livemode from mode), s.livemode)
  ) or exists (
    select 1 from public.stripe_charges c
    where c.user_id = p_user and c.plan = 'lifetime' and c.paid and not c.refunded and not coalesce(c.disputed, false)
      and c.livemode is not distinct from coalesce((select livemode from mode), c.livemode)
  )
$$;
revoke all on function public.stripe_first_class(uuid) from public, anon, authenticated;
grant execute on function public.stripe_first_class(uuid) to service_role;

create or replace function public.entitlement(p_user uuid)
returns text language sql stable security definer set search_path = '' as $$
  select case when exists (
    select 1 from public.entitlement_grants g
    where g.user_id = p_user and g.ended_at is null and g.starts_at <= now() and (g.ends_at is null or g.ends_at > now())
  ) or public.stripe_first_class(p_user) then 'first_class' else 'free' end
$$;
revoke all on function public.entitlement(uuid) from public, anon, authenticated;
grant execute on function public.entitlement(uuid) to service_role;

-- The member's own plan for the website (/upgrade/, /redeem/): plan, until (null = lifetime or free), and the web
-- purchase behind it so the page can offer Manage billing.
create or replace function public.my_entitlement()
returns jsonb language sql stable security definer set search_path = '' as $$
  with mode as (select livemode from public.stripe_sync where id = 1),
  grants as (
    select g.ends_at from public.entitlement_grants g
    where g.user_id = auth.uid() and g.ended_at is null and g.starts_at <= now() and (g.ends_at is null or g.ends_at > now())
  ),
  sub as (
    select s.status, s.current_period_end, s.cancel_at_period_end from public.stripe_subscriptions s
    where s.user_id = auth.uid() and s.status in ('active', 'trialing', 'past_due')
      and (s.current_period_end is null or s.current_period_end > now())
      and s.livemode is not distinct from coalesce((select livemode from mode), s.livemode)
    order by s.current_period_end desc nulls first limit 1
  ),
  lifetime as (
    select exists (
      select 1 from public.stripe_charges c
      where c.user_id = auth.uid() and c.plan = 'lifetime' and c.paid and not c.refunded and not coalesce(c.disputed, false)
        and c.livemode is not distinct from coalesce((select livemode from mode), c.livemode)
    ) as yes
  )
  select jsonb_build_object(
    'plan', public.entitlement(auth.uid()),
    'until', case
      when (select yes from lifetime) or exists (select 1 from grants where ends_at is null) then null
      else greatest((select max(ends_at) from grants), (select current_period_end from sub)) end,
    'web', jsonb_build_object(
      'lifetime', (select yes from lifetime),
      'subscription', (select jsonb_build_object('status', status, 'period_end', current_period_end, 'canceling', cancel_at_period_end) from sub),
      'customer', exists (select 1 from public.stripe_customers cu where cu.user_id = auth.uid()
                          and cu.livemode is not distinct from coalesce((select livemode from mode), cu.livemode))
    )
  )
$$;
revoke all on function public.my_entitlement() from public, anon;
grant execute on function public.my_entitlement() to authenticated;
