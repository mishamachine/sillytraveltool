-- Goose inbox trust (audit S4). NOT APPLIED by the PR that adds it: the owner applies it before deploying
-- receive-booking-email.
--
-- 1. Who may mail an inbox: the member's account email always; more addresses in inbox_allowed_senders; anyone
--    only when inbox_accept_any is on (for auto-forwarding rules that keep the airline as the sender).
-- 2. A per-inbox daily parse budget (inbox_usage + consume_inbox_quota), separate from the interactive AI quota.
-- 3. A cancellation email no longer renames or cancels a booking: it stamps cancellation_received_at and the app
--    shows a note.
-- 4. Inbox tokens are made by the server: 12 hex chars (48 bits) from gen_random_bytes, on profile insert and on
--    rotate. Existing 8-hex tokens keep working until the member rotates. Clients can no longer set the token.

-- ── 1. Sender settings ────────────────────────────────────────────────────────
alter table public.user_profiles
  add column if not exists inbox_allowed_senders text[] not null default '{}',
  add column if not exists inbox_accept_any boolean not null default false;

-- A short list of plain addresses, nothing else
alter table public.user_profiles drop constraint if exists user_profiles_inbox_allowed_senders_check;
alter table public.user_profiles add constraint user_profiles_inbox_allowed_senders_check
  check (cardinality(inbox_allowed_senders) <= 20 and length(array_to_string(inbox_allowed_senders, ',')) <= 2000);

-- ── 2. Parse budget ───────────────────────────────────────────────────────────
create table if not exists public.inbox_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null default current_date,
  parses integer not null default 0,
  primary key (user_id, day)
);
alter table public.inbox_usage enable row level security; -- no policies: service role only

-- One unit per AI read of an inbound email or attachment. True while the inbox is within p_limit today.
create or replace function public.consume_inbox_quota(p_user uuid, p_limit integer default 30)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_parses integer;
begin
  insert into public.inbox_usage (user_id, day, parses) values (p_user, current_date, 1)
  on conflict (user_id, day) do update set parses = public.inbox_usage.parses + 1
  returning parses into v_parses;
  return v_parses <= p_limit;
end;
$$;
revoke all on function public.consume_inbox_quota(uuid, integer) from public, anon, authenticated;
grant execute on function public.consume_inbox_quota(uuid, integer) to service_role;

-- ── 3. Cancellation emails ────────────────────────────────────────────────────
alter table public.bookings add column if not exists cancellation_received_at timestamptz;

-- ── 4. Server-made inbox tokens ───────────────────────────────────────────────
-- security definer: the insert trigger runs as the signed-in client, who may not reach the extensions schema
create or replace function public.new_inbox_token()
returns text
language sql
volatile
security definer
set search_path = ''
as $$ select encode(extensions.gen_random_bytes(6), 'hex') $$;
-- Random hex only, nothing to leak; the insert trigger below runs as the signed-in client and needs it
revoke all on function public.new_inbox_token() from public, anon;
grant execute on function public.new_inbox_token() to authenticated, service_role;

-- A fresh 12-hex address for p_user; the old one stops working at once. Returns the new token.
create or replace function public.rotate_booking_email_token(p_user uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare v_token text;
begin
  for i in 1..5 loop
    v_token := public.new_inbox_token();
    begin
      update public.user_profiles set booking_email_token = v_token where id = p_user;
      if not found then return null; end if;
      return v_token;
    exception when unique_violation then
      -- 1 in 2^48 per existing token: try another
    end;
  end loop;
  raise exception 'could not find a free inbox token';
end;
$$;
revoke all on function public.rotate_booking_email_token(uuid) from public, anon, authenticated;
grant execute on function public.rotate_booking_email_token(uuid) to service_role;

-- What Settings → "New address" calls: rotates the signed-in member's own token only
create or replace function public.my_rotate_inbox_token()
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  return public.rotate_booking_email_token(auth.uid());
end;
$$;
revoke all on function public.my_rotate_inbox_token() from public, anon;
grant execute on function public.my_rotate_inbox_token() to authenticated;

-- New profiles get a token from the server; a token in the client's insert is replaced. A signed-in client can't
-- change it afterwards (only the functions above, which run as the owner, can).
-- security invoker on purpose: current_user is then the caller ('authenticated' from the app, the owner inside
-- rotate_booking_email_token, 'service_role' from Edge Functions)
create or replace function public.guard_booking_email_token()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.booking_email_token is null or current_user in ('authenticated', 'anon') then
      new.booking_email_token := public.new_inbox_token();
    end if;
  elsif new.booking_email_token is distinct from old.booking_email_token and current_user in ('authenticated', 'anon') then
    new.booking_email_token := old.booking_email_token;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_booking_email_token on public.user_profiles;
create trigger guard_booking_email_token
  before insert or update of booking_email_token on public.user_profiles
  for each row execute function public.guard_booking_email_token();

-- Any profile still without an address gets one now (none expected: all 18 have 8-hex tokens)
update public.user_profiles set booking_email_token = public.new_inbox_token() where booking_email_token is null;
