# jsonb bounds: apply, validate, roll back

Migration: `supabase/migrations/20261110100000_jsonb_bounds.sql`. Rollback: `supabase/rollbacks/20261110100000_jsonb_bounds_down.sql`.

## Why
Postgres stores `1e131071` in a few bytes but prints it in full (about 131 KB). An array of them in a client-writable
jsonb column makes one row's read use huge memory. `public.json_ok(jsonb)` rejects any number above 1e15 in magnitude, and any
non-zero number smaller than 1e-12 in magnitude, anywhere in the document. Two CHECK constraints use it:
`analytics_events.props` (also under 16 KB) and `wallet_documents.parsed_data`.

## Apply
1. Apply the migration the normal way (`supabase db push`, or paste the file in the SQL editor). It takes a brief lock only; both constraints are NOT VALID, so no table scan.
2. Check: `select conname, convalidated from pg_constraint where conname in ('analytics_props_ok','wallet_parsed_ok');` shows both with `convalidated = false`.
3. Smoke test as a signed-in test user: a normal analytics insert works, and an insert of props `[1e15]` is fine while `[1e16]` fails with a check violation.

## Validate (later, separate step)
Existing rows were not checked. First look for rows that would fail:
```sql
select count(*) from public.analytics_events where not public.json_ok(props);
select count(*) from public.wallet_documents where not public.json_ok(parsed_data);
```
Do not run a plain `select *` over a bad row: it prints in full. Count only. If both counts are 0, run:
```sql
alter table public.analytics_events validate constraint analytics_props_ok;
alter table public.wallet_documents validate constraint wallet_parsed_ok;
```
Validation scans the table and takes a lighter lock (SHARE UPDATE EXCLUSIVE). If a count is above 0, delete or null those rows first (owner decision).

## Roll back
Run `supabase/rollbacks/20261110100000_jsonb_bounds_down.sql`. It drops both constraints and the function.
