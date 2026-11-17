import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { createHmac, createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
const W = fileURLToPath(new URL('../../supabase/migrations/', import.meta.url))
const read = f => readFileSync(W + f, 'utf8')
const slice = (txt, from, to) => { const a = txt.indexOf(from); const b = txt.indexOf(to, a); if (a < 0 || b < 0) throw new Error('migration text moved: ' + from); return txt.slice(a, b) }
const STATS = read('20261116100000_delete_account_stats_fix.sql')
const MIG = read('20261117100000_email_sends_hash.sql')
const KEY = 'test-key-not-a-real-secret-0123456789abcdef', KEY2 = 'another-test-key-0123456789abcdef-xyz'
const U = '11111111-1111-1111-1111-111111111111', V = '22222222-2222-2222-2222-222222222222'
const ADDR = 'Alice.Traveller@Example.com'
let fails = 0
const ok = (name, cond, extra = '') => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name} ${cond ? '' : extra}`) }
const expected = (addr, key = KEY) => 'h1:' + createHmac('sha256', key).update(addr.trim().toLowerCase()).digest('hex')

async function build() {
  const db = new PGlite()
  await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth; create table auth.users (id uuid primary key, email text);
  create schema extensions; create schema vault;
  create table vault.secrets (name text primary key, secret text);
  create view vault.decrypted_secrets as select name, secret as decrypted_secret from vault.secrets;
  -- Test stand-in for pgcrypto's hmac (RFC 2104 over the built-in sha256); checked against Node's createHmac below.
  -- Production uses the real extensions.hmac from pgcrypto.
  create function extensions.hmac(d bytea, k bytea, t text) returns bytea language plpgsql immutable as $f$
  declare kk bytea := k; ip bytea; op bytea; i int;
  begin
    if t <> 'sha256' then raise exception 'test shim: sha256 only'; end if;
    if length(kk) > 64 then kk := sha256(kk); end if;
    kk := kk || decode(repeat('00', 64 - length(kk)), 'hex');
    ip := kk; op := kk;
    for i in 0..63 loop ip := set_byte(ip, i, get_byte(kk, i) # 54); op := set_byte(op, i, get_byte(kk, i) # 92); end loop;
    return sha256(op || sha256(ip || d));
  end $f$;
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
  create table public.ingest_locks (user_id uuid);
  create table public.former_members (id bigint generated always as identity primary key, user_id uuid, email text);
  create table public.user_stats (user_id uuid primary key references auth.users(id) on delete cascade,
    countries_visited int default 0, trips_completed int default 0, trips_created int default 0, total_flights int default 0, days_abroad int default 0,
    restaurants_added int default 0, museums_visited int default 0, activities_added int default 0, goose_score int default 0, updated_at timestamptz default now());
  create table public.user_badges (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
    badge_id text not null, badge_tier public.badge_tier not null, unique(user_id, badge_id));
  `)
  // email_sends in the real shape (20261023160000_member_emails.sql)
  const me = read('20261023160000_member_emails.sql')
  await db.exec(slice(me, 'create table if not exists public.email_sends', 'create index if not exists email_sends_user'))
  const p1 = read('20261021180100_phase1_security_analytics.sql')
  await db.exec(slice(p1, 'create or replace function public.recompute_user_stats', '-- ────────────────────────────────────────────────────────────\n-- D. analytics_events'))
  const p0 = read('20261021120000_phase0_security_and_stats.sql')
  await db.exec(slice(p0, 'create or replace function public.trg_recompute_user_stats', '-- ────────────────────────────────────────────────────────────\n-- C4'))
  await db.exec(STATS) // the live delete_account this migration builds on
  return db
}
const q = async (db, sql) => (await db.query(sql)).rows
const setKey = (db, k) => db.exec(`delete from vault.secrets where name='email_hash_key'; ${k ? `insert into vault.secrets values ('email_hash_key', '${k}')` : ''}`)
const send = (db, uid, email, extra = {}) => db.exec(`insert into public.email_sends (user_id, former_member_id, email, template_key, kind, subject, status, reason, resend_id, campaign, created_at)
  values (${uid ? `'${uid}'` : 'null'}, ${extra.fm ?? 'null'}, '${email}', '${extra.tpl ?? 'welcome'}', '${extra.kind ?? 'service'}', '${extra.subject ?? 'Where to next, Alice?'}',
  '${extra.status ?? 'sent'}', ${extra.reason ? `'${extra.reason}'` : 'null'}, '${extra.rid ?? 're_abc123'}', 'c1', '2026-10-30T10:00:00Z')`)
