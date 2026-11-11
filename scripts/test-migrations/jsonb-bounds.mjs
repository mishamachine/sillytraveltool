// SQL-level test for 20261110100000_jsonb_bounds.sql, run on PGlite (real Postgres 16 compiled to WASM), like the
// other migration tests. Table shapes copy the real definitions (analytics_events from 20261021180100, wallet_documents
// from supabase-migration.sql).  node scripts/test-migrations/jsonb-bounds.mjs
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const W = fileURLToPath(new URL('../../supabase/migrations/', import.meta.url))
const R = fileURLToPath(new URL('../../supabase/rollbacks/', import.meta.url))
const db = new PGlite()
const U = '11111111-1111-1111-1111-111111111111'
let fails = 0
const ok = (name, cond, extra = '') => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name} ${cond ? '' : extra}`) }
const q = async s => (await db.query(s)).rows
const rejects = async sql => { try { await db.exec(sql); return false } catch (e) { return /check|violates/i.test(e.message) ? true : (console.log('  other error:', e.message), false) } }
const accepts = async sql => { try { await db.exec(sql); return true } catch (e) { console.log('  error:', e.message); return false } }

await db.exec(`
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth; create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql as $$ select '${U}'::uuid $$;
insert into auth.users values ('${U}');
create type document_type as enum ('passport', 'visa', 'insurance', 'id', 'vaccine', 'other');
create table public.analytics_events (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  session_id text check (session_id is null or char_length(session_id) <= 64),
  event text not null check (char_length(event) between 1 and 64),
  screen text check (screen is null or char_length(screen) <= 64),
  props jsonb not null default '{}'::jsonb check (pg_column_size(props) <= 4096),
  app_version text, platform text, ts timestamptz not null default now());
