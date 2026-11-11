-- Runs the usage_reader migration on the real supabase/postgres image as the non-superuser `postgres` role
-- (real auth.users, real Vault). pg_net is not installed in the image, so net.http_post is a stub that records calls.
-- See scripts/test-migrations/container/run.sh.
\set ON_ERROR_STOP on
create table public.admins (user_id uuid, role text);
create table public.email_sends (id bigint generated always as identity primary key, email text not null, kind text not null, status text not null, created_at timestamptz not null default now());
create table public.invite_sends (id bigint generated always as identity primary key, sender uuid not null, recipient_hash text not null, trip_id uuid not null, created_at timestamptz not null default now());
create table public.beta_waitlist (id bigint generated always as identity primary key, email text not null, confirmation_sent_at timestamptz, invited_at timestamptz);
create table public.trips (id uuid primary key default gen_random_uuid(), title text);
alter table public.email_sends enable row level security; alter table public.invite_sends enable row level security; alter table public.beta_waitlist enable row level security;
revoke all on public.email_sends, public.invite_sends, public.beta_waitlist from public, anon, authenticated;
create schema net; create table net.calls (body jsonb, headers jsonb);
create function net.http_post(url text, headers jsonb, body jsonb, timeout_milliseconds int default 5000) returns bigint language sql as $$ insert into net.calls values (body, headers); select 1::bigint $$;
select vault.create_secret('x', 'cost_alert_token', 'test') is not null as vault_secret;
select 'current_user=' || current_user || ' superuser=' || (select rolsuper from pg_roles where rolname = current_user) as who;
\i supabase/migrations/20261111070000_usage_reader.sql
do $$ begin
  assert (select not rolcanlogin and not rolsuper and not rolbypassrls and rolpassword is null from pg_authid where rolname = 'usage_reader'), 'role flags';
  assert (select proowner::regrole::text from pg_proc where proname = 'stt_email_usage_counts') = 'usage_reader', 'owner';
  assert not has_schema_privilege('usage_reader', 'public', 'CREATE'), 'no create left';
end $$;
-- fixtures: PII in rows the role must never return
insert into auth.users (id, email, confirmation_sent_at, recovery_sent_at) values (gen_random_uuid(), 'secret.person@example.test', now(), now()), (gen_random_uuid(), 'other@example.test', now(), null);
insert into public.email_sends (email, kind, status) select 'bulk@example.test', 'service', 'sent' from generate_series(1, 40);
insert into public.invite_sends (sender, recipient_hash, trip_id) values (gen_random_uuid(), 'hashvalue', gen_random_uuid());
insert into public.beta_waitlist (email, confirmation_sent_at) values ('beta.person@example.test', now());
insert into public.admins select id, 'owner' from auth.users where email = 'secret.person@example.test';
do $$
declare s text; denied int := 0;
begin
  set local role usage_reader;
  foreach s in array array['select id from auth.users','select email from auth.users','select * from auth.users','select email from public.email_sends','select kind from public.email_sends','select status from public.email_sends','select sender from public.invite_sends','select recipient_hash from public.invite_sends','select email from public.beta_waitlist','select * from public.trips','select * from public.admins',
    'insert into public.email_sends (email, kind, status) values (''a'',''b'',''sent'')','delete from public.invite_sends','update public.beta_waitlist set invited_at = now()'] loop
    begin execute s; raise exception 'NOT DENIED: %', s; exception when insufficient_privilege then denied := denied + 1; end;
  end loop;
  perform count(*) from public.email_sends where created_at is not null; perform count(*) from usage_private.auth_email_stamps where confirmation_sent_at is not null;
  reset role;
  raise notice 'usage_reader denied % statements', denied;
end $$;
do $$ declare r text; begin
  foreach r in array array['anon','authenticated'] loop
    execute 'set local role ' || r;
    begin perform * from public.stt_email_usage_counts(); raise exception 'EXEC ALLOWED %', r; exception when insufficient_privilege then null; end;
    begin perform public.stt_usage_check(); raise exception 'CHECK ALLOWED %', r; exception when insufficient_privilege then null; end;
    begin perform public.usage_alert_recipients(); raise exception 'RECIPIENTS ALLOWED %', r; exception when insufficient_privilege then null; end;
    reset role;
  end loop;
end $$;
set role service_role;
select auth_confirm_today, auth_recovery_today, app_email_sends_today, app_invite_sends_today, beta_today from public.stt_email_usage_counts();
do $$ declare c jsonb; begin
  assert (select auth_confirm_today from public.stt_email_usage_counts()) = 2 and (select app_email_sends_today from public.stt_email_usage_counts()) = 40 and (select beta_today from public.stt_email_usage_counts()) = 1, 'counts';
  assert public.usage_alert_recipients() = array['secret.person@example.test'], 'recipients';
  c := public.stt_usage_check(); assert jsonb_array_length(c -> 'fired') >= 1, 'fires';
  perform public.stt_usage_check(); perform public.stt_usage_check();
end $$;
reset role;
do $$ begin
  assert (select count(*) from net.calls where body ->> 'scope' = 'day') = 1, 'day alert exactly once';
  assert not exists (select 1 from net.calls where body::text ~ '@|hashvalue|[0-9a-f]{8}-[0-9a-f]{4}-'), 'no PII in body';
end $$;
\i supabase/rollbacks/20261111070000_usage_reader_down.sql
do $$ begin assert not exists (select 1 from pg_roles where rolname = 'usage_reader') and not exists (select 1 from pg_proc where proname like 'stt_%usage%'), 'rollback'; end $$;
select 'ALL PASSED' as result;
