-- Bound client-writable jsonb. Postgres stores a number like 1e131071 in a few bytes but prints it in full (about
-- 131 KB) when read back, so an array of them makes one row's read exhaust memory. Two columns take jsonb straight
-- from signed-in clients under RLS: analytics_events.props and wallet_documents.parsed_data. A CHECK that rejects
-- numbers outside a sane range stops that at insert and update time.
--
-- Allowed: any number with 1e-12 <= |x| <= 1e15, and 0. Epoch milliseconds (~1.8e12), amounts, coordinates and ids
-- fit with room to spare. Nothing in the app writes parsed_data today; analytics props are rounded to 2 decimals.

create or replace function public.json_ok(j jsonb)
returns boolean
language sql immutable parallel safe
set search_path = ''
as $$
  select j is null or not jsonb_path_exists(j,
    'strict $.** ? (@.type() == "number" && (@ > 1e15 || @ < -1e15 || (@ != 0 && @ < 1e-12 && @ > -1e-12)))')
$$;

-- A CHECK calls the function as the inserting role, so signed-in clients and the service role need execute.
-- Not callable by anon or the public.
revoke all on function public.json_ok(jsonb) from public, anon;
grant execute on function public.json_ok(jsonb) to authenticated, service_role;

-- NOT VALID: new and changed rows are checked, existing rows are not scanned or blocked.
-- A later, separate step (owner): alter table ... validate constraint ... (see docs/JSONB_BOUNDS_RUNBOOK.md).
alter table public.analytics_events
  add constraint analytics_props_ok check (public.json_ok(props) and pg_column_size(props) < 16384) not valid;
alter table public.wallet_documents
  add constraint wallet_parsed_ok check (public.json_ok(parsed_data)) not valid;
