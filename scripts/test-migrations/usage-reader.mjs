// SQL-level test for 20261110110000_usage_reader.sql on PGlite (Postgres 16 in WASM) plus the alert email text.
// Table shapes copy the real definitions (auth.users timestamps, email_sends, invite_sends, beta_waitlist).
//   node scripts/test-migrations/usage-reader.mjs
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { usageEmail } from '../../supabase/functions/_shared/usageAlert.js'
const W = fileURLToPath(new URL('../../supabase/migrations/', import.meta.url))
const db = new PGlite()
let fails = 0
const ok = (name, cond, extra = '') => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name} ${cond ? '' : extra}`) }
const q = async s => (await db.query(s)).rows
const denies = async (role, sql) => { await db.exec(`set role ${role}`); try { await db.exec(sql); return false } catch (e) { return /permission denied|must be owner/.test(e.message) } finally { await db.exec('reset role') } }

await db.exec(`
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, encrypted_password text, confirmation_sent_at timestamptz, recovery_sent_at timestamptz, email_change_sent_at timestamptz, invited_at timestamptz);
alter table auth.users enable row level security;
create table public.email_sends (id bigint generated always as identity primary key, email text not null, kind text not null, status text not null, created_at timestamptz not null default now());
create table public.invite_sends (id bigint generated always as identity primary key, sender uuid not null, recipient_hash text not null, trip_id uuid not null, created_at timestamptz not null default now());
create table public.beta_waitlist (id bigint generated always as identity primary key, email text not null, confirmation_sent_at timestamptz, invited_at timestamptz);
create table public.admins (user_id uuid, role text);
create table public.trips (id uuid primary key default gen_random_uuid(), title text);
alter table public.email_sends enable row level security; alter table public.invite_sends enable row level security; alter table public.beta_waitlist enable row level security;
revoke all on public.email_sends, public.invite_sends, public.beta_waitlist from public, anon, authenticated;
-- stand-ins for pg_net and Vault
create schema net; create table net.calls (body jsonb, headers jsonb);
create function net.http_post(url text, headers jsonb, body jsonb, timeout_milliseconds int default 5000) returns bigint language sql as $$ insert into net.calls values (body, headers); select 1::bigint $$;
create schema vault; create table vault.secrets_t (name text, decrypted_secret text); create view vault.decrypted_secrets as select * from vault.secrets_t;
insert into vault.secrets_t values ('cost_alert_token', 'x'), ('other', 'y');
grant usage on schema public to anon, authenticated, service_role; grant usage on schema net to service_role; grant select on net.calls to service_role;
`)
await db.exec(readFileSync(W + '20261110110000_usage_reader.sql', 'utf8'))

// --- the role ---
const role = (await q(`select rolcanlogin, rolsuper, rolbypassrls, rolcreaterole, rolpassword from pg_authid where rolname = 'usage_reader'`))[0]
ok('usage_reader is NOLOGIN, not super, no bypassrls, no password', role.rolcanlogin === false && !role.rolsuper && !role.rolbypassrls && !role.rolcreaterole && role.rolpassword === null)
ok('usage_reader has no CREATE on public after the owner change', (await q(`select has_schema_privilege('usage_reader','public','CREATE') c`))[0].c === false)
ok('function is owned by usage_reader and is SECURITY DEFINER', (await q(`select proowner::regrole::text o, prosecdef s from pg_proc where proname = 'stt_email_usage_counts'`))[0].o === 'usage_reader')

await db.exec(`
insert into auth.users (email, encrypted_password, confirmation_sent_at) values ('secret.person@example.test', 'HASH', now());
insert into public.email_sends (email, kind, status) values ('secret.person@example.test', 'service', 'sent');
insert into public.invite_sends (sender, recipient_hash, trip_id) values (gen_random_uuid(), 'hashvalue', gen_random_uuid());
insert into public.beta_waitlist (email, confirmation_sent_at) values ('beta.person@example.test', now());
insert into public.trips (title) values ('Paris');`)
// what it can and cannot read, as the role itself
await db.exec('set role usage_reader')
ok('reader can count the allowed columns', (await q(`select (select count(*) from public.email_sends where created_at is not null) a, (select count(*) from usage_private.auth_email_stamps where confirmation_sent_at is not null) b, (select count(*) from public.beta_waitlist where invited_at is null) c`)).length === 1)
await db.exec('reset role')
for (const sql of [
  'select id from auth.users', 'select email from auth.users', 'select * from auth.users', 'select email from public.email_sends', 'select kind from public.email_sends', 'select status from public.email_sends',
  'select * from public.email_sends', 'select sender from public.invite_sends', 'select recipient_hash from public.invite_sends', 'select email from public.beta_waitlist', 'select * from public.beta_waitlist',
  'select * from public.trips', `insert into public.email_sends (email, kind, status) values ('a','b','sent')`, 'update public.beta_waitlist set invited_at = now()', 'delete from public.invite_sends',
]) ok(`usage_reader denied: ${sql}`, await denies('usage_reader', sql))
for (const r of ['anon', 'authenticated']) {
  ok(`${r} cannot execute stt_email_usage_counts`, await denies(r, 'select * from public.stt_email_usage_counts()'))
  ok(`${r} cannot execute stt_usage_check`, await denies(r, 'select public.stt_usage_check()'))
  ok(`${r} cannot read the view or usage_alerts`, await denies(r, 'select * from usage_private.auth_email_stamps') && await denies(r, 'select * from public.usage_alerts'))
}

await db.exec(`insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111','owner@example.test'), ('22222222-2222-2222-2222-222222222222','analyst@example.test'); insert into public.admins values ('11111111-1111-1111-1111-111111111111','owner'), ('22222222-2222-2222-2222-222222222222','analyst')`)
ok('usage_alert_recipients returns only owner addresses, service role only', (await q(`select public.usage_alert_recipients() r`))[0].r.join() === 'owner@example.test' && await denies('authenticated', 'select public.usage_alert_recipients()') && await denies('anon', 'select public.usage_alert_recipients()'))
await db.exec(`delete from auth.users; delete from public.admins`)
// --- counts on fixtures: one row of integers ---
await db.exec(`delete from public.email_sends; delete from public.invite_sends; delete from public.beta_waitlist; delete from auth.users;`)
const D = `date_trunc('day', now() at time zone 'utc') at time zone 'utc'`, Y = `(${D}) - interval '1 second'`
const L = `(date_trunc('month', now() at time zone 'utc') at time zone 'utc') - interval '1 second'`
const early = Number((await q(`select extract(day from now() at time zone 'utc') d`))[0].d) > 1
await db.exec(`
insert into auth.users (email, confirmation_sent_at, recovery_sent_at, email_change_sent_at, invited_at) values
 ('a@x', ${D}, null, null, null), ('b@x', ${D}, ${D}, null, null), ('c@x', null, null, ${D}, ${D}), ('d@x', ${Y}, ${Y}, null, null), ('e@x', ${L}, ${L}, ${L}, ${L}), ('f@x', null, null, null, null), ('g@x', ${D}, ${D}, ${D}, ${D});
insert into public.email_sends (email, kind, status, created_at) values ('a','service','sent',${D}),('a','marketing','sent',${D}),('a','service','sent',${Y}),('a','service','sent',${L});
insert into public.invite_sends (sender, recipient_hash, trip_id, created_at) values (gen_random_uuid(),'h1',gen_random_uuid(),${D}),(gen_random_uuid(),'h2',gen_random_uuid(),${D}),(gen_random_uuid(),'h3',gen_random_uuid(),${Y}),(gen_random_uuid(),'h4',gen_random_uuid(),${L});
insert into public.beta_waitlist (email, confirmation_sent_at, invited_at) values ('w1',${D},null),('w2',${D},${D}),('w3',${Y},${Y}),('w4',null,null);`)
await db.exec('set role service_role')
const r = await q('select * from public.stt_email_usage_counts()')
await db.exec('reset role')
const o = r[0]
ok('exactly one row of 11 integers', r.length === 1 && Object.keys(o).length === 11 && Object.values(o).every(v => typeof v === 'number' && Number.isInteger(v)), JSON.stringify(o))
const exp = { auth_confirm_today: 3, auth_recovery_today: 2, auth_email_change_today: 2, auth_invite_today: 2, app_email_sends_today: 2, app_invite_sends_today: 2, beta_today: 3,
  auth_mtd: early ? 5 : 4, app_email_sends_mtd: early ? 3 : 2, app_invite_sends_mtd: early ? 3 : 2, beta_mtd: early ? 5 : 3 }
