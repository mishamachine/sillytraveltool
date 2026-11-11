// SQL-level test for 20261110100100_stt_email_usage_counts.sql on PGlite. Table shapes copy the real definitions
// (auth.users timestamp columns, email_sends, invite_sends, beta_waitlist).  node scripts/test-migrations/email-usage-counts.mjs
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const W = fileURLToPath(new URL('../../supabase/migrations/', import.meta.url))
const db = new PGlite()
let fails = 0
const ok = (name, cond, extra = '') => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name} ${cond ? '' : extra}`) }
const q = async s => (await db.query(s)).rows
const denied = async role => { await db.exec(`set role ${role}`); try { await db.exec(`select * from public.stt_email_usage_counts()`); return false } catch (e) { return /permission denied/.test(e.message) } finally { await db.exec('reset role') } }

await db.exec(`
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, confirmation_sent_at timestamptz, recovery_sent_at timestamptz, email_change_sent_at timestamptz, invited_at timestamptz);
create table public.email_sends (id bigint generated always as identity primary key, email text not null, kind text not null, status text not null check (status in ('sent','failed','skipped')), created_at timestamptz not null default now());
create table public.invite_sends (id bigint generated always as identity primary key, sender uuid not null, recipient_hash text not null, trip_id uuid not null, created_at timestamptz not null default now());
create table public.beta_waitlist (id bigint generated always as identity primary key, email text not null, confirmation_sent_at timestamptz, invited_at timestamptz);
grant usage on schema public to anon, authenticated, service_role;
`)
await db.exec(readFileSync(W + '20261110100100_stt_email_usage_counts.sql', 'utf8'))

const day = (await q(`select (date_trunc('day', now() at time zone 'utc') at time zone 'utc')::text d, extract(day from now() at time zone 'utc') dom`))[0]
const D = `date_trunc('day', now() at time zone 'utc') at time zone 'utc'` // exactly the UTC day start: counts (boundary is inclusive)
const Y = `(${D}) - interval '1 second'`                                 // just before: not today
const M = `(date_trunc('month', now() at time zone 'utc') at time zone 'utc')` // month start: month-to-date only when not the 1st
const L = `(${M}) - interval '1 second'`                                   // last month: never counted
const early = Number(day.dom) > 1 // on the 1st, month start == day start, so the month-only rows count as today too
await db.exec(`
insert into auth.users (email, confirmation_sent_at, recovery_sent_at, email_change_sent_at, invited_at) values
 ('a@x', ${D}, null, null, null), ('b@x', ${D}, ${D}, null, null), ('c@x', null, null, ${D}, ${D}), ('d@x', ${Y}, ${Y}, null, null),
 ('e@x', ${L}, ${L}, ${L}, ${L}), ('f@x', null, null, null, null), ('g@x', ${D}, ${D}, ${D}, ${D});
insert into public.email_sends (email, kind, status, created_at) values
 ('a', 'service', 'sent', ${D}), ('a', 'marketing', 'sent', ${D}), ('a', 'service', 'failed', ${D}), ('a', 'service', 'skipped', ${D}), ('a', 'service', 'sent', ${Y}), ('a', 'service', 'sent', ${L});
insert into public.invite_sends (sender, recipient_hash, trip_id, created_at) values
 (gen_random_uuid(), 'h1', gen_random_uuid(), ${D}), (gen_random_uuid(), 'h2', gen_random_uuid(), ${D}), (gen_random_uuid(), 'h3', gen_random_uuid(), ${Y}), (gen_random_uuid(), 'h4', gen_random_uuid(), ${L});
insert into public.beta_waitlist (email, confirmation_sent_at, invited_at) values
 ('w1', ${D}, null), ('w2', ${D}, ${D}), ('w3', ${Y}, ${Y}), ('w4', null, null);
`)
const r = await q(`select * from public.stt_email_usage_counts()`)
const o = r[0]
ok('returns exactly one row', r.length === 1)
ok('every column is an integer', Object.values(o).every(v => Number.isInteger(Number(v)) && typeof v === 'number'), JSON.stringify(o))
ok('ten columns, no ids or emails', Object.keys(o).length === 10 && !Object.keys(o).some(k => /id|mail$/.test(k.replace('email_sends', 'es').replace('email_change', 'ec'))), Object.keys(o).join())
ok('auth_confirm_today = 3 (a, b, g)', o.auth_confirm_today === 3, o.auth_confirm_today)
ok('auth_recovery_today = 2 (b, g)', o.auth_recovery_today === 2, o.auth_recovery_today)
ok('auth_email_change_today = 2 (c, g)', o.auth_email_change_today === 2, o.auth_email_change_today)
ok('auth_invite_today = 2 (c, g)', o.auth_invite_today === 2, o.auth_invite_today)
ok("app_email_sends_today = 2 (status 'sent' only)", o.app_email_sends_today === 2, o.app_email_sends_today)
ok('app_invite_sends_today = 2', o.app_invite_sends_today === 2, o.app_invite_sends_today)
ok('beta_today = 3 (w1 confirmation, w2 confirmation + invite)', o.beta_today === 3, o.beta_today)
// month to date: users a,b,c,g today, d yesterday (same month unless today is the 1st); e last month; f never
ok('auth_mtd counts each user once', o.auth_mtd === (early ? 5 : 4), o.auth_mtd)
ok('app_email_sends_mtd', o.app_email_sends_mtd === (early ? 3 : 2), o.app_email_sends_mtd)
ok('app_invite_sends_mtd', o.app_invite_sends_mtd === (early ? 3 : 2), o.app_invite_sends_mtd)
ok('anon gets permission denied', await denied('anon'))
ok('authenticated gets permission denied', await denied('authenticated'))
await db.exec('set role service_role')
ok('service_role can call it', (await q(`select count(*)::int c from public.stt_email_usage_counts()`))[0].c === 1)
await db.exec('reset role')
console.log(fails ? `\n${fails} FAILED` : '\nall passed')
process.exit(fails ? 1 : 0)
