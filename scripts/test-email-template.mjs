// node scripts/test-email-template.mjs: checks member email rendering (supabase/functions/_shared/emailTemplate.js)
import assert from 'node:assert/strict'
import { render, fill } from '../supabase/functions/_shared/emailTemplate.js'

const tpl = {
  subject: 'Welcome back from {{last_trip_city}}',
  body: 'Hi {{first_name}},\n\nWelcome home. **{{last_trip_days}} days** and a [guide](https://sillytraveltool.com/).\n\n<script>alert(1)</script> [bad](javascript:alert(1))',
  cta_label: 'See your recap', cta_url: '{{app_url}}',
}
const vars = { first_name: 'Ana', last_trip_city: 'Lisbon', last_trip_days: 7, app_url: 'https://sillytraveltool.com/' }
const m = render(tpl, vars, { kind: 'marketing', unsubscribeUrl: 'https://sillytraveltool.com/unsubscribe/?t=abc' })

assert.equal(m.subject, 'Welcome back from Lisbon')
assert.match(m.html, /Hi Ana,/)
assert.match(m.html, /<strong>7 days<\/strong>/)
assert.match(m.html, /href="https:\/\/sillytraveltool.com\/" style="color:#B24A17/)
assert.ok(!m.html.includes('<script>'), 'raw HTML is escaped')
assert.ok(!/href="javascript:/.test(m.html), 'only http(s) links become links')
assert.match(m.html, /Unsubscribe<\/a>/)
assert.match(m.html, /See your recap/)
assert.match(m.text, /guide \(https:\/\/sillytraveltool.com\/\)/)
assert.match(m.text, /Unsubscribe: https:\/\/sillytraveltool.com\/unsubscribe\/\?t=abc/)

const s = render({ subject: 'Notice', body: '{{message}}' }, { message: 'Line one\n\nLine two' }, { kind: 'service' })
assert.ok(!s.html.includes('Unsubscribe'), 'service emails have no unsubscribe link')
assert.match(s.html, /Line two/)
assert.equal(fill('Hi {{first_name}}!', {}), 'Hi !')

console.log('email template: 13 checks passed')

// Footer and postal address
import { readFileSync, readdirSync } from 'node:fs'
import { FOOTER_LINE, POSTAL_ADDRESS } from '../supabase/functions/_shared/emailTemplate.js'
import { welcomeEmail } from '../supabase/functions/_shared/welcomeEmail.js'
import { confirmEmail, inviteEmail } from '../supabase/functions/_shared/betaEmails.js'
const ADDRESS = /Grandey|Renton|98056/i
const unsub = 'https://sillytraveltool.com/unsubscribe/?t=abc'
assert.equal(FOOTER_LINE, 'Silly Travel Tool · B&B Project Factory')
assert.equal(POSTAL_ADDRESS, '', 'postal address stays empty until a PO box exists')
for (const e of [m, s, welcomeEmail({ name: 'Ana' }), confirmEmail({ platform: 'web', unsubscribeUrl: unsub }), inviteEmail({ platform: 'web', link: 'https://x.test/', unsubscribeUrl: unsub })]) {
  assert.ok(!ADDRESS.test(e.html) && !ADDRESS.test(e.text), 'no postal address in rendered email')
  assert.ok(e.html.includes('Silly Travel Tool · B&amp;B Project Factory'), 'house footer in html')
  assert.ok(e.text.includes(FOOTER_LINE), 'house footer in text')
}
const dir = new URL('../supabase/templates/', import.meta.url)
for (const f of readdirSync(dir)) {
  const h = readFileSync(new URL(f, dir), 'utf8')
  assert.ok(!ADDRESS.test(h), `${f} has no postal address`)
  assert.ok(h.includes('Silly Travel Tool · B&amp;B Project Factory'), `${f} has the house footer`)
}
// With an address set it prints on marketing emails only
const addr = '1 Example PO Box, Town ST 00000, USA'
const mk = render(tpl, vars, { kind: 'marketing', unsubscribeUrl: unsub, postalAddress: addr })
const sv = render({ subject: 'Notice', body: 'Hi' }, {}, { kind: 'service', postalAddress: addr })
assert.ok(mk.html.includes(addr) && mk.text.includes(addr), 'marketing prints the postal address when set')
assert.ok(!sv.html.includes(addr) && !sv.text.includes(addr), 'service email never prints it')

// Welcome email
const w = welcomeEmail({ name: 'Ana' })
assert.equal(w.subject, 'Welcome to Silly Travel Tool, Ana!')
assert.match(w.html, /Where to first, Ana\?/)
for (const t of ['The Goose inbox', 'Day-by-day plans, with weather', 'Fill my day', 'HONK']) { assert.ok(w.html.includes(t) && w.text.includes(t), `feature: ${t}`) }
assert.equal((w.html.match(/Plan your first trip/g) || []).length, 1, 'exactly one CTA')
assert.equal((w.html.match(/<a /g) || []).length, 1)
assert.match(w.html, /href="https:\/\/sillytraveltool.com"/)
assert.match(w.text, /Plan your first trip: https:\/\/sillytraveltool.com/)
assert.ok(!/[\u{1F300}-\u{1FAFF}☀-➿️]/u.test(w.subject + w.html + w.text), 'no emoji')
assert.ok(!w.html.includes('Unsubscribe'), 'welcome is a service email')
const x = welcomeEmail({ name: '<img src=x onerror=1>\nEvil' })
assert.ok(!x.html.includes('<img src=x') && !x.subject.includes('\n'), 'name is escaped and one line')
assert.match(welcomeEmail({}).subject, /, Traveler!$/)

console.log('email footer + welcome: checks passed')
