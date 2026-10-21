-- Phase 0: critical security fixes (C3, C4) + single source of truth for user stats.
-- Pre-change definitions are preserved in supabase/backups/2026-10-21-pre-phase0.md.

-- ────────────────────────────────────────────────────────────
-- Helper: trip ownership check that bypasses RLS, so policies on
-- trip_collaborators can reference trips without the trips ↔
-- trip_collaborators policy recursion.
-- ────────────────────────────────────────────────────────────
create or replace function public.is_trip_owner(p_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.trips t
    where t.id = p_trip_id and t.owner_id = (select auth.uid())
  );
$$;
revoke all on function public.is_trip_owner(uuid) from public, anon;
grant execute on function public.is_trip_owner(uuid) to authenticated;

-- ────────────────────────────────────────────────────────────
-- C3: trip_collaborators. Old tc_owner (ALL, invited_by = auth.uid())
-- let anyone insert themselves as an accepted collaborator on any trip.
-- Now: only the trip owner can see/insert/update/delete rows for that
-- trip, and never with role 'owner'. Invitees keep read access to their
-- own row; accepting goes through the accept-invite Edge Function.
-- ────────────────────────────────────────────────────────────
drop policy if exists tc_owner on public.trip_collaborators;
drop policy if exists tc_self_update on public.trip_collaborators;

create policy tc_owner_select on public.trip_collaborators
  for select to authenticated
  using (public.is_trip_owner(trip_id));

create policy tc_owner_insert on public.trip_collaborators
  for insert to authenticated
  with check (
    public.is_trip_owner(trip_id)
    and invited_by = (select auth.uid())
    and role <> 'owner'
  );

create policy tc_owner_update on public.trip_collaborators
  for update to authenticated
  using (public.is_trip_owner(trip_id))
  with check (public.is_trip_owner(trip_id) and role <> 'owner');

create policy tc_owner_delete on public.trip_collaborators
  for delete to authenticated
  using (public.is_trip_owner(trip_id));

-- Invitee may leave a trip (delete own row) but not edit role/status.
create policy tc_self_delete on public.trip_collaborators
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- collabs_select had a typo (trip_collaborators.trip_id = trip_collaborators.id)
-- and is fully covered by owners_all + "Collaborators can view shared trips".
drop policy if exists collabs_select on public.trips;

