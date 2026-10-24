// node scripts/test-beta-emails.mjs: beta waitlist emails render, link to unsubscribe, and stay on-message
import { confirmEmail, inviteEmail } from '../supabase/functions/_shared/betaEmails.js'

let n = 0
const check = (ok, what) => { if (!ok) { console.error(`FAIL: ${what}`); process.exit(1) } n++ }
const unsub = 'https://sillytraveltool.com/unsubscribe/?t=abc'
const all = [confirmEmail({ platform: 'ios', unsubscribeUrl: unsub }),
  ...['ios', 'android', 'web'].map((platform) => inviteEmail({ platform, link: 'https://example.com/join', unsubscribeUrl: unsub }))]
check(all[0].subject === "You're on the list", 'confirmation subject')
check(all[0].text.includes('early access on iPhone'), 'platform named')
for (const m of all) {
  check(m.html.includes(unsub) && m.text.includes(unsub), 'unsubscribe link')
  check(m.html.includes('joined the Silly Travel Tool beta list'), 'why line')
  check(!/\bfree\b|\bAI\b/i.test(m.text), 'never free or AI')
  check(!/\p{Extended_Pictographic}/u.test(m.text + m.subject), 'no emoji')
}
for (const m of all.slice(1)) check(m.html.includes('href="https://example.com/join"'), 'invite button link')
check(inviteEmail({ platform: 'web', link: 'https://x.y/', unsubscribeUrl: unsub, test: true }).subject.startsWith('[Test] '), 'test subject')
console.log(`beta emails: ${n} checks passed`)