for (const [k, v] of Object.entries(exp)) ok(`${k} = ${v}`, o[k] === v, o[k])

// --- the daily check fires once per period ---
await db.exec('set role service_role')
let c = (await q('select public.stt_usage_check() r'))[0].r
ok('below the levels: nothing fires', c.fired.length === 0 && (await q('select count(*)::int n from net.calls'))[0].n === 0, JSON.stringify(c))
await db.exec('reset role')
await db.exec(`insert into public.email_sends (email, kind, status, created_at) select 'bulk@x', 'service', 'sent', ${D} from generate_series(1, 40)`)
await db.exec('set role service_role')
c = (await q('select public.stt_usage_check() r'))[0].r
ok('40 today: the day alert fires once', c.fired.length === 1 && c.fired[0].startsWith('day:') && (await q('select count(*)::int n from net.calls'))[0].n === 1, JSON.stringify(c))
await db.exec('select public.stt_usage_check()'); await db.exec('select public.stt_usage_check()')
ok('run again twice the same day: still one call', (await q('select count(*)::int n from net.calls'))[0].n === 1)
await db.exec('reset role')
await db.exec(`insert into public.email_sends (email, kind, status, created_at) select 'bulk@x', 'service', 'sent', ${D} from generate_series(1, 1500)`)
await db.exec('set role service_role')
c = (await q('select public.stt_usage_check() r'))[0].r
ok('1,500 this month: the month alert fires once, the day alert does not repeat', c.fired.length === 1 && c.fired[0].startsWith('month:') && (await q('select count(*)::int n from net.calls'))[0].n === 2, JSON.stringify(c))
await db.exec('select public.stt_usage_check()')
ok('and never again this month', (await q('select count(*)::int n from net.calls'))[0].n === 2)
await db.exec('reset role')
// what was sent: counts only, with the Vault token header and no other secret
const calls = await q('select body, headers from net.calls')
const bodies = JSON.stringify(calls.map(x => x.body))
ok('pg_net bodies carry no email, id or hash text', !/@|example\.test|hashvalue|HASH|[0-9a-f]{8}-[0-9a-f]{4}-/.test(bodies), bodies.slice(0, 200))
ok('only the cost_alert_token is used', calls.every(x => x.headers['x-cron-token'] === 'x'))
ok('usage_alerts holds period keys and counts only', Object.keys((await q('select * from public.usage_alerts'))[0]).join() === 'period_key,total,alert_limit,created_at')

