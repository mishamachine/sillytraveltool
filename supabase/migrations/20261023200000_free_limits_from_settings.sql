-- Free-plan limits read their numbers from the owner's Controls (app_settings 'free_limits', migration
-- 20261023190000_costs_controls) instead of hard-coded 2 / 5 / 5. Switching enforcement on or off stays
-- billing_settings.free_limits_on (20261023170000). Missing keys fall back to the original numbers.

create or replace function public.enforce_trip_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare cap int := coalesce((public.setting('free_limits') ->> 'upcoming_trips')::int, 2);
begin
  if auth.uid() is null or not public.free_limits_on() then return new; end if;
  if not public.trip_upcoming(new.start_date, new.end_date, new.status) then return new; end if;
  if tg_op = 'UPDATE' and public.trip_upcoming(old.start_date, old.end_date, old.status) then return new; end if;
  if public.entitlement(new.owner_id) = 'first_class' then return new; end if;
  if (select count(*) from public.trips t where t.owner_id = new.owner_id and t.id <> new.id
      and public.trip_upcoming(t.start_date, t.end_date, t.status)) >= cap then
    raise exception 'upgrade:trips' using hint = format('Free plan: %s upcoming trips. First Class lifts the limit.', cap);
  end if;
  return new;
end $$;

create or replace function public.enforce_reservation_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare cap int := coalesce((public.setting('free_limits') ->> 'reservations_per_trip')::int, 5);
begin
  if auth.uid() is null or not public.free_limits_on() then return new; end if;
  if new.trip_id is null or new.type not in ('restaurant', 'activity', 'other') then return new; end if;
  if tg_op = 'UPDATE' and old.trip_id is not distinct from new.trip_id and old.type in ('restaurant', 'activity', 'other') then return new; end if;
  if public.entitlement((select owner_id from public.trips where id = new.trip_id)) = 'first_class' then return new; end if;
  if (select count(*) from public.bookings b where b.trip_id = new.trip_id and b.id <> new.id
      and b.type in ('restaurant', 'activity', 'other')) >= cap then
    raise exception 'upgrade:reservations' using hint = format('Free plan: %s reservations per trip. First Class lifts the limit.', cap);
  end if;
  return new;
end $$;

create or replace function public.email_import_locked(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.free_limits_on() and public.entitlement(p_user) = 'free'
    and (select count(distinct coalesce(b.raw_email_id, b.id::text)) from public.bookings b
         where b.created_by = p_user and b.source = 'email_import')
        >= coalesce((public.setting('free_limits') ->> 'email_imports')::int, 5)
$$;
revoke all on function public.email_import_locked(uuid) from public, anon, authenticated;
