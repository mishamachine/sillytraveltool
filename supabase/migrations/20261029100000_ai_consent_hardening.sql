-- AI consent hardening (follow-up to 20261026120000_ai_consent). Ships as a file; apply after that one.
--
-- 1. Consent columns on user_profiles (the current-state cache) can't be written by the app directly.
-- 2. ai_consent_events: append-only record of every answer (granted / declined / withdrawn), written only by the
--    server function my_record_ai_consent, which also keeps the cache and accepts only a known wording version.
-- 3. held_inbox_emails.attempts: tries so far; inbox-release drops an email after 5 failed tries.
-- 4. claim_held_emails: hands each held email to ONE release call (delete ... returning with skip locked), so two
--    calls at once can't file the same email twice. inbox-release puts an email back if the filing failed for a
--    temporary reason.
-- 5. Table grants made explicit.

alter table public.user_profiles add column if not exists ai_consent_routing text;

-- ── 1. Guard the consent columns (same pattern as guard_booking_email_token) ──
-- security invoker on purpose: current_user is the caller ('authenticated' from the app, the owner inside
-- my_set_ai_consent, 'service_role' from Edge Functions). Local check, run as the owner:
--   set role authenticated; update public.user_profiles set ai_consent_at = now() where id = '<me>';  -- value unchanged
--   reset role; select public.my_record_ai_consent('granted', 'v2-2026-10-29');                      -- value set (as a member: set request.jwt.claim.sub)
create or replace function public.guard_ai_consent()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.ai_consent_at := null;
      new.ai_consent_version := null;
      new.ai_consent_routing := null;
    else
      new.ai_consent_at := old.ai_consent_at;
      new.ai_consent_version := old.ai_consent_version;
      new.ai_consent_routing := old.ai_consent_routing;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_ai_consent on public.user_profiles;
create trigger guard_ai_consent
  before insert or update of ai_consent_at, ai_consent_version, ai_consent_routing on public.user_profiles
  for each row execute function public.guard_ai_consent();

-- ── 2. The consent record ─────────────────────────────────────────────────────
-- One row per answer, never changed or removed (except when the account is deleted). Written only by
-- my_record_ai_consent. created_at is the server's time. platform / app_version / source come from the app and are
-- informational only (cut to length, not trusted).
create table if not exists public.ai_consent_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  event text not null check (event in ('granted', 'declined', 'withdrawn')),
  wording_version text not null check (length(wording_version) <= 40),
  provider_routing text not null check (length(provider_routing) <= 200),
  created_at timestamptz not null default now(),
  platform text check (length(platform) <= 20),
  app_version text check (length(app_version) <= 20),
  source text check (length(source) <= 20)
);
create index if not exists ai_consent_events_user_idx on public.ai_consent_events (user_id, created_at);

-- Members may read their own rows; nothing else. Expected behaviour (to check on a database, as a member):
--   select  -> only own rows;  insert / update / delete / truncate -> permission denied (no grant, no policy)
--   as the table owner: update -> raises 'append-only'; delete -> raises, except as part of deleting the account
alter table public.ai_consent_events enable row level security;
drop policy if exists consent_events_own_select on public.ai_consent_events;
create policy consent_events_own_select on public.ai_consent_events for select to authenticated using (user_id = auth.uid());
revoke all on public.ai_consent_events from anon, authenticated;
grant select on public.ai_consent_events to authenticated;

-- Even the owner role can't edit history. A delete is allowed only when it is the cascade from deleting the account
-- (that runs one trigger level deeper than a direct delete).
create or replace function public.block_consent_event_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then return old; end if;
  raise exception 'ai_consent_events is append-only';
end;
$$;
drop trigger if exists block_consent_event_change on public.ai_consent_events;
create trigger block_consent_event_change
  before update or delete on public.ai_consent_events
  for each row execute function public.block_consent_event_change();

