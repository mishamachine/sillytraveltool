-- Bookings in the local time of the place they happen (owner rule, 2026-10-21).
-- Additive only: new nullable columns + a server-only cache. Nothing is dropped or rewritten.
--   bookings.departure_tz  IANA zone of the departure airport/station (e.g. 'America/Los_Angeles')
--   bookings.arrival_tz    IANA zone of the arrival airport/station
--   bookings.local_tz      IANA zone of the hotel / restaurant / venue (check-in, activity date+time)
--   trips.destination_tz   IANA zone of the trip's destination (Today, day counts, plan items)
-- departure_time / arrival_time stay timestamptz (the real instant); activity_date + activity_time
-- and check_in_date stay wall-clock values, read in local_tz.

alter table public.bookings
  add column if not exists departure_tz text check (departure_tz is null or char_length(departure_tz) <= 64),
  add column if not exists arrival_tz text check (arrival_tz is null or char_length(arrival_tz) <= 64),
  add column if not exists local_tz text check (local_tz is null or char_length(local_tz) <= 64);

alter table public.trips
  add column if not exists destination_tz text check (destination_tz is null or char_length(destination_tz) <= 64);

-- Place → zone lookups made by Edge Functions (Google Time Zone API / fallbacks). Service role only.
create table if not exists public.timezone_cache (
  key text primary key check (char_length(key) <= 220),
  tz text not null check (char_length(tz) <= 64),
  source text,
  created_at timestamptz not null default now()
);
alter table public.timezone_cache enable row level security;
revoke all on public.timezone_cache from anon, authenticated;
