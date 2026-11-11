-- Runs the jsonb bounds migration on the real supabase/postgres image as the non-superuser `postgres` role.
-- See scripts/test-migrations/container/run.sh. Exits non-zero (ON_ERROR_STOP) at the first failed assertion.
\set ON_ERROR_STOP on
create temp table _t (n int);  -- keeps psql quiet if a previous run left objects; tables below are created fresh
drop table if exists public.analytics_events, public.wallet_documents cascade;
drop type if exists public.document_type cascade;
create type public.document_type as enum ('passport', 'visa', 'insurance', 'id', 'vaccine', 'other');
create table public.analytics_events (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid(), session_id text, event text not null check (char_length(event) between 1 and 64),
  screen text, props jsonb not null default '{}'::jsonb check (pg_column_size(props) <= 4096), ts timestamptz not null default now());
create table public.wallet_documents (id uuid primary key default gen_random_uuid(), user_id uuid not null, type public.document_type not null, title text not null, parsed_data jsonb, notes text);
grant all on public.analytics_events, public.wallet_documents to authenticated, service_role;
insert into public.analytics_events (user_id, event, props) values (gen_random_uuid(), 'old_bomb', '[1e131071]');
insert into public.wallet_documents (user_id, type, title, parsed_data) values (gen_random_uuid(), 'other', 'old bomb', '[1e131071]');
\i supabase/migrations/20261110100000_jsonb_bounds.sql
select 'current_user=' || current_user || ' superuser=' || (select rolsuper from pg_roles where rolname = current_user) as who;
do $$ begin
  assert (select count(*) from public.analytics_events) = 1 and (select count(*) from public.wallet_documents) = 1, 'old rows kept';
  assert (select count(*) from pg_constraint where conname in ('analytics_props_ok','wallet_parsed_ok') and not convalidated) = 2, 'not validated';
end $$;
set role authenticated;
do $$
declare j text; ok_n int := 0; bad_n int := 0;
begin
  foreach j in array array['[1e131071]','{"a":{"b":[1,1e131071]}}','[1000000000000001]','[1e16]','[-1e16]','{"k":1e-13}','[-1e-13]','0e-16383','[-0e-16383]','{"a":[{"b":0e-30}]}','[0e-21]'] loop
    begin insert into public.analytics_events (user_id, event, props) values (gen_random_uuid(), 't', j::jsonb); raise exception 'ACCEPTED %', j;
    exception when check_violation then bad_n := bad_n + 1; end;
    begin insert into public.wallet_documents (user_id, type, title, parsed_data) values (gen_random_uuid(), 'other', 't', j::jsonb); raise exception 'ACCEPTED %', j;
    exception when check_violation then bad_n := bad_n + 1; end;
  end loop;
  foreach j in array array['{}','[]','{"n":0}','{"n":1e15}','{"n":-1e15}','{"n":1e-12}','{"n":0.01}','{"ts":1800000000000}','{"lat":51.5074,"lng":-0.1278}','{"s":"1e131071"}','{"z":0.00000000000000000000}','{"d":null,"b":true}'] loop
    insert into public.analytics_events (user_id, event, props) values (gen_random_uuid(), 't', j::jsonb);
    insert into public.wallet_documents (user_id, type, title, parsed_data) values (gen_random_uuid(), 'other', 't', j::jsonb); ok_n := ok_n + 1;
  end loop;
  begin insert into public.wallet_documents (user_id, type, title, parsed_data) values (gen_random_uuid(), 'other', 't', jsonb_build_object('s', repeat('x', 262200))); raise exception 'ACCEPTED 256KB';
  exception when check_violation then bad_n := bad_n + 1; end;
  begin insert into public.analytics_events (user_id, event, props) values (gen_random_uuid(), 't', jsonb_build_object('s', repeat('x', 16400))); raise exception 'ACCEPTED 16KB';
  exception when check_violation then bad_n := bad_n + 1; end;
  raise notice 'rejected % bad inputs, accepted % good inputs', bad_n, ok_n;
end $$;
reset role;
set role anon;
do $$ begin begin perform public.json_ok('{}'); raise exception 'anon could call json_ok'; exception when insufficient_privilege then null; end; end $$;
reset role;
-- VALIDATE fails while a bad row exists; old rows are untouched
do $$ begin begin alter table public.analytics_events validate constraint analytics_props_ok; raise exception 'validate passed'; exception when check_violation then null; end; end $$;
\i supabase/rollbacks/20261110100000_jsonb_bounds_down.sql
do $$ begin assert (select count(*) from pg_proc where proname = 'json_ok') = 0 and (select count(*) from pg_constraint where conname in ('analytics_props_ok','wallet_parsed_ok')) = 0, 'rollback'; end $$;
select 'ALL PASSED' as result;
