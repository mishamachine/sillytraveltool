-- Shared-trip RLS hardening and admin Google check (audit 09: S1, S2, S5, D6).
-- bookings SELECT is unchanged on purpose (S9 is a separate approval).
-- No policy here adds a trips <-> trip_collaborators cycle: trip_collaborators policies only use
-- public.is_trip_owner() (security definer) or user_id = auth.uid().

-- ────────────────────────────────────────────────────────────
-- S1: an owner could insert any user's UUID as an accepted collaborator, with no consent.
-- Owners may only create pending, unclaimed invites; user_id/status are written by the
-- send-invite and accept-invite Edge Functions (service role). Clients may update role only.
-- ────────────────────────────────────────────────────────────
alter policy tc_owner_insert on public.trip_collaborators
  with check (
    public.is_trip_owner(trip_id)
    and invited_by = (select auth.uid())
    and role <> 'owner'
    and user_id is null
    and status = 'pending'
  );

revoke update on public.trip_collaborators from anon, authenticated;
grant update (role) on public.trip_collaborators to authenticated;

-- ────────────────────────────────────────────────────────────
-- S2: bookings/trip_activities UPDATE had no WITH CHECK, so a member could re-point
-- their own row into any trip. The new trip_id must be one the user owns or edits.
-- ────────────────────────────────────────────────────────────
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
  );

alter policy "Activity creator or trip owner can update" on public.trip_activities
  with check (
    exists (
      select 1 from public.trips t
      where t.id = trip_activities.trip_id
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
  );

-- ────────────────────────────────────────────────────────────
-- D6: editors' "Extend trip" was silently filtered (no collaborator UPDATE policy on trips).
-- Accepted editors may now change start_date/end_date only. A column grant cannot do this
-- (owners and editors are both `authenticated`), so a trigger refuses any other column
-- change by a non-owner. Same subquery shape as the live collaborator SELECT policy.
-- ────────────────────────────────────────────────────────────
create policy trips_editor_update_dates on public.trips
  for update to authenticated
  using (
    id in (
      select tc.trip_id from public.trip_collaborators tc
      where tc.user_id = (select auth.uid())
        and tc.role in ('owner', 'collaborator')
        and tc.status = 'accepted'
    )
  )
  with check (
    id in (
      select tc.trip_id from public.trip_collaborators tc
      where tc.user_id = (select auth.uid())
        and tc.role in ('owner', 'collaborator')
        and tc.status = 'accepted'
    )
  );

create or replace function public.trips_editor_dates_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Service role (no auth.uid()) and the owner are unrestricted
  if (select auth.uid()) is null or old.owner_id = (select auth.uid()) then return new; end if;
  if (to_jsonb(new) - 'start_date' - 'end_date' - 'updated_at')
     is distinct from (to_jsonb(old) - 'start_date' - 'end_date' - 'updated_at') then
    raise exception 'editor_dates_only' using errcode = '42501',
      hint = 'Trip editors can change the dates only.';
  end if;
  return new;
end;
$$;
revoke all on function public.trips_editor_dates_only() from public, anon, authenticated;

drop trigger if exists trips_editor_dates_only on public.trips;
create trigger trips_editor_dates_only
  before update on public.trips
  for each row execute function public.trips_editor_dates_only();

-- ────────────────────────────────────────────────────────────
-- S5: admin_guard accepted any OAuth session, so an Apple sign-in would pass once enabled.
-- The JWT's amr has no provider name, so also require that Google is the account's only
-- linked OAuth identity (email is allowed: one admin has email + Google). An admin who links
-- another social login loses admin until it is unlinked (fails closed).
-- ────────────────────────────────────────────────────────────
create or replace function public.admin_guard(p_min text default 'analyst')
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_role text;
begin
  select role into v_role from public.admins where user_id = auth.uid();
  if v_role is null then raise exception 'not_admin' using errcode = '42501'; end if;
  if not exists (select 1 from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) a where a ->> 'method' = 'oauth')
     or not exists (select 1 from auth.identities i where i.user_id = auth.uid() and i.provider = 'google')
     or exists (select 1 from auth.identities i where i.user_id = auth.uid() and i.provider not in ('google', 'email')) then
    raise exception 'google_required' using errcode = '42501';
  end if;
  if public.admin_role_rank(v_role) < public.admin_role_rank(p_min) then
    raise exception 'role_too_low' using errcode = '42501';
  end if;
  return v_role;
end;
$$;
