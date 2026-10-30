#!/usr/bin/env node
// Invite helpers (supabase/functions/_shared/invite.js): subject cleaning and caps, token-safe log form, limit answers.
// The Edge Function handlers and invite_send_check SQL are not run here (no database, esm.sh import).
//   node scripts/test-invite.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { cleanLine, inviteSubject, last4, limitResponse } from '../supabase/functions/_shared/invite.js'

// Subject: caps both names at 60, strips line breaks (header injection) and control characters
const long = 'T'.repeat(500)
const s = inviteSubject('Eve\r\nBcc: x@y.com', long)
assert.ok(!/[\r\n]/.test(s))
assert.equal(s, `Eve Bcc: x@y.com invited you to "${'T'.repeat(60)}"`)
assert.equal(inviteSubject('N'.repeat(100), 'Rome').split(' invited')[0].length, 60)
assert.equal(inviteSubject('', ''), 'Someone invited you to "a trip"')
assert.equal(cleanLine('a b\u0000c\td'), 'a b c d')
assert.equal(cleanLine(null), '')
// bidi, zero-width and C1 controls are stripped
assert.equal(cleanLine('a\u202Eb\u2066c\u200Bd\u0085e\u009Ff\uFEFFg'), 'a b c d e f g')
assert.equal(inviteSubject('Eve\u202E', 'Rome\u200B').includes('\u202E'), false)

// Logs: last four only
assert.equal(last4('0b9f6c1e-aaaa-bbbb-cccc-1234567890ab'), '…90ab')
assert.equal(last4(''), '(none)')
assert.ok(!last4('0b9f6c1e-aaaa-bbbb-cccc-1234567890ab').includes('0b9f'))

// Limit answers: ok passes; per-sender and per-recipient are 429; the project-wide cap is 503
assert.equal(limitResponse('ok'), null)
assert.equal(limitResponse('sender_limit').status, 429)
assert.equal(limitResponse('recipient_limit').status, 429)
assert.equal(limitResponse('global_limit').status, 503)

// Client helpers: success is judged by ok, never by the absence of error
const lib = readFileSync(new URL('../src/lib/invite.js', import.meta.url), 'utf8')
assert.ok(/if \(!r\.ok\) return \{ ok: false, error: r\.error \|\| /.test(lib), 'lib must default the error text')
assert.equal(lib.match(/if \(!r\.ok\)/g).length, 2)
const sheet = readFileSync(new URL('../src/components/shared/InviteConfirmSheet.jsx', import.meta.url), 'utf8')
assert.ok(sheet.includes('if (!r.ok)') && !sheet.includes('if (r.error)'))
const collab = readFileSync(new URL('../src/store/collabStore.js', import.meta.url), 'utf8')
assert.ok(!/inviterName|tripName,/.test(collab), 'dead inviterName/tripName fields removed')

// Source checks on the handlers: no token in the send-invite answer, a count error fails closed, email must be confirmed
const send = readFileSync(new URL('../supabase/functions/send-invite/index.ts', import.meta.url), 'utf8')
assert.ok(!/success: true, token/.test(send), 'send-invite must not return the token')
assert.ok(/limitErr \|\| typeof verdict !== 'string'[\s\S]{0,200}503/.test(send), 'limit check error must return 503')
assert.ok(!/\?\? 0\)/.test(send), 'no fail-open count')
assert.ok(send.indexOf('email_confirmed_at') > 0 && send.indexOf('email_confirmed_at') < send.indexOf('invite_send_check'), 'send-invite needs a confirmed email before counting')
assert.ok(send.includes('global_invite_cap_hit'))
const acc = readFileSync(new URL('../supabase/functions/accept-invite/index.ts', import.meta.url), 'utf8')
assert.ok(acc.indexOf('email_confirmed_at') > 0 && acc.indexOf('email_confirmed_at') < acc.indexOf("action === 'preview'"), 'confirmed-email gate comes before every path')
assert.ok(/invite_token: null/.test(acc), 'token cleared on accept')
assert.ok(!/console\.\w+\([^)]*\btoken\b[^)]*\)/.test(acc.replace(/last4\(token\)/g, '')), 'accept-invite must not log the token')
console.log('invite tests passed')
