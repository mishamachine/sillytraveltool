#!/usr/bin/env node
// The Privacy page's statements about the Goose inbox must match the code: forwarded emails are read only after the
// member allowed AI reading; until then they wait unread. Any sender is accepted. The consent hold defaults to ON (ingest.ts inboxSwitches), which is what makes
// this literally true; the sender check is OFF, so no text may promise one. Reads source text; no build or network.
//   node scripts/test-privacy-inbox.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const read = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\s+/g, ' ')
const privacy = read('public/privacy/index.html')
const ingest = read('supabase/functions/receive-booking-email/ingest.ts')

assert.ok(privacy.includes('Goose accepts forwarded mail from any sender, so anyone who knows your Goose inbox address can add bookings to your trips; you can get a new address in Settings. Goose reads emails forwarded to your Goose inbox only after you\'ve allowed AI reading. Until then they wait unread (see <a href="#ai">AI features</a>).'))
// Nothing public or in the app may promise a sender check while it is off
for (const f of ['public/privacy/index.html', 'public/terms/index.html', 'src/lib/helpContent.js', 'src/screens/auth/Onboarding.jsx', 'src/lib/sectionTours.js', 'src/lib/sectionTourScenes.js']) assert.ok(!/only if they come from|from your account email|Accept from any sender|only reads mail|only mail from/i.test(read(f)), `${f} promises a sender check`)
assert.ok(privacy.includes('for emails you forward and for text and files you import, we ask first'))
assert.ok(privacy.includes('you\'ll see "Let Goose read your bookings with AI?" (in older app versions, "Let Goose use AI on your bookings?") in the tour'))
assert.equal((privacy.match(/<em>Settings → AI reading<\/em> \(in older app versions, <em>AI reading of imports and translations<\/em>\)/g) || []).length, 2, 'both Settings references name the new and the older label')
assert.ok(read('docs/APP_REVIEW_CHECKLIST.md').includes('Any sender is accepted; no setting needed.') && !/Accept from any sender\*\* on|Accept from any\s+sender\*\* on/.test(read('docs/APP_REVIEW_CHECKLIST.md')))
assert.ok(read('docs/STORE_PRIVACY_FORMS.md').includes('Settings → AI reading; in older app versions, AI reading of imports and translations)'))
assert.ok(privacy.includes('Forwarded emails then wait unread until you turn it back on.'))
for (const old of ['read when they arrive', 'until our next update', 'Until our next update', 'are still read when they arrive', "don't forward it"]) assert.ok(!privacy.includes(old), `stale privacy text: ${old}`)
assert.ok(privacy.includes('Last updated 16 November 2026'))

// The code behind it: a withdrawn or missing yes holds the email; the switches fail closed; the member's switch is the same record
assert.ok(/switches\.consent_hold && profile\.ai_consent_at !== undefined && !consentCurrent\(profile\) && !input\.released/.test(ingest), 'hold on a missing or old yes')
assert.ok(/sender_check: v\.sender_check === true, consent_hold: v\.consent_hold !== false/.test(ingest), 'consent hold defaults ON, sender check OFF')
const settings = read('src/screens/profile/SettingsView.jsx'), policy = read('src/lib/inboxPolicy.js')
assert.ok(/SENDER_CHECK_LIVE = false/.test(policy) && /SENDER_CHECK_LIVE && \(/.test(settings), 'Accept-from-any-sender switch hidden while the sender check is off')
assert.ok(settings.includes("Forward booking emails from any address. Goose reads them once you've allowed AI reading. Keep this address private.") && !/Goose reads mail you forward from/.test(settings), 'Settings promises no sender check')
assert.ok(/switches\.sender_check && !\(await senderAllowed/.test(ingest), 'sender check runs first')
const sql = readFileSync(new URL('../supabase/migrations/20261029100000_ai_consent_hardening.sql', import.meta.url), 'utf8')
assert.ok(/ai_consent_at = case when p_event = 'granted' then now\(\) else null end/.test(sql), 'turning the Settings switch off clears the yes the hold checks')
const help = read('src/lib/helpContent.js')
assert.ok(help.includes("If you haven\\'t allowed AI reading yet, Goose holds the email until you do."), 'help: forwarded email answer mentions the hold')
console.log('privacy inbox statements match the code')
