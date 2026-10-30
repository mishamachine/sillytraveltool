-- AI reading consent (Apple guideline 5.1.2(i); legal review L1). Before Goose's AI (DeepSeek, China; Google Gemini
-- for photos and PDFs) reads anything a member imports or types to translate, the member says yes once.
--
-- 1. user_profiles.ai_consent_at / ai_consent_version: when they said yes, and to which wording. Null = not yet, or
--    turned off in Settings. Set through my_set_ai_consent so the time is the server's.
-- 2. held_inbox_emails: forwarded emails that arrived before the yes. Only Resend's email id, the sender's domain and
--    the subject are kept (no body); inbox-release fetches the email again from Resend and files it after the yes.
--    Rows cascade with the account and are dropped after 30 days.

-- ── 1. Consent ────────────────────────────────────────────────────────────────
alter table public.user_profiles
  add column if not exists ai_consent_at timestamptz,
  add column if not exists ai_consent_version text;

create or replace function public.my_set_ai_consent(p_on boolean, p_version text default null)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare v_at timestamptz;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  update public.user_profiles
     set ai_consent_at = case when p_on then now() else null end,
         ai_consent_version = case when p_on then left(coalesce(p_version, 'v1'), 20) else null end,
         updated_at = now()
   where id = auth.uid()
  returning ai_consent_at into v_at;
  return v_at;
end;
$$;
revoke all on function public.my_set_ai_consent(boolean, text) from public, anon;
grant execute on function public.my_set_ai_consent(boolean, text) to authenticated;

-- ── 2. Held forwarded emails ──────────────────────────────────────────────────
create table if not exists public.held_inbox_emails (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  email_id text not null check (length(email_id) <= 200),
  from_domain text check (length(from_domain) <= 120),
  subject text check (length(subject) <= 200),
  received_at timestamptz not null default now(),
  unique (user_id, email_id)
);
create index if not exists held_inbox_emails_user_idx on public.held_inbox_emails (user_id, received_at);

alter table public.held_inbox_emails enable row level security;
-- Members see and dismiss their own; only the server (service role) adds them
drop policy if exists held_own_select on public.held_inbox_emails;
create policy held_own_select on public.held_inbox_emails for select to authenticated using (user_id = auth.uid());
drop policy if exists held_own_delete on public.held_inbox_emails;
create policy held_own_delete on public.held_inbox_emails for delete to authenticated using (user_id = auth.uid());
revoke insert, update on public.held_inbox_emails from anon, authenticated;
grant select, delete on public.held_inbox_emails to authenticated;

-- Held emails older than 30 days are dropped (Resend may no longer have them; the member can forward again)
select cron.unschedule('purge-held-emails') where exists (select 1 from cron.job where jobname = 'purge-held-emails');
select cron.schedule('purge-held-emails', '37 3 * * *', $cron$delete from public.held_inbox_emails where received_at < now() - interval '30 days'$cron$);
