-- Trip ideas: places shortlisted from the guide or HONK before they are booked. Additive only.
-- An idea is a trip_activities row with is_idea = true (no date); "Confirm a visit" turns it into a booking.
alter table public.trip_activities
  add column if not exists is_idea boolean not null default false,
  add column if not exists place_id text check (place_id is null or char_length(place_id) <= 300);

create index if not exists trip_activities_trip_idea_idx on public.trip_activities (trip_id) where is_idea;
