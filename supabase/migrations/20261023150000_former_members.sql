-- Fresh start (owner, 2026-10-23): keep only the owner's accounts; everyone else's account and data are removed,
-- but their name and email are kept in former_members so the owner can write to them later (relaunch notes).
-- Marketing to them still needs consent where the law requires it (marketing_consent starts 'unknown').

create table if not exists public.former_members (
  id bigint generated always as identity primary key,
  user_id uuid,
  email text not null,
  name text,
  joined timestamptz,
  last_seen timestamptz,
  trips integer,
  bookings integer,
  countries integer,
  plan text,
  was_internal boolean,
  marketing_consent text not null default 'unknown' check (marketing_consent in ('unknown', 'yes', 'no')),
  removed_at timestamptz not null default now(),
  removed_by uuid,
  reason text
);
create unique index if not exists former_members_email on public.former_members (lower(email));
alter table public.former_members enable row level security;
revoke all on public.former_members from anon, authenticated;

-- Copy names and emails now (idempotent)
insert into public.former_members (user_id, email, name, joined, last_seen, trips, bookings, countries, plan, was_internal, reason)
select m.user_id, m.email, m.display_name, m.joined, m.last_seen, m.trips, m.bookings, m.countries, m.plan, m.internal, 'fresh start 2026-10-23'
from public.admin_member_rows() m
where m.email is not null and lower(m.email) not in ('babar54@gmail.com', 'machinemisha@gmail.com')
on conflict (lower(email)) do nothing;

-- Who the clear-out would remove, and what goes with them
create or replace function public.admin_fresh_start_preview()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.admin_guard('owner');
  return jsonb_build_object(
    'keep', (select jsonb_agg(u.email order by u.email) from auth.users u where lower(u.email) in ('babar54@gmail.com', 'machinemisha@gmail.com')),
    'remove', coalesce((select jsonb_agg(jsonb_build_object('email', u.email, 'saved', exists (select 1 from public.former_members f where lower(f.email) = lower(u.email)),
        'trips', (select count(*) from public.trips t where t.owner_id = u.id),
        'bookings', (select count(*) from public.bookings b where b.created_by = u.id)) order by u.email)
      from auth.users u where lower(coalesce(u.email, '')) not in ('babar54@gmail.com', 'machinemisha@gmail.com')), '[]'::jsonb),
    'saved', (select count(*) from public.former_members)
  );
end;
$$;

-- The clear-out. Owner only, typed confirmation. Names and emails are saved first; then each account is deleted
-- (its trips, bookings, documents, cards, events and stats go with it). Bookings or ideas they added to a kept
-- member's trip move to that trip's owner, so kept trips stay whole.
create or replace function public.admin_fresh_start(p_confirm text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_removed integer := 0; v_ids uuid[];
begin
  perform public.admin_guard('owner');
  if p_confirm is distinct from 'START FRESH' then raise exception 'Type START FRESH to confirm.'; end if;

  insert into public.former_members (user_id, email, name, joined, last_seen, trips, bookings, countries, plan, was_internal, removed_by, reason)
  select m.user_id, m.email, m.display_name, m.joined, m.last_seen, m.trips, m.bookings, m.countries, m.plan, m.internal, auth.uid(), 'fresh start'
  from public.admin_member_rows() m
  where m.email is not null and lower(m.email) not in ('babar54@gmail.com', 'machinemisha@gmail.com')
  on conflict (lower(email)) do update set removed_by = excluded.removed_by, removed_at = now();

  select array_agg(id) into v_ids from auth.users where lower(coalesce(email, '')) not in ('babar54@gmail.com', 'machinemisha@gmail.com');
  if v_ids is null then return jsonb_build_object('removed', 0); end if;
  if exists (select 1 from auth.users where id = auth.uid() and id = any (v_ids)) then raise exception 'You would remove yourself.'; end if;

  -- Keep kept members' trips whole
  update public.bookings b set created_by = t.owner_id from public.trips t
    where b.trip_id = t.id and b.created_by = any (v_ids) and not (t.owner_id = any (v_ids));
  update public.trip_activities a set created_by = t.owner_id from public.trips t
    where a.trip_id = t.id and a.created_by = any (v_ids) and not (t.owner_id = any (v_ids));
  update public.trip_activities set completed_by = null where completed_by = any (v_ids);
  update public.trip_collaborators c set invited_by = t.owner_id from public.trips t
    where c.trip_id = t.id and c.invited_by = any (v_ids) and not (t.owner_id = any (v_ids));
  -- Their own trips go (bookings and activities on them cascade with the trip)
  delete from public.trips where owner_id = any (v_ids);
  delete from public.bookings where created_by = any (v_ids);
  delete from public.trip_activities where created_by = any (v_ids);
  delete from public.trip_collaborators where invited_by = any (v_ids) or user_id = any (v_ids);

  delete from auth.users where id = any (v_ids);
  get diagnostics v_removed = row_count;
  perform public.admin_log('members.fresh_start', null, jsonb_build_object('removed', v_removed));
  return jsonb_build_object('removed', v_removed, 'saved', (select count(*) from public.former_members));
end;
$$;

create or replace function public.admin_former_members()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_role text;
begin
  v_role := public.admin_guard('analyst');
  return coalesce((select jsonb_agg(jsonb_build_object('email', case when v_role = 'analyst' then public.mask_email(f.email) else f.email end,
      'name', f.name, 'joined', f.joined, 'last_seen', f.last_seen, 'trips', f.trips, 'bookings', f.bookings,
      'was_internal', f.was_internal, 'marketing_consent', f.marketing_consent, 'removed_at', f.removed_at) order by f.joined)
    from public.former_members f), '[]'::jsonb);
end;
$$;

do $$
declare f text;
begin
  foreach f in array array['public.admin_fresh_start_preview()', 'public.admin_fresh_start(text)', 'public.admin_former_members()'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- Account deletion fix: the stats trigger fired during cascades after the auth.users row was gone (FK error)
do $$ declare d text; begin
  d := pg_get_functiondef('public.recompute_user_stats(uuid)'::regprocedure);
  if position('Skip accounts being deleted' in d) = 0 then
    d := replace(d, '  if p_user_id is null then return; end if;', '  if p_user_id is null then return; end if;
  -- Skip accounts being deleted (cascades fire this after auth.users row is gone)
  if not exists (select 1 from auth.users where id = p_user_id) then return; end if;');
    execute d;
  end if;
end $$;
