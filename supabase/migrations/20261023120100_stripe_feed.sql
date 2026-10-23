-- Stripe feed for the cockpit (docs/ADMIN_PLAN.md, Money). The admin-stripe Edge Function copies Stripe objects
-- here (service role); the cockpit reads them through admin_* functions. Amounts are in the smallest currency unit.
-- user_id is matched from metadata.user_id, else the customer's email.

create table if not exists public.stripe_customers (
  id text primary key, livemode boolean not null, email text, user_id uuid references auth.users (id) on delete set null,
  name text, country text, created timestamptz, delinquent boolean, synced_at timestamptz not null default now()
);
create table if not exists public.stripe_subscriptions (
  id text primary key, livemode boolean not null, customer text, user_id uuid references auth.users (id) on delete set null,
  status text, price_id text, lookup_key text, amount integer, currency text, interval text,
  current_period_end timestamptz, cancel_at_period_end boolean, canceled_at timestamptz, ended_at timestamptz,
  promotion_code text, created timestamptz, synced_at timestamptz not null default now()
);
create table if not exists public.stripe_charges (
  id text primary key, livemode boolean not null, customer text, user_id uuid references auth.users (id) on delete set null,
  amount integer, amount_refunded integer, currency text, status text, paid boolean, refunded boolean, disputed boolean,
  failure_code text, plan text, invoice text, payment_intent text, created timestamptz, synced_at timestamptz not null default now()
);
create table if not exists public.stripe_checkouts (
  id text primary key, livemode boolean not null, customer text, user_id uuid references auth.users (id) on delete set null,
  mode text, status text, payment_status text, amount_total integer, amount_discount integer, currency text,
  promotion_code text, plan text, created timestamptz, synced_at timestamptz not null default now()
);
create table if not exists public.stripe_invoices (
  id text primary key, livemode boolean not null, customer text, subscription text, user_id uuid references auth.users (id) on delete set null,
  status text, amount_paid integer, amount_discount integer, currency text, promotion_code text, billing_reason text,
  created timestamptz, synced_at timestamptz not null default now()
);
create table if not exists public.stripe_promotion_codes (
  id text primary key, livemode boolean not null, code text, coupon_id text, active boolean, times_redeemed integer,
  max_redemptions integer, expires_at timestamptz, percent_off numeric, amount_off integer, currency text, duration text,
  first_time_only boolean, created timestamptz, synced_at timestamptz not null default now()
);
create table if not exists public.stripe_sync (
  id integer primary key default 1 check (id = 1), livemode boolean, last_sync timestamptz, ok boolean, error text, counts jsonb
);
create index if not exists stripe_charges_created on public.stripe_charges (created desc);
create index if not exists stripe_subs_user on public.stripe_subscriptions (user_id);

