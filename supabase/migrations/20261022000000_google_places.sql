-- Google Maps Platform: server-side cache plus place references on bookings and trips. Additive only.

-- Cache for Google responses (geocodes, autocomplete details, photo URLs, place lists). Server writes only.
create table if not exists public.google_cache (
  key text primary key,
  data jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
alter table public.google_cache enable row level security;
revoke all on public.google_cache from anon, authenticated;
create index if not exists google_cache_expires_idx on public.google_cache (expires_at);

-- Google place for a hotel / venue / activity (place IDs may be stored indefinitely under Google's terms)
alter table public.bookings
  add column if not exists place_id text check (place_id is null or char_length(place_id) <= 300),
  add column if not exists place_lat double precision check (place_lat is null or place_lat between -90 and 90),
  add column if not exists place_lng double precision check (place_lng is null or place_lng between -180 and 180);

-- Google place for the destination city, and its photo reference for the trip cover
alter table public.trips
  add column if not exists destination_place_id text check (destination_place_id is null or char_length(destination_place_id) <= 300),
  add column if not exists cover_photo text check (cover_photo is null or char_length(cover_photo) <= 500);
