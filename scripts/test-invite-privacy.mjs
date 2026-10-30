#!/usr/bin/env node
// Static checks on migration 20261030120100_invite_privacy_cleanup.sql (no database here; the SQL itself was run
// against a PGlite stub when it was written). Guards the parts that must not drift:
//   - delete_account only gained the intended statements, and keeps SECURITY DEFINER, empty search_path and its grants
//   - the purge job is rescheduled idempotently and only targets pending-expired and declined rows
//   node scripts/test-invite-privacy.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const dir = new URL('../supabase/migrations/', import.meta.url)
const oldSql = readFileSync(new URL('20261024030000_delete_account.sql', dir), 'utf8')
const newSql = readFileSync(new URL('20261030120100_invite_privacy_cleanup.sql', dir), 'utf8')
const body = s => s.slice(s.indexOf('create or replace function public.delete_account'))
const lines = s => body(s).split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('--'))

// Every original statement line is still there, in the same order (only additions allowed)
const nl = lines(newSql)
let at = 0
for (const l of lines(oldSql)) {
  const i = nl.indexOf(l, at)
  assert.ok(i >= 0, `original line missing or moved: ${l}`)
  at = i + 1
}
const b = body(newSql)
assert.match(b, /security definer set search_path = ''/)
assert.match(b, /revoke all on function public\.delete_account\(uuid\) from public, anon, authenticated;/)
assert.match(b, /grant execute on function public\.delete_account\(uuid\) to service_role;/)

// Free text is cleared before the rows are handed to the trip owner, and only on other owners' trips
const clear = b.indexOf('passenger_name = null, notes = null')
const hand = b.indexOf('update public.bookings b set created_by')
assert.ok(clear > 0 && clear < hand, 'bookings cleared before re-attribution')
assert.ok(b.indexOf('update public.trip_activities a set notes = null') < b.indexOf('update public.trip_activities a set created_by'))
assert.equal((b.match(/t\.owner_id <> p_user/g) || []).length, 5, 'clear + hand over (bookings, activities) plus the existing invited_by hand-over')
assert.doesNotMatch(b, /confirmation_number|title\s*=\s*null/, 'confirmation numbers and titles stay')
// Unbound invites for the member's address
assert.match(b, /c\.user_id is null and c\.status in \('pending', 'declined'\)/)
assert.match(b, /lower\(c\.invited_email\) = \(select lower\(u\.email\) from auth\.users u where u\.id = p_user\)/)

// Purge job: unschedule-then-schedule, daily, never touches accepted or owner rows
assert.match(newSql, /cron\.unschedule\('purge-stale-invites'\) where exists/)
const job = newSql.match(/cron\.schedule\('purge-stale-invites', '([^']+)', \$cron\$([\s\S]*?)\$cron\$\)/)
assert.ok(job, 'job scheduled')
assert.match(job[1], /^\d+ \d+ \* \* \*$/, 'daily')
assert.match(job[2], /status = 'pending' and invite_expires_at < now\(\) - interval '7 days'/)
assert.match(job[2], /status = 'declined' and invited_at < now\(\) - interval '30 days'/)
assert.match(job[2], /role is distinct from 'owner'/)
assert.doesNotMatch(job[2], /accepted/)
// Accepted rows keep their address (send-invite, the Travelers list and the upsert key read it)
assert.doesNotMatch(newSql, /invited_email\s*=\s*null/i)
console.log('invite privacy migration checks passed')
