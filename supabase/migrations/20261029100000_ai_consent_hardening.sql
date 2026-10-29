-- AI consent hardening (follow-up to 20261026120000_ai_consent). Ships as a file; apply after that one.
--
-- 1. Consent columns can't be written by the app directly (only my_set_ai_consent, which runs as the owner, sets them).
-- 2. my_set_ai_consent only accepts a known wording version.
-- 3. held_inbox_emails.attempts: tries so far; inbox-release drops an email after 5 failed tries.
-- 4. claim_held_emails: hands each held email to ONE release call (delete ... returning with skip locked), so two
--    calls at once can't file the same email twice. inbox-release puts an email back if the filing failed for a
--    temporary reason.
-- 5. Table grants made explicit.

-- ── 1. Guard the consent columns (same pattern as guard_booking_email_token) ──
-- security invoker on purpose: current_user is the caller ('authenticated' from the app, the owner inside
-- my_set_ai_consent, 'service_role' from Edge Functions). Local check, run as the owner:
--   set role authenticated; update public.user_profiles set ai_consent_at = now() where id = '<me>';  -- value unchanged
--   reset role; select public.my_set_ai_consent(true, 'v2-2026-10-29');                              -- value set
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
    else
      new.ai_consent_at := old.ai_consent_at;
      new.ai_consent_version := old.ai_consent_version;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_ai_consent on public.user_profiles;
create trigger guard_ai_consent
  before insert or update of ai_consent_at, ai_consent_version on public.user_profiles
  for each row execute function public.guard_ai_consent();

-- ── 2. Known wording versions only ────────────────────────────────────────────
-- When the wording changes, add the new version here (and bump AI_CONSENT_VERSION in the app).
create or replace function public.my_set_ai_consent(p_on boolean, p_version text default null)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare v_at timestamptz;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if p_on and p_version is distinct from 'v2-2026-10-29' then raise exception 'Unknown consent version'; end if;
  update public.user_profiles
     set ai_consent_at = case when p_on then now() else null end,
         ai_consent_version = case when p_on then p_version else null end,
         updated_at = now()
   where id = auth.uid()
  returning ai_consent_at into v_at;
  return v_at;
end;
$$;
revoke all on function public.my_set_ai_consent(boolean, text) from public, anon;
grant execute on function public.my_set_ai_consent(boolean, text) to authenticated;

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
