-- Keep the record of service emails, without the address. delete_account used to leave email_sends rows with
-- user_id cleared but the plain email address still in them. Now the address is replaced by a keyed hash:
--   'h1:' || hex(HMAC-SHA256(key, lower(btrim(address, E' \t\r\n'))))
-- The key is a Supabase Vault secret named email_hash_key. This migration creates it inside the database if it is
-- missing (32 random bytes as a 64-character hex string; nobody sees it and it is never in this repo). The HMAC key
-- bytes are the ASCII of that 64-character hex string (convert_to(text, 'UTF8')), not the 32 decoded bytes; anything
-- that recomputes a hash outside the database must do the same. A plain, unkeyed hash is not used: an address can be guessed and hashed. Same address + same key
-- always gives the same code, so a code can be compared with one made from an address later. (No email-keyed
-- unsubscribe list exists today: unsubscribes are per-token flags on user_profiles, former_members and beta_waitlist,
-- and email_sends is a log that no send reads. Nothing here changes how an unsubscribe is honoured.)
-- Cleared on hashed rows: subject (the rendered subject can carry a first name or city), reason (a provider error can
-- quote the address) and resend_id (a lookup key into the email provider, which holds the plain address; keeping it
-- would let the record be turned back into an address). Kept: template_key, kind, status, campaign, created_at.
-- Backfill leaves rows that still point at a live former_members row alone (the address is held there); when a
-- member is deleted, their former-member rows and any row with their address are hashed too.
-- If the secret is changed or lost, old hashes stop matching new ones: keep it.
-- Coded rows are kept (no purge).
-- Idempotent. NOT applied automatically: the owner applies it.

create extension if not exists pgcrypto with schema extensions;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'email_hash_key') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'email_hash_key', 'HMAC key for email_sends hashes');
  end if;
end $$;

create or replace function public.email_hash(p_email text)
returns text language plpgsql stable security definer set search_path = '' as $$
declare v_key text;
begin
  if p_email is null then return null; end if;
  if p_email like 'h1:%' then return p_email; end if;
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'email_hash_key';
  if v_key is null or length(v_key) < 32 then
    raise exception 'Vault secret "email_hash_key" is missing or shorter than 32 characters: it is created by migration 20261117100000; check Vault.';
  end if;
  return 'h1:' || encode(extensions.hmac(convert_to(lower(btrim(p_email, E' \t\r\n')), 'UTF8'), convert_to(v_key, 'UTF8'), 'sha256'), 'hex');
end;
$$;
revoke all on function public.email_hash(text) from public, anon, authenticated;
grant execute on function public.email_hash(text) to service_role;

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
  -- The service-email log stays, without the address: email_sends keeps type, kind, date and status, but the address
  -- becomes a keyed hash (so the log can still show what was sent), and the free text that can hold personal data
  -- (rendered subject, provider error text, provider message id) is cleared. Rows are found by user_id, by their
  -- former_members row (deleted just below, which would drop the link) and by the account's address.
  update public.email_sends
    set email = public.email_hash(email), subject = null, reason = null, resend_id = null
    where email not like 'h1:%'
      and (user_id = p_user
        or former_member_id in (select f.id from public.former_members f where f.user_id = p_user
             or lower(btrim(f.email, E' \t\r\n')) = (select lower(btrim(u.email, E' \t\r\n')) from auth.users u where u.id = p_user))
        or lower(btrim(email, E' \t\r\n')) = (select lower(btrim(u.email, E' \t\r\n')) from auth.users u where u.id = p_user));

  -- Their former-member record goes too: the one tied to the account and any one holding the same address (normalised)
  delete from public.former_members
    where user_id = p_user
       or lower(btrim(email, E' \t\r\n')) = (select lower(btrim(u.email, E' \t\r\n')) from auth.users u where u.id = p_user);

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

-- Backfill: rows whose member is already gone (user_id null) and that are not hashed yet
do $$
begin
  if exists (select 1 from public.email_sends where user_id is null and former_member_id is null and email not like 'h1:%') then
    update public.email_sends
      set email = public.email_hash(email), subject = null, reason = null, resend_id = null
      where user_id is null and former_member_id is null and email not like 'h1:%';
  end if;
end $$;