-- Records an answer and keeps the cache on user_profiles in step. Only granted keeps a time and version there.
-- When the wording or the routing changes: add the new version to the list, change the routing text, and change
-- AI_CONSENT_VERSION / AI_CONSENT_ROUTING in the app and _shared/consent.ts (members are asked again).
drop function if exists public.my_set_ai_consent(boolean, text);
create or replace function public.my_record_ai_consent(
  p_event text, p_version text, p_source text default null, p_platform text default null, p_app_version text default null)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_routing constant text := 'deepseek-first+gemini-fallback; pdf/image gemini';
  v_at timestamptz;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if p_event not in ('granted', 'declined', 'withdrawn') then raise exception 'Unknown consent event'; end if;
  if p_version is distinct from 'v2-2026-10-29' then raise exception 'Unknown consent version'; end if;
  insert into public.ai_consent_events (user_id, event, wording_version, provider_routing, source, platform, app_version)
    values (auth.uid(), p_event, p_version, v_routing, left(p_source, 20), left(p_platform, 20), left(p_app_version, 20));
  update public.user_profiles
     set ai_consent_at = case when p_event = 'granted' then now() else null end,
         ai_consent_version = case when p_event = 'granted' then p_version else null end,
         ai_consent_routing = case when p_event = 'granted' then v_routing else null end,
         updated_at = now()
   where id = auth.uid()
  returning ai_consent_at into v_at;
  return v_at;
end;
$$;
revoke all on function public.my_record_ai_consent(text, text, text, text, text) from public, anon;
grant execute on function public.my_record_ai_consent(text, text, text, text, text) to authenticated;

-- The support export includes the consent record (delete_account needs no change: the table cascades from
-- auth.users, and the trigger above lets that cascade through)
create or replace function public.admin_member_export(p_user uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform public.admin_guard('support');
  perform public.admin_log('member.export', p_user);
  return jsonb_build_object(
    'exported_at', now(),
    'account', (select jsonb_build_object('id', u.id, 'email', u.email, 'created_at', u.created_at, 'last_sign_in_at', u.last_sign_in_at)
                from auth.users u where u.id = p_user),
    'profile', (select to_jsonb(p) - 'booking_email_token' from public.user_profiles p where p.id = p_user),
    'trips', coalesce((select jsonb_agg(to_jsonb(t)) from public.trips t where t.owner_id = p_user), '[]'::jsonb),
    'bookings', coalesce((select jsonb_agg(to_jsonb(b) - 'raw_email_id') from public.bookings b where b.created_by = p_user), '[]'::jsonb),
    'activities', coalesce((select jsonb_agg(to_jsonb(a)) from public.trip_activities a where a.created_by = p_user), '[]'::jsonb),
    'loyalty', coalesce((select jsonb_agg(to_jsonb(l)) from public.loyalty_cards l where l.user_id = p_user), '[]'::jsonb),
    'stats', (select to_jsonb(s) from public.user_stats s where s.user_id = p_user),
    'badges', coalesce((select jsonb_agg(to_jsonb(b)) from public.user_badges b where b.user_id = p_user), '[]'::jsonb),
    'grants', coalesce((select jsonb_agg(to_jsonb(g)) from public.entitlement_grants g where g.user_id = p_user), '[]'::jsonb),
    'ai_consent', coalesce((select jsonb_agg(to_jsonb(c) order by c.id) from public.ai_consent_events c where c.user_id = p_user), '[]'::jsonb)
  );
end;
$$;

-- ── 3. Tries so far ───────────────────────────────────────────────────────────
alter table public.held_inbox_emails add column if not exists attempts integer not null default 0;

-- ── 4. Claim held emails ──────────────────────────────────────────────────────
-- Removes and returns up to p_n of the member's held emails, oldest first. Rows another call has locked are skipped.
-- Only for members who have said yes. Called by inbox-release with the service role; a signed-in caller could only
-- claim their own.
create or replace function public.claim_held_emails(p_user uuid, p_n integer default 1)
returns setof public.held_inbox_emails
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null and auth.uid() <> p_user then raise exception 'Not allowed'; end if;
  if not exists (select 1 from public.user_profiles where id = p_user and ai_consent_at is not null) then return; end if;
  return query
    delete from public.held_inbox_emails
     where id in (select h.id from public.held_inbox_emails h where h.user_id = p_user
                   order by h.received_at limit greatest(1, least(coalesce(p_n, 1), 5)) for update skip locked)
    returning *;
end;
$$;
revoke all on function public.claim_held_emails(uuid, integer) from public, anon, authenticated;
grant execute on function public.claim_held_emails(uuid, integer) to service_role;

-- ── 5. Table grants ───────────────────────────────────────────────────────────
revoke all on public.held_inbox_emails from anon, authenticated;
grant select, delete on public.held_inbox_emails to authenticated;
