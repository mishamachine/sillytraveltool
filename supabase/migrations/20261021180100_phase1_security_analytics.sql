-- Phase 1: cache lockdown, AI quotas, passport encryption, function cleanup,
-- reservation fields, analytics_events.

-- ────────────────────────────────────────────────────────────
-- A1. Shared caches: readable, written only by Edge Functions (service role).
-- ────────────────────────────────────────────────────────────
drop policy if exists "Users can write own checklist cache" on public.checklist_cache;
drop policy if exists "Authenticated users can write guide cache" on public.guide_cache;
drop policy if exists "Service role can write guide cache" on public.guide_cache_sections;
drop policy if exists "Anyone authenticated can write phrase cache" on public.phrase_cache;
drop policy if exists "Authenticated users can write phrases" on public.phrase_cache;

-- ────────────────────────────────────────────────────────────
-- A2. Daily AI quota per user, consumed atomically by _shared/gemini.ts.
-- ────────────────────────────────────────────────────────────
create table if not exists public.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null default current_date,
  calls integer not null default 0,
  primary key (user_id, day)
);
alter table public.ai_usage enable row level security; -- no policies: service role only

create or replace function public.consume_ai_quota(p_user_id uuid, p_limit integer default 100)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_calls integer;
begin
  insert into public.ai_usage (user_id, day, calls) values (p_user_id, current_date, 1)
  on conflict (user_id, day) do update set calls = public.ai_usage.calls + 1
  returning calls into v_calls;
  return v_calls <= p_limit;
end;
$$;
revoke all on function public.consume_ai_quota(uuid, integer) from public, anon, authenticated;
grant execute on function public.consume_ai_quota(uuid, integer) to service_role;

-- ────────────────────────────────────────────────────────────
-- A3. Passport / document numbers encrypted at rest.
-- Key lives in Supabase Vault and never leaves the database. A BEFORE
-- trigger encrypts whatever the client writes into document_number and
-- blanks the plaintext; the app shows document_number_last4 and calls
-- reveal_document_number() (owner only) to show the full value.
-- ────────────────────────────────────────────────────────────
alter table public.wallet_documents
  add column if not exists document_number_enc bytea,
  add column if not exists document_number_last4 text;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'wallet_document_key') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'base64'),
      'wallet_document_key',
      'Symmetric key for wallet_documents.document_number_enc'
    );
  end if;
end;
$$;

create or replace function public.encrypt_wallet_document_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_key text;
begin
  if new.document_number is not null and btrim(new.document_number) <> '' then
    select decrypted_secret into v_key from vault.decrypted_secrets where name = 'wallet_document_key';
    new.document_number_enc := extensions.pgp_sym_encrypt(btrim(new.document_number), v_key);
    new.document_number_last4 := right(regexp_replace(new.document_number, '\s', '', 'g'), 4);
  end if;
  -- Never store plaintext. A null/blank write leaves any existing ciphertext alone.
  new.document_number := null;
  return new;
end;
$$;
revoke all on function public.encrypt_wallet_document_number() from public, anon, authenticated;

drop trigger if exists wallet_documents_encrypt on public.wallet_documents;
create trigger wallet_documents_encrypt
  before insert or update of document_number on public.wallet_documents
  for each row execute function public.encrypt_wallet_document_number();

create or replace function public.reveal_document_number(p_doc_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_key text; v_enc bytea;
begin
  select document_number_enc into v_enc
  from public.wallet_documents
  where id = p_doc_id and user_id = (select auth.uid());
  if v_enc is null then return null; end if;
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'wallet_document_key';
  return extensions.pgp_sym_decrypt(v_enc, v_key);
end;
$$;
revoke all on function public.reveal_document_number(uuid) from public, anon;
grant execute on function public.reveal_document_number(uuid) to authenticated;

-- Encrypt existing plaintext rows (the trigger does the work).
update public.wallet_documents set document_number = document_number
where document_number is not null and btrim(document_number) <> '';

-- ────────────────────────────────────────────────────────────
-- A4. Function housekeeping.
-- ────────────────────────────────────────────────────────────
-- Broken or unused: get_shared_trip (missing shared_trips), handle_new_activity /
-- increment_activity (missing user_activity), generate_referral_code (no column
-- or trigger), and the incremental stats functions replaced in Phase 0.
drop function if exists public.get_shared_trip(text);
drop function if exists public.handle_new_activity();
drop function if exists public.increment_activity(uuid, text);
drop function if exists public.generate_referral_code();
drop function if exists public.update_stats_on_trip_complete();
drop function if exists public.update_stats_on_booking();
drop function if exists public.update_stats_on_activity();

alter function public.update_updated_at() set search_path = public;
alter function public.handle_new_profile() set search_path = public;
alter function public.get_user_id_by_email(text) set search_path = public;

-- ────────────────────────────────────────────────────────────
-- Reservations: party size and transport mode (train/bus/ferry/…).
-- Restaurant bookings count toward the foodie stat.
-- ────────────────────────────────────────────────────────────
alter table public.bookings
  add column if not exists party_size integer check (party_size is null or party_size between 1 and 50),
  add column if not exists transport_mode text check (transport_mode is null or char_length(transport_mode) <= 20);

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

-- ────────────────────────────────────────────────────────────
-- D. analytics_events: clients insert their own events; reading is
-- service-role only (dashboard / SQL), via the rollup views below.
-- ────────────────────────────────────────────────────────────
create table if not exists public.analytics_events (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  session_id text check (session_id is null or char_length(session_id) <= 64),
  event text not null check (char_length(event) between 1 and 64),
  screen text check (screen is null or char_length(screen) <= 64),
  props jsonb not null default '{}'::jsonb check (pg_column_size(props) <= 4096),
  app_version text check (app_version is null or char_length(app_version) <= 32),
  platform text check (platform is null or platform in ('web', 'android', 'ios')),
  ts timestamptz not null default now()
);
create index if not exists analytics_events_event_ts on public.analytics_events (event, ts desc);
create index if not exists analytics_events_user_ts on public.analytics_events (user_id, ts desc);

alter table public.analytics_events enable row level security;
drop policy if exists analytics_insert_own on public.analytics_events;
create policy analytics_insert_own on public.analytics_events
  for insert to authenticated
  with check (user_id = (select auth.uid()));
revoke all on public.analytics_events from anon;
revoke select, update, delete on public.analytics_events from authenticated;

create or replace view public.analytics_daily_events with (security_invoker = true) as
  select date_trunc('day', ts)::date as day, event, platform,
         count(*) as events, count(distinct user_id) as users
  from public.analytics_events group by 1, 2, 3;

create or replace view public.analytics_daily_active with (security_invoker = true) as
  select date_trunc('day', ts)::date as day, platform, count(distinct user_id) as dau
  from public.analytics_events group by 1, 2;

revoke all on public.analytics_daily_events, public.analytics_daily_active from anon, authenticated;
