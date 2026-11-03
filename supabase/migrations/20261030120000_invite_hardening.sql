-- Invite hardening: an append-only send log with per-sender, per-recipient and project-wide limits, plus two RLS gaps
-- found in the same review (booking_seats membership, bookings.created_by on update).
-- Idempotent. NOT applied automatically: the owner applies it before deploying the send-invite function.

-- ── Send log ────────────────────────────────────────────────────────────────
-- The old limit counted trip_collaborators rows, which an owner can delete (tc_owner_delete) and which one re-send to the
-- same address only refreshes. This log is written only by invite_send_check(), only by the service role, and never
-- edited or deleted by it. Recipients are stored as a hash of the lower-cased address, not the address.
create table if not exists public.invite_sends (
  id bigint generated always as identity primary key,
  sender uuid not null,
  recipient_hash text not null,
  trip_id uuid not null,
  created_at timestamptz not null default now()
);
-- No foreign keys on purpose: deleting a trip or an account must not erase the log
create index if not exists invite_sends_sender_idx on public.invite_sends (sender, created_at);
create index if not exists invite_sends_recipient_idx on public.invite_sends (recipient_hash, created_at);
create index if not exists invite_sends_created_idx on public.invite_sends (created_at);
alter table public.invite_sends enable row level security; -- no policies: nobody but the service role
revoke all on public.invite_sends from public, anon, authenticated;
revoke all on public.invite_sends from service_role;
grant select, insert on public.invite_sends to service_role;

-- Limits (constants here; the project-wide one can be set in app_settings.global_limits.invite_daily):
--   20 per sender per hour, 50 per sender per 24 hours, 3 per recipient per 24 hours across all senders,
--   500 per 24 hours project-wide. The recipient hash is taken from a normalised address (lower case, +tag removed,
--   dots removed for gmail.com / googlemail.com) so aliases of one mailbox share a limit.
-- Returns 'ok' (and records the send), 'sender_limit', 'recipient_limit' or 'global_limit'. One transaction-level lock
-- makes check-and-record atomic, so parallel requests cannot all slip under a limit.
create or replace function public.invite_recipient_key(p_email text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(sha256(convert_to(
    case when d in ('gmail.com', 'googlemail.com')
      then replace(split_part(l, '+', 1), '.', '') || '@gmail.com'
      else split_part(l, '+', 1) || '@' || d end, 'utf8')), 'hex')
  from (select split_part(lower(trim(p_email)), '@', 1) as l, split_part(lower(trim(p_email)), '@', 2) as d) x
$$;
revoke all on function public.invite_recipient_key(text) from public, anon, authenticated;
grant execute on function public.invite_recipient_key(text) to service_role;

create or replace function public.invite_send_check(p_sender uuid, p_recipient text, p_trip uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash text := public.invite_recipient_key(p_recipient);
  v_global_cap integer;
begin
  perform pg_advisory_xact_lock(hashtext('invite_sends'));
  if (select count(*) from public.invite_sends where sender = p_sender and created_at > now() - interval '1 hour') >= 20 then
    return 'sender_limit';
  end if;
  if (select count(*) from public.invite_sends where sender = p_sender and created_at > now() - interval '24 hours') >= 50 then
    return 'sender_limit';
  end if;
  if (select count(*) from public.invite_sends where recipient_hash = v_hash and created_at > now() - interval '24 hours') >= 3 then
    return 'recipient_limit';
  end if;
  v_global_cap := coalesce((public.setting('global_limits') ->> 'invite_daily')::integer, 500);
  if (select count(*) from public.invite_sends where created_at > now() - interval '24 hours') >= v_global_cap then
    return 'global_limit';
  end if;
  insert into public.invite_sends (sender, recipient_hash, trip_id) values (p_sender, v_hash, p_trip);
  return 'ok';
end;
$$;
revoke all on function public.invite_send_check(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.invite_send_check(uuid, text, uuid) to service_role;

-- ── L5: booking_seats ───────────────────────────────────────────────────────
-- "Users manage own seats" only said user_id = the caller, so a removed member (or anyone) could write a seat row
-- against any booking id. The write must now be on a booking of a trip the caller owns or has accepted a place on.
alter policy "Users manage own seats" on public.booking_seats
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.bookings b
      join public.trips t on t.id = b.trip_id
      where b.id = booking_seats.booking_id
        and (
          t.owner_id = (select auth.uid())
          or exists (
            select 1 from public.trip_collaborators tc
            where tc.trip_id = t.id and tc.user_id = (select auth.uid()) and tc.status = 'accepted'
          )
        )
    )
  );

-- ── L6: bookings update ─────────────────────────────────────────────────────
-- Same check as 20261025100000 (the new trip_id must be one the caller owns or edits), plus: only the trip owner may
-- change who created a booking. A creator who is not the owner must leave created_by as themselves.
alter policy "Booking creator or trip owner can update" on public.bookings
  with check (
    exists (
      select 1 from public.trips t
      where t.id = bookings.trip_id
        and (
          t.owner_id = (select auth.uid())
          or exists (
            select 1 from public.trip_collaborators tc
            where tc.trip_id = t.id
              and tc.user_id = (select auth.uid())
              and tc.role in ('owner', 'collaborator')
              and tc.status = 'accepted'
          )
        )
    )
    and (
      bookings.created_by = (select auth.uid())
      or exists (select 1 from public.trips t2 where t2.id = bookings.trip_id and t2.owner_id = (select auth.uid()))
    )
  );

-- ── Retention ───────────────────────────────────────────────────────────────
-- The longest window is 24 hours; keep 14 days for abuse review, then delete (the job runs as the table owner).
select cron.unschedule('purge-invite-sends') where exists (select 1 from cron.job where jobname = 'purge-invite-sends');
select cron.schedule('purge-invite-sends', '47 3 * * *', $cron$delete from public.invite_sends where created_at < now() - interval '14 days'$cron$);
