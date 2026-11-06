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
for (const m of [all[1], all[3]]) check(m.html.includes('href="https://example.com/join"'), 'invite button link')

// Android invite: approved two-step copy, group link first, both links as real links
const G = 'https://groups.google.com/g/sillytraveltool-beta'
const P = 'https://play.google.com/apps/testing/com.sillytraveltool.app'
const and = inviteEmail({ platform: 'android', link: P, unsubscribeUrl: unsub })
check(and.subject === "You're in: test Silly Travel Tool on Android", 'android subject')
for (const line of [
  'You signed up for the Silly Travel Tool beta, and Android is ready for you. Two quick steps on your phone:',
  `1. Join the beta group: ${G} (use the Google account on your phone)`,
  `2. Install the app: ${P}`,
  'Forward a booking confirmation to your Goose inbox and watch your trip build itself.',
  "One favour: keep the beta installed for at least two weeks. It's how we unlock the public launch on Google Play.",
  'Questions or bugs? Reply to hello@sillytraveltool.com.',
]) check(and.text.includes(line), `android copy: ${line.slice(0, 30)}`)
check(!and.text.includes('(https://'), 'bare links in text, not "label (url)"')
check(and.html.includes(`href="${G}"`) && and.html.includes(`href="${P}"`), 'both steps are links')
check(and.html.indexOf(`href="${G}"`) < and.html.indexOf(`href="${P}"`), 'group link comes first')
check(and.html.includes('Join the beta group</a>'), 'CTA button = group link')
check(and.html.includes(unsub) && and.text.includes(unsub), 'android unsubscribe line kept')
const custom = inviteEmail({ platform: 'android', link: P, groupLink: 'https://groups.google.com/g/other', unsubscribeUrl: unsub })
check(custom.text.includes('https://groups.google.com/g/other') && !custom.text.includes(G), 'android_group_url overrides the fallback')
check(inviteEmail({ platform: 'web', link: 'https://x.y/', unsubscribeUrl: unsub, test: true }).subject.startsWith('[Test] '), 'test subject')
console.log(`beta emails: ${n} checks passed`)