const del = (db, u) => db.query(`select public.delete_account('${u}') r`).then(() => ({ ok: true }), e => ({ ok: false, e: e.message }))

const db = await build()
await db.exec(`insert into auth.users values ('${U}','${ADDR}'),('${V}','bob@example.com');
  insert into public.trips (id, owner_id, status, start_date, end_date, destination_country_code) values ('aaaa1111-1111-1111-1111-111111111111','${U}','completed','2026-01-01','2026-01-05','FR');
  insert into public.user_badges (user_id, badge_id, badge_tier) values ('${U}','first_honk','easy');`)
await db.exec(`insert into public.former_members (id, user_id, email) overriding system value values (7, null, 'former@example.com')`)
ok('seed: member has a Goose score', (await q(db, `select goose_score from public.user_stats where user_id='${U}'`))[0]?.goose_score > 0)
await send(db, U, ADDR); await send(db, U, ADDR.toUpperCase(), { tpl: 'recap', kind: 'marketing', status: 'failed', reason: `The to address ${ADDR} is invalid` })
await send(db, V, 'bob@example.com', { rid: 're_bob' })
await send(db, null, 'old.member@example.com', { rid: 're_old', subject: 'Welcome back from Lisbon' })            // member already gone, plain address
await send(db, null, 'former@example.com', { fm: 7 })                                                            // former member, address still held in former_members
await send(db, null, expected('done@example.com'), {})                                                           // already hashed

// 1. No key yet: a clear error, and nothing changes
let r = await db.exec(MIG).then(() => ({ ok: true }), e => ({ ok: false, e: e.message }))
ok('migration with rows to backfill and no Vault secret fails clearly', !r.ok && /email_hash_key/.test(r.e), r.e)
ok('...and left the rows alone (rolled back by the failed statement)', (await q(db, `select count(*)::int n from public.email_sends where email like 'h1:%'`))[0].n === 1)
await setKey(db, 'short')
r = await db.exec(MIG).then(() => ({ ok: true }), e => ({ ok: false, e: e.message }))
ok('a key under 32 characters is refused', !r.ok && /shorter than 32|missing/.test(r.e), r.e)
await setKey(db, KEY)

// 2. Hash function: deterministic, keyed, equals HMAC-SHA256 of lower(trim(address))
await db.exec(MIG)
const h = async (a, k) => { if (k) await setKey(db, k); return (await q(db, `select public.email_hash('${a}') h`))[0].h }
ok('shim matches Node HMAC-SHA256 (so the SQL below tests the real algorithm)', await h('a@b.co', KEY) === expected('a@b.co'))
ok('same address + same key = same hash; case and spaces do not matter', await h(ADDR) === await h('  ' + ADDR.toLowerCase() + ' ') && await h(ADDR) === expected(ADDR))
ok('the hash is prefixed h1: and is 64 hex characters', /^h1:[0-9a-f]{64}$/.test(await h(ADDR)))
ok('a different key gives a different hash', await h(ADDR, KEY2) !== expected(ADDR) && await h(ADDR) === expected(ADDR, KEY2))
ok('it is not a plain sha256', await h(ADDR) !== 'h1:' + createHash('sha256').update(ADDR.toLowerCase()).digest('hex'))
await setKey(db, KEY)
ok('hashing an already-hashed value returns it unchanged', await h(expected('x@y.z')) === expected('x@y.z'))
ok('email_hash is not callable by anon or authenticated', (await q(db, `select has_function_privilege('anon','public.email_hash(text)','execute') a, has_function_privilege('authenticated','public.email_hash(text)','execute') b, has_function_privilege('service_role','public.email_hash(text)','execute') c`)).every(x => x.a === false && x.b === false && x.c === true))

