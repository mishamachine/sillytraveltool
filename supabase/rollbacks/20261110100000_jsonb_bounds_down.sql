-- Rollback for 20261110100000_jsonb_bounds.sql. Run by hand; the Supabase CLI does not run this folder.
alter table public.analytics_events drop constraint if exists analytics_props_ok;
alter table public.wallet_documents drop constraint if exists wallet_parsed_ok;
drop function if exists public.json_ok(jsonb);