do $$
declare t text;
begin
  foreach t in array array['stripe_customers', 'stripe_subscriptions', 'stripe_charges', 'stripe_checkouts', 'stripe_invoices',
                           'stripe_promotion_codes', 'stripe_sync'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- Discount codes made in the cockpit are mirrored to Stripe (coupon + promotion code with the same code)
alter table public.promo_codes
  add column if not exists stripe_coupon_id text,
  add column if not exists stripe_promo_id text,
  add column if not exists stripe_error text;

-- First Class also comes from a live Stripe subscription or a paid lifetime purchase (metadata plan=lifetime)
create or replace function public.entitlement(p_user uuid)
returns text language sql stable security definer set search_path = '' as $$
  select case when exists (
    select 1 from public.entitlement_grants g
    where g.user_id = p_user and g.ended_at is null and g.starts_at <= now() and (g.ends_at is null or g.ends_at > now())
  ) or exists (
    select 1 from public.stripe_subscriptions s
    where s.user_id = p_user and s.status in ('active', 'trialing', 'past_due') and (s.current_period_end is null or s.current_period_end > now())
  ) or exists (
    select 1 from public.stripe_charges c
    where c.user_id = p_user and c.plan = 'lifetime' and c.paid and not c.refunded and not coalesce(c.disputed, false)
  ) then 'first_class' else 'free' end
$$;
revoke all on function public.entitlement(uuid) from public, anon, authenticated;
grant execute on function public.entitlement(uuid) to service_role;

-- Money summary for the cockpit
create or replace function public.admin_stripe(p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_role text; v_live boolean;
begin
  v_role := public.admin_guard('analyst');
  select livemode into v_live from public.stripe_sync where id = 1;
  return jsonb_build_object(
    'sync', (select to_jsonb(s) - 'id' from public.stripe_sync s where s.id = 1),
    'customers', (select count(*) from public.stripe_customers where livemode is not distinct from v_live),
    'matched_customers', (select count(*) from public.stripe_customers where livemode is not distinct from v_live and user_id is not null),
    'active_subscriptions', (select count(*) from public.stripe_subscriptions where livemode is not distinct from v_live and status in ('active', 'trialing', 'past_due')),
    'past_due', (select count(*) from public.stripe_subscriptions where livemode is not distinct from v_live and status = 'past_due'),
    'canceling', (select count(*) from public.stripe_subscriptions where livemode is not distinct from v_live and status = 'active' and cancel_at_period_end),
    'arr', (select coalesce(sum(case interval when 'year' then amount when 'month' then amount * 12 else 0 end), 0)
            from public.stripe_subscriptions where livemode is not distinct from v_live and status in ('active', 'trialing', 'past_due')),
    'lifetime_sold', (select count(*) from public.stripe_charges where livemode is not distinct from v_live and plan = 'lifetime' and paid and not refunded),
    'lifetime_sold_period', (select count(*) from public.stripe_charges where livemode is not distinct from v_live and plan = 'lifetime' and paid and not refunded
                             and created >= p_from and created < p_to + 1),
    'gross', (select coalesce(sum(amount), 0) from public.stripe_charges where livemode is not distinct from v_live and paid and created >= p_from and created < p_to + 1),
    'refunded', (select coalesce(sum(amount_refunded), 0) from public.stripe_charges where livemode is not distinct from v_live and created >= p_from and created < p_to + 1),
    'failed', (select count(*) from public.stripe_charges where livemode is not distinct from v_live and status = 'failed' and created >= p_from and created < p_to + 1),
    'disputes', (select count(*) from public.stripe_charges where livemode is not distinct from v_live and disputed and created >= p_from and created < p_to + 1),
    'discounts', (select coalesce(sum(amount_discount), 0) from public.stripe_checkouts where livemode is not distinct from v_live and status = 'complete' and created >= p_from and created < p_to + 1),
    'new_subscriptions', (select count(*) from public.stripe_subscriptions where livemode is not distinct from v_live and created >= p_from and created < p_to + 1),
    'cancellations', (select count(*) from public.stripe_subscriptions where livemode is not distinct from v_live and canceled_at >= p_from and canceled_at < p_to + 1),
    'checkout_started', (select count(*) from public.stripe_checkouts where livemode is not distinct from v_live and created >= p_from and created < p_to + 1),
    'checkout_completed', (select count(*) from public.stripe_checkouts where livemode is not distinct from v_live and status = 'complete' and created >= p_from and created < p_to + 1),
    'daily', coalesce((select jsonb_agg(jsonb_build_object('day', d, 'gross', g) order by d) from (
        select created::date as d, sum(amount) filter (where paid) as g from public.stripe_charges
        where livemode is not distinct from v_live and created >= p_from and created < p_to + 1 group by 1) x), '[]'::jsonb),
    'payments', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'amount', c.amount, 'refunded', c.amount_refunded, 'currency', c.currency,
        'status', c.status, 'plan', c.plan, 'created', c.created, 'user_id', c.user_id, 'failure', c.failure_code,
        'email', case when v_role = 'analyst' then public.mask_email(coalesce(u.email, cu.email)) else coalesce(u.email, cu.email) end) order by c.created desc)
      from (select * from public.stripe_charges where livemode is not distinct from v_live order by created desc limit 50) c
      left join auth.users u on u.id = c.user_id left join public.stripe_customers cu on cu.id = c.customer), '[]'::jsonb),
    'subscriptions', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'status', s.status, 'amount', s.amount, 'currency', s.currency,
        'interval', s.interval, 'renews', s.current_period_end, 'canceling', s.cancel_at_period_end, 'created', s.created, 'user_id', s.user_id,
        'promotion_code', s.promotion_code,
        'email', case when v_role = 'analyst' then public.mask_email(coalesce(u.email, cu.email)) else coalesce(u.email, cu.email) end) order by s.created desc)
      from (select * from public.stripe_subscriptions where livemode is not distinct from v_live order by created desc limit 100) s
      left join auth.users u on u.id = s.user_id left join public.stripe_customers cu on cu.id = s.customer), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.admin_stripe(date, date) from public, anon;
grant execute on function public.admin_stripe(date, date) to authenticated;

-- Stripe side of a code: redemptions, revenue and discount given, by promotion code
create or replace function public.admin_code_stripe(p_code uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_promo text; v_code text;
begin
  perform public.admin_guard('analyst');
  select stripe_promo_id, code into v_promo, v_code from public.promo_codes where id = p_code;
  return jsonb_build_object(
    'promotion', (select to_jsonb(p) from public.stripe_promotion_codes p where p.id = v_promo or (v_promo is null and p.code = v_code) limit 1),
    'checkouts', (select count(*) from public.stripe_checkouts c where c.promotion_code = v_promo and c.status = 'complete'),
    'revenue', (select coalesce(sum(amount_total), 0) from public.stripe_checkouts c where c.promotion_code = v_promo and c.status = 'complete')
             + (select coalesce(sum(amount_paid), 0) from public.stripe_invoices i where i.promotion_code = v_promo and i.billing_reason = 'subscription_cycle'),
    'discount_given', (select coalesce(sum(amount_discount), 0) from public.stripe_checkouts c where c.promotion_code = v_promo and c.status = 'complete')
                    + (select coalesce(sum(amount_discount), 0) from public.stripe_invoices i where i.promotion_code = v_promo and i.billing_reason = 'subscription_cycle'),
    'subscriptions_active', (select count(*) from public.stripe_subscriptions s where s.promotion_code = v_promo and s.status in ('active', 'trialing', 'past_due')),
    'subscriptions_canceled', (select count(*) from public.stripe_subscriptions s where s.promotion_code = v_promo and s.status = 'canceled')
  );
end;
$$;
revoke all on function public.admin_code_stripe(uuid) from public, anon;
grant execute on function public.admin_code_stripe(uuid) to authenticated;