-- ────────────────────────────────────────────────────────────
-- Stats: one server-side recompute derived from real data.
-- Replaces the trigger + client RPC double counting and the two
-- goose_score formulas. A trip is "completed" once its end_date has
-- passed (status rarely leaves 'planning'), unless cancelled.
-- ────────────────────────────────────────────────────────────
create or replace function public.recompute_user_stats(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trips_created int;
  v_trips_completed int;
  v_countries int;
  v_days int;
  v_flights int;
  v_food int;
  v_museums int;
  v_activities int;
  v_badge_points int;
begin
  if p_user_id is null then return; end if;

  insert into public.user_stats (user_id) values (p_user_id) on conflict (user_id) do nothing;

  select count(*) into v_trips_created
  from public.trips where owner_id = p_user_id;

  select count(*),
         count(distinct nullif(trim(destination_country_code), '')),
         coalesce(sum(greatest(end_date - start_date + 1, 1)), 0)
    into v_trips_completed, v_countries, v_days
  from public.trips
  where owner_id = p_user_id
    and status <> 'cancelled'
    and (status = 'completed' or end_date < current_date);

  select count(*) into v_flights
  from public.bookings where created_by = p_user_id and type = 'flight';

  select count(*) filter (where category = 'food'),
         count(*) filter (where category = 'museum'),
         count(*)
    into v_food, v_museums, v_activities
  from public.trip_activities where created_by = p_user_id;

  select coalesce(sum(case badge_tier::text
           when 'easy' then 10 when 'medium' then 25
           when 'hard' then 50 when 'legendary' then 100 else 10 end), 0)
    into v_badge_points
  from public.user_badges where user_id = p_user_id;

  update public.user_stats set
    trips_created     = v_trips_created,
    trips_completed   = v_trips_completed,
    countries_visited = v_countries,
    days_abroad       = v_days,
    total_flights     = v_flights,
    restaurants_added = v_food,
    museums_visited   = v_museums,
    activities_added  = v_activities,
    goose_score = v_trips_completed * 10
                + v_countries * 5
                + v_days * 2
                + v_trips_created * 3
                + v_flights * 2
                + v_badge_points,
    updated_at = now()
  where user_id = p_user_id;
end;
$$;
revoke all on function public.recompute_user_stats(uuid) from public, anon, authenticated;
grant execute on function public.recompute_user_stats(uuid) to service_role;

-- Trigger wrapper: recompute for whichever user(s) a row change affects.
create or replace function public.trg_recompute_user_stats()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new uuid;
  v_old uuid;
begin
  if tg_table_name = 'trips' then
    if tg_op <> 'DELETE' then v_new := new.owner_id; end if;
    if tg_op <> 'INSERT' then v_old := old.owner_id; end if;
  elsif tg_table_name = 'user_badges' then
    if tg_op <> 'DELETE' then v_new := new.user_id; end if;
    if tg_op <> 'INSERT' then v_old := old.user_id; end if;
  else -- bookings, trip_activities
    if tg_op <> 'DELETE' then v_new := new.created_by; end if;
    if tg_op <> 'INSERT' then v_old := old.created_by; end if;
  end if;

  perform public.recompute_user_stats(v_new);
  if v_old is distinct from v_new then
    perform public.recompute_user_stats(v_old);
  end if;
  return null;
end;
$$;
revoke all on function public.trg_recompute_user_stats() from public, anon, authenticated;

-- Retire the incremental triggers that double counted.
drop trigger if exists on_trip_completed on public.trips;
drop trigger if exists on_booking_created on public.bookings;
drop trigger if exists on_activity_created on public.trip_activities;

create trigger stats_trips after insert or update or delete on public.trips
  for each row execute function public.trg_recompute_user_stats();
create trigger stats_bookings after insert or update of type, created_by or delete on public.bookings
  for each row execute function public.trg_recompute_user_stats();
create trigger stats_activities after insert or update of category, created_by or delete on public.trip_activities
  for each row execute function public.trg_recompute_user_stats();
create trigger stats_badges after insert or delete on public.user_badges
  for each row execute function public.trg_recompute_user_stats();

-- ────────────────────────────────────────────────────────────
-- C4: increment_user_stat was anon-executable SECURITY DEFINER with
-- no auth check and a caller-chosen column. Now: caller's own row only,
-- and only the counters that can't be derived from data.
-- ────────────────────────────────────────────────────────────
create or replace function public.increment_user_stat(p_user_id uuid, p_field text, p_amount integer default 1)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or (select auth.uid()) <> p_user_id then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;
  if p_field not in ('honks_used', 'currency_lookups', 'packing_completed') then
    -- Derived stats are recomputed server-side; ignore quietly so older
    -- clients still in the wild don't error.
    return;
  end if;

  insert into public.user_stats (user_id) values (p_user_id) on conflict (user_id) do nothing;
  execute format(
    'update public.user_stats set %I = coalesce(%I, 0) + $1, updated_at = now() where user_id = $2',
    p_field, p_field
  ) using least(greatest(coalesce(p_amount, 1), 1), 5), p_user_id;
end;
$$;
revoke all on function public.increment_user_stat(uuid, text, integer) from public, anon;
grant execute on function public.increment_user_stat(uuid, text, integer) to authenticated;

-- upsert_visited_country: superseded by recompute; keep the signature for
-- older clients but make it a no-op for anyone but the caller.
create or replace function public.upsert_visited_country(p_user_id uuid, p_country text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or (select auth.uid()) <> p_user_id then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;
  perform public.recompute_user_stats(p_user_id);
end;
$$;
revoke all on function public.upsert_visited_country(uuid, text) from public, anon;
grant execute on function public.upsert_visited_country(uuid, text) to authenticated;

-- get_user_id_by_email: anon-executable lookup into auth.users. Server only.
revoke all on function public.get_user_id_by_email(text) from public, anon, authenticated;
grant execute on function public.get_user_id_by_email(text) to service_role;

-- increment_activity writes to a table that doesn't exist; at minimum not anon.
revoke all on function public.increment_activity(uuid, text) from public, anon;
grant execute on function public.increment_activity(uuid, text) to authenticated;

-- Trigger-only functions never need to be callable through the API.
revoke all on function public.handle_new_profile() from public, anon, authenticated;
revoke all on function public.handle_new_activity() from public, anon, authenticated;
revoke all on function public.update_stats_on_trip_complete() from public, anon, authenticated;
revoke all on function public.update_stats_on_booking() from public, anon, authenticated;
revoke all on function public.update_stats_on_activity() from public, anon, authenticated;

-- ────────────────────────────────────────────────────────────
-- Recompute every user's stats once under the new rules.
-- ────────────────────────────────────────────────────────────
do $$
declare r record;
begin
  for r in select id from public.user_profiles loop
    perform public.recompute_user_stats(r.id);
  end loop;
end;
$$;
