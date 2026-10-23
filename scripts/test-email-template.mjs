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
