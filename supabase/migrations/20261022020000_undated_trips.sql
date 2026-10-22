-- Trips can exist before their dates are known ("Lisbon, dates to be decided"). Both dates are set together.
-- recompute_user_stats already copes: an undated trip is never "completed" by date and counts as 1 day if marked done.
alter table public.trips alter column start_date drop not null;
alter table public.trips alter column end_date drop not null;
alter table public.trips add constraint trips_dates_together check ((start_date is null) = (end_date is null));
alter table public.trips add constraint trips_dates_order check (start_date is null or end_date >= start_date);
