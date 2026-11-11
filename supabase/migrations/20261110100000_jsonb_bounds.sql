set lock_timeout = '3s';

-- Bound numeric values in client-writable jsonb columns (analytics_events.props, wallet_documents.parsed_data).
--
-- Allowed: any number with 1e-12 <= |x| <= 1e15, and a plain zero (no more than 20 decimal places). Epoch milliseconds (~1.8e12), amounts, coordinates and ids
-- fit with room to spare. Nothing in the app writes parsed_data today; analytics props are rounded to 2 decimals.

create or replace function public.json_ok(j jsonb) returns boolean language sql immutable parallel safe set search_path = '' as $$
  select j is null or (
    not jsonb_path_exists(j, 'strict $.** ? (@.type() == "number" && (@ > 1e15 || @ < -1e15 || (@ != 0 && @ < 1e-12 && @ > -1e-12)))')
    and not exists (select 1 from jsonb_path_query(j, 'strict $.** ? (@.type() == "number" && @ == 0)') v where scale(v::numeric) > 20))
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
  add constraint wallet_parsed_ok check (pg_column_size(parsed_data) < 262144 and public.json_ok(parsed_data)) not valid;