// 3. Backfill (ran with the migration above)
const rows = await q(db, `select user_id, former_member_id, email, subject, reason, resend_id, template_key, kind, status, campaign, created_at from public.email_sends order by id`)
const old = rows.find(x => x.resend_id === null && x.former_member_id === null && x.user_id === null && x.email === expected('old.member@example.com'))
ok('backfill: orphaned plain address is now the keyed hash', !!old)
ok('backfill: subject cleared, template/kind/status/date kept', old && old.subject === null && old.template_key === 'welcome' && old.kind === 'service' && old.status === 'sent' && new Date(old.created_at).toISOString() === '2026-10-30T10:00:00.000Z')
ok('backfill: live member rows untouched (plain, with user_id)', rows.filter(x => x.user_id).every(x => !x.email.startsWith('h1:') && x.subject))
ok('backfill: a row tied to a held former_members address is untouched', rows.some(x => x.former_member_id === '7' || x.former_member_id === 7 ? x.email === 'former@example.com' : false))
const snap = JSON.stringify(rows)
await db.exec(MIG); await db.exec(MIG)
ok('backfill is idempotent: running the migration again changes nothing', JSON.stringify(await q(db, `select user_id, former_member_id, email, subject, reason, resend_id, template_key, kind, status, campaign, created_at from public.email_sends order by id`)) === snap)

// 4. Deleting a member
const res = await del(db, U)
ok('delete_account still works for a member with a Goose score and badges', res.ok, res.e)
ok('auth user, stats and badges are gone', (await q(db, `select (select count(*) from auth.users where id='${U}')::int a, (select count(*) from public.user_stats where user_id='${U}')::int b, (select count(*) from public.user_badges where user_id='${U}')::int c`)).every(x => x.a + x.b + x.c === 0))
const left = await q(db, `select * from public.email_sends where template_key in ('welcome','recap') and campaign='c1' and kind in ('service','marketing') and id <= 2 order by id`)
ok('the deleted member keeps 2 log rows, user_id cleared', left.length === 2 && left.every(x => x.user_id === null))
ok('NO plain address remains for that member (any case) anywhere in email_sends', (await q(db, `select count(*)::int n from public.email_sends where lower(email) like '%alice%' or lower(reason) like '%alice%'`))[0].n === 0)
ok('both rows (even with different letter case) carry the same hash', left[0].email === expected(ADDR) && left[1].email === expected(ADDR))
ok('type, kind, status and date kept; subject, reason, resend_id cleared', left.every(x => x.subject === null && x.reason === null && x.resend_id === null && x.created_at) && left[1].template_key === 'recap' && left[1].kind === 'marketing' && left[1].status === 'failed')
const bob = (await q(db, `select * from public.email_sends where user_id='${V}'`))[0]
ok('another member\'s log row is untouched', bob.email === 'bob@example.com' && bob.subject === 'Where to next, Alice?' && bob.resend_id === 're_bob')

// 5. Deleting without the key fails safely (the plain address must not survive by accident)
await db.exec(`insert into auth.users values ('33333333-3333-3333-3333-333333333333','c@example.com')`)
await send(db, '33333333-3333-3333-3333-333333333333', 'c@example.com')
await setKey(db, null)
const noKey = await del(db, '33333333-3333-3333-3333-333333333333')
ok('no Vault secret: deletion fails with a clear error', !noKey.ok && /email_hash_key/.test(noKey.e), noKey.e)
ok('...and nothing was deleted or changed', (await q(db, `select (select count(*) from auth.users where id='33333333-3333-3333-3333-333333333333')::int u, (select email from public.email_sends where user_id='33333333-3333-3333-3333-333333333333') e`))[0].u === 1)
await setKey(db, KEY)
ok('with the secret restored, the same deletion succeeds', (await del(db, '33333333-3333-3333-3333-333333333333')).ok)

// 6. The page text
const page = readFileSync(new URL('../../public/delete-account/index.html', import.meta.url), 'utf8')
const LINE = "A record of the service emails we sent you (the type and date), with your email address replaced by a code we can't turn back into an address. We keep it so we can show what we sent."
const keep = page.slice(page.indexOf('What we keep'), page.indexOf('<h2>Subscriptions'))
ok('/delete-account lists the email record under "What we keep", word for word', keep.includes(`<li>${LINE}</li>`) && !page.slice(0, page.indexOf('What we keep')).includes('service emails we sent you'))
console.log(fails ? `\n${fails} FAILED` : '\nall passed'); process.exit(fails ? 1 : 0)
