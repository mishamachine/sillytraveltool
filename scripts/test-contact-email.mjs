#!/usr/bin/env node
// Contact email: every public contact point uses the owner default, the old address is gone from shipped
// code and pages, and the From addresses did not move. Reads source text, so it needs no build or network.
//   node scripts/test-contact-email.mjs
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const CONTACT = 'machinemisha@gmail.com'
const OLD = 'hello@sillytraveltool.com'
const read = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

function walk(dir, out = []) {
  for (const name of readdirSync(new URL(`../${dir}`, import.meta.url))) {
    const rel = join(dir, name)
    const st = statSync(new URL(`../${rel}`, import.meta.url))
    if (st.isDirectory()) walk(rel, out)
    else if (/\.(js|jsx|ts|tsx|html)$/.test(name)) out.push(rel)
  }
  return out
}

// 1. The old address is gone from everything that ships.
const shipped = ['public', 'src', 'supabase/functions'].flatMap(d => walk(d))
// The one allowed mention: the Privacy page says hello@ is forwarded by Forward Email.
const FORWARD_LINE = "Forward Email (forwardemail.net), which forwards messages sent to hello@sillytraveltool.com to our inbox. Forward Email says it doesn't store message content; if a message can't be delivered, it keeps the error and email headers for up to 7 days."
const stale = shipped.filter(f => read(f).split(FORWARD_LINE).join('').includes(OLD))
assert.deepEqual(stale, [], `old contact address still in: ${stale.join(', ')}`)

// 2. Each place that shows the contact carries the new one.
const mustHave = [
  'public/privacy/index.html', 'public/terms/index.html', 'public/help/index.html', 'public/delete-account/index.html',
  'src/lib/helpContent.js', 'src/lib/reportIssue.js', 'src/screens/profile/SettingsView.jsx',
  'src/screens/explore/AiDisclosure.jsx', 'src/screens/explore/ExploreScreen.jsx',
  'src/screens/toolbox/components/TranslateTool.jsx', 'src/screens/trips/detail/PackTab.jsx',
  'supabase/functions/delete-account/index.ts', 'supabase/functions/_shared/timezones.ts',
]
for (const f of mustHave) assert.ok(read(f).includes(CONTACT), `${f} should carry ${CONTACT}`)
assert.ok(read('src/lib/helpContent.js').includes(`HELP_CONTACT = '${CONTACT}'`))
assert.ok(read('src/lib/reportIssue.js').includes(`REPORT_EMAIL = '${CONTACT}'`))

// Privacy page carries the Forward Email line (in the processors table) and the new date.
const privacy = read('public/privacy/index.html')
assert.ok(privacy.includes(`<td>${FORWARD_LINE}</td>`), 'privacy: Forward Email line')
assert.ok(privacy.includes('Last updated 10 November 2026'), 'privacy: last updated date')

// 3. Reply-to fallback moved, From did not.
for (const fn of ['admin-email', 'beta-invite', 'beta-signup']) {
  const src = read(`supabase/functions/${fn}/index.ts`)
  assert.ok(src.includes(`'MEMBER_EMAIL_REPLY_TO') || '${CONTACT}'`), `${fn} reply-to fallback`)
  assert.ok(src.includes('Silly Travel Tool <goose@bookings.sillytraveltool.com>'), `${fn} From unchanged`)
}

console.log('contact email: all checks pass')
