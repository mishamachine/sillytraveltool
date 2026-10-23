-- Stops of a multi-city trip (docs/MULTI_CITY_PLAN.md §3a): where the traveller sleeps (or passes through) and when.
-- Derived from the trip's bookings by the app (src/lib/route.js) and rewritten when they change; rows with
-- source = 'manual' are the traveller's own edits and are never overwritten. Read with the trip by every member.
create table if not exists public.trip_stops (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  position int not null,
  city text not null,
  country text,
  country_code char(2),
  place_id text,
  lat numeric,
  lng numeric,
  tz text,
  start_date date,            -- first day there (arrival)
  end_date date,              -- last day there (departure)
  nights int not null default 0,
  kind text not null default 'stay' check (kind in ('stay', 'transit', 'day_trip', 'home')),
  source text not null default 'derived' check (source in ('derived', 'manual')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists trip_stops_trip_idx on public.trip_stops (trip_id, position);

alter table public.trip_stops enable row level security;

create policy "Trip members can view stops" on public.trip_stops for select using (
  exists (select 1 from public.trips where trips.id = trip_stops.trip_id and (trips.owner_id = auth.uid() or exists (
    select 1 from public.trip_collaborators c where c.trip_id = trip_stops.trip_id and c.user_id = auth.uid() and c.status = 'accepted'))));

create policy "Trip editors can add stops" on public.trip_stops for insert with check (
  exists (select 1 from public.trips where trips.id = trip_stops.trip_id and (trips.owner_id = auth.uid() or exists (
    select 1 from public.trip_collaborators c where c.trip_id = trip_stops.trip_id and c.user_id = auth.uid()
      and c.role = any (array['owner'::collaborator_role, 'collaborator'::collaborator_role]) and c.status = 'accepted'))));

create policy "Trip editors can change stops" on public.trip_stops for update using (
  exists (select 1 from public.trips where trips.id = trip_stops.trip_id and (trips.owner_id = auth.uid() or exists (
    select 1 from public.trip_collaborators c where c.trip_id = trip_stops.trip_id and c.user_id = auth.uid()
      and c.role = any (array['owner'::collaborator_role, 'collaborator'::collaborator_role]) and c.status = 'accepted'))));

create policy "Trip editors can remove stops" on public.trip_stops for delete using (
  exists (select 1 from public.trips where trips.id = trip_stops.trip_id and (trips.owner_id = auth.uid() or exists (
    select 1 from public.trip_collaborators c where c.trip_id = trip_stops.trip_id and c.user_id = auth.uid()
      and c.role = any (array['owner'::collaborator_role, 'collaborator'::collaborator_role]) and c.status = 'accepted'))));

grant select, insert, update, delete on public.trip_stops to authenticated;
