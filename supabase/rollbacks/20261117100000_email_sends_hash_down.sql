-- Rollback for 20261117100000_email_sends_hash.sql (run by hand).
-- 1. Restore delete_account to its 20261116100000 definition (verbatim copy below).
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

revoke all on function public.delete_account(uuid) from public, anon, authenticated;
grant execute on function public.delete_account(uuid) to service_role;

-- 2. Then stop the purge and drop the helpers:
select cron.unschedule('purge-old-email-sends') where exists (select 1 from cron.job where jobname = 'purge-old-email-sends');
drop function if exists public.purge_old_email_sends();
drop function if exists public.email_hash(text);
-- Rows already hashed stay hashed: a hash cannot be turned back into an address. That is intended.
-- The Vault secret email_hash_key and the pgcrypto extension are kept (delete the secret in the dashboard only if
-- hashing is abandoned for good).
