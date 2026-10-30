-- Invite privacy cleanup.
-- 1. A daily job deletes invites that can no longer be answered: pending ones 7 days after they expired, declined ones
--    30 days after they were sent. Accepted rows are never touched. Also drops any leftover token on answered rows.
-- 2. delete_account clears the leaving member's free text on rows they created on OTHER owners' trips before those
--    rows pass to the trip owner, and removes unbound invites addressed to the member's email.
-- Idempotent. NOT applied automatically: the owner applies it. Requires pg_cron (already used by earlier migrations).
-- Accepted rows keep invited_email on purpose: send-invite uses it to refuse re-inviting a member, the Travelers list
-- shows it, and UNIQUE (trip_id, invited_email) is what the re-invite upsert relies on. See the PR.

-- Tokens are already cleared when an invite is answered; this catches rows answered before that was true.
update public.trip_collaborators set invite_token = null where status <> 'pending' and invite_token is not null;

select cron.unschedule('purge-stale-invites') where exists (select 1 from cron.job where jobname = 'purge-stale-invites');
select cron.schedule('purge-stale-invites', '23 3 * * *', $cron$delete from public.trip_collaborators
  where role is distinct from 'owner'
    and ((status = 'pending' and invite_expires_at < now() - interval '7 days')
      or (status = 'declined' and invited_at < now() - interval '30 days'))$cron$);

-- ── delete_account ──────────────────────────────────────────────────────────
-- Same as 20261024030000 except for the two additions marked in the body.
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

  -- Everything else (profile, inbox token, documents, loyalty cards, badges, stats, usage events, entitlements,
  -- store purchases, experiments, notes) cascades from auth.users
  delete from auth.users where id = p_user;
  return jsonb_build_object('deleted', true, 'trips', v_trips);
end;
$$;

revoke all on function public.delete_account(uuid) from public, anon, authenticated;
grant execute on function public.delete_account(uuid) to service_role;
