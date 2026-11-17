import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const W = fileURLToPath(new URL('../../supabase/migrations/', import.meta.url))
const read = f => readFileSync(W + f, 'utf8')
const slice = (txt, from, to) => { const a = txt.indexOf(from); const b = txt.indexOf(to, a); if (a < 0 || b < 0) throw new Error('migration text moved: ' + from); return txt.slice(a, b) }
const MIG = read('20261116100000_delete_account_stats_fix.sql')
const U = '11111111-1111-1111-1111-111111111111', V = '22222222-2222-2222-2222-222222222222'
let fails = 0
const ok = (name, cond, extra = '') => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name} ${cond ? '' : extra}`) }


// Two starting points: the database as the earlier migrations leave it WITH the 20261023150000 guard, and WITHOUT it
// (what happens if its text replacement did not match, which is how the production error is explained).
async function build(guard) {
  const db = new PGlite()
  // Minimal schema in the real shape (columns the stats function reads; FKs as in supabase-migration.sql)
  await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth; create table auth.users (id uuid primary key, email text);
  create type public.badge_tier as enum ('easy','medium','hard','legendary');
  create type public.booking_type as enum ('flight','hotel','restaurant');
  create table public.admins (user_id uuid, role text);
  create table public.trips (id uuid primary key default gen_random_uuid(), owner_id uuid references auth.users(id) on delete cascade,
    status text default 'planned', start_date date, end_date date, destination_country_code text);
  create table public.bookings (id uuid primary key default gen_random_uuid(), trip_id uuid references public.trips(id) on delete cascade,
    created_by uuid not null references auth.users(id), type public.booking_type default 'flight', notes text, passenger_name text);
  create table public.trip_activities (id uuid primary key default gen_random_uuid(), trip_id uuid references public.trips(id) on delete cascade,
    created_by uuid not null references auth.users(id), category text, notes text, completed_by uuid references auth.users(id));
  create table public.trip_collaborators (id uuid primary key default gen_random_uuid(), trip_id uuid references public.trips(id) on delete cascade,
    user_id uuid references auth.users(id) on delete set null, invited_by uuid references auth.users(id), invited_email text, status text default 'pending');
  create table public.api_usage (day date, user_id uuid, service text, endpoint text, calls int, unique(day,user_id,service,endpoint));
  create table public.ai_calls (user_id uuid); create table public.function_errors (user_id uuid);
  create table public.ingest_locks (user_id uuid); create table public.former_members (user_id uuid);
  create table public.user_stats (user_id uuid primary key references auth.users(id) on delete cascade,
    countries_visited int default 0, trips_completed int default 0, trips_created int default 0, total_flights int default 0, days_abroad int default 0,
    restaurants_added int default 0, museums_visited int default 0, activities_added int default 0, goose_score int default 0, updated_at timestamptz default now());
  create table public.user_badges (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
    badge_id text not null, badge_tier public.badge_tier not null, unique(user_id, badge_id));
  `)
  // The real stats function and triggers, lifted from the migrations (so this test follows them)
  const p1 = read('20261021180100_phase1_security_analytics.sql')
  await db.exec(slice(p1, 'create or replace function public.recompute_user_stats', '-- ────────────────────────────────────────────────────────────\n-- D. analytics_events'))
  const p0 = read('20261021120000_phase0_security_and_stats.sql')
  await db.exec(slice(p0, 'create or replace function public.trg_recompute_user_stats', '-- ────────────────────────────────────────────────────────────\n-- C4'))
  const fm = read('20261023150000_former_members.sql')
  if (guard) await db.exec(fm.slice(fm.indexOf('-- Account deletion fix')))
  // The real delete_account, latest definition
  const dels = ['20261024030000_delete_account.sql', '20261030120100_invite_privacy_cleanup.sql']
  const last = dels.map(f => read(f)).filter(t => /create or replace function public\.delete_account/.test(t)).pop()
  await db.exec(last.slice(last.indexOf('create or replace function public.delete_account'), last.indexOf('revoke all on function public.delete_account')))

  return db
}
const ID = u => u.replace(/^.{4}/, 'aaaa')
async function seed(db, user) {
  await db.exec(`insert into auth.users values ('${user}','${user.slice(0, 4)}@x.com') on conflict do nothing;
   insert into public.trips (id, owner_id, status, start_date, end_date, destination_country_code) values
     ('${ID(user)}', '${user}', 'completed', '2026-01-01', '2026-01-05', 'FR');
   insert into public.bookings (trip_id, created_by, type) values ('${ID(user)}', '${user}', 'flight');
   insert into public.trip_activities (trip_id, created_by, category) values ('${ID(user)}', '${user}', 'food');
   insert into public.user_badges (user_id, badge_id, badge_tier) values ('${user}','first_honk','easy'),('${user}','ocean','legendary');`)
}
const del = (db, u) => db.query(`select public.delete_account('${u}') r`).then(r => ({ ok: true }), e => ({ ok: false, e: e.message }))
const count = async (db, t, col, u) => (await db.query(`select count(*)::int n from ${t} where ${col}='${u}'`)).rows[0].n

