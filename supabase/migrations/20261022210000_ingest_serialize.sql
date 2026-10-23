-- Email import safety when several confirmations arrive at once (multi-city build, 2026-10-22):
-- 1. widen_trip: a trip's dates only ever grow, in one statement, so two emails can't overwrite each other's widening.
-- 2. ingest_locks + take/release_ingest_lock: one email per user at a time, so two emails can't both start a trip.
-- Service role only (receive-booking-email).
create or replace function public.widen_trip(p_trip uuid, p_start date, p_end date)
returns table (start_date date, end_date date)
language sql security invoker set search_path = public as $$
  update trips set
    start_date = case when trips.start_date is null then p_start else least(trips.start_date, p_start) end,
    end_date   = case when trips.end_date   is null then p_end   else greatest(trips.end_date, p_end) end,
    updated_at = now()
  where id = p_trip
  returning trips.start_date, trips.end_date
$$;

create table if not exists public.ingest_locks (
  user_id uuid primary key,
  until timestamptz not null
);
alter table public.ingest_locks enable row level security;

create or replace function public.take_ingest_lock(p_user uuid, p_seconds int default 90)
returns boolean
language sql security invoker set search_path = public as $$
  with got as (
    insert into ingest_locks (user_id, until) values (p_user, now() + make_interval(secs => p_seconds))
    on conflict (user_id) do update set until = excluded.until where ingest_locks.until < now()
    returning 1
  )
  select exists (select 1 from got)
$$;

create or replace function public.release_ingest_lock(p_user uuid)
returns void
language sql security invoker set search_path = public as $$
  delete from ingest_locks where user_id = p_user
$$;

revoke all on function public.widen_trip(uuid, date, date) from public, anon, authenticated;
revoke all on function public.take_ingest_lock(uuid, int) from public, anon, authenticated;
revoke all on function public.release_ingest_lock(uuid) from public, anon, authenticated;
grant execute on function public.widen_trip(uuid, date, date) to service_role;
grant execute on function public.take_ingest_lock(uuid, int) to service_role;
grant execute on function public.release_ingest_lock(uuid) to service_role;
