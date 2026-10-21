-- Phase 1 data cleanup (rows reviewed 2026-10-21). Every touched row is
-- copied to public._cleanup_backup_20261021 first.
-- Restore a deleted booking:
--   insert into public.bookings select (jsonb_populate_record(null::public.bookings, row_data)).*
--   from public._cleanup_backup_20261021 where table_name = 'bookings' and row_id = '<id>';

create table if not exists public._cleanup_backup_20261021 (
  table_name text not null,
  row_id uuid not null,
  reason text not null,
  row_data jsonb not null,
  backed_up_at timestamptz not null default now()
);
alter table public._cleanup_backup_20261021 enable row level security; -- service role only

-- 1. Duplicate bookings (identical rows created in March before the dedupe guard):
--    keep the oldest copy of each group.
with ranked as (
  select b.*, row_number() over (
    partition by created_by, trip_id, type, coalesce(confirmation_number, ''), coalesce(flight_number, ''),
                 departure_time, check_in_date, coalesce(title, '')
    order by created_at, id) as rn
  from public.bookings b
)
insert into public._cleanup_backup_20261021 (table_name, row_id, reason, row_data)
select 'bookings', id, 'duplicate', to_jsonb(r) - 'rn' from ranked r where rn > 1;

delete from public.bookings
where id in (select row_id from public._cleanup_backup_20261021 where table_name = 'bookings' and reason = 'duplicate');

-- 2. Orphan bookings (no trip, no date to match on).
insert into public._cleanup_backup_20261021 (table_name, row_id, reason, row_data)
select 'bookings', id, 'orphan', to_jsonb(b) from public.bookings b where trip_id is null;

delete from public.bookings
where id in (select row_id from public._cleanup_backup_20261021 where table_name = 'bookings' and reason = 'orphan');

-- 3. Trips whose end date is before their last booking (email auto-create set
--    end = start). Extend end_date to the latest booking date. Genuine one-day
--    trips with no later booking are left alone.
with latest as (
  select t.id, greatest(
           max(b.arrival_time::date), max(b.departure_time::date),
           max(b.check_out_date), max(b.activity_date)) as last_day
  from public.trips t join public.bookings b on b.trip_id = t.id
  where t.end_date <= t.start_date
  group by t.id
)
insert into public._cleanup_backup_20261021 (table_name, row_id, reason, row_data)
select 'trips', t.id, 'end_date_extended', to_jsonb(t)
from public.trips t join latest l on l.id = t.id
where l.last_day > t.end_date;

update public.trips t set end_date = l.last_day
from (
  select t2.id, greatest(max(b.arrival_time::date), max(b.departure_time::date),
                         max(b.check_out_date), max(b.activity_date)) as last_day
  from public.trips t2 join public.bookings b on b.trip_id = t2.id
  where t2.end_date <= t2.start_date
  group by t2.id
) l
where l.id = t.id and l.last_day > t.end_date;