for (const guard of [true, false]) {
  const label = guard ? 'with the earlier guard' : 'without the earlier guard'
  const db = await build(guard)
  await seed(db, U); await seed(db, V)
  ok(`[${label}] seed: Goose score row exists and 2 badges`, (await db.query(`select goose_score from public.user_stats where user_id='${U}'`)).rows[0]?.goose_score > 0
    && await count(db, 'public.user_badges', 'user_id', U) === 2)
  if (!guard) { // the production error, before the fix
    const before = await del(db, U)
    ok(`[${label}] BEFORE the migration: deletion hits the user_stats foreign key (reproduces the report)`, !before.ok && /user_stats_user_id_fkey/.test(before.e), before.e)
    ok(`[${label}] BEFORE: the failed delete rolled back (account still there)`, await count(db, 'auth.users', 'id', U) === 1)
  }
  await db.exec(MIG); await db.exec(MIG) // idempotent
  const res = await del(db, U)
  ok(`[${label}] AFTER the migration: delete succeeds for a member with a Goose score and badges`, res.ok, res.e)
  for (const [t, c] of [['public.user_stats', 'user_id'], ['public.user_badges', 'user_id'], ['public.bookings', 'created_by'], ['public.trip_activities', 'created_by'], ['public.trips', 'owner_id'], ['auth.users', 'id']])
    ok(`[${label}] ${t}: nothing left for the deleted member`, await count(db, t, c, U) === 0)
  ok(`[${label}] no stats row was re-created for the deleted member`, await count(db, 'public.user_stats', 'user_id', U) === 0)
  ok(`[${label}] other member untouched (stats row and 2 badges kept)`, await count(db, 'public.user_stats', 'user_id', V) === 1 && await count(db, 'public.user_badges', 'user_id', V) === 2)
  // stats triggers still work for live members after the migration
  await db.exec(`insert into public.user_badges (user_id, badge_id, badge_tier) values ('${V}','third','hard')`)
  const sc = (await db.query(`select goose_score from public.user_stats where user_id='${V}'`)).rows[0].goose_score
  ok(`[${label}] stats still recompute for a live member (badge points counted)`, sc >= 10 + 25 + 100 + 50 + 3, String(sc))
  const only = '33333333-3333-3333-3333-333333333333'
  await db.exec(`insert into auth.users values ('${only}','c@x.com'); insert into public.user_stats (user_id) values ('${only}')`)
  const r3 = await del(db, only); ok(`[${label}] delete works for a member with only a stats row`, r3.ok, r3.e)
  const again = await del(db, U); ok(`[${label}] deleting again says "No such account", not a constraint error`, !again.ok && /No such account/.test(again.e), again.e)
  ok(`[${label}] flag does not leak past the transaction`, ((await db.query(`select current_setting('stt.deleting_account', true) v`)).rows[0].v || '') === '')
}
console.log(fails ? `\n${fails} FAILED` : '\nall passed'); process.exit(fails ? 1 : 0)
