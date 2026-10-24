-- In-app account deletion (Apple 5.1.1(v), Google Play account-deletion policy).
-- Called only by the delete-account Edge Function (service role), which checks the member's own JWT and cancels any
-- Stripe subscription first. Mirrors admin_fresh_start for one member, without keeping a former_members row.
-- Kept on purpose, without the member: Stripe ledger rows (user_id set null by FK; tax records), email_sends log
-- (set null), blocked_identities (ban evasion), cost counts (folded into the zero user so totals stay right).
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
