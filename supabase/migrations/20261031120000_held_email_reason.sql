-- Why a forwarded email is waiting in held_inbox_emails (nothing in it is read by the AI while it waits):
--   consent          no yes to AI reading yet (the default, as before)
--   over_free_limit  free plan past its forwarded-email limit: released once the member has First Class
--   retry            a temporary failure while filing (daily AI limit, database or AI trouble): inbox-release tries again
-- Additive. Apply BEFORE deploying receive-booking-email / inbox-release from this change.
alter table public.held_inbox_emails add column if not exists reason text not null default 'consent';
alter table public.held_inbox_emails drop constraint if exists held_inbox_emails_reason_check;
alter table public.held_inbox_emails add constraint held_inbox_emails_reason_check check (reason in ('consent', 'over_free_limit', 'retry'));

-- Claim: as before (only members with a current yes), but an over_free_limit email is handed out only once the member is
-- no longer over the free limit (email_import_locked is false after First Class, or while the limits switch is off).
create or replace function public.claim_held_emails(p_user uuid, p_n integer default 1)
returns setof public.held_inbox_emails
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null and auth.uid() <> p_user then raise exception 'Not allowed'; end if;
  if not exists (select 1 from public.user_profiles where id = p_user and ai_consent_at is not null
                    and ai_consent_version = 'v4-2026-10-29' and ai_consent_routing = 'deepseek-first+gemini-fallback; pdf/image gemini') then return; end if;
  return query
    delete from public.held_inbox_emails
     where id in (select h.id from public.held_inbox_emails h where h.user_id = p_user
                   and (h.reason <> 'over_free_limit' or not public.email_import_locked(p_user))
                   order by h.received_at limit greatest(1, least(coalesce(p_n, 1), 5)) for update skip locked)
    returning *;
end;
$$;
revoke all on function public.claim_held_emails(uuid, integer) from public, anon, authenticated;
grant execute on function public.claim_held_emails(uuid, integer) to service_role;
-- The daily purge (30 days) from 20261026120000_ai_consent.sql covers every reason.