// --- the email text: fixed words and integers only ---
for (const b of calls.map(x => x.body)) {
  const m = usageEmail(b)
  const text = [m.subject, ...m.lines].join('\n')
  const stripped = text.replace(/\d[\d,]*/g, '#')
  ok(`email (${b.scope}) has only numbers and fixed text`, !/@|https?:|[0-9a-f]{8}-[0-9a-f]{4}/i.test(text) && m.lines.length >= 4)
  ok(`email (${b.scope}) matches the fixed template once numbers are masked`, /^[A-Za-z #().:,;'-]+$/.test(stripped.replace(/\n/g, ' ')), stripped)
}
// a hostile body cannot smuggle text in: unknown keys and non-integers are dropped, a bad shape is refused
const evil = usageEmail({ kind: 'usage', scope: 'day', total: 41, limit: 40, counts: { auth_confirm_today: 'victim@example.test', beta_today: 2, user_email: 'victim@example.test', app_email_sends_today: 1.5 } })
ok('hostile counts are dropped', evil && !/victim|@/.test(evil.lines.join('\n')) && /beta emails: 2/.test(evil.lines.join('\n')) && !/member emails: /.test(evil.lines.join('\n')))
ok('bad shapes refused', usageEmail({ kind: 'usage', scope: 'day', total: 'x', limit: 40 }) === null && usageEmail({ kind: 'cost' }) === null && usageEmail(null) === null)
console.log(fails ? `\n${fails} FAILED` : '\nall passed')
process.exit(fails ? 1 : 0)
