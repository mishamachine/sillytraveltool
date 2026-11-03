#!/usr/bin/env node
// /auth/confirm logic (src/lib/authConfirm.js) and the auth email templates (supabase/templates).
//   node scripts/test-auth-confirm.mjs
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { CONFIRM_TYPES, isConfirmPath, parseConfirmParams, stripConfirmParams, confirmLink, REASON_COPY } from '../src/lib/authConfirm.js'

// Path match
assert.ok(isConfirmPath('/auth/confirm'))
assert.ok(isConfirmPath('/auth/confirm/'))
assert.ok(!isConfirmPath('/auth/confirmed'))
assert.ok(!isConfirmPath('/'))
assert.ok(!isConfirmPath(undefined))

// Param parsing
assert.deepEqual(parseConfirmParams('?token_hash=abc123&type=recovery'), { tokenHash: 'abc123', type: 'recovery' })
for (const type of ['recovery', 'magiclink', 'signup', 'email_change', 'invite']) {
  assert.deepEqual(parseConfirmParams(`?token_hash=h&type=${type}`), { tokenHash: 'h', type })
}
assert.equal(parseConfirmParams('').error, 'incomplete')
assert.equal(parseConfirmParams('?type=recovery').error, 'incomplete')
assert.equal(parseConfirmParams('?token_hash=abc').error, 'incomplete')
assert.equal(parseConfirmParams('?token_hash=%20&type=recovery').error, 'incomplete')
assert.equal(parseConfirmParams('?token_hash=abc&type=sms').error, 'unknown_type')
assert.equal(parseConfirmParams('?token_hash=abc&type=__proto__').error, 'unknown_type')
assert.equal(parseConfirmParams('?token_hash=abc&type=toString').error, 'unknown_type')
for (const r of ['expired', 'network', 'incomplete', 'unknown_type']) assert.ok(REASON_COPY[r].title && REASON_COPY[r].body)
for (const [t, c] of Object.entries(CONFIRM_TYPES)) assert.ok(c.title && c.blurb && c.again && ['forgot', 'magic', 'login'].includes(c.start), t)

// Strip: query goes, path and history state stay
const calls = []
stripConfirmParams({ history: { state: { k: 1 }, replaceState: (...a) => calls.push(a) }, location: { pathname: '/auth/confirm' } })
assert.deepEqual(calls, [[{ k: 1 }, '', '/auth/confirm']])

// verifyOtp: one call, exactly { token_hash, type }; nothing on parse errors
const fake = (result, { throws } = {}) => {
  const seen = []
  return { seen, auth: { verifyOtp: async (args) => { seen.push(args); if (throws) throw new Error('offline'); return result } } }
}
for (const type of ['recovery', 'magiclink', 'signup', 'email_change', 'invite']) {
  const sb = fake({ data: { session: {} }, error: null })
  assert.deepEqual(await confirmLink(sb, { tokenHash: 'h', type }), { ok: true, type })
  assert.deepEqual(sb.seen, [{ token_hash: 'h', type }])
}
{
  const sb = fake({ error: null })
  assert.deepEqual(await confirmLink(sb, parseConfirmParams('?type=recovery')), { ok: false, reason: 'incomplete' })
  assert.deepEqual(await confirmLink(sb, parseConfirmParams('?token_hash=a&type=nope')), { ok: false, reason: 'unknown_type' })
  assert.equal(sb.seen.length, 0, 'verifyOtp must not run for a bad link')
}

// Error states: expired/used token, server trouble, thrown fetch
assert.deepEqual(await confirmLink(fake({ error: { name: 'AuthApiError', status: 403, message: 'Email link is invalid or has expired' } }), { tokenHash: 'h', type: 'recovery' }), { ok: false, reason: 'expired' })
assert.deepEqual(await confirmLink(fake({ error: { name: 'AuthApiError', status: 500, message: 'x' } }), { tokenHash: 'h', type: 'recovery' }), { ok: false, reason: 'network' })
assert.deepEqual(await confirmLink(fake({ error: { name: 'AuthRetryableFetchError', status: 0, message: 'x' } }), { tokenHash: 'h', type: 'recovery' }), { ok: false, reason: 'network' })
assert.deepEqual(await confirmLink(fake(null, { throws: true }), { tokenHash: 'h', type: 'recovery' }), { ok: false, reason: 'network' })

// Templates: right link per type, subject line, no old supabase link, no secrets/stray vars
const tdir = new URL('../supabase/templates/', import.meta.url)
const expected = { 'recovery.html': 'recovery', 'magic-link.html': 'magiclink', 'confirmation.html': 'signup', 'email-change.html': 'email_change' }
assert.deepEqual(readdirSync(tdir).sort(), Object.keys(expected).sort())
for (const [file, type] of Object.entries(expected)) {
  const t = readFileSync(new URL(file, tdir), 'utf8')
  assert.match(t, /^<!-- Subject: .{10,80} -->/, `${file} subject`)
  assert.ok(t.includes(`{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&amp;type=${type}`), `${file} link`)
  assert.ok(!t.includes('.ConfirmationURL') && !t.includes('supabase.co'), `${file} old link`)
  assert.ok(t.includes('Silly Travel Tool'), `${file} name`)
  const vars = [...t.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)].map(m => m[1])
  for (const v of vars) assert.ok(['.SiteURL', '.TokenHash', '.Email', '.NewEmail'].includes(v), `${file} variable ${v}`)
}

console.log('auth confirm: ok')
