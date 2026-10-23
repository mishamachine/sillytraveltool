-- First Class on every platform + free-plan limits (docs/STRIPE_BILLING.md, plans A and B).
-- 1. store_entitlements: App Store / Google Play purchases, written by the store-webhook Edge Function (RevenueCat).
-- 2. entitlement() / my_entitlement() also count those purchases.
-- 3. Free-plan limits as triggers, behind billing_settings.free_limits_on (OFF until every platform can take payment).
--    Limits follow the trip owner's plan, block only adding (nothing is removed on downgrade) and skip server-side
--    inserts (auth.uid() is null: email import has its own rule, see email_import_locked).

-- ── 1. Store purchases ───────────────────────────────────────────────────────
create table if not exists public.store_entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  store text not null,                 -- RevenueCat store: app_store | play_store | ...
  product_id text,
  expires_at timestamptz,              -- null = lifetime
  grace_expires_at timestamptz,        -- billing retry grace from the store
  will_renew boolean,
  refunded boolean not null default false,
  last_event_id text,
  updated_at timestamptz not null default now()
);
alter table public.store_entitlements enable row level security;
drop policy if exists "read own store entitlement" on public.store_entitlements;
create policy "read own store entitlement" on public.store_entitlements for select to authenticated using (user_id = auth.uid());

create or replace function public.store_first_class(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.store_entitlements e
    where e.user_id = p_user and not e.refunded
      and (e.expires_at is null or greatest(e.expires_at, coalesce(e.grace_expires_at, e.expires_at)) > now())
  )
$$;
revoke all on function public.store_first_class(uuid) from public, anon, authenticated;

-- The free-limits switch (section 3) is read by my_entitlement(), so it exists first
create table if not exists public.billing_settings (
  id int primary key default 1 check (id = 1),
  free_limits_on boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into public.billing_settings (id) values (1) on conflict (id) do nothing;
alter table public.billing_settings enable row level security;  -- no policies: service role and definer functions only

-- ── 2. One answer for every platform ─────────────────────────────────────────
create or replace function public.entitlement(p_user uuid)
returns text language sql stable security definer set search_path = '' as $$
  select case when exists (
    select 1 from public.entitlement_grants g
    where g.user_id = p_user and g.ended_at is null and g.starts_at <= now() and (g.ends_at is null or g.ends_at > now())
  ) or public.stripe_first_class(p_user) or public.store_first_class(p_user) then 'first_class' else 'free' end
$$;

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
  ),
  store as (
    select e.store, e.product_id, e.expires_at, e.will_renew from public.store_entitlements e
    where e.user_id = auth.uid() and public.store_first_class(auth.uid())
  )
  select jsonb_build_object(
    'plan', public.entitlement(auth.uid()),
    'until', case
      when (select yes from lifetime) or exists (select 1 from grants where ends_at is null)
        or exists (select 1 from store where expires_at is null) then null
      else greatest((select max(ends_at) from grants), (select current_period_end from sub), (select expires_at from store)) end,
    'web', jsonb_build_object(
      'lifetime', (select yes from lifetime),
      'subscription', (select jsonb_build_object('status', status, 'period_end', current_period_end, 'canceling', cancel_at_period_end) from sub),
      'customer', exists (select 1 from public.stripe_customers cu where cu.user_id = auth.uid()
                          and cu.livemode is not distinct from coalesce((select livemode from mode), cu.livemode))
    ),
    'store', (select jsonb_build_object('store', store, 'product', product_id, 'expires_at', expires_at, 'will_renew', will_renew) from store),
    'limits_on', coalesce((select free_limits_on from public.billing_settings where id = 1), false)
  )
$$;

-- ── 3. Free-plan limits (switch OFF) ─────────────────────────────────────────
create or replace function public.free_limits_on()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select free_limits_on from public.billing_settings where id = 1), false)
$$;

-- An upcoming dated trip: has dates, hasn't ended, not completed or cancelled. Undated trips never count.
create or replace function public.trip_upcoming(p_start date, p_end date, p_status public.trip_status)
returns boolean language sql stable set search_path = '' as $$
  select p_start is not null and coalesce(p_end, p_start) >= current_date and p_status in ('planning', 'active')
$$;

-- Free: 2 upcoming dated trips
create or replace function public.enforce_trip_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.free_limits_on() then return new; end if;
  if not public.trip_upcoming(new.start_date, new.end_date, new.status) then return new; end if;
  if tg_op = 'UPDATE' and public.trip_upcoming(old.start_date, old.end_date, old.status) then return new; end if;
  if public.entitlement(new.owner_id) = 'first_class' then return new; end if;
  if (select count(*) from public.trips t where t.owner_id = new.owner_id and t.id <> new.id
      and public.trip_upcoming(t.start_date, t.end_date, t.status)) >= 2 then
    raise exception 'upgrade:trips' using hint = 'Free plan: 2 upcoming trips. First Class lifts the limit.';
  end if;
  return new;
end $$;
drop trigger if exists free_trip_limit on public.trips;
create trigger free_trip_limit before insert or update of start_date, end_date, status on public.trips
  for each row execute function public.enforce_trip_limit();

-- Free: 5 reservations per trip (restaurants, tickets, activities). Flights, hotels and transport don't count; trip
-- ideas live in trip_activities and only count once confirmed as a booking.
create or replace function public.enforce_reservation_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.free_limits_on() then return new; end if;
  if new.trip_id is null or new.type not in ('restaurant', 'activity', 'other') then return new; end if;
  if tg_op = 'UPDATE' and old.trip_id is not distinct from new.trip_id and old.type in ('restaurant', 'activity', 'other') then return new; end if;
  if public.entitlement((select owner_id from public.trips where id = new.trip_id)) = 'first_class' then return new; end if;
  if (select count(*) from public.bookings b where b.trip_id = new.trip_id and b.id <> new.id
      and b.type in ('restaurant', 'activity', 'other')) >= 5 then
    raise exception 'upgrade:reservations' using hint = 'Free plan: 5 reservations per trip. First Class lifts the limit.';
  end if;
  return new;
end $$;
drop trigger if exists free_reservation_limit on public.bookings;
create trigger free_reservation_limit before insert or update of trip_id, type on public.bookings
  for each row execute function public.enforce_reservation_limit();

-- Free: 5 forwarded emails per account. Later ones are still filed, with bookings.locked set; the app shows them
-- locked while the account is free and opens them once it has First Class (no unlock step needed).
alter table public.bookings add column if not exists locked boolean not null default false;

create or replace function public.email_import_locked(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.free_limits_on() and public.entitlement(p_user) = 'free'
    and (select count(distinct coalesce(b.raw_email_id, b.id::text)) from public.bookings b
         where b.created_by = p_user and b.source = 'email_import') >= 5
$$;
revoke all on function public.email_import_locked(uuid) from public, anon, authenticated;