create table public.wallet_documents (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  type document_type not null, title text not null, parsed_data jsonb, notes text);
grant usage on schema public, auth to authenticated, anon; grant all on all tables in schema public to authenticated, service_role;
grant execute on function auth.uid() to authenticated;
-- rows that exist before the migration, including a bomb (inserted as the owner)
insert into public.analytics_events (event, props) values ('old_ok', '{"n": 1}'), ('old_bomb', '[1e131071]');
insert into public.wallet_documents (user_id, type, title, parsed_data) values ('${U}', 'other', 'old bomb', '[1e131071]'), ('${U}', 'other', 'old ok', '{"a": 1}');
`)

await db.exec(readFileSync(W + '20261110100000_jsonb_bounds.sql', 'utf8'))

// --- NOT VALID leaves existing rows alone ---
ok('existing rows untouched (4 rows, none scanned or blocked)', (await q(`select (select count(*) from public.analytics_events) a, (select count(*) from public.wallet_documents) w`))[0].a == 2
  && (await q(`select count(*) c from public.wallet_documents`))[0].c == 2)
ok('both constraints exist and are NOT validated', (await q(`select count(*) c from pg_constraint where conname in ('analytics_props_ok','wallet_parsed_ok') and not convalidated`))[0].c == 2)
ok('json_ok flags the old bombs without printing them', (await q(`select count(*) c from public.analytics_events where not public.json_ok(props)`))[0].c == 1
  && (await q(`select count(*) c from public.wallet_documents where not public.json_ok(parsed_data)`))[0].c == 1)
ok('VALIDATE fails while a bad row exists (so the owner must clean first)', await rejects(`alter table public.analytics_events validate constraint analytics_props_ok`))
ok('updating an old bad wallet row is also blocked until it is fixed', await rejects(`update public.wallet_documents set notes = 'x' where title = 'old bomb'`))
ok('fixing the old bad row works', await accepts(`update public.wallet_documents set parsed_data = null where title = 'old bomb'`))

// --- as a signed-in client ---
await db.exec(`set role authenticated`)
const bad = [
  `[1e131071]`, `{"a": {"b": [1, 2, 1e131071]}}`, `[1e15000]`, `[1000000000000001]`, `[1e16]`, `[-1e16]`, `{"k": 1e-13}`, `[-1e-13]`, `[[[[[1e999]]]]]`, `0e-16383`, `[-0e-16383]`, `{"a": [{"b": 0e-30}]}`, `[0e-21]`,
]
for (const j of bad) {
  ok(`analytics rejects ${j}`, await rejects(`insert into public.analytics_events (event, props) values ('t', '${j}')`))
  ok(`wallet rejects ${j}`, await rejects(`insert into public.wallet_documents (user_id, type, title, parsed_data) values ('${U}', 'other', 't', '${j}')`))
}
ok('wallet rejects bomb on UPDATE', await rejects(`update public.wallet_documents set parsed_data = '[1e131071]' where title = 'old ok'`))
for (const j of [`{}`, `[]`, `{"n": 0}`, `{"n": 1e15}`, `{"n": -1e15}`, `{"n": 1e-12}`, `{"n": 0.01}`, `{"ts": 1800000000000}`, `{"lat": 51.5074, "lng": -0.1278}`, `{"s": "1e131071"}`, `{"z": 0.0}`, `{"d": null, "b": true}`]) {
  ok(`analytics accepts ${j}`, await accepts(`insert into public.analytics_events (event, props) values ('t', '${j}')`))
}
ok('analytics accepts typical events', await accepts(`insert into public.analytics_events (event, screen, props, platform) values
  ('screen_view', 'trips', '{"path":"trips/detail"}', 'ios'), ('active_time', 'plan', '{"path":"plan","seconds":42.5}', 'web'),
  ('session_start', null, '{"days_since":3,"dark":true,"lang":"en","width":390}', 'android'), ('import_parsed', 'trips', '{"bookings":4,"matched_trip":true}', 'web')`))
// a realistic multi-page parsed document: amounts, ISO dates, coordinates, ids, epoch ms, nested pages
const pages = Array.from({ length: 40 }, (_, i) => ({ page: i + 1, text_len: 1800 + i, items: [
  { kind: 'flight', pnr: 'ABC123', amount: 1234.56, currency: 'GBP', depart: '2026-12-01T09:45:00+00:00', from: { iata: 'SFO', lat: 37.6213, lng: -122.379 }, to: { iata: 'LHR', lat: 51.47, lng: -0.4543 }, seat: '23A', epoch_ms: 1796118300000, ids: [10000000001, 20000000002] },
  { kind: 'hotel', nights: 3, rate: 189.0, tax: 0.0, total: 567, geo: { lat: 51.5246, lng: -0.0799 }, ref: 48211734 }] }))
ok('wallet accepts a 40-page parsed document', await accepts(`insert into public.wallet_documents (user_id, type, title, parsed_data) values ('${U}', 'other', 'multi', '${JSON.stringify({ pages, confidence: 0.93 })}')`))
const big = JSON.stringify({ pages: Array.from({ length: 100 }, () => ({ text: 'x'.repeat(2000) })) })
ok(`wallet accepts a large parsed document (${Math.round(big.length / 1024)} KB)`, await accepts(`insert into public.wallet_documents (user_id, type, title, parsed_data) values ('${U}', 'other', 'huge text', '${big}')`))
ok('wallet rejects parsed_data of 256 KB or more', await rejects(`insert into public.wallet_documents (user_id, type, title, parsed_data) values ('${U}', 'other', 't', '{"s": "${'x'.repeat(262200)}"}')`))
ok('zero with up to 20 decimals is fine', await accepts(`insert into public.analytics_events (event, props) values ('t', '{"z": 0.00000000000000000000}')`))
ok('props of 16 KB or more are rejected', await rejects(`insert into public.analytics_events (event, props) values ('t', '{"s": "${'x'.repeat(16400)}"}')`))
ok('props just under the existing 4 KB cap still pass', await accepts(`insert into public.analytics_events (event, props) values ('t', '{"s": "${'x'.repeat(3000)}"}')`))
ok('json_ok(null) is true', (await q(`select public.json_ok(null) v`))[0].v === true)
await db.exec(`reset role; set role anon`)
ok('anon cannot call json_ok', await (async () => { try { await db.exec(`select public.json_ok('{}')`); return false } catch (e) { return /permission denied/.test(e.message) } })())
await db.exec(`reset role`)

// --- rollback ---
await db.exec(readFileSync(R + '20261110100000_jsonb_bounds_down.sql', 'utf8'))
ok('rollback removes both constraints and the function', (await q(`select (select count(*) from pg_constraint where conname in ('analytics_props_ok','wallet_parsed_ok')) c, (select count(*) from pg_proc where proname='json_ok') f`))[0].c == 0
  && (await q(`select count(*) f from pg_proc where proname='json_ok'`))[0].f == 0)
console.log(fails ? `\n${fails} FAILED` : '\nall passed')
process.exit(fails ? 1 : 0)
