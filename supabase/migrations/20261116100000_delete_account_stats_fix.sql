-- Account deletion no longer fails with 'insert or update on table "user_stats" violates foreign key constraint
-- "user_stats_user_id_fkey"' for members who have a Goose score or badges.
-- Cause: deleting the account fires the stats triggers (trips, bookings, activities, badges), and those call
-- recompute_user_stats, which inserts a user_stats row. Once auth.users is going, that insert has no parent row.
-- The earlier fix (20261023150000) patched the function by text replacement and only helps if that replace matched.
-- This migration instead (1) defines recompute_user_stats in full, with a transaction-local "deleting" flag and an
-- existence check, and (2) makes delete_account set the flag first and delete badges and stats explicitly.
-- No foreign key changes: user_stats and user_badges already cascade from auth.users.
-- Idempotent (create or replace). NOT applied automatically: the owner applies it.

create or replace function public.recompute_user_stats(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trips_created int; v_trips_completed int; v_countries int; v_days int;
  v_flights int; v_reservations int; v_food int; v_museums int; v_activities int; v_badge_points int;
begin
  if p_user_id is null then return; end if;
  -- Account deletion in progress (set by delete_account for this transaction only): write nothing for that member.
  -- Cascades fire the stats triggers while the account is going, and a write here would hit user_stats_user_id_fkey.
  if current_setting('stt.deleting_account', true) = p_user_id::text then return; end if;
  -- Never write stats for an account that no longer exists
  if not exists (select 1 from auth.users where id = p_user_id) then return; end if;
  insert into public.user_stats (user_id) values (p_user_id) on conflict (user_id) do nothing;

  select count(*) into v_trips_created from public.trips where owner_id = p_user_id;

  select count(*), count(distinct nullif(trim(destination_country_code), '')),
         coalesce(sum(greatest(end_date - start_date + 1, 1)), 0)
    into v_trips_completed, v_countries, v_days
  from public.trips
  where owner_id = p_user_id and status <> 'cancelled'
    and (status = 'completed' or end_date < current_date);

  select count(*) filter (where type = 'flight'),
         count(*) filter (where type::text = 'restaurant')
    into v_flights, v_reservations
  from public.bookings where created_by = p_user_id;

  select count(*) filter (where category = 'food'), count(*) filter (where category = 'museum'), count(*)
    into v_food, v_museums, v_activities
  from public.trip_activities where created_by = p_user_id;

  select coalesce(sum(case badge_tier::text when 'easy' then 10 when 'medium' then 25
           when 'hard' then 50 when 'legendary' then 100 else 10 end), 0)
    into v_badge_points from public.user_badges where user_id = p_user_id;

  update public.user_stats set
    trips_created = v_trips_created, trips_completed = v_trips_completed,
    countries_visited = v_countries, days_abroad = v_days, total_flights = v_flights,
    restaurants_added = v_food + v_reservations, museums_visited = v_museums,
    activities_added = v_activities,
    goose_score = v_trips_completed * 10 + v_countries * 5 + v_days * 2
                + v_trips_created * 3 + v_flights * 2 + v_badge_points,
    updated_at = now()
  where user_id = p_user_id;
end;
$$;

create or replace function public.delete_account(p_user uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_trips integer;
begin
  if p_user is null or not exists (select 1 from auth.users where id = p_user) then
    raise exception 'No such account.';
  end if;
  if exists (select 1 from public.admins where user_id = p_user and role = 'owner') then
    raise exception 'Owner accounts can''t be deleted from the app.';
  end if;

  -- From here to the end of this transaction, recompute_user_stats writes nothing for this member (see above)
  perform set_config('stt.deleting_account', p_user::text, true);

  -- Trips owned by others stay whole, but the leaving member's personal free text does not stay with them: clear it
  -- first, then hand the rows to the trip owner. Cleared: bookings.passenger_name, bookings.notes,
  -- trip_activities.notes. Left: titles, confirmation numbers, places, times, prices, seat_number, ticket_quantity,
  -- raw_email_id (trip content the owner needs). Their booking_seats rows cascade with the account.
  update public.bookings b set passenger_name = null, notes = null from public.trips t
    where b.trip_id = t.id and b.created_by = p_user and t.owner_id <> p_user;
  update public.trip_activities a set notes = null from public.trips t
    where a.trip_id = t.id and a.created_by = p_user and t.owner_id <> p_user;

  -- Trips owned by others stay whole: hand their bookings, ideas and invites to the trip owner
  update public.bookings b set created_by = t.owner_id from public.trips t
    where b.trip_id = t.id and b.created_by = p_user and t.owner_id <> p_user;
  update public.trip_activities a set created_by = t.owner_id from public.trips t
    where a.trip_id = t.id and a.created_by = p_user and t.owner_id <> p_user;
  update public.trip_activities set completed_by = null where completed_by = p_user;
  update public.trip_collaborators c set invited_by = t.owner_id from public.trips t
    where c.trip_id = t.id and c.invited_by = p_user and t.owner_id <> p_user;

  -- Their own trips go (bookings, stops, ideas and travellers cascade with the trip)
  select count(*) into v_trips from public.trips where owner_id = p_user;
  delete from public.trips where owner_id = p_user;
  delete from public.bookings where created_by = p_user;
  delete from public.trip_activities where created_by = p_user;
  delete from public.trip_collaborators where invited_by = p_user or user_id = p_user;

  -- Invites sent to this member's address that were never tied to their account (pending or declined) are not
  -- trip content: remove them so the address does not outlive the account
  delete from public.trip_collaborators c
    where c.user_id is null and c.status in ('pending', 'declined')
      and lower(c.invited_email) = (select lower(u.email) from auth.users u where u.id = p_user);

  -- Tables without a foreign key to auth.users
  insert into public.api_usage (day, user_id, service, endpoint, calls)
    select day, '00000000-0000-0000-0000-000000000000', service, endpoint, calls from public.api_usage where user_id = p_user
    on conflict (day, user_id, service, endpoint) do update set calls = public.api_usage.calls + excluded.calls;
  delete from public.api_usage where user_id = p_user;
  update public.ai_calls set user_id = null where user_id = p_user;
  delete from public.function_errors where user_id = p_user;
  delete from public.ingest_locks where user_id = p_user;
  delete from public.former_members where user_id = p_user;

  -- Stats and badges go before auth.users, explicitly, so no stats trigger has anything left to recompute
  delete from public.user_badges where user_id = p_user;
  delete from public.user_stats where user_id = p_user;

  -- Everything else (profile, inbox token, documents, loyalty cards, badges, stats, usage events, entitlements,
  -- store purchases, experiments, notes) cascades from auth.users
  delete from auth.users where id = p_user;
  return jsonb_build_object('deleted', true, 'trips', v_trips);
end;
$$;

revoke all on function public.recompute_user_stats(uuid) from public, anon, authenticated;
grant execute on function public.recompute_user_stats(uuid) to service_role;

revoke all on function public.delete_account(uuid) from public, anon, authenticated;
grant execute on function public.delete_account(uuid) to service_role;
