#!/usr/bin/env node
// The Privacy page's statements about the Goose inbox must match the code: forwarded emails are read only from the
// account email (or any sender if the member turns that on), and only after the member allowed AI reading; until then
// they wait unread. The sender check and the consent hold default to ON (ingest.ts inboxSwitches), which is what makes
// this literally true. Reads source text; no build or network.
//   node scripts/test-privacy-inbox.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const read = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\s+/g, ' ')
const privacy = read('public/privacy/index.html')
const ingest = read('supabase/functions/receive-booking-email/ingest.ts')

assert.ok(privacy.includes('Goose reads emails forwarded to your Goose inbox only if they come from your account email, unless you turn on Accept from any sender in Settings, and only after you\'ve allowed AI reading. Until then they wait unread (see <a href="#ai">AI features</a>).'))
assert.ok(privacy.includes('for emails you forward and for text and files you import, we ask first'))
assert.ok(privacy.includes('Forwarded emails then wait unread until you turn it back on.'))
for (const old of ['read when they arrive', 'until our next update', 'Until our next update', 'are still read when they arrive', "don't forward it"]) assert.ok(!privacy.includes(old), `stale privacy text: ${old}`)
assert.ok(privacy.includes('Last updated 16 November 2026'))

// The code behind it: a withdrawn or missing yes holds the email; the switches fail closed; the member's switch is the same record
assert.ok(/switches\.consent_hold && profile\.ai_consent_at !== undefined && !consentCurrent\(profile\) && !input\.released/.test(ingest), 'hold on a missing or old yes')
assert.ok(/sender_check: v\.sender_check !== false, consent_hold: v\.consent_hold !== false/.test(ingest), 'both default ON')
assert.ok(/switches\.sender_check && !\(await senderAllowed/.test(ingest), 'sender check runs first')
const sql = readFileSync(new URL('../supabase/migrations/20261029100000_ai_consent_hardening.sql', import.meta.url), 'utf8')
assert.ok(/ai_consent_at = case when p_event = 'granted' then now\(\) else null end/.test(sql), 'turning the Settings switch off clears the yes the hold checks')
console.log('privacy inbox statements match the code')
